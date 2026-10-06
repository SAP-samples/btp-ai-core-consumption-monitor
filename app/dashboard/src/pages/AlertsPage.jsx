import { useState, useEffect } from 'react'
import { fetchAlertLogs, formatDate } from '../services/api'
import { useSubaccount } from '../App'
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react'
import { getLevelMeta } from '../constants/levelMeta'

const PAGE_SIZE = 20

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const { selectedSubaccount, subaccounts } = useSubaccount()

  const selectedName = subaccounts.find(s => s.subaccountId === selectedSubaccount)?.subaccountName

  useEffect(() => {
    setLoading(true)
    fetchAlertLogs(500, selectedSubaccount)
      .then(data => { setAlerts(data); setError('') })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [selectedSubaccount])

  // Reset to page 1 whenever filter or subaccount changes
  useEffect(() => { setPage(1) }, [filter, selectedSubaccount])

  const filteredAlerts = filter
    ? alerts.filter(a => (a.alertLevel?.name || '') === filter)
    : alerts

  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / PAGE_SIZE))
  const pagedAlerts = filteredAlerts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sap-blue" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-sap-dark dark:text-gray-100">Alert History</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {selectedSubaccount
              ? `Showing: ${selectedName || selectedSubaccount}`
              : 'All subaccounts'}
            {filteredAlerts.length > 0 && ` · ${filteredAlerts.length} record${filteredAlerts.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          {[
            { label: 'All', value: '' },
            { label: 'Info', value: 'INFO' },
            { label: 'Warning', value: 'WARNING' },
            { label: 'Alert', value: 'ALERT' },
          ].map(f => {
            const meta = f.value ? getLevelMeta(f.value) : null
            const isActive = filter === f.value
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? f.value
                      ? 'text-white'
                      : 'bg-sap-blue text-white'
                    : 'bg-white dark:bg-gray-800 border dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                style={isActive && meta ? { backgroundColor: meta.hex } : undefined}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {filteredAlerts.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-12 text-center text-gray-400">
          <Bell size={48} className="mx-auto mb-4 opacity-30" />
          <p>No alerts {filter ? `with level "${filter}"` : 'yet'}</p>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 font-semibold">Timestamp</th>
                    <th className="px-4 py-3 text-center text-gray-600 dark:text-gray-400 font-semibold">Level</th>
                    <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 font-semibold">Subaccount</th>
                    <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 font-semibold">Message</th>
                    <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">CU</th>
                    <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 font-semibold">Usage %</th>
                    <th className="px-4 py-3 text-center text-gray-600 dark:text-gray-400 font-semibold">SMTP</th>
                    <th className="px-4 py-3 text-center text-gray-600 dark:text-gray-400 font-semibold">ANS</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {pagedAlerts.map((a, i) => {
                    const levelName = a.alertLevel?.name || 'INFO'
                    const meta = getLevelMeta(levelName)
                    return (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {a.alertTimestamp
                            ? new Date(a.alertTimestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : formatDate(a.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white"
                            style={{ backgroundColor: meta.hex }}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 max-w-[120px] truncate" title={a.subaccountName}>
                          {a.subaccountName || '—'}
                        </td>
                        <td className="px-4 py-3 max-w-[250px] truncate text-xs dark:text-gray-300" title={a.message}>
                          {a.message || '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs dark:text-gray-300">
                          {a.totalCu != null ? Number(a.totalCu).toFixed(4) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-xs dark:text-gray-300">
                          {a.percentageUsed != null ? `${Number(a.percentageUsed).toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {a.smtpSent ? <span className="text-green-600">✓</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {a.ansSent ? <span className="text-green-600">✓</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredAlerts.length)} of {filteredAlerts.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-300 min-w-[80px] text-center">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
