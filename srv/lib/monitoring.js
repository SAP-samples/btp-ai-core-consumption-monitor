/**
 * monitoring.js
 * -------------
 * Core monitoring logic for the AI Core FinOps Dashboard.
 * Supports multi-subaccount monitoring.
 * Orchestrates: fetch usage → determine alert → store in DB → send notifications.
 */

const cds = require('@sap/cds')
const { getCurrentMonthUsage, fetchMonthlyCost } = require('./uas-client')
const { sendSmtpNotification } = require('./smtp-notifier')
const { sendAnsNotification } = require('./ans-notifier')

const { info, warn, error } = cds.log('monitoring')

// Alert level IDs (matching CSV seed data)
const ALERT_LEVEL_IDS = {
    INFO: 'a0e00001-0000-4000-8000-000000000001',
    WARNING: 'a0e00001-0000-4000-8000-000000000002',
    ALERT: 'a0e00001-0000-4000-8000-000000000003'
}

// Concurrency limit for parallel API calls
const MAX_CONCURRENT = 3

/**
 * Determine the alert level based on current consumption vs. spending limit.
 * @param {number} totalCu - Total capacity units consumed
 * @param {Object} monConfig - Monitoring configuration
 * @returns {string} 'INFO', 'WARNING', or 'ALERT'
 */
function determineAlertLevel(totalCu, monConfig) {
    if (!monConfig.spendingLimit || monConfig.spendingLimit <= 0) return 'INFO'

    const pct = (totalCu / monConfig.spendingLimit) * 100

    if (pct >= monConfig.alertThresholdPct) return 'ALERT'
    if (pct >= monConfig.warningThresholdPct) return 'WARNING'
    return 'INFO'
}

/**
 * Run monitoring for ALL active subaccounts.
 * Iterates through all active MonitoringConfigs and checks each.
 *
 * @param {boolean} dryRun - If true, skip notifications
 * @returns {Array} Array of result objects (one per subaccount)
 */
async function runMonitoringJob(dryRun = false) {
    info(`=== AI Core FinOps: starting monitoring check for ALL subaccounts (dryRun=${dryRun}) ===`)

    const db = cds.db || await cds.connect.to('db')

    // Get all active monitoring configs
    const configs = await db.run(
        SELECT.from('aicorefin.MonitoringConfigs')
            .where({ isActive: true })
            .orderBy({ displayOrder: 'asc' })
    )

    if (!configs || configs.length === 0) {
        warn('No active monitoring configurations found.')
        return []
    }

    info(`Found ${configs.length} active subaccount(s) to monitor`)

    // Pre-fetch commercial data ONCE for all subaccounts (optimization)
    const today = new Date()
    const currentYM = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`
    const dayOfMonth = today.getDate()
    let fromMonth = currentYM
    if (dayOfMonth <= 3) {
        const prevY = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
        const prevM = today.getMonth() === 0 ? 12 : today.getMonth()
        fromMonth = `${prevY}${String(prevM).padStart(2, '0')}`
    }
    let allCostRecords = []
    try {
        allCostRecords = await fetchMonthlyCost(fromMonth, currentYM)
        info(`[Bulk] Fetched ${allCostRecords.length} commercial records for ${fromMonth}-${currentYM}`)
    } catch (err) {
        warn(`[Bulk] Commercial data fetch failed (non-fatal): ${err.message}`)
    }

    // Process subaccounts with concurrency limit
    const results = []
    for (let i = 0; i < configs.length; i += MAX_CONCURRENT) {
        const batch = configs.slice(i, i + MAX_CONCURRENT)
        const batchResults = await Promise.allSettled(
            batch.map(config => runCheckForConfig(config, dryRun, allCostRecords))
        )

        for (let j = 0; j < batchResults.length; j++) {
            const result = batchResults[j]
            const config = batch[j]
            if (result.status === 'fulfilled') {
                results.push(result.value)
            } else {
                error(`Failed to check subaccount '${config.subaccountName}' (${config.subaccountId}): ${result.reason?.message}`)
                results.push({
                    subaccountId: config.subaccountId,
                    subaccountName: config.subaccountName,
                    alertLevel: 'ALERT',
                    totalCu: 0,
                    percentageUsed: 0,
                    projectedCu: 0,
                    message: `Error: ${result.reason?.message || 'Unknown error'}`
                })
            }
        }
    }

    info(`=== Monitoring complete: ${results.length} subaccount(s) checked ===`)
    return results
}

/**
 * Run monitoring for a SINGLE subaccount by its ID.
 * Looks up the config from DB and runs the check.
 *
 * @param {string} subaccountId - The subaccount UUID to check
 * @param {boolean} dryRun - If true, skip notifications
 * @returns {Object} Result object
 */
async function runMonitoringForSubaccount(subaccountId, dryRun = false) {
    info(`=== Monitoring single subaccount: ${subaccountId} (dryRun=${dryRun}) ===`)

    const db = cds.db || await cds.connect.to('db')

    const monConfig = await db.run(
        SELECT.one.from('aicorefin.MonitoringConfigs').where({ subaccountId, isActive: true })
    )

    if (!monConfig) {
        throw new Error(`No active monitoring configuration found for subaccount '${subaccountId}'.`)
    }

    return runCheckForConfig(monConfig, dryRun)
}

/**
 * Run one monitoring check cycle for a specific config.
 *
 * @param {Object} monConfig - Monitoring configuration record
 * @param {boolean} dryRun - If true, skip notifications
 * @returns {Object} Result object
 */
async function runCheckForConfig(monConfig, dryRun = false, preloadedCostRecords = null) {
    const db = cds.db || await cds.connect.to('db')

    info(`Checking subaccount '${monConfig.subaccountName}' (${monConfig.subaccountId})...`)

    // 1. Read notification config (shared)
    const notifConfig = await db.run(
        SELECT.one.from('aicorefin.NotificationConfigs')
    )

    // 2. Fetch usage from UAS API
    const usage = await getCurrentMonthUsage(monConfig.subaccountId)

    const totalCu = usage.totalCu
    const pct = monConfig.spendingLimit > 0 ? (totalCu / monConfig.spendingLimit * 100) : 0

    info(`[${monConfig.subaccountName}] Usage: ${totalCu.toFixed(6)} CU / ${monConfig.spendingLimit} limit (${pct.toFixed(1)}%) | ` +
         `Projected: ${usage.projectedCu.toFixed(6)} CU | Day ${usage.daysElapsed} of ${usage.daysInMonth}`)

    // 3. Determine alert level
    const level = determineAlertLevel(totalCu, monConfig)
    info(`[${monConfig.subaccountName}] Alert level: ${level}`)

    // 4. Store consumption record
    const today = new Date()
    const reportYearMonth = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`

    const consumptionRecord = {
        recordDate: today.toISOString().split('T')[0],
        reportYearMonth,
        subaccountId: monConfig.subaccountId,
        subaccountName: usage.subaccountName || monConfig.subaccountName,
        totalCapacityUnits: totalCu,
        spendingLimit: monConfig.spendingLimit,
        percentageUsed: Number(pct.toFixed(2)),
        projectedCu: usage.projectedCu,
        daysElapsed: usage.daysElapsed,
        daysInMonth: usage.daysInMonth,
        interval: 'daily',
        alertLevel_ID: ALERT_LEVEL_IDS[level],
        notificationSent: false,
        modelUsages: Object.entries(usage.byApplication || {}).map(([modelName, cu]) => {
            const tokens = (usage.tokensByApplication || {})[modelName] || {}
            const breakdown = (usage.cuByType || {})[modelName] || { inference: 0, grounding: 0, genaiToken: 0, dataIndexed: 0 }
            return {
                modelName,
                capacityUnits: cu,
                inferenceCu: breakdown.inference,
                groundingCu: breakdown.grounding,
                genaiTokenCu: breakdown.genaiToken,
                dataIndexedCu: breakdown.dataIndexed,
                inputTokens: tokens.inputTokens || 0,
                outputTokens: tokens.outputTokens || 0,
                totalTokens: (tokens.inputTokens || 0) + (tokens.outputTokens || 0),
                sharePercentage: totalCu > 0 ? Number((cu / totalCu * 100).toFixed(2)) : 0
            }
        })
    }

    // Check if a record for this month + subaccount already exists (one per month)
    const existingRecord = await db.run(
        SELECT.one.from('aicorefin.ConsumptionRecords').where({
            reportYearMonth,
            subaccountId: monConfig.subaccountId
        })
    )

    if (existingRecord) {
        // Update existing record (includes spendingLimit so config changes are reflected)
        await db.run(
            UPDATE('aicorefin.ConsumptionRecords')
                .set({
                    totalCapacityUnits: consumptionRecord.totalCapacityUnits,
                    spendingLimit: monConfig.spendingLimit,
                    percentageUsed: consumptionRecord.percentageUsed,
                    projectedCu: consumptionRecord.projectedCu,
                    daysElapsed: consumptionRecord.daysElapsed,
                    alertLevel_ID: consumptionRecord.alertLevel_ID
                })
                .where({ ID: existingRecord.ID })
        )
        // Delete old model usages and re-insert
        await db.run(DELETE.from('aicorefin.ModelUsages').where({ consumptionRecord_ID: existingRecord.ID }))
        if (consumptionRecord.modelUsages.length > 0) {
            await db.run(
                INSERT.into('aicorefin.ModelUsages').entries(
                    consumptionRecord.modelUsages.map(m => ({ ...m, consumptionRecord_ID: existingRecord.ID }))
                )
            )
        }
        info(`[${monConfig.subaccountName}] Updated existing record for ${consumptionRecord.recordDate}`)
    } else {
        // Insert new record
        await db.run(INSERT.into('aicorefin.ConsumptionRecords').entries(consumptionRecord))
        info(`[${monConfig.subaccountName}] Inserted new record for ${consumptionRecord.recordDate}`)
    }

    // 5. Send notifications (unless dry run)
    let notificationResults = { smtp: false, ans: false }

    if (!dryRun && notifConfig) {
        const shouldNotify = (
            level === 'WARNING' || level === 'ALERT' ||
            monConfig.receiveDailyEmails
        )

        if (shouldNotify) {
            info(`[${monConfig.subaccountName}] Sending ${level} notification...`)

            notificationResults.smtp = await sendSmtpNotification(usage, level, notifConfig, monConfig)
            notificationResults.ans = await sendAnsNotification(usage, level, notifConfig, monConfig)

            // Log the alert
            await db.run(INSERT.into('aicorefin.AlertLogs').entries({
                alertTimestamp: new Date().toISOString(),
                alertLevel_ID: ALERT_LEVEL_IDS[level],
                subaccountId: monConfig.subaccountId,
                subaccountName: usage.subaccountName || monConfig.subaccountName,
                totalCu: totalCu,
                percentageUsed: Number(pct.toFixed(2)),
                spendingLimit: monConfig.spendingLimit,
                message: `${level}: ${pct.toFixed(1)}% of spending limit used (${totalCu.toFixed(4)} / ${monConfig.spendingLimit} CU) – ${monConfig.subaccountName}`,
                smtpSent: notificationResults.smtp,
                ansSent: notificationResults.ans,
                recipients: notifConfig.notificationEmails || ''
            }))

            // Update consumption record
            const recordId = existingRecord ? existingRecord.ID : consumptionRecord.ID
            if (recordId) {
                await db.run(
                    UPDATE('aicorefin.ConsumptionRecords')
                        .set({ notificationSent: true })
                        .where({ ID: recordId })
                )
            }

            info(`[${monConfig.subaccountName}] Notification results: SMTP=${notificationResults.smtp}, ANS=${notificationResults.ans}`)
        } else {
            info(`[${monConfig.subaccountName}] No notification sent (level=INFO, daily updates disabled)`)
        }
    }

    // 6. Store commercial data (use preloaded data if available, else fetch)
    try {
        let costRecords = preloadedCostRecords
        if (!costRecords) {
            // Single subaccount check — fetch on its own
            const dayOfMonth = today.getDate()
            const monthsToFetch = [reportYearMonth]
            if (dayOfMonth <= 3) {
                const prevY = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
                const prevM = today.getMonth() === 0 ? 12 : today.getMonth()
                monthsToFetch.push(`${prevY}${String(prevM).padStart(2, '0')}`)
            }
            const fromMonth = monthsToFetch[monthsToFetch.length - 1]
            const toMonth = monthsToFetch[0]
            costRecords = await fetchMonthlyCost(fromMonth, toMonth)
        }
        if (costRecords && costRecords.length > 0) {
            const relevant = costRecords.filter(r => r.subaccountId === monConfig.subaccountId)
            for (const r of relevant) {
                const ym = String(r.reportYearMonth)
                const existingCm = await db.run(
                    SELECT.one.from('aicorefin.CommercialMeasures').where({
                        reportYearMonth: ym,
                        subaccountId: r.subaccountId,
                        measureId: r.measureId
                    })
                )
                const entry = {
                    reportYearMonth: ym,
                    subaccountId: r.subaccountId,
                    subaccountName: r.subaccountName || monConfig.subaccountName,
                    serviceId: r.serviceId,
                    serviceName: r.serviceName || 'AI Core',
                    plan: r.plan || '', planName: r.planName || '',
                    measureId: r.measureId, metricName: r.metricName || '',
                    usage: r.usage || 0, actualUsage: r.actualUsage || 0,
                    chargedBlocks: r.chargedBlocks || 0,
                    cost: r.cost || 0, currency: r.currency || '',
                    paygCost: r.paygCost || 0, cloudCreditsCost: r.cloudCreditsCost || 0,
                    unit: r.unitPlural || r.unit || ''
                }
                if (existingCm) {
                    await db.run(UPDATE('aicorefin.CommercialMeasures').set(entry).where({ ID: existingCm.ID }))
                } else {
                    await db.run(INSERT.into('aicorefin.CommercialMeasures').entries(entry))
                }
            }
            info(`[${monConfig.subaccountName}] Updated ${relevant.length} commercial measures for ${reportYearMonth}`)
        }
    } catch (err) {
        warn(`[${monConfig.subaccountName}] Commercial data fetch failed (non-fatal): ${err.message}`)
    }

    return {
        subaccountId: monConfig.subaccountId,
        subaccountName: monConfig.subaccountName,
        alertLevel: level,
        totalCu,
        percentageUsed: Number(pct.toFixed(2)),
        projectedCu: usage.projectedCu,
        message: `${pct.toFixed(1)}% of limit used`
    }
}

module.exports = {
    runMonitoringJob,
    runMonitoringForSubaccount,
    runCheckForConfig,
    determineAlertLevel
}