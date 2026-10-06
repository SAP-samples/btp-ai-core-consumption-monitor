import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts'
import { fetchMonthlyStats, fetchCuTypeTrend, formatNumber, toNum } from '../services/api'
import { useSubaccount } from '../App'
import { BarChart3, AlertTriangle } from 'lucide-react'
import { getLevelMeta, deriveLevelFromPct } from '../constants/levelMeta'
import { CU_TYPE_SERIES, CHART_CHROME } from '../constants/chartColors'

// ── Custom tooltip for monthly CU bar ───────────────────────────────────────
function MonthlyTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  const level = deriveLevelFromPct(toNum(d.percentageUsed))
  const meta = getLevelMeta(level)
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 text-sm min-w-[160px]">
      <div className="font-semibold text-sap-dark dark:text-gray-100 mb-1">{label}</div>
      <div className="space-y-1 text-gray-600 dark:text-gray-300">
        <div className="flex justify-between gap-4"><span>Total CU</span><span className="font-mono font-semibold">{formatNumber(d.totalCu, 4)}</span></div>
        <div className="flex justify-between gap-4"><span>Entitlement</span><span className="font-mono">{formatNumber(d.spendingLimit, 2)}</span></div>
        <div className="flex justify-between gap-4"><span>Usage</span>
          <span className="font-semibold" style={{ color: meta.hex }}>{toNum(d.percentageUsed).toFixed(1)}%</span>
        </div>
        {d.projectedCu > 0 && (
          <div className="flex justify-between gap-4 pt-1 border-t dark:border-gray-600">
            <span>Projected</span><span className="font-mono">{formatNumber(d.projectedCu, 4)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Custom tooltip for stacked CU-type chart ─────────────────────────────────
function CuTypeTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const total = payload.reduce((s, p) => s + toNum(p.value), 0)
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 text-sm min-w-[180px]">
      <div className="font-semibold text-sap-dark dark:text-gray-100 mb-2">{label}</div>
      {[...payload].reverse().map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.fill }} />
            <span className="text-gray-600 dark:text-gray-300">{p.name}</span>
          </span>
          <span className="font-mono text-gray-800 dark:text-gray-200">{formatNumber(p.value, 4)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 pt-1 border-t dark:border-gray-600 font-semibold text-sap-dark dark:text-gray-100">
        <span>Total</span><span className="font-mono">{formatNumber(total, 4)}</span>
      </div>
    </div>
  )
}

// ── Legend (manual — controlled, no color-alone identity) ────────────────────
function ChartLegend({ series, darkMode }) {
  return (
    <div className="flex items-center gap-4 flex-wrap mt-3">
      {series.map(s => (
        <span key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <span className="w-3 h-3 rounded-sm" style={{ background: darkMode ? s.darkHex : s.lightHex }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function MonthlyPage() {
  const [stats, setStats] = useState([])
  const [cuTrend, setCuTrend] = useState([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('monthly')  // 'monthly' | 'cutype'
  const { selectedSubaccount, subaccounts } = useSubaccount()
  const selectedName = subaccounts.find(s => s.subaccountId === selectedSubaccount)?.subaccountName

  // Detect dark mode from <html> class
  const isDark = document.documentElement.classList.contains('dark')
  const chrome = isDark ? CHART_CHROME.dark : CHART_CHROME.light

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchMonthlyStats(year, selectedSubaccount),
      fetchCuTypeTrend(year, selectedSubaccount).catch(() => [])
    ])
      .then(([s, t]) => { setStats(s); setCuTrend(t); setError('') })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [year, selectedSubaccount])

  const currentYM = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const hasCurrentMonth = stats.some(s => s.reportYearMonth === currentYM)

  // Shape data for monthly bar: color bar by alert level
  const monthlyData = stats.map(s => ({
    ...s,
    totalCu: toNum(s.totalCu),
    barColor: getLevelMeta(deriveLevelFromPct(toNum(s.percentageUsed))).hex
  }))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sap-blue" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-sap-dark dark:text-gray-100">Monthly Consumption</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {selectedSubaccount ? `Showing: ${selectedName || selectedSubaccount}` : 'All subaccounts (aggregated)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(y => y - 1)} className="px-3 py-1 border dark:border-gray-600 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">←</button>
          <span className="text-sm font-semibold px-3 dark:text-gray-100">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="px-3 py-1 border dark:border-gray-600 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">→</button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

      {year === new Date().getFullYear() && hasCurrentMonth && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={16} />
          <span className="text-sm">Current month is provisional (till-date) and may change until month-end.</span>
        </div>
      )}

      {stats.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-12 text-center text-gray-400">
          <BarChart3 size={48} className="mx-auto mb-4 opacity-30" />
          <p>No consumption data for {year}</p>
        </div>
      ) : (
        <>
          {/* Chart tabs */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700">
            <div className="px-6 pt-4 flex gap-1 border-b dark:border-gray-700">
              {[
                { id: 'monthly', label: 'Monthly CU' },
                { id: 'cutype', label: 'CU by Type' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-sap-blue text-sap-blue'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* Monthly CU bar chart */}
              {activeTab === 'monthly' && (
                <div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke={chrome.gridline} vertical={false} />
                      <XAxis
                        dataKey="month" tick={{ fontSize: 12, fill: chrome.muted }}
                        axisLine={{ stroke: chrome.axis }} tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: chrome.muted }}
                        axisLine={false} tickLine={false}
                        tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                      />
                      <Tooltip content={<MonthlyTooltip />} cursor={{ fill: 'rgba(0,87,210,0.06)' }} />
                      {/* Entitlement reference line from first record (approximation for "All") */}
                      {monthlyData[0]?.spendingLimit > 0 && (
                        <ReferenceLine
                          y={toNum(monthlyData[0].spendingLimit)}
                          stroke="#0057d2" strokeDasharray="6 3" strokeWidth={1.5}
                          label={{ value: 'Entitlement', position: 'insideTopRight', fontSize: 10, fill: '#0057d2' }}
                        />
                      )}
                      <Bar dataKey="totalCu" name="Total CU" radius={[4, 4, 0, 0]} maxBarSize={48}>
                        {monthlyData.map((entry, i) => (
                          <Cell key={i} fill={entry.barColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {/* Status legend */}
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    {['INFO', 'WARNING', 'ALERT'].map(l => {
                      const m = getLevelMeta(l)
                      return (
                        <span key={l} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                          <span className="w-3 h-3 rounded-sm" style={{ background: m.hex }} />
                          {m.label}
                        </span>
                      )
                    })}
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span className="w-6 h-0 border-t-2 border-dashed border-sap-blue inline-block" />
                      Entitlement
                    </span>
                  </div>
                </div>
              )}

              {/* Stacked CU-by-type chart */}
              {activeTab === 'cutype' && (
                <div>
                  {cuTrend.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">No CU-type breakdown data for {year}</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={cuTrend} margin={{ top: 8, right: 8, left: 8, bottom: 4 }} barCategoryGap="25%">
                          <CartesianGrid strokeDasharray="3 3" stroke={chrome.gridline} vertical={false} />
                          <XAxis
                            dataKey="month" tick={{ fontSize: 12, fill: chrome.muted }}
                            axisLine={{ stroke: chrome.axis }} tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: chrome.muted }}
                            axisLine={false} tickLine={false}
                            tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                          />
                          <Tooltip content={<CuTypeTooltip />} cursor={{ fill: 'rgba(0,87,210,0.06)' }} />
                          {CU_TYPE_SERIES.map((s, i) => (
                            <Bar
                              key={s.key} dataKey={s.key} name={s.label} stackId="cu"
                              fill={isDark ? s.darkHex : s.lightHex}
                              radius={i === CU_TYPE_SERIES.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                              maxBarSize={48}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                      <ChartLegend series={CU_TYPE_SERIES} darkMode={isDark} />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Monthly table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold text-sap-dark dark:text-gray-100">Monthly Details</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 font-semibold">Month</th>
                    <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Total CU</th>
                    <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Projected</th>
                    <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Entitlement</th>
                    <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Usage %</th>
                    <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 font-semibold w-32">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {stats.map((s, i) => {
                    const pct = toNum(s.percentageUsed)
                    const level = deriveLevelFromPct(pct)
                    const meta = getLevelMeta(level)
                    return (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3 font-medium dark:text-gray-200">{s.month} {year}</td>
                        <td className="px-4 py-3 text-right font-mono dark:text-gray-300">{formatNumber(s.totalCu, 4)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-500 dark:text-gray-400">{formatNumber(s.projectedCu, 4)}</td>
                        <td className="px-4 py-3 text-right dark:text-gray-300">{formatNumber(s.spendingLimit, 2)}</td>
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: meta.hex }}>
                          {pct.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3">
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: meta.hex }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
