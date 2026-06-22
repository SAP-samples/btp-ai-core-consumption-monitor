/**
 * service.js
 * ----------
 * CAP service handler for the FinOpsService.
 * Implements custom actions, functions, and the Job Scheduler callback.
 * Supports multi-subaccount monitoring.
 */

const cds = require('@sap/cds')
const { runMonitoringJob, runMonitoringForSubaccount } = require('./lib/monitoring')
const { sendSmtpNotification, sendTestEmail, invalidateTransporterCache } = require('./lib/smtp-notifier')
const { sendAnsNotification } = require('./lib/ans-notifier')

const { encrypt } = require('./lib/crypto')
const { info, warn, error } = cds.log('service')

// Fields that should be encrypted before storage
const SENSITIVE_FIELDS = ['smtpPassword', 'apiKey']

module.exports = class FinOpsService extends cds.ApplicationService {
    async init() {

        // ── Encrypt sensitive fields before saving NotificationConfigs ─────────
        this.before(['UPDATE', 'CREATE'], 'NotificationConfigs', (req) => {
            for (const field of SENSITIVE_FIELDS) {
                if (req.data[field] && !req.data[field].startsWith('enc:')) {
                    req.data[field] = encrypt(req.data[field])
                }
            }
        })

        // ── triggerCheck action ───────────────────────────────────────────────
        this.on('triggerCheck', async (req) => {
            const dryRun = req.data.dryRun || false
            const subaccountId = req.data.subaccountId || null
            info(`triggerCheck called (dryRun=${dryRun}, subaccountId=${subaccountId || 'ALL'})`)

            try {
                if (subaccountId) {
                    // Check a single subaccount
                    const result = await runMonitoringForSubaccount(subaccountId, dryRun)
                    return {
                        status: 'ok',
                        results: [result],
                        totalChecked: 1,
                        message: `Check complete for ${result.subaccountName || subaccountId}`
                    }
                } else {
                    // Check ALL active subaccounts
                    const results = await runMonitoringJob(dryRun)
                    return {
                        status: 'ok',
                        results,
                        totalChecked: results.length,
                        message: `Check complete for ${results.length} subaccount(s)`
                    }
                }
            } catch (err) {
                error(`triggerCheck failed: ${err.message}`)
                return {
                    status: 'error',
                    results: [],
                    totalChecked: 0,
                    message: `Error: ${err.message}`
                }
            }
        })

        // ── testNotification action ──────────────────────────────────────────
        this.on('testNotification', async (req) => {
            info('testNotification called')

            const db = cds.db || await cds.connect.to('db')

            const monConfig = await db.run(
                SELECT.one.from('aicorefin.MonitoringConfigs').where({ isActive: true }).orderBy({ displayOrder: 'asc' })
            )
            const notifConfig = await db.run(
                SELECT.one.from('aicorefin.NotificationConfigs')
            )

            if (!monConfig || !notifConfig) {
                return {
                    smtpResult: false,
                    ansResult: false,
                    message: 'Configuration not found. Please set up monitoring and notification configs first.'
                }
            }

            // Create a test usage object
            const testUsage = {
                totalCu: 42.1234,
                byApplication: {
                    'anthropic--claude-sonnet-test': 30.5,
                    'gpt-4-test': 10.1234,
                    'text-embedding-test': 1.5
                },
                tokensByApplication: {},
                subaccountName: monConfig.subaccountName || 'Test Subaccount',
                periodStart: new Date().toISOString().split('T')[0],
                periodEnd: new Date().toISOString().split('T')[0],
                projectedCu: 65.4321,
                daysElapsed: 15,
                daysInMonth: 30,
                fetchDate: new Date().toISOString().split('T')[0]
            }

            const smtpResult = await sendSmtpNotification(testUsage, 'INFO', notifConfig, monConfig)
            const ansResult = await sendAnsNotification(testUsage, 'INFO', notifConfig, monConfig)

            const smtpOk = smtpResult && smtpResult.success
            const smtpErr = (smtpResult && smtpResult.error) || ''
            const ansOk = ansResult === true

            return {
                smtpResult: smtpOk,
                ansResult: ansOk,
                message: 'Test notification sent. SMTP: ' + (smtpOk ? 'success' : 'failed (' + smtpErr + ')') + ', ANS: ' + (ansOk ? 'success' : 'failed/disabled')
            }
        })

                // ── sendTestEmail action ─────────────────────────────────────────────
        this.on('sendTestEmail', async (req) => {
            info('sendTestEmail called: ' + req.data.recipientEmail)
            const db = cds.db || await cds.connect.to('db')
            const notifConfig = await db.run(SELECT.one.from('aicorefin.NotificationConfigs'))
            return await sendTestEmail(req.data.recipientEmail, notifConfig)
        })

        // ── loadHistoricalData action ─────────────────────────────────────────
        this.on('loadHistoricalData', async (req) => {
            const { fromDate, toDate, subaccountId } = req.data
            info(`loadHistoricalData called (from=${fromDate}, to=${toDate}, subaccountId=${subaccountId || 'ALL'})`)

            const db = cds.db || await cds.connect.to('db')
            const { fetchSubaccountUsage, fetchMonthlyCost } = require('./lib/uas-client')

            // Determine which subaccounts to load
            let configs
            if (subaccountId) {
                configs = await db.run(
                    SELECT.from('aicorefin.MonitoringConfigs').where({ subaccountId, isActive: true })
                )
            } else {
                configs = await db.run(
                    SELECT.from('aicorefin.MonitoringConfigs').where({ isActive: true })
                )
            }

            if (!configs || configs.length === 0) {
                return { status: 'error', recordsLoaded: 0, daysProcessed: 0, message: 'No active subaccount configs found.' }
            }

            // Alert level IDs
            const ALERT_LEVEL_IDS = {
                INFO: 'a0e00001-0000-4000-8000-000000000001',
                WARNING: 'a0e00001-0000-4000-8000-000000000002',
                ALERT: 'a0e00001-0000-4000-8000-000000000003'
            }

            let totalRecordsLoaded = 0
            let totalMonthsProcessed = 0

            // Generate list of months between fromDate and toDate
            const startYear = parseInt(fromDate.slice(0, 4))
            const startMonth = parseInt(fromDate.slice(4, 6))
            const endYear = parseInt(toDate.slice(0, 4))
            const endMonth = parseInt(toDate.slice(4, 6))

            const monthsList = []
            let y = startYear, m = startMonth
            while (y < endYear || (y === endYear && m <= endMonth)) {
                monthsList.push({ year: y, month: m, ym: `${y}${String(m).padStart(2, '0')}` })
                m++
                if (m > 12) { m = 1; y++ }
            }
            info(`[Historical] Will process ${monthsList.length} months for ${configs.length} subaccount(s)`)

            const now = new Date()
            const currentYM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`

            for (const config of configs) {
                try {
                    info(`[Historical] Loading data for '${config.subaccountName}' (${config.subaccountId})...`)

                    for (const monthInfo of monthsList) {
                        // Calculate month start/end dates in YYYYMMDD format
                        const monthStart = `${monthInfo.ym}01`
                        const lastDay = new Date(monthInfo.year, monthInfo.month, 0).getDate()
                        const monthEnd = `${monthInfo.ym}${String(lastDay).padStart(2, '0')}`

                        info(`[Historical] Fetching ${monthInfo.ym} (${monthStart} to ${monthEnd}) for ${config.subaccountName}...`)

                        // Fetch from UAS API for this specific month
                        const records = await fetchSubaccountUsage(monthStart, monthEnd, config.subaccountId)

                        // Filter to AI Core only
                        const aiCoreRecords = (records || []).filter(r => r.serviceId === 'ai-core')

                        if (aiCoreRecords.length === 0) {
                            info(`[Historical] No AI Core records for ${monthInfo.ym}`)
                            continue
                        }

                        // Aggregate ALL CU-type measures (capacity_units + grounding + genai_token + data_indexed)
                        const cuRecords = aiCoreRecords.filter(r => r.unitPlural === 'capacity units' || r.measureId === 'capacity_units' || r.measureId === 'capacity_units_grounding' || r.measureId === 'genai_token_capacity_units' || r.measureId === 'data_indexed_in_gbs_per_day')
                        const totalCu = cuRecords.reduce((sum, r) => sum + (r.usage || 0), 0)

                        // Aggregate by model/application with per-type CU breakdown
                        const byApp = {}       // total CU per app
                        const cuByType = {}    // { app: { inference, grounding, genaiToken, dataIndexed } }
                        for (const r of cuRecords) {
                            const app = r.application || r.servicePlanName || 'unknown'
                            byApp[app] = (byApp[app] || 0) + (r.usage || 0)
                            if (!cuByType[app]) cuByType[app] = { inference: 0, grounding: 0, genaiToken: 0, dataIndexed: 0 }
                            if (r.measureId === 'capacity_units') cuByType[app].inference += (r.usage || 0)
                            else if (r.measureId === 'capacity_units_grounding') cuByType[app].grounding += (r.usage || 0)
                            else if (r.measureId === 'genai_token_capacity_units') cuByType[app].genaiToken += (r.usage || 0)
                            else if (r.measureId === 'data_indexed_in_gbs_per_day') cuByType[app].dataIndexed += (r.usage || 0)
                            else cuByType[app].inference += (r.usage || 0) // fallback
                        }

                        // Aggregate tokens by model
                        const tokensByApp = {}
                        const tokenRecords = aiCoreRecords.filter(r => r.measureId === 'input_tokens' || r.measureId === 'output_tokens')
                        for (const r of tokenRecords) {
                            const app = r.application || r.servicePlanName || 'unknown'
                            if (!tokensByApp[app]) tokensByApp[app] = { inputTokens: 0, outputTokens: 0 }
                            if (r.measureId === 'input_tokens') tokensByApp[app].inputTokens += (r.usage || 0)
                            else tokensByApp[app].outputTokens += (r.usage || 0)
                        }

                        const reportYearMonth = monthInfo.ym
                        const isCurrentMonth = reportYearMonth === currentYM
                        const todayDay = now.getDate()
                        const recordDate = isCurrentMonth
                            ? `${monthInfo.year}-${String(monthInfo.month).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`
                            : `${monthInfo.year}-${String(monthInfo.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
                        const interval = isCurrentMonth ? 'daily' : 'monthly'

                        // Calculate days elapsed and projection for current month
                        const daysElapsed = isCurrentMonth ? todayDay : lastDay
                        const daysInMonth = lastDay
                        const projectedCu = (isCurrentMonth && daysElapsed > 0)
                            ? Number((totalCu / daysElapsed * daysInMonth).toFixed(6))
                            : 0

                        // Calculate percentage and alert level
                        const pct = config.spendingLimit > 0 ? (totalCu / config.spendingLimit * 100) : 0
                        let level = 'INFO'
                        if (pct >= config.alertThresholdPct) level = 'ALERT'
                        else if (pct >= config.warningThresholdPct) level = 'WARNING'

                        // Build model usages with CU breakdown
                        const modelUsages = Object.entries(byApp).map(([modelName, cu]) => {
                            const tokens = tokensByApp[modelName] || {}
                            const breakdown = cuByType[modelName] || { inference: 0, grounding: 0, genaiToken: 0, dataIndexed: 0 }
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

                        // Also add models with tokens but no CU
                        for (const [app, tokens] of Object.entries(tokensByApp)) {
                            if (!byApp[app]) {
                                modelUsages.push({
                                    modelName: app, capacityUnits: 0,
                                    inferenceCu: 0, groundingCu: 0, genaiTokenCu: 0, dataIndexedCu: 0,
                                    inputTokens: tokens.inputTokens || 0, outputTokens: tokens.outputTokens || 0,
                                    totalTokens: (tokens.inputTokens || 0) + (tokens.outputTokens || 0), sharePercentage: 0
                                })
                            }
                        }

                        // Upsert by reportYearMonth + subaccountId (one record per month)
                        const existing = await db.run(
                            SELECT.one.from('aicorefin.ConsumptionRecords').where({
                                reportYearMonth,
                                subaccountId: config.subaccountId
                            })
                        )

                        if (existing) {
                            await db.run(UPDATE('aicorefin.ConsumptionRecords').set({
                                recordDate, totalCapacityUnits: totalCu,
                                percentageUsed: Number(pct.toFixed(2)),
                                projectedCu, daysElapsed, daysInMonth,
                                alertLevel_ID: ALERT_LEVEL_IDS[level], interval
                            }).where({ ID: existing.ID }))
                            await db.run(DELETE.from('aicorefin.ModelUsages').where({ consumptionRecord_ID: existing.ID }))
                            if (modelUsages.length > 0) {
                                await db.run(INSERT.into('aicorefin.ModelUsages').entries(
                                    modelUsages.map(m => ({ ...m, consumptionRecord_ID: existing.ID }))
                                ))
                            }
                        } else {
                            await db.run(INSERT.into('aicorefin.ConsumptionRecords').entries({
                                recordDate, reportYearMonth,
                                subaccountId: config.subaccountId, subaccountName: config.subaccountName,
                                totalCapacityUnits: totalCu, spendingLimit: config.spendingLimit,
                                percentageUsed: Number(pct.toFixed(2)), projectedCu,
                                daysElapsed, daysInMonth, interval,
                                alertLevel_ID: ALERT_LEVEL_IDS[level], notificationSent: false,
                                modelUsages
                            }))
                        }

                        totalRecordsLoaded += modelUsages.length
                        totalMonthsProcessed++
                    }

                    info(`[Historical] Completed ${config.subaccountName}`)
                } catch (err) {
                    error(`[Historical] Failed for ${config.subaccountName}: ${err.message}`)
                }
            }

            // ── Also load commercial data (monthlySubaccountsCost) ──────────────
            try {
                const fromMonth = fromDate.slice(0, 6)  // YYYYMMDD → YYYYMM
                const toMonth = toDate.slice(0, 6)
                info(`[Historical] Loading commercial data from ${fromMonth} to ${toMonth}...`)

                const costRecords = await fetchMonthlyCost(fromMonth, toMonth)

                if (costRecords && costRecords.length > 0) {
                    // Filter by configured subaccounts
                    const configSubIds = configs.map(c => c.subaccountId)
                    const relevantCost = costRecords.filter(r => configSubIds.includes(r.subaccountId))

                    for (const r of relevantCost) {
                        const ym = String(r.reportYearMonth)
                        // Check if already exists
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
                            subaccountName: r.subaccountName || '',
                            serviceId: r.serviceId,
                            serviceName: r.serviceName || 'AI Core',
                            plan: r.plan || '',
                            planName: r.planName || '',
                            measureId: r.measureId,
                            metricName: r.metricName || '',
                            usage: r.usage || 0,
                            actualUsage: r.actualUsage || 0,
                            chargedBlocks: r.chargedBlocks || 0,
                            cost: r.cost || 0,
                            currency: r.currency || '',
                            paygCost: r.paygCost || 0,
                            cloudCreditsCost: r.cloudCreditsCost || 0,
                            unit: r.unitPlural || r.unit || ''
                        }
                        if (existingCm) {
                            await db.run(UPDATE('aicorefin.CommercialMeasures').set(entry).where({ ID: existingCm.ID }))
                        } else {
                            await db.run(INSERT.into('aicorefin.CommercialMeasures').entries(entry))
                        }
                    }
                    info(`[Historical] Loaded ${relevantCost.length} commercial measure records`)
                    totalRecordsLoaded += relevantCost.length
                }
            } catch (err) {
                warn(`[Historical] Commercial data load failed (non-fatal): ${err.message}`)
            }

            return {
                status: 'ok',
                recordsLoaded: totalRecordsLoaded,
                daysProcessed: totalMonthsProcessed,
                message: `Loaded ${totalMonthsProcessed} months with ${totalRecordsLoaded} records (technical + commercial) for ${configs.length} subaccount(s)`
            }
        })

        // ── overviewStatus function ───────────────────────────────────────────
        this.on('overviewStatus', async (req) => {
            const db = cds.db || await cds.connect.to('db')

            // Get all active monitoring configs
            const configs = await db.run(
                SELECT.from('aicorefin.MonitoringConfigs')
                    .where({ isActive: true })
                    .orderBy({ displayOrder: 'asc' })
            )

            if (!configs || configs.length === 0) {
                return []
            }

            const results = []

            for (const config of configs) {
                // Get the latest consumption record for this subaccount
                const latest = await db.run(
                    SELECT.one.from('aicorefin.ConsumptionRecords')
                        .where({ subaccountId: config.subaccountId })
                        .orderBy({ recordDate: 'desc' })
                )

                // Get alert level name
                let alertLevelName = 'INFO'
                if (latest && latest.alertLevel_ID) {
                    const alertLevel = await db.run(
                        SELECT.one.from('aicorefin.AlertLevels').where({ ID: latest.alertLevel_ID })
                    )
                    if (alertLevel) alertLevelName = alertLevel.name
                }

                results.push({
                    subaccountId: config.subaccountId,
                    subaccountName: config.subaccountName,
                    totalCu: latest ? latest.totalCapacityUnits : 0,
                    spendingLimit: config.spendingLimit,
                    percentageUsed: latest ? latest.percentageUsed : 0,
                    projectedCu: latest ? latest.projectedCu : 0,
                    alertLevel: alertLevelName,
                    daysElapsed: latest ? latest.daysElapsed : 0,
                    daysInMonth: latest ? latest.daysInMonth : 0,
                    lastCheckDate: latest ? latest.recordDate : null,
                    tags: config.tags || ''
                })
            }

            return results
        })

        // ── currentStatus function ───────────────────────────────────────────
        this.on('currentStatus', async (req) => {
            const db = cds.db || await cds.connect.to('db')
            const subaccountId = req.data.subaccountId

            // Build query based on whether subaccountId is provided
            let latest
            if (subaccountId) {
                latest = await db.run(
                    SELECT.one.from('aicorefin.ConsumptionRecords')
                        .where({ subaccountId })
                        .orderBy({ recordDate: 'desc' })
                )
            } else {
                // Fallback: get the very latest record across all subaccounts
                latest = await db.run(
                    SELECT.one.from('aicorefin.ConsumptionRecords')
                        .orderBy({ recordDate: 'desc' })
                )
            }

            if (!latest) {
                // Return defaults from config if available
                let config = null
                if (subaccountId) {
                    config = await db.run(
                        SELECT.one.from('aicorefin.MonitoringConfigs').where({ subaccountId, isActive: true })
                    )
                }
                return {
                    subaccountId: subaccountId || '',
                    subaccountName: config ? config.subaccountName : '',
                    totalCu: 0,
                    spendingLimit: config ? config.spendingLimit : 100,
                    percentageUsed: 0,
                    projectedCu: 0,
                    alertLevel: 'INFO',
                    daysElapsed: 0,
                    daysInMonth: 0,
                    lastCheckDate: null,
                    topModels: []
                }
            }

            // Get model usages for the latest record
            const models = await db.run(
                SELECT.from('aicorefin.ModelUsages')
                    .where({ consumptionRecord_ID: latest.ID })
                    .orderBy({ capacityUnits: 'desc' })
                    .limit(10)
            )

            // Get alert level name
            const alertLevel = await db.run(
                SELECT.one.from('aicorefin.AlertLevels').where({ ID: latest.alertLevel_ID })
            )

            return {
                subaccountId: latest.subaccountId,
                subaccountName: latest.subaccountName,
                totalCu: latest.totalCapacityUnits,
                spendingLimit: latest.spendingLimit,
                percentageUsed: latest.percentageUsed,
                projectedCu: latest.projectedCu,
                alertLevel: alertLevel ? alertLevel.name : 'INFO',
                daysElapsed: latest.daysElapsed,
                daysInMonth: latest.daysInMonth,
                lastCheckDate: latest.recordDate,
                topModels: models.map(m => ({
                    modelName: m.modelName,
                    capacityUnits: m.capacityUnits,
                    sharePercentage: m.sharePercentage
                }))
            }
        })

        // ── monthlyStats function ────────────────────────────────────────────
        this.on('monthlyStats', async (req) => {
            const db = cds.db || await cds.connect.to('db')
            const year = req.data.year || new Date().getFullYear()
            const subaccountId = req.data.subaccountId

            const yearPrefix = String(year)

            // Build where conditions
            const conditions = { reportYearMonth: { like: yearPrefix + '%' } }
            if (subaccountId) {
                conditions.subaccountId = subaccountId
            }

            // Get records for this year (and optionally subaccount)
            const records = await db.run(
                SELECT.from('aicorefin.ConsumptionRecords')
                    .where(conditions)
                    .orderBy({ recordDate: 'desc' })
            )

            const filteredRecords = records

            // Group by reportYearMonth and take the latest per month
            const monthlyMap = {}
            for (const rec of filteredRecords) {
                if (!monthlyMap[rec.reportYearMonth]) {
                    monthlyMap[rec.reportYearMonth] = rec
                }
            }

            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

            return Object.values(monthlyMap)
                .sort((a, b) => a.reportYearMonth.localeCompare(b.reportYearMonth))
                .map(rec => {
                    const monthIdx = parseInt(rec.reportYearMonth.slice(4, 6)) - 1
                    return {
                        month: months[monthIdx] || rec.reportYearMonth,
                        reportYearMonth: rec.reportYearMonth,
                        totalCu: rec.totalCapacityUnits,
                        projectedCu: rec.projectedCu,
                        spendingLimit: rec.spendingLimit,
                        percentageUsed: rec.percentageUsed
                    }
                })
        })

        // ── dailyStats function ──────────────────────────────────────────────
        this.on('dailyStats', async (req) => {
            const db = cds.db || await cds.connect.to('db')
            const reportYearMonth = req.data.reportYearMonth
            const subaccountId = req.data.subaccountId

            if (!reportYearMonth) {
                return []
            }

            // Build where conditions
            const conditions = { reportYearMonth }
            if (subaccountId) {
                conditions.subaccountId = subaccountId
            }

            const records = await db.run(
                SELECT.from('aicorefin.ConsumptionRecords')
                    .where(conditions)
                    .orderBy({ recordDate: 'asc' })
            )

            // Batch fetch alert levels to avoid N+1
            const alertLevelIds = [...new Set(records.map(r => r.alertLevel_ID).filter(Boolean))]
            const alertLevels = alertLevelIds.length > 0
                ? await db.run(SELECT.from('aicorefin.AlertLevels').where({ ID: { in: alertLevelIds } }))
                : []
            const alertLevelMap = {}
            for (const al of alertLevels) {
                alertLevelMap[al.ID] = al.name
            }

            // Batch fetch model counts
            const recordIds = records.map(r => r.ID)
            let modelCountMap = {}
            if (recordIds.length > 0) {
                const modelCounts = await db.run(
                    SELECT.from('aicorefin.ModelUsages')
                        .columns('consumptionRecord_ID', 'count(ID) as cnt')
                        .where({ consumptionRecord_ID: { in: recordIds } })
                        .groupBy('consumptionRecord_ID')
                )
                for (const mc of modelCounts) {
                    modelCountMap[mc.consumptionRecord_ID] = mc.cnt
                }
            }

            return records.map(rec => ({
                recordDate: rec.recordDate,
                totalCu: rec.totalCapacityUnits,
                percentageUsed: rec.percentageUsed,
                projectedCu: rec.projectedCu,
                alertLevel: alertLevelMap[rec.alertLevel_ID] || 'INFO',
                modelCount: modelCountMap[rec.ID] || 0
            }))
        })

        // ── userInfo function ────────────────────────────────────────────────
        this.on('userInfo', async (req) => {
            const userId = req.user?.id || 'anonymous'
            const roles = []
            if (req.user.is('Admin')) roles.push('Admin')
            if (req.user.is('Viewer')) roles.push('Viewer')

            return {
                user: userId,
                roles
            }
        })

        return super.init()
    }
}