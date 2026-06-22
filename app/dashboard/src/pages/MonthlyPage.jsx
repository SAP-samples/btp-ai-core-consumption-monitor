import { useState, useEffect } from 'react'
import { fetchMonthlyStats, formatNumber, toNum } from '../services/api'
import { useSubaccount } from '../App'
import { BarChart3, AlertTriangle } from 'lucide-react'

export default function MonthlyPage() {
  const [stats, setStats] = useState([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { selectedSubaccount, subaccounts } = useSubaccount()

  const selectedName = subaccounts.find(s => s.subaccountId === selectedSubaccount)?.subaccountName

  useEffect(() => {
    setLoading(true)
    fetchMonthlyStats(year, selectedSubaccount)
      .then(data => { setStats(data); setError('') })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [year, selectedSubaccount])

  const maxCu = Math.max(...stats.map(s => toNum(s.totalCu)), 1)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sap-blue"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-sap-dark">Monthly Consumption</h2>
          <p className="text-sm text-gray-500">
            {selectedSubaccount
              ? `Showing: ${selectedName || selectedSubaccount}`
              : 'All subaccounts (aggregated)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(y => y - 1)} className="px-3 py-1 border rounded text-sm hover:bg-gray-50">←</button>
          <span className="text-sm font-semibold px-3">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="px-3 py-1 border rounded text-sm hover:bg-gray-50">→</button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

      {/* Current month warning */}
      {year === new Date().getFullYear() && stats.some(s => {
        const currentYM = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`
        return s.reportYearMonth === currentYM
      }) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={16} />
          <span className="text-sm">Current month data is provisional (till-date) and may not be final until the month ends.</span>
        </div>
      )}

      {stats.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <BarChart3 size={48} className="mx-auto mb-4 opacity-30" />
          <p>No consumption data for {year}</p>
          {selectedSubaccount && <p className="text-sm mt-1">Try selecting "All Subaccounts" or a different year</p>}
        </div>
      ) : (
        <>
          {/* Bar Chart */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="text-sm font-semibold text-sap-dark mb-4">Monthly CU Consumption</h3>
            <div className="flex items-end gap-2 h-48">
              {stats.map((s, i) => {
                const height = maxCu > 0 ? (toNum(s.totalCu) / maxCu * 100) : 0
                const pct = toNum(s.percentageUsed)
                const barColor = pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-sap-blue'
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-500 font-mono">{formatNumber(s.totalCu, 2)}</span>
                    <div className="w-full flex items-end justify-center" style={{ height: '140px' }}>
                      <div
                        className={`w-full max-w-[40px] ${barColor} rounded-t transition-all duration-300`}
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={`${s.month}: ${formatNumber(s.totalCu, 4)} CU (${pct.toFixed(1)}%)`}
                      />
                    </div>
                    <span className="text-xs text-gray-600 font-medium">{s.month}</span>
                  </div>
                )
              })}
            </div>
            {/* Spending limit line reference */}
            <div className="flex items-center gap-3 mt-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-sap-blue"></span> Below 60%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500"></span> 60-80%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500"></span> Above 80%</span>
            </div>
          </div>

          {/* Monthly Table */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-sap-dark">Monthly Details</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-3 text-left text-gray-600 font-semibold">Month</th>
                    <th className="px-4 py-3 text-right text-gray-600 font-semibold">Total CU</th>
                    <th className="px-4 py-3 text-right text-gray-600 font-semibold">Projected CU</th>
                    <th className="px-4 py-3 text-right text-gray-600 font-semibold">Entitlement</th>
                    <th className="px-4 py-3 text-right text-gray-600 font-semibold">Usage %</th>
                    <th className="px-4 py-3 text-left text-gray-600 font-semibold w-32">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stats.map((s, i) => {
                    const pct = toNum(s.percentageUsed)
                    const barColor = pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-green-500'
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{s.month} {year}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatNumber(s.totalCu, 4)}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatNumber(s.projectedCu, 4)}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(s.spendingLimit, 2)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{pct.toFixed(1)}%</td>
                        <td className="px-4 py-3">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className={`${barColor} h-2 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
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