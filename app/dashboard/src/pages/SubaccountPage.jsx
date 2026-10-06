import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  fetchConsumptionByMonth, fetchCommercialMeasures,
  fetchModelBreakdown, fetchTopModelsByCost,
  triggerCheck, formatNumber, toNum
} from '../services/api'
import { useSubaccount } from '../App'
import {
  TrendingUp, Zap, Target, Calendar, RefreshCw, AlertTriangle,
  Building2, DollarSign, Cpu, Info, BarChart2
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { getLevelMeta, deriveLevelFromPct } from '../constants/levelMeta'
import { CU_TYPE_SERIES, SEQUENTIAL_BLUE, CHART_CHROME } from '../constants/chartColors'

// ── Shared MetricCard ─────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, subtitle, color = 'blue', infoTooltip }) {
  const cls = {
    blue:   'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    green:  'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300',
    orange: 'border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300',
    red:    'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300',
    gray:   'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
    purple: 'border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300',
    violet: 'border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300',
  }
  return (
    <div className={`rounded-xl border p-5 ${cls[color] || cls.gray}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        {infoTooltip && (
          <span className="relative group cursor-help ml-auto">
            <Info size={14} className="opacity-60" />
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg w-56 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
              {infoTooltip}
            </span>
          </span>
        )}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subtitle && <div className="text-xs mt-1 opacity-75">{subtitle}</div>}
    </div>
  )
}

// ── TechnicalView (unchanged structure, dark mode added) ──────────────────────
function TechnicalView({ status, isCurrentMonth }) {
  const models = status?.topModels || []
  const pct = toNum(status?.percentageUsed)
  const level = deriveLevelFromPct(pct)
  const levelMeta = getLevelMeta(level)
  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isCurrentMonth ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        <MetricCard icon={Zap} label="CU Used" value={formatNumber(status?.totalCu, 4)} subtitle={isCurrentMonth ? 'This month (till-date)' : 'Total for month'} color="blue" />
        <MetricCard icon={Target} label="Monthly Entitlement" value={formatNumber(status?.spendingLimit, 2)} subtitle="Capacity Units" color="gray" />
        {isCurrentMonth && (
          <MetricCard
            icon={TrendingUp} label="Projected" value={formatNumber(status?.projectedCu, 4)}
            subtitle="Month-end estimate"
            color={pct >= 90 ? 'red' : pct >= 70 ? 'orange' : 'green'}
            infoTooltip="Projection: (CU consumed ÷ days elapsed) × days in month. Actual may vary."
          />
        )}
        <MetricCard
          icon={Calendar} label={isCurrentMonth ? 'Days' : 'Period'}
          value={isCurrentMonth ? `${status?.daysElapsed || 0} / ${status?.daysInMonth || 0}` : 'Past Month'}
          subtitle={isCurrentMonth ? 'Elapsed / Total' : 'Refresh via Run Check'} color="gray"
        />
      </div>

      {/* Progress */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-6">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-semibold text-sap-dark dark:text-gray-100">Monthly Usage vs Configured Entitlement</span>
          <span className="text-sm font-bold" style={{ color: levelMeta.hex }}>{pct.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: levelMeta.hex }} />
        </div>
      </div>

      {/* Model table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700">
        <div className="px-6 py-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-sap-dark dark:text-gray-100">Usage by Application / Model</h3>
        </div>
        {models.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No model data available. Run a check to fetch current usage.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-gray-700 dark:text-gray-400 font-bold">Model / Application</th>
                  <th className="px-4 py-3 text-right text-gray-700 dark:text-gray-400 font-bold">CU</th>
                  <th className="px-4 py-3 text-right text-gray-700 dark:text-gray-400 font-bold">Input Tokens</th>
                  <th className="px-4 py-3 text-right text-gray-700 dark:text-gray-400 font-bold">Output Tokens</th>
                  <th className="px-4 py-3 text-right text-gray-700 dark:text-gray-400 font-bold">Share %</th>
                  <th className="px-4 py-3 text-left text-gray-700 dark:text-gray-400 font-bold w-28">Distribution</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {models.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 font-medium text-sap-dark dark:text-gray-200">{m.modelName}</td>
                    <td className="px-4 py-3 text-right font-mono dark:text-gray-300">
                      <span className="inline-flex items-center gap-1">
                        {formatNumber(m.capacityUnits, 6)}
                        {toNum(m.capacityUnits) > 0 && (
                          <span className="relative group cursor-help">
                            <Info size={12} className="text-gray-400 hover:text-sap-blue" />
                            <span className="absolute top-full right-0 mt-1 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg w-52 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                              <span className="font-semibold block mb-1">CU Breakdown:</span>
                              {toNum(m.inferenceCu) > 0 && <span className="block">• Inference: {formatNumber(m.inferenceCu, 6)}</span>}
                              {toNum(m.genaiTokenCu) > 0 && <span className="block">• GenAI Token: {formatNumber(m.genaiTokenCu, 6)}</span>}
                              {toNum(m.groundingCu) > 0 && <span className="block">• Grounding: {formatNumber(m.groundingCu, 6)}</span>}
                              {toNum(m.dataIndexedCu) > 0 && <span className="block">• Data Indexed: {formatNumber(m.dataIndexedCu, 6)}</span>}
                              <span className="block mt-1 border-t border-gray-600 pt-1 font-semibold">Total: {formatNumber(m.capacityUnits, 6)}</span>
                            </span>
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{toNum(m.inputTokens) > 0 ? formatNumber(m.inputTokens, 0) : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{toNum(m.outputTokens) > 0 ? formatNumber(m.outputTokens, 0) : '—'}</td>
                    <td className="px-4 py-3 text-right dark:text-gray-300">{formatNumber(m.sharePercentage, 1)}%</td>
                    <td className="px-4 py-3">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="bg-sap-blue h-2 rounded-full" style={{ width: `${Math.min(toNum(m.sharePercentage), 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── CommercialView (dark mode added) ─────────────────────────────────────────
function CommercialView({ commercialData }) {
  if (!commercialData || commercialData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-8 text-center text-gray-400">
        <DollarSign size={36} className="mx-auto mb-3 opacity-30" />
        <p>No commercial data available. Click "Load Historical" on the Overview page to fetch billing data.</p>
      </div>
    )
  }

  const byMonth = {}
  for (const r of commercialData) {
    if (!byMonth[r.reportYearMonth]) byMonth[r.reportYearMonth] = []
    byMonth[r.reportYearMonth].push(r)
  }
  const months = Object.keys(byMonth).sort().reverse()
  const latestMonth = months[0]
  const latestData = byMonth[latestMonth] || []
  const totalCost = latestData.reduce((s, r) => s + toNum(r.cost), 0)
  const totalUsage = latestData.reduce((s, r) => s + toNum(r.usage), 0)
  const currency = latestData[0]?.currency || 'EUR'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={DollarSign} label="Total Cost" value={`${formatNumber(totalCost, 2)} ${currency}`} subtitle={`Month: ${latestMonth}`} color="purple" />
        <MetricCard icon={Zap} label="Total Usage" value={formatNumber(totalUsage, 4)} subtitle="Capacity Units" color="blue" />
        <MetricCard icon={Target} label="Measures" value={latestData.length} subtitle="Billing line items" color="gray" />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-sap-dark dark:text-gray-100">Billing Breakdown — {latestMonth}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 font-semibold">Metric</th>
                <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 font-semibold">Plan</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Usage</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Cost</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Cloud Credits</th>
                <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 font-semibold">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {latestData.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3 font-medium text-sap-dark dark:text-gray-200">{r.metricName || r.measureId}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.planName || r.plan}</td>
                  <td className="px-4 py-3 text-right font-mono dark:text-gray-300">{formatNumber(r.usage, 4)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold dark:text-gray-200">{formatNumber(r.cost, 2)} {r.currency}</td>
                  <td className="px-4 py-3 text-right font-mono dark:text-gray-300">{formatNumber(r.cloudCreditsCost, 2)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{r.unit}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                <td className="px-4 py-3 dark:text-gray-200" colSpan="2">Total</td>
                <td className="px-4 py-3 text-right font-mono dark:text-gray-200">{formatNumber(totalUsage, 4)}</td>
                <td className="px-4 py-3 text-right font-mono dark:text-gray-200">{formatNumber(totalCost, 2)} {currency}</td>
                <td className="px-4 py-3 text-right font-mono dark:text-gray-200">{formatNumber(latestData.reduce((s, r) => s + toNum(r.cloudCreditsCost), 0), 2)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {months.length > 1 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b dark:border-gray-700">
            <h3 className="text-lg font-semibold text-sap-dark dark:text-gray-100">Monthly Cost Trend</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 font-semibold">Month</th>
                  <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Total Cost</th>
                  <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Total Usage</th>
                  <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Measures</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {months.map(m => {
                  const mData = byMonth[m]
                  return (
                    <tr key={m} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 font-medium dark:text-gray-200">{m}</td>
                      <td className="px-4 py-3 text-right font-mono dark:text-gray-300">{formatNumber(mData.reduce((s, r) => s + toNum(r.cost), 0), 2)} {currency}</td>
                      <td className="px-4 py-3 text-right font-mono dark:text-gray-300">{formatNumber(mData.reduce((s, r) => s + toNum(r.usage), 0), 4)}</td>
                      <td className="px-4 py-3 text-right dark:text-gray-300">{mData.length}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Custom tooltip for top-models bar chart ───────────────────────────────────
function TopModelsTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 text-sm min-w-[180px]">
      <div className="font-semibold text-sap-dark dark:text-gray-100 mb-2 break-all">{label}</div>
      <div className="space-y-1 text-gray-600 dark:text-gray-300">
        <div className="flex justify-between gap-4"><span>Total Cost</span><span className="font-mono font-semibold">{formatNumber(d.totalCost, 2)} {d.currency}</span></div>
        <div className="flex justify-between gap-4"><span>Total CU</span><span className="font-mono">{formatNumber(d.totalCu, 4)}</span></div>
        {d.totalTokens > 0 && (
          <div className="flex justify-between gap-4"><span>Tokens</span><span className="font-mono">{formatNumber(d.totalTokens, 0)}</span></div>
        )}
      </div>
    </div>
  )
}

// ── AiBreakdownView ───────────────────────────────────────────────────────────
function AiBreakdownView({ breakdown, topModels, selectedYM, year }) {
  const isDark = document.documentElement.classList.contains('dark')
  const chrome = isDark ? CHART_CHROME.dark : CHART_CHROME.light

  if (breakdown.length === 0 && topModels.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-12 text-center text-gray-400">
        <BarChart2 size={48} className="mx-auto mb-4 opacity-30" />
        <p>No AI breakdown data available.</p>
        <p className="text-sm mt-1">Run a check to fetch current usage, or load historical data from the Overview page.</p>
      </div>
    )
  }

  // Sum CU by type across all models for the selected month
  const cuByType = CU_TYPE_SERIES.map(s => ({
    ...s,
    total: breakdown.reduce((sum, m) => sum + toNum(m[s.key]), 0)
  }))
  const totalCu = cuByType.reduce((s, t) => s + t.total, 0)
  const totalTokens = breakdown.reduce((s, m) => s + toNum(m.totalTokens), 0)
  const totalCost = breakdown.reduce((s, m) => s + toNum(m.cost), 0)
  const currency = breakdown[0]?.currency || 'EUR'

  // Horizontal bar data for top models (limited to 8 for readability)
  const topModelsChartData = topModels.slice(0, 8).map((m, i) => ({
    ...m,
    shortName: m.modelName.length > 30 ? m.modelName.slice(0, 28) + '…' : m.modelName,
    fill: SEQUENTIAL_BLUE[Math.min(i, SEQUENTIAL_BLUE.length - 1)]
  }))

  return (
    <div className="space-y-6">
      {/* CU-type tiles for the month */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">CU by Type — {selectedYM}</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cuByType.map(s => (
            <div key={s.key} className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: isDark ? s.darkHex : s.lightHex }} />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{s.label}</span>
              </div>
              <div className="text-xl font-bold text-sap-dark dark:text-gray-100">{formatNumber(s.total, 4)}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {totalCu > 0 ? `${(s.total / totalCu * 100).toFixed(1)}% of total` : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Token + cost summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={Cpu} label="Total Tokens" value={totalTokens > 0 ? formatNumber(totalTokens, 0) : '—'} subtitle="Input + output tokens combined" color="blue" />
        <MetricCard icon={DollarSign} label="Total Cost" value={totalCost > 0 ? `${formatNumber(totalCost, 2)} ${currency}` : '—'} subtitle={`Month: ${selectedYM}`} color="purple" />
        <MetricCard
          icon={TrendingUp} label="Avg Cost / 1k Tokens"
          value={totalTokens > 0 && totalCost > 0 ? `${formatNumber(totalCost / (totalTokens / 1000), 4)} ${currency}` : '—'}
          subtitle="Weighted average across all models" color="violet"
          infoTooltip="Total billing cost divided by (total tokens / 1000). Only available when commercial measures data is loaded."
        />
      </div>

      {/* Model breakdown table */}
      {breakdown.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b dark:border-gray-700">
            <h3 className="text-lg font-semibold text-sap-dark dark:text-gray-100">Model Breakdown — {selectedYM}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 font-semibold">Model</th>
                  <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Total CU</th>
                  <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Inference</th>
                  <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">GenAI Token</th>
                  <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Grounding</th>
                  <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Tokens</th>
                  <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Cost</th>
                  <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Cost/1k tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {breakdown.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 font-medium text-sap-dark dark:text-gray-200 max-w-[160px] truncate">{m.modelName}</td>
                    <td className="px-4 py-3 text-right font-mono dark:text-gray-300">{formatNumber(m.capacityUnits, 4)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500 dark:text-gray-400">{toNum(m.inferenceCu) > 0 ? formatNumber(m.inferenceCu, 4) : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500 dark:text-gray-400">{toNum(m.genaiTokenCu) > 0 ? formatNumber(m.genaiTokenCu, 4) : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500 dark:text-gray-400">{toNum(m.groundingCu) > 0 ? formatNumber(m.groundingCu, 4) : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono dark:text-gray-300">{toNum(m.totalTokens) > 0 ? formatNumber(m.totalTokens, 0) : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono dark:text-gray-300">{toNum(m.cost) > 0 ? `${formatNumber(m.cost, 4)} ${m.currency}` : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono dark:text-gray-200 font-semibold">{toNum(m.costPer1kTokens) > 0 ? formatNumber(m.costPer1kTokens, 6) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Annual top models by cost */}
      {topModels.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700">
          <div className="px-6 py-4 border-b dark:border-gray-700">
            <h3 className="text-lg font-semibold text-sap-dark dark:text-gray-100">Top Models by Cost — {year}</h3>
          </div>
          <div className="p-6">
            <ResponsiveContainer width="100%" height={Math.max(180, topModelsChartData.length * 36)}>
              <BarChart
                layout="vertical"
                data={topModelsChartData}
                margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
                barCategoryGap="25%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chrome.gridline} horizontal={false} />
                <XAxis
                  type="number" tick={{ fontSize: 11, fill: chrome.muted }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => v > 0 ? formatNumber(v, 2) : '0'}
                />
                <YAxis
                  type="category" dataKey="shortName" width={140}
                  tick={{ fontSize: 11, fill: chrome.muted }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip content={<TopModelsTooltip />} cursor={{ fill: 'rgba(0,87,210,0.06)' }} />
                <Bar dataKey="totalCost" name="Cost" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {topModelsChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="text-xs text-gray-400 mt-2 text-right">{topModels[0]?.currency || 'EUR'}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SubaccountPage() {
  const [status, setStatus] = useState(null)
  const [commercialData, setCommercialData] = useState([])
  const [breakdown, setBreakdown] = useState([])
  const [topModels, setTopModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('technical')
  const { selectedSubaccount, setSelectedSubaccount } = useSubaccount()
  const { subaccountId: urlSubaccountId } = useParams()

  useEffect(() => {
    if (urlSubaccountId && !selectedSubaccount) setSelectedSubaccount(urlSubaccountId)
  }, [urlSubaccountId])

  const effectiveSubaccount = selectedSubaccount || urlSubaccountId

  const now = new Date()
  const [selectedYM, setSelectedYM] = useState(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`)
  const currentYM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const isCurrentMonth = selectedYM === currentYM
  const year = parseInt(selectedYM.slice(0, 4))

  const selectedMonthLabel = (() => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const m = parseInt(selectedYM.slice(4, 6)) - 1
    return `${months[m]} ${selectedYM.slice(0, 4)}`
  })()

  const handlePrevMonth = () => {
    const y = parseInt(selectedYM.slice(0, 4)), m = parseInt(selectedYM.slice(4, 6))
    setSelectedYM(m === 1 ? `${y - 1}12` : `${y}${String(m - 1).padStart(2, '0')}`)
  }
  const handleNextMonth = () => {
    const y = parseInt(selectedYM.slice(0, 4)), m = parseInt(selectedYM.slice(4, 6))
    setSelectedYM(m === 12 ? `${y + 1}01` : `${y}${String(m + 1).padStart(2, '0')}`)
  }

  const loadData = async () => {
    if (!effectiveSubaccount) return
    try {
      setLoading(true)
      const [statusData, commercial, brk, top] = await Promise.all([
        fetchConsumptionByMonth(effectiveSubaccount, selectedYM),
        fetchCommercialMeasures(effectiveSubaccount, selectedYM).catch(() => []),
        fetchModelBreakdown(selectedYM, effectiveSubaccount).catch(() => []),
        fetchTopModelsByCost(year, effectiveSubaccount).catch(() => []),
      ])
      setStatus(statusData)
      setCommercialData(commercial)
      setBreakdown(brk)
      setTopModels(top)
      setError('')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [effectiveSubaccount, selectedYM])

  const handleTrigger = async (dryRun) => {
    setTriggering(true)
    try { await triggerCheck(dryRun, effectiveSubaccount); await loadData() }
    catch (err) { setError(err.message) }
    finally { setTriggering(false) }
  }

  if (!effectiveSubaccount) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-12 text-center text-gray-400">
        <Building2 size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">No subaccount selected</p>
        <p className="text-sm mt-1">Select a subaccount from the dropdown or click a card on the overview.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sap-blue" />
      </div>
    )
  }

  const pct = toNum(status?.percentageUsed)
  const levelMeta = getLevelMeta(deriveLevelFromPct(pct))

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {status?.alertLevel && status.alertLevel !== 'INFO' && (
        <div className={`rounded-xl border ${levelMeta.border} ${levelMeta.bg} p-4 flex items-center gap-3`}>
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: levelMeta.hex }} />
          <div className={`font-semibold ${levelMeta.text}`}>
            {status.alertLevel === 'WARNING' && '⚠️ Warning — Approaching Limit'}
            {status.alertLevel === 'ALERT' && '🚨 Alert — Near or Over Limit'}
          </div>
          <div className={`ml-auto text-sm ${levelMeta.text}`}>{pct.toFixed(1)}% of limit used</div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={16} /><span>{error}</span>
        </div>
      )}

      {/* Header & Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-sap-dark dark:text-gray-100">{status?.subaccountName || 'No data yet'}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Last check: {status?.lastCheckDate || 'Never'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleTrigger(true)} disabled={triggering} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300 disabled:opacity-50">
            <RefreshCw size={14} className={triggering ? 'animate-spin' : ''} /> Dry Run
          </button>
          <button onClick={() => handleTrigger(false)} disabled={triggering} className="flex items-center gap-2 px-4 py-2 bg-sap-blue text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            <Zap size={14} /> Run Check
          </button>
        </div>
      </div>

      {/* Month nav + tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
          {[
            { id: 'technical', icon: Cpu, label: 'Technical' },
            { id: 'commercial', icon: DollarSign, label: 'Commercial' },
            { id: 'ai-breakdown', icon: BarChart2, label: 'AI Breakdown' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 shadow text-sap-blue'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrevMonth} className="px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">←</button>
          <span className="text-sm font-semibold px-3 min-w-[90px] text-center dark:text-gray-100">{selectedMonthLabel}</span>
          <button onClick={handleNextMonth} className="px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">→</button>
        </div>
      </div>

      {isCurrentMonth && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={16} />
          <span className="text-sm">Current month — data is provisional (till-date) and may not be final.</span>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'commercial' && <CommercialView commercialData={commercialData} />}
      {activeTab === 'technical' && <TechnicalView status={status} isCurrentMonth={isCurrentMonth} />}
      {activeTab === 'ai-breakdown' && (
        <AiBreakdownView breakdown={breakdown} topModels={topModels} selectedYM={selectedYM} year={year} />
      )}
    </div>
  )
}
