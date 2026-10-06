import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchOverviewStatus, triggerCheck, loadHistoricalData, formatNumber, toNum } from '../services/api'
import { useSubaccount } from '../App'
import { TrendingUp, Zap, Target, RefreshCw, AlertTriangle, Building2, ArrowRight, Download, X } from 'lucide-react'
import { getLevelMeta } from '../constants/levelMeta'

function SummaryCards({ overview }) {
  const totalCu = overview.reduce((sum, s) => sum + toNum(s.totalCu), 0)
  const totalLimit = overview.reduce((sum, s) => sum + toNum(s.spendingLimit), 0)
  const alertCount = overview.filter(s => s.alertLevel === 'ALERT').length
  const warningCount = overview.filter(s => s.alertLevel === 'WARNING').length

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Building2 size={16} className="text-blue-700 dark:text-blue-400" />
          <span className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-400">Subaccounts</span>
        </div>
        <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{overview.length}</div>
        <div className="text-xs mt-1 text-blue-600 dark:text-blue-500 opacity-75">Active monitored</div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Zap size={16} className="text-gray-700 dark:text-gray-300" />
          <span className="text-xs font-medium uppercase tracking-wide text-gray-700 dark:text-gray-300">Total CU</span>
        </div>
        <div className="text-2xl font-bold text-gray-700 dark:text-gray-200">{formatNumber(totalCu, 2)}</div>
        <div className="text-xs mt-1 text-gray-500 dark:text-gray-400 opacity-75">/ {formatNumber(totalLimit, 0)} entitlement</div>
      </div>
      <div className="rounded-xl border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/40 p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={16} className="text-yellow-700 dark:text-yellow-400" />
          <span className="text-xs font-medium uppercase tracking-wide text-yellow-700 dark:text-yellow-400">Warnings</span>
        </div>
        <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{warningCount}</div>
        <div className="text-xs mt-1 text-yellow-600 dark:text-yellow-500 opacity-75">Approaching limit</div>
      </div>
      <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={16} className="text-red-700 dark:text-red-400" />
          <span className="text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-400">Alerts</span>
        </div>
        <div className="text-2xl font-bold text-red-700 dark:text-red-300">{alertCount}</div>
        <div className="text-xs mt-1 text-red-600 dark:text-red-500 opacity-75">Over threshold</div>
      </div>
    </div>
  )
}

function SubaccountCard({ item, onSelect }) {
  const meta = getLevelMeta(item.alertLevel)
  const pct = toNum(item.percentageUsed)

  return (
    <div
      className={`rounded-xl border ${meta.border} bg-white dark:bg-gray-900 hover:shadow-md transition-shadow cursor-pointer`}
      onClick={() => onSelect(item.subaccountId)}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-sap-dark dark:text-gray-100 truncate">{item.subaccountName}</h3>
            {item.tags && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {item.tags.split(',').map((tag, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-[10px]">{tag.trim()}</span>
                ))}
              </div>
            )}
          </div>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${meta.badgeBg}`}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.hex }} />
            <span className={`text-xs font-semibold ${meta.badgeText}`}>{meta.label}</span>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center">
            <div className="text-lg font-bold text-sap-dark dark:text-gray-200">{formatNumber(item.totalCu, 2)}</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">CU Used</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-gray-600 dark:text-gray-300">{formatNumber(item.spendingLimit, 0)}</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Entitlement</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: meta.hex }}>{pct.toFixed(1)}%</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Used</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
          <div
            className="h-2 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: meta.hex }}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
          <span>Day {item.daysElapsed}/{item.daysInMonth}</span>
          <span>Projected: {formatNumber(item.projectedCu, 2)} CU</span>
        </div>
      </div>

      {/* View details link */}
      <div className="border-t dark:border-gray-700 px-5 py-2.5 flex items-center justify-between bg-gray-50 dark:bg-gray-800/60 rounded-b-xl">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Last check: {item.lastCheckDate || 'Never'}
        </span>
        <span className="text-xs text-sap-blue font-medium flex items-center gap-1">
          Details <ArrowRight size={12} />
        </span>
      </div>
    </div>
  )
}

function HistoricalDataModal({ show, onClose, subaccounts }) {
  const today = new Date().toISOString().split('T')[0]
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const [fromDate, setFromDate] = useState(yearAgo)
  const [toDate, setToDate] = useState(today)
  const [selectedSa, setSelectedSa] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  if (!show) return null

  const handleLoad = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const from = fromDate.replace(/-/g, '')
      const to = toDate.replace(/-/g, '')
      const res = await loadHistoricalData(from, to, selectedSa || null)
      setResult(res)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download size={18} className="text-sap-blue" />
            <h3 className="text-lg font-semibold dark:text-gray-100">Load Historical Data</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded dark:text-gray-400"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Fetch historical consumption data from the UAS API and store it in the database. This includes capacity units and token usage per model.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">From Date</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">To Date</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Subaccount</label>
            <select value={selectedSa} onChange={e => setSelectedSa(e.target.value)} className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100">
              <option value="">All Active Subaccounts</option>
              {subaccounts.map(sa => <option key={sa.subaccountId} value={sa.subaccountId}>{sa.subaccountName}</option>)}
            </select>
          </div>
          {error && <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2 rounded text-sm">{error}</div>}
          {result && <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-3 py-2 rounded text-sm">{result.message}</div>}
        </div>
        <div className="px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 border dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300">Close</button>
          <button onClick={handleLoad} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-sap-blue text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            {loading ? 'Loading...' : 'Load Data'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [overview, setOverview] = useState([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState('')
  const [showHistorical, setShowHistorical] = useState(false)
  const { subaccounts, setSelectedSubaccount } = useSubaccount()
  const navigate = useNavigate()

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await fetchOverviewStatus()
      setOverview(data)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleTriggerAll = async (dryRun) => {
    setTriggering(true)
    try {
      await triggerCheck(dryRun)
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setTriggering(false)
    }
  }

  const handleSelectSubaccount = (subaccountId) => {
    setSelectedSubaccount(subaccountId)
    navigate(`/subaccount/${subaccountId}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sap-blue" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Header & Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-sap-dark dark:text-gray-100">Subaccount Overview</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{overview.length} active subaccount(s) monitored</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowHistorical(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
          >
            <Download size={14} />
            Load Historical
          </button>
          <button
            onClick={() => handleTriggerAll(true)}
            disabled={triggering}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300 disabled:opacity-50"
          >
            <RefreshCw size={14} className={triggering ? 'animate-spin' : ''} />
            Dry Run All
          </button>
          <button
            onClick={() => handleTriggerAll(false)}
            disabled={triggering}
            className="flex items-center gap-2 px-4 py-2 bg-sap-blue text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Zap size={14} />
            Check All
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards overview={overview} />

      {/* Subaccount Grid */}
      {overview.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-12 text-center text-gray-400">
          <Building2 size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No subaccounts configured</p>
          <p className="text-sm mt-1">Go to Configuration to add subaccounts to monitor.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {overview.map(item => (
            <SubaccountCard
              key={item.subaccountId}
              item={item}
              onSelect={handleSelectSubaccount}
            />
          ))}
        </div>
      )}

      <HistoricalDataModal
        show={showHistorical}
        onClose={() => { setShowHistorical(false); loadData() }}
        subaccounts={subaccounts}
      />
    </div>
  )
}
