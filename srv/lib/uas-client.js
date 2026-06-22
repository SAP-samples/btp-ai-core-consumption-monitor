/**
 * uas-client.js
 * -------------
 * Client for the SAP BTP Usage and Accounting Service (UAS) Reporting API.
 * Handles OAuth2 token management and fetches AI Core capacity unit usage.
 */

const cds = require('@sap/cds')
const { filterServices } = require('@sap/xsenv')

const { info, warn, error } = cds.log('uas-client')

// ── Token cache ───────────────────────────────────────────────────────────────

let _tokenCache = { accessToken: null, expiresAt: 0 }

/**
 * Resolve UAS credentials from CF service binding (VCAP_SERVICES)
 * or from environment variables for local dev.
 */
function getUasCredentials() {
    // Try CF service binding first
    try {
        const bindings = filterServices(binding => /.*uas.*/.test(binding.name))
        if (bindings.length > 0) {
            const creds = bindings[0].credentials
            info(`Using UAS credentials from CF service binding '${bindings[0].name}'`)
            return {
                clientId: creds.clientid,
                clientSecret: creds.clientsecret,
                tokenUrl: `${creds.url}/oauth/token`,
                reportingUrl: creds.target_url || deriveReportingUrl(creds.url)
            }
        }
    } catch (e) {
        // No bindings found, fall back to env vars
    }

    // Fall back to explicit env vars
    const clientId = process.env.UAS_CLIENT_ID
    const clientSecret = process.env.UAS_CLIENT_SECRET
    const tokenUrl = process.env.UAS_TOKEN_URL
    const reportingUrl = process.env.UAS_REPORTING_BASE_URL

    if (clientId && clientSecret && tokenUrl) {
        return {
            clientId,
            clientSecret,
            tokenUrl,
            reportingUrl: reportingUrl || deriveReportingUrl(tokenUrl)
        }
    }

    return null
}

/**
 * Derive the UAS Reporting base URL from the token URL region.
 */
function deriveReportingUrl(tokenUrl) {
    const match = tokenUrl.match(/\.authentication\.([a-z0-9-]+)\.hana\.ondemand\.com/)
    if (match) {
        const region = match[1]
        return `https://uas-reporting.cfapps.${region}.hana.ondemand.com`
    }
    return ''
}

/**
 * Fetch (or return cached) OAuth2 access token for the UAS Reporting API.
 */
async function getAccessToken() {
    const now = Date.now() / 1000
    if (_tokenCache.accessToken && now < _tokenCache.expiresAt) {
        return _tokenCache.accessToken
    }

    const creds = getUasCredentials()
    if (!creds) {
        throw new Error(
            'UAS credentials not found. Bind a UAS service instance or set ' +
            'UAS_CLIENT_ID, UAS_CLIENT_SECRET, and UAS_TOKEN_URL.'
        )
    }

    info(`Fetching new OAuth2 token from ${creds.tokenUrl}`)

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
        throw new Error(`Failed to get UAS token: ${response.status} ${response.statusText}`)
    }

    const tokenData = await response.json()
    const expiresIn = tokenData.expires_in || 3600

    _tokenCache.accessToken = tokenData.access_token
    _tokenCache.expiresAt = now + expiresIn - 60 // 60-second safety margin

    info(`OAuth2 token obtained, expires in ${expiresIn} seconds`)
    return _tokenCache.accessToken
}

/**
 * Fetch subaccount usage from the UAS Reporting API.
 * @param {string} fromDate - Start date in YYYYMMDD format
 * @param {string} toDate - End date in YYYYMMDD format
 * @param {string} subaccountId - The subaccount UUID to query
 * @returns {Array} List of usage record objects
 */
async function fetchSubaccountUsage(fromDate, toDate, subaccountId) {
    const token = await getAccessToken()
    const creds = getUasCredentials()

    if (!creds || !creds.reportingUrl) {
        throw new Error(
            'Cannot determine UAS Reporting URL. ' +
            'Set UAS_REPORTING_BASE_URL or ensure the token URL contains a recognisable region.'
        )
    }

    const url = `${creds.reportingUrl}/reports/v1/subaccountUsage?fromDate=${fromDate}&toDate=${toDate}&subaccountId=${subaccountId}`

    info(`Fetching usage for subaccount ${subaccountId} from ${fromDate} to ${toDate}`)

    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!response.ok) {
        throw new Error(`UAS API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const records = data.content || []

    // Single log: URL, status, and only AI Core records
    const aiCoreOnly = records.filter(r => r.serviceId === 'ai-core')
    info(`UAS_API_RESPONSE | url=${url} | status=${response.status} | totalRecords=${records.length} | aiCoreRecords=${aiCoreOnly.length} | response=${JSON.stringify(aiCoreOnly)}`)

    return records
}

/**
 * Filter records to AI Core capacity units and aggregate them.
 * @param {Array} records - Raw usage records from the UAS API
 * @returns {Object} Aggregated data with total_cu, by_application, cuByType, etc.
 */
function aggregateAiCoreUsage(records) {
    // Total CU = ALL measures where unit is "capacity units" (matches BTP Cockpit behavior)
    // This includes: capacity_units, capacity_units_grounding, genai_token_capacity_units, data_indexed_in_gbs_per_day
    const cuRecords = records.filter(
        r => r.serviceId === 'ai-core' && (r.unitPlural === 'capacity units' || r.measureId === 'capacity_units' || r.measureId === 'capacity_units_grounding' || r.measureId === 'genai_token_capacity_units' || r.measureId === 'data_indexed_in_gbs_per_day')
    )

    const totalCu = cuRecords.reduce((sum, r) => sum + (r.usage || 0), 0)

    // Group by application/model (all CU-contributing measures)
    const byApplication = {}
    const cuByType = {}  // { app: { inference, grounding, genaiToken, dataIndexed } }
    for (const r of cuRecords) {
        const app = r.application || 'unknown'
        byApplication[app] = (byApplication[app] || 0) + (r.usage || 0)
        if (!cuByType[app]) cuByType[app] = { inference: 0, grounding: 0, genaiToken: 0, dataIndexed: 0 }
        if (r.measureId === 'capacity_units') cuByType[app].inference += (r.usage || 0)
        else if (r.measureId === 'capacity_units_grounding') cuByType[app].grounding += (r.usage || 0)
        else if (r.measureId === 'genai_token_capacity_units') cuByType[app].genaiToken += (r.usage || 0)
        else if (r.measureId === 'data_indexed_in_gbs_per_day') cuByType[app].dataIndexed += (r.usage || 0)
        else cuByType[app].inference += (r.usage || 0) // fallback
    }

    // Sort by consumption descending
    const sortedApps = Object.entries(byApplication)
        .sort((a, b) => b[1] - a[1])
        .reduce((obj, [k, v]) => { obj[k] = v; return obj }, {})

    // Extract metadata
    let subaccountName = ''
    let periodStart = ''
    let periodEnd = ''
    if (cuRecords.length > 0) {
        subaccountName = cuRecords[0].subaccountName || ''
        periodStart = cuRecords[0].startIsoDate || ''
        periodEnd = cuRecords[0].endIsoDate || ''
    }

    // Also check for token-based measures
    const tokenRecords = records.filter(
        r => r.serviceId === 'ai-core' && (r.measureId === 'input_tokens' || r.measureId === 'output_tokens')
    )
    const tokensByApplication = {}
    for (const r of tokenRecords) {
        const app = r.application || 'unknown'
        if (!tokensByApplication[app]) {
            tokensByApplication[app] = { inputTokens: 0, outputTokens: 0 }
        }
        if (r.measureId === 'input_tokens') {
            tokensByApplication[app].inputTokens += (r.usage || 0)
        } else {
            tokensByApplication[app].outputTokens += (r.usage || 0)
        }
    }

    return {
        totalCu,
        byApplication: sortedApps,
        cuByType,
        tokensByApplication,
        subaccountName,
        periodStart,
        periodEnd,
        rawRecordCount: cuRecords.length
    }
}

/**
 * Fetch and aggregate AI Core capacity unit usage for the current calendar month.
 * @param {string} subaccountId - The subaccount UUID
 * @returns {Object} Usage data with totals, projections, and model breakdown
 */
async function getCurrentMonthUsage(subaccountId) {
    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

    // Days in current month
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const daysInMonth = Math.round((nextMonth - monthStart) / (1000 * 60 * 60 * 24))
    const daysElapsed = Math.round((today - monthStart) / (1000 * 60 * 60 * 24)) + 1

    const fromDate = formatDate(monthStart)
    const toDate = formatDate(today)

    const records = await fetchSubaccountUsage(fromDate, toDate, subaccountId)
    const result = aggregateAiCoreUsage(records)

    // Linear projection
    const projectedCu = daysElapsed > 0
        ? (result.totalCu / daysElapsed) * daysInMonth
        : 0

    return {
        ...result,
        daysElapsed,
        daysInMonth,
        projectedCu,
        fetchDate: today.toISOString().split('T')[0],
        fromDate,
        toDate
    }
}

/**
 * Format a Date object to YYYYMMDD string
 */
function formatDate(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}${m}${d}`
}

/**
 * Fetch monthly cost data from the UAS monthlySubaccountsCost endpoint.
 * @param {number} fromDate - Start month in YYYYMM format (e.g. 202501)
 * @param {number} toDate - End month in YYYYMM format (e.g. 202606)
 * @returns {Array} List of cost record objects
 */
async function fetchMonthlyCost(fromDate, toDate) {
    const token = await getAccessToken()
    const creds = getUasCredentials()

    if (!creds || !creds.reportingUrl) {
        throw new Error('Cannot determine UAS Reporting URL.')
    }

    const url = `${creds.reportingUrl}/reports/v1/monthlySubaccountsCost?fromDate=${fromDate}&toDate=${toDate}`

    info(`Fetching monthly cost data from ${fromDate} to ${toDate}`)

    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!response.ok) {
        throw new Error(`UAS Monthly Cost API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const records = data.content || []

    // Filter to AI Core only and log
    const aiCoreOnly = records.filter(r => r.serviceId === 'ai-core')
    info(`UAS_MONTHLY_COST_RESPONSE | url=${url} | status=${response.status} | totalRecords=${records.length} | aiCoreRecords=${aiCoreOnly.length}`)

    return aiCoreOnly
}

module.exports = {
    getUasCredentials,
    fetchSubaccountUsage,
    fetchMonthlyCost,
    aggregateAiCoreUsage,
    getCurrentMonthUsage
}
