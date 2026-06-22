/**
 * API service layer for the AI Core FinOps Dashboard.
 * Handles all communication with the CAP OData backend.
 * Supports multi-subaccount operations.
 */

function getBaseUrl() {
  if (import.meta.env.DEV) {
    return '/service/FinOpsService'
  }
  return './service/FinOpsService'
}

const BASE_URL = getBaseUrl()

// ── CSRF Token Management ───────────────────────────────────────────
let csrfToken = null

async function fetchCsrfToken() {
  if (csrfToken) return csrfToken
  const response = await fetch(`${BASE_URL}/`, {
    method: 'HEAD',
    headers: { 'X-CSRF-Token': 'Fetch' }
  })
  csrfToken = response.headers.get('x-csrf-token')
  return csrfToken
}

async function mutationFetch(url, options = {}) {
  const token = await fetchCsrfToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'X-CSRF-Token': token } : {}),
    ...options.headers
  }
  const response = await fetch(url, { ...options, headers })
  if (response.status === 403) {
    csrfToken = null
    const retryToken = await fetchCsrfToken()
    return fetch(url, { ...options, headers: { ...headers, 'X-CSRF-Token': retryToken } })
  }
  return response
}

// ── Overview Status (all subaccounts) ────────────────────────────────
export async function fetchOverviewStatus() {
  const response = await fetch(`${BASE_URL}/overviewStatus()`)
  if (!response.ok) throw new Error(`Failed to fetch overview: ${response.statusText}`)
  const data = await response.json()
  return data.value || data
}

// ── Current Status (single subaccount) ───────────────────────────────
export async function fetchCurrentStatus(subaccountId) {
  const param = subaccountId ? `subaccountId='${subaccountId}'` : ''
  const response = await fetch(`${BASE_URL}/currentStatus(${param})`)
  if (!response.ok) throw new Error(`Failed to fetch status: ${response.statusText}`)
  return response.json()
}

// ── Subaccounts list ─────────────────────────────────────────────────
export async function fetchSubaccounts() {
  const response = await fetch(`${BASE_URL}/Subaccounts?$orderby=displayOrder asc`)
  if (!response.ok) throw new Error(`Failed to fetch subaccounts: ${response.statusText}`)
  const data = await response.json()
  return data.value || []
}

// ── Monthly Stats ────────────────────────────────────────────────────
export async function fetchMonthlyStats(year, subaccountId) {
  const y = year || new Date().getFullYear()
  const saParam = subaccountId ? `,subaccountId='${subaccountId}'` : ''
  const response = await fetch(`${BASE_URL}/monthlyStats(year=${y}${saParam})`)
  if (!response.ok) throw new Error(`Failed to fetch monthly stats: ${response.statusText}`)
  const data = await response.json()
  return data.value || data
}

// ── Daily Stats ──────────────────────────────────────────────────────
export async function fetchDailyStats(reportYearMonth, subaccountId) {
  const saParam = subaccountId ? `,subaccountId='${subaccountId}'` : ''
  const response = await fetch(`${BASE_URL}/dailyStats(reportYearMonth='${reportYearMonth}'${saParam})`)
  if (!response.ok) throw new Error(`Failed to fetch daily stats: ${response.statusText}`)
  const data = await response.json()
  return data.value || data
}

// ── Consumption Records ──────────────────────────────────────────────
export async function fetchConsumptionRecords(top = 30, subaccountId) {
  let filter = ''
  if (subaccountId) {
    filter = `&$filter=subaccountId eq '${subaccountId}'`
  }
  const response = await fetch(`${BASE_URL}/ConsumptionRecords?$expand=alertLevel,modelUsages&$orderby=recordDate desc&$top=${top}${filter}`)
  if (!response.ok) throw new Error(`Failed to fetch records: ${response.statusText}`)
  const data = await response.json()
  return data.value || []
}

// ── Alert Logs ───────────────────────────────────────────────────────
export async function fetchAlertLogs(top = 50, subaccountId) {
  let filter = ''
  if (subaccountId) {
    filter = `&$filter=subaccountId eq '${subaccountId}'`
  }
  const response = await fetch(`${BASE_URL}/AlertLogs?$expand=alertLevel&$orderby=createdAt desc&$top=${top}${filter}`)
  if (!response.ok) throw new Error(`Failed to fetch alert logs: ${response.statusText}`)
  const data = await response.json()
  return data.value || []
}

// ── Monitoring Config ────────────────────────────────────────────────
export async function fetchMonitoringConfigs() {
  const response = await fetch(`${BASE_URL}/MonitoringConfigs?$orderby=displayOrder asc`)
  if (!response.ok) throw new Error(`Failed to fetch configs: ${response.statusText}`)
  const data = await response.json()
  return data.value || []
}

export async function fetchMonitoringConfig(id) {
  const response = await fetch(`${BASE_URL}/MonitoringConfigs(${id})`)
  if (!response.ok) throw new Error(`Failed to fetch config: ${response.statusText}`)
  return response.json()
}

export async function createMonitoringConfig(payload) {
  const response = await mutationFetch(`${BASE_URL}/MonitoringConfigs`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Failed to create config: ${response.statusText}`)
  }
  return response.json()
}

export async function updateMonitoringConfig(id, payload) {
  const response = await mutationFetch(`${BASE_URL}/MonitoringConfigs(${id})`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Failed to update config: ${response.statusText}`)
  }
  return response.json()
}

export async function deleteMonitoringConfig(id) {
  const response = await mutationFetch(`${BASE_URL}/MonitoringConfigs(${id})`, {
    method: 'DELETE'
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Failed to delete config: ${response.statusText}`)
  }
  return true
}

// ── Notification Config ──────────────────────────────────────────────
export async function fetchNotificationConfig() {
  const response = await fetch(`${BASE_URL}/NotificationConfigs`)
  if (!response.ok) throw new Error(`Failed to fetch notification config: ${response.statusText}`)
  const data = await response.json()
  return (data.value || [])[0] || null
}

export async function updateNotificationConfig(id, payload) {
  const response = await mutationFetch(`${BASE_URL}/NotificationConfigs(${id})`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Failed to update notification config: ${response.statusText}`)
  }
  return response.json()
}

// ── Actions ──────────────────────────────────────────────────────────
export async function triggerCheck(dryRun = false, subaccountId = null) {
  const body = { dryRun }
  if (subaccountId) body.subaccountId = subaccountId
  const response = await mutationFetch(`${BASE_URL}/triggerCheck`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Failed to trigger check: ${response.statusText}`)
  }
  return response.json()
}

export async function loadHistoricalData(fromDate, toDate, subaccountId = null) {
  const body = { fromDate, toDate }
  if (subaccountId) body.subaccountId = subaccountId
  const response = await mutationFetch(`${BASE_URL}/loadHistoricalData`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Failed to load historical data: ${response.statusText}`)
  }
  return response.json()
}

export async function testNotification() {
  const response = await mutationFetch(`${BASE_URL}/testNotification`, {
    method: 'POST',
    body: JSON.stringify({})
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Failed to test notification: ${response.statusText}`)
  }
  return response.json()
}

// ── Consumption by Month (for Detail page) ───────────────────────────
export async function fetchConsumptionByMonth(subaccountId, reportYearMonth) {
  let filter = `$filter=reportYearMonth eq '${reportYearMonth}'`
  if (subaccountId) filter += ` and subaccountId eq '${subaccountId}'`

  // Determine if this is the current month
  const now = new Date()
  const currentYM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const isCurrentMonth = reportYearMonth === currentYM

  // For current month, also fetch live config to get the latest spendingLimit
  const fetches = [
    fetch(`${BASE_URL}/ConsumptionRecords?${filter}&$expand=modelUsages&$orderby=recordDate desc&$top=1`)
  ]
  if (isCurrentMonth && subaccountId) {
    fetches.push(fetch(`${BASE_URL}/MonitoringConfigs?$filter=subaccountId eq '${subaccountId}' and isActive eq true&$top=1`))
  }

  const [consumptionRes, configRes] = await Promise.all(fetches)
  if (!consumptionRes.ok) throw new Error(`Failed to fetch consumption: ${consumptionRes.statusText}`)
  const data = await consumptionRes.json()
  const records = data.value || []

  // Get live spending limit for current month
  let liveSpendingLimit = null
  if (configRes && configRes.ok) {
    const cfgData = await configRes.json()
    const configs = cfgData.value || []
    if (configs.length > 0) liveSpendingLimit = configs[0].spendingLimit
  }

  if (records.length === 0) return null
  const rec = records[0]

  // For current month: use live config limit. For past months: use historical snapshot.
  const spendingLimit = (isCurrentMonth && liveSpendingLimit != null) ? liveSpendingLimit : rec.spendingLimit
  const totalCu = Number(rec.totalCapacityUnits) || 0
  const percentageUsed = spendingLimit > 0 ? Number((totalCu / spendingLimit * 100).toFixed(2)) : Number(rec.percentageUsed) || 0

  return {
    subaccountId: rec.subaccountId,
    subaccountName: rec.subaccountName,
    totalCu: rec.totalCapacityUnits,
    spendingLimit,
    percentageUsed,
    projectedCu: rec.projectedCu,
    alertLevel: rec.alertLevel?.name || 'INFO',
    daysElapsed: rec.daysElapsed,
    daysInMonth: rec.daysInMonth,
    lastCheckDate: rec.recordDate,
    interval: rec.interval,
    topModels: (rec.modelUsages || []).sort((a, b) => Number(b.capacityUnits || 0) - Number(a.capacityUnits || 0)).slice(0, 10).map(m => ({
      modelName: m.modelName,
      capacityUnits: m.capacityUnits,
      inferenceCu: m.inferenceCu,
      groundingCu: m.groundingCu,
      genaiTokenCu: m.genaiTokenCu,
      dataIndexedCu: m.dataIndexedCu,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      totalTokens: m.totalTokens,
      sharePercentage: m.sharePercentage
    }))
  }
}

// ── Commercial Measures ──────────────────────────────────────────────
export async function fetchCommercialMeasures(subaccountId, reportYearMonth) {
  let filter = `$filter=serviceId eq 'ai-core'`
  if (subaccountId) filter += ` and subaccountId eq '${subaccountId}'`
  if (reportYearMonth) filter += ` and reportYearMonth eq '${reportYearMonth}'`
  const response = await fetch(`${BASE_URL}/CommercialMeasures?${filter}&$orderby=reportYearMonth desc,cost desc`)
  if (!response.ok) throw new Error(`Failed to fetch commercial measures: ${response.statusText}`)
  const data = await response.json()
  return data.value || []
}

// ── Usage Metrics (Technical) ────────────────────────────────────────
export async function fetchUsageMetrics(consumptionRecordId) {
  const response = await fetch(`${BASE_URL}/UsageMetrics?$filter=consumptionRecord_ID eq '${consumptionRecordId}'&$orderby=usage desc`)
  if (!response.ok) throw new Error(`Failed to fetch usage metrics: ${response.statusText}`)
  const data = await response.json()
  return data.value || []
}

// ── User Info ────────────────────────────────────────────────────────
export async function fetchUserInfo() {
  try {
    const response = await fetch(`${BASE_URL}/userInfo()`)
    if (!response.ok) return { user: 'anonymous', roles: ['Admin'] }
    return response.json()
  } catch {
    return { user: 'anonymous', roles: ['Admin'] }
  }
}

// ── Utility ──────────────────────────────────────────────────────────
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

export function formatNumber(num, decimals = 4) {
  if (num == null || num === '') return '—'
  const n = Number(num)
  if (isNaN(n)) return '—'
  return n.toFixed(decimals)
}

export function toNum(val, fallback = 0) {
  if (val == null || val === '') return fallback
  const n = Number(val)
  return isNaN(n) ? fallback : n
}
