/**
 * ans-notifier.js
 * ---------------
 * SAP Alert Notification Service (ANS) notification sender.
 * Posts structured events to the ANS Producer API.
 *
 * Credentials are resolved ONLY from:
 *   1. CF service binding (production) — via MTA resource "ai-core-finops-ans"
 *   2. Environment variables (local dev only)
 *
 * NO secrets are stored in the database.
 */

const cds = require('@sap/cds')

const { info, warn, error } = cds.log('ans-notifier')

// ── ANS Token cache ───────────────────────────────────────────────────────────

let _ansTokenCache = { accessToken: null, expiresAt: 0 }

const LEVEL_META = {
    INFO: { severity: 'INFO', category: 'NOTIFICATION', label: 'Daily Update', emoji: '✅' },
    WARNING: { severity: 'WARNING', category: 'ALERT', label: 'Warning', emoji: '⚠️' },
    ALERT: { severity: 'ERROR', category: 'ALERT', label: 'Alert', emoji: '🚨' }
}

/**
 * Resolve ANS credentials from CF service binding or environment variables.
 * The ansServiceName from notifConfig is used to locate the correct binding.
 * NO credentials are read from the database.
 *
 * @param {Object} notifConfig - Notification config (only uses ansServiceName)
 * @returns {Object|null} credentials or null if not available
 */
function getAnsCredentials(notifConfig) {
    // 1. Try CF service binding (production path)
    try {
        const { filterServices } = require('@sap/xsenv')
        const ansServiceName = notifConfig?.ansServiceName || 'ai-core-finops-ans'
        const bindings = filterServices(binding =>
            binding.name === ansServiceName || binding.label === 'alert-notification'
        )
        if (bindings.length > 0) {
            const creds = bindings[0].credentials
            info(`Using ANS credentials from CF service binding '${bindings[0].name}'`)
            return {
                url: creds.url,
                clientId: creds.client_id,
                clientSecret: creds.client_secret,
                tokenUrl: creds.oauth_url
            }
        }
    } catch (e) {
        // No bindings found — expected in local dev
    }

    // 2. Fall back to environment variables (local dev only)
    if (process.env.ANS_URL && process.env.ANS_CLIENT_ID && process.env.ANS_CLIENT_SECRET) {
        info('Using ANS credentials from environment variables (local dev)')
        return {
            url: process.env.ANS_URL,
            clientId: process.env.ANS_CLIENT_ID,
            clientSecret: process.env.ANS_CLIENT_SECRET,
            tokenUrl: process.env.ANS_TOKEN_URL
        }
    }

    return null
}

/**
 * Fetch (or return cached) OAuth2 token for ANS.
 */
async function getAnsToken(creds) {
    const now = Date.now() / 1000
    if (_ansTokenCache.accessToken && now < _ansTokenCache.expiresAt) {
        return _ansTokenCache.accessToken
    }

    const authHeader = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')

    const response = await fetch(creds.tokenUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    })

    if (!response.ok) {
        throw new Error(`Failed to get ANS token: ${response.status} ${response.statusText}`)
    }

    const tokenData = await response.json()
    _ansTokenCache.accessToken = tokenData.access_token
    _ansTokenCache.expiresAt = now + (tokenData.expires_in || 3600) - 60
    return _ansTokenCache.accessToken
}

/**
 * Post a structured event to the SAP Alert Notification Service.
 * @param {Object} usage - Usage data from monitoring job
 * @param {string} level - Alert level (INFO, WARNING, ALERT)
 * @param {Object} notifConfig - Notification configuration from DB (only enableAns + ansServiceName used)
 * @param {Object} monConfig - Monitoring configuration from DB
 * @returns {boolean} true on success
 */
async function sendAnsNotification(usage, level, notifConfig, monConfig) {
    if (!notifConfig.enableAns) {
        info('ANS notifications disabled, skipping')
        return false
    }

    const creds = getAnsCredentials(notifConfig)
    if (!creds || !creds.url) {
        error('ANS credentials not found — ensure the alert-notification service is bound via MTA or set ANS_* env vars for local dev')
        return false
    }

    const meta = LEVEL_META[level] || LEVEL_META.INFO
    const totalCu = usage.totalCu
    const pct = monConfig.spendingLimit > 0 ? (totalCu / monConfig.spendingLimit * 100) : 0
    const subaccountName = usage.subaccountName || monConfig.subaccountId
    const topConsumer = Object.keys(usage.byApplication || {})[0] || 'none'

    const event = {
        eventType: 'AI_CORE_CAPACITY_MONITOR',
        eventTimestamp: Math.floor(Date.now() / 1000),
        severity: meta.severity,
        category: meta.category,
        subject: `AI Core Capacity ${meta.label}: ${pct.toFixed(1)}% used`,
        body: `Subaccount '${subaccountName}' (${monConfig.subaccountId}) has consumed ` +
              `${totalCu.toFixed(6)} capacity units (${pct.toFixed(1)}% of the ${monConfig.spendingLimit} CU ` +
              `monthly limit). Projected month-end: ${(usage.projectedCu || 0).toFixed(6)} CU.\n\n` +
              `Top consumer: ${topConsumer}.`,
        tags: {
            subaccountId: monConfig.subaccountId,
            subaccountName: subaccountName,
            totalCapacityUnits: String(totalCu.toFixed(6)),
            percentageUsed: String(pct.toFixed(2)),
            spendingLimit: String(monConfig.spendingLimit),
            alertLevel: level,
            projectedCu: String((usage.projectedCu || 0).toFixed(6)),
            daysElapsed: String(usage.daysElapsed || 0),
            daysInMonth: String(usage.daysInMonth || 0),
            warningThreshold: String(monConfig.warningThresholdPct),
            alertThreshold: String(monConfig.alertThresholdPct)
        },
        resource: {
            resourceName: subaccountName,
            resourceType: 'SAP BTP Subaccount',
            resourceInstance: monConfig.subaccountId,
            tags: { serviceId: 'ai-core' }
        }
    }

    try {
        const token = await getAnsToken(creds)
        const ansEventsUrl = `${creds.url.replace(/\/$/, '')}/cf/producer/v1/resource-events`

        const response = await fetch(ansEventsUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        })

        if (!response.ok) {
            throw new Error(`ANS API returned ${response.status}: ${response.statusText}`)
        }

        info(`ANS event posted successfully (level=${level}, status=${response.status})`)
        return true
    } catch (err) {
        error(`Failed to post ANS event: ${err.message}`)
        return false
    }
}

module.exports = {
    sendAnsNotification
}