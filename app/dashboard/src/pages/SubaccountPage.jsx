import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { fetchConsumptionByMonth, fetchCommercialMeasures, triggerCheck, formatNumber, toNum } from '../services/api'
import { useSubaccount } from '../App'
import { TrendingUp, Zap, Target, Calendar, RefreshCw, AlertTriangle, Building2, DollarSign, Cpu, Info } from 'lucide-react'

const LEVEL_COLORS = {
  INFO: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', dot: 'bg-green-500' },
  WARNING: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  ALERT: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', dot: 'bg-red-500' }
}

function MetricCard({ icon: Icon, label, value, subtitle, color = 'blue', infoTooltip }) {
  const colors = { blue: 'border-blue-200 bg-blue-50 text-blue-700', green: 'border-green-200 bg-green-50 text-green-700', orange: 'border-orange-200 bg-orange-50 text-orange-700', red: 'border-red-200 bg-red-50 text-red-700', gray: 'border-gray-200 bg-gray-50 text-gray-700', purple: 'border-purple-200 bg-purple-50 text-purple-700' }
  return (
    <div className={`rounded-xl border p-5 ${colors[color] || colors.gray}`}>
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

function ProgressBar({ percentage, color = '#0057d2' }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: color }} />
    </div>
  )
}

function CommercialView({ commercialData, subaccountName }) {
  if (!commercialData || commercialData.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
        <DollarSign size={36} className="mx-auto mb-3 opacity-30" />
        <p>No commercial data available. Click "Load Historical" on the Overview page to fetch billing data.</p>
      </div>
    )
  }

  // Group by reportYearMonth
  const byMonth = {}
  for (const r of commercialData) { if (!byMonth[r.reportYearMonth]) byMonth[r.reportYearMonth] = []; byMonth[r.reportYearMonth].push(r) }
  const months = Object.keys(byMonth).sort().reverse()
  const latestMonth = months[0]
  const latestData = byMonth[latestMonth] || []

  // Totals for latest month
  const totalCost = latestData.reduce((s, r) => s + toNum(r.cost), 0)
  const totalUsage = latestData.reduce((s, r) => s + toNum(r.usage), 0)
  const currency = latestData[0]?.currency || 'EUR'

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={DollarSign} label="Total Cost" value={`${formatNumber(totalCost, 2)} ${currency}`} subtitle={`Month: ${latestMonth}`} color="purple" />
        <MetricCard icon={Zap} label="Total Usage" value={formatNumber(totalUsage, 4)} subtitle="Capacity Units" color="blue" />
        <MetricCard icon={Target} label="Measures" value={latestData.length} subtitle="Billing line items" color="gray" />
      </div>

      {/* Commercial measures table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b"><h3 className="text-lg font-semibold text-sap-dark">Billing Breakdown — {latestMonth}</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left text-gray-600 font-semibold">Metric</th>
              <th className="px-4 py-3 text-left text-gray-600 font-semibold">Plan</th>
              <th className="px-4 py-3 text-right text-gray-600 font-semibold">Usage</th>
              <th className="px-4 py-3 text-right text-gray-600 font-semibold">Cost</th>
              <th className="px-4 py-3 text-right text-gray-600 font-semibold">Cloud Credits</th>
              <th className="px-4 py-3 text-left text-gray-600 font-semibold">Unit</th>
            </tr></thead>
            <tbody className="divide-y">
              {latestData.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-sap-dark">{r.metricName || r.measureId}</td>
                  <td className="px-4 py-3 text-gray-600">{r.planName || r.plan}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatNumber(r.usage, 4)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatNumber(r.cost, 2)} {r.currency}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatNumber(r.cloudCreditsCost, 2)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.unit}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-gray-50 font-semibold">
              <td className="px-4 py-3" colSpan="2">Total</td>
              <td className="px-4 py-3 text-right font-mono">{formatNumber(totalUsage, 4)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatNumber(totalCost, 2)} {currency}</td>
              <td className="px-4 py-3 text-right font-mono">{formatNumber(latestData.reduce((s, r) => s + toNum(r.cloudCreditsCost), 0), 2)}</td>
              <td className="px-4 py-3"></td>
            </tr></tfoot>
          </table>
        </div>
      </div>

      {/* Monthly cost trend */}
      {months.length > 1 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b"><h3 className="text-lg font-semibold text-sap-dark">Monthly Cost Trend</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-gray-600 font-semibold">Month</th>
                <th className="px-4 py-3 text-right text-gray-600 font-semibold">Total Cost</th>
                <th className="px-4 py-3 text-right text-gray-600 font-semibold">Total Usage</th>
                <th className="px-4 py-3 text-right text-gray-600 font-semibold">Measures</th>
              </tr></thead>
              <tbody className="divide-y">
                {months.map(m => {
                  const mData = byMonth[m]
                  return (
                    <tr key={m} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{m}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatNumber(mData.reduce((s, r) => s + toNum(r.cost), 0), 2)} {currency}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatNumber(mData.reduce((s, r) => s + toNum(r.usage), 0), 4)}</td>
                      <td className="px-4 py-3 text-right">{mData.length}</td>
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

function TechnicalView({ status, isCurrentMonth }) {
  const models = status?.topModels || []
  return (
    <div className="space-y-4">
      {/* Key metrics */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isCurrentMonth ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        <MetricCard icon={Zap} label="CU Used" value={formatNumber(status?.totalCu, 4)} subtitle={isCurrentMonth ? "This month (till-date)" : "Total for month"} color="blue" />
        <MetricCard icon={Target} label="Monthly Entitlement" value={formatNumber(status?.spendingLimit, 2)} subtitle="Capacity Units" color="gray" />
        {isCurrentMonth && (
          <MetricCard icon={TrendingUp} label="Projected" value={formatNumber(status?.projectedCu, 4)} subtitle="Month-end estimate" color={toNum(status?.percentageUsed) >= 80 ? 'red' : toNum(status?.percentageUsed) >= 60 ? 'orange' : 'green'} infoTooltip="Tentative projection based on current usage: (CU consumed ÷ days elapsed) × days in month. Actual usage may vary." />
        )}
        <MetricCard icon={Calendar} label={isCurrentMonth ? "Days" : "Period"} value={isCurrentMonth ? `${status?.daysElapsed || 0} / ${status?.daysInMonth || 0}` : "Past Month"} subtitle={isCurrentMonth ? "Elapsed / Total" : "Refresh via Run Check"} color="gray" />
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-semibold text-sap-dark">Monthly Usage vs Configured Entitlement</span>
          <span className="text-sm font-bold">{toNum(status?.percentageUsed).toFixed(1)}%</span>
        </div>
        <ProgressBar percentage={toNum(status?.percentageUsed)} color={toNum(status?.percentageUsed) >= 80 ? '#bb0000' : toNum(status?.percentageUsed) >= 60 ? '#e9730c' : '#28a745'} />
      </div>

      {/* Model breakdown */}
      <div className="bg-white rounded-xl border">
        <div className="px-6 py-4 border-b"><h3 className="text-lg font-semibold text-sap-dark">Usage by Application / Model</h3></div>
        {models.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No model data available. Run a check to fetch current usage.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-gray-700 font-bold">Model / Application</th>
                <th className="px-4 py-3 text-right text-gray-700 font-bold">Capacity Units</th>
                <th className="px-4 py-3 text-right text-gray-700 font-bold">Input Tokens</th>
                <th className="px-4 py-3 text-right text-gray-700 font-bold">Output Tokens</th>
                <th className="px-4 py-3 text-right text-gray-700 font-bold">Share %</th>
                <th className="px-4 py-3 text-left text-gray-700 font-bold w-28">Distribution</th>
              </tr></thead>
              <tbody className="divide-y">
                {models.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-sap-dark">{m.modelName}</td>
                    <td className="px-4 py-3 text-right font-mono">
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
                    <td className="px-4 py-3 text-right font-mono text-gray-600">{toNum(m.inputTokens) > 0 ? formatNumber(m.inputTokens, 0) : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">{toNum(m.outputTokens) > 0 ? formatNumber(m.outputTokens, 0) : '—'}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(m.sharePercentage, 1)}%</td>
                    <td className="px-4 py-3"><div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-sap-blue h-2 rounded-full" style={{ width: `${Math.min(toNum(m.sharePercentage), 100)}%` }} /></div></td>
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

export default function SubaccountPage() {
  const [status, setStatus] = useState(null)
  const [commercialData, setCommercialData] = useState([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('technical')
  const { selectedSubaccount, setSelectedSubaccount } = useSubaccount()
  const { subaccountId: urlSubaccountId } = useParams()

  // Restore selectedSubaccount from URL param on refresh/deep-link
  useEffect(() => {
    if (urlSubaccountId && !selectedSubaccount) {
      setSelectedSubaccount(urlSubaccountId)
    }
  }, [urlSubaccountId])

  // Use URL param as fallback if context is not yet set
  const effectiveSubaccount = selectedSubaccount || urlSubaccountId

  // Month/year navigation
  const now = new Date()
  const [selectedYM, setSelectedYM] = useState(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`)
  const currentYM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const isCurrentMonth = selectedYM === currentYM

  const selectedMonthLabel = (() => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const m = parseInt(selectedYM.slice(4, 6)) - 1
    const y = selectedYM.slice(0, 4)
    return `${months[m]} ${y}`
  })()

  const handlePrevMonth = () => {
    const y = parseInt(selectedYM.slice(0, 4))
    const m = parseInt(selectedYM.slice(4, 6))
    setSelectedYM(m === 1 ? `${y - 1}12` : `${y}${String(m - 1).padStart(2, '0')}`)
  }
  const handleNextMonth = () => {
    const y = parseInt(selectedYM.slice(0, 4))
    const m = parseInt(selectedYM.slice(4, 6))
    setSelectedYM(m === 12 ? `${y + 1}01` : `${y}${String(m + 1).padStart(2, '0')}`)
  }

  const loadData = async () => {
    if (!effectiveSubaccount) return
    try {
      setLoading(true)
      const [statusData, commercial] = await Promise.all([
        fetchConsumptionByMonth(effectiveSubaccount, selectedYM),
        fetchCommercialMeasures(effectiveSubaccount, selectedYM).catch(() => [])
      ])
      setStatus(statusData)
      setCommercialData(commercial)
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
    return (<div className="bg-white rounded-xl border p-12 text-center text-gray-400"><Building2 size={48} className="mx-auto mb-4 opacity-30" /><p className="text-lg font-medium">No subaccount selected</p><p className="text-sm mt-1">Select a subaccount from the dropdown or click a card on the overview.</p></div>)
  }

  if (loading) return (<div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sap-blue"></div></div>)

  const levelColors = LEVEL_COLORS[status?.alertLevel] || LEVEL_COLORS.INFO
  const pct = toNum(status?.percentageUsed)

  return (
    <div className="space-y-6">
      {/* Alert Banner — only show for WARNING and ALERT levels */}
      {status?.alertLevel && status.alertLevel !== 'INFO' && (
        <div className={`rounded-xl border ${levelColors.border} ${levelColors.bg} p-4 flex items-center gap-3`}>
          <div className={`w-3 h-3 rounded-full ${levelColors.dot}`} />
          <div className={`font-semibold ${levelColors.text}`}>
            {status.alertLevel === 'WARNING' && '⚠️ Warning — Approaching Limit'}
            {status.alertLevel === 'ALERT' && '🚨 Alert — Near or Over Limit'}
          </div>
          <div className={`ml-auto text-sm ${levelColors.text}`}>{pct.toFixed(1)}% of limit used</div>
        </div>
      )}

      {error && (<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2"><AlertTriangle size={16} /><span>{error}</span></div>)}

      {/* Header & Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-sap-dark">{status?.subaccountName || 'No data yet'}</h2>
          <p className="text-sm text-gray-500">Last check: {status?.lastCheckDate || 'Never'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleTrigger(true)} disabled={triggering} className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"><RefreshCw size={14} className={triggering ? 'animate-spin' : ''} /> Dry Run</button>
          <button onClick={() => handleTrigger(false)} disabled={triggering} className="flex items-center gap-2 px-4 py-2 bg-sap-blue text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"><Zap size={14} /> Run Check</button>
        </div>
      </div>

      {/* Month Navigation + Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          <button onClick={() => setActiveTab('technical')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'technical' ? 'bg-white shadow text-sap-blue' : 'text-gray-600 hover:text-gray-900'}`}><Cpu size={16} /> Technical</button>
          <button onClick={() => setActiveTab('commercial')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'commercial' ? 'bg-white shadow text-sap-blue' : 'text-gray-600 hover:text-gray-900'}`}><DollarSign size={16} /> Commercial</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrevMonth} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">←</button>
          <span className="text-sm font-semibold px-3 min-w-[90px] text-center">{selectedMonthLabel}</span>
          <button onClick={handleNextMonth} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">→</button>
        </div>
      </div>

      {/* Current month warning */}
      {isCurrentMonth && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={16} />
          <span className="text-sm">Current month — data is provisional (till-date) and may not be final.</span>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'commercial' ? (
        <CommercialView commercialData={commercialData} subaccountName={status?.subaccountName} />
      ) : (
        <TechnicalView status={status} isCurrentMonth={isCurrentMonth} />
      )}
    </div>
  )
}
