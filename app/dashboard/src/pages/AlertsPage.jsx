import { useState, useEffect } from 'react'
import { fetchAlertLogs, formatDate } from '../services/api'
import { useSubaccount } from '../App'
import { Bell } from 'lucide-react'

const LEVEL_BADGE = {
  INFO: 'bg-green-100 text-green-800',
  WARNING: 'bg-yellow-100 text-yellow-800',
  ALERT: 'bg-red-100 text-red-800'
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const { selectedSubaccount, subaccounts } = useSubaccount()

  const selectedName = subaccounts.find(s => s.subaccountId === selectedSubaccount)?.subaccountName

  useEffect(() => {
    setLoading(true)
    fetchAlertLogs(100, selectedSubaccount)
      .then(data => { setAlerts(data); setError('') })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [selectedSubaccount])

  const filteredAlerts = filter
    ? alerts.filter(a => (a.alertLevel?.name || '') === filter)
    : alerts

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
          <h2 className="text-xl font-bold text-sap-dark">Alert History</h2>
          <p className="text-sm text-gray-500">
            {selectedSubaccount
              ? `Showing: ${selectedName || selectedSubaccount}`
              : 'All subaccounts'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${!filter ? 'bg-sap-blue text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>All</button>
          <button onClick={() => setFilter('INFO')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === 'INFO' ? 'bg-green-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>Info</button>
          <button onClick={() => setFilter('WARNING')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === 'WARNING' ? 'bg-yellow-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>Warning</button>
          <button onClick={() => setFilter('ALERT')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === 'ALERT' ? 'bg-red-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>Alert</button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

      {filteredAlerts.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <Bell size={48} className="mx-auto mb-4 opacity-30" />
          <p>No alerts {filter ? `with level "${filter}"` : 'yet'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-gray-600 font-semibold">Timestamp</th>
                  <th className="px-4 py-3 text-center text-gray-600 font-semibold">Level</th>
                  <th className="px-4 py-3 text-left text-gray-600 font-semibold">Subaccount</th>
                  <th className="px-4 py-3 text-left text-gray-600 font-semibold">Message</th>
                  <th className="px-4 py-3 text-right text-gray-600 font-semibold">CU</th>
                  <th className="px-4 py-3 text-right text-gray-600 font-semibold">Usage %</th>
                  <th className="px-4 py-3 text-center text-gray-600 font-semibold">SMTP</th>
                  <th className="px-4 py-3 text-center text-gray-600 font-semibold">ANS</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredAlerts.map((a, i) => {
                  const levelName = a.alertLevel?.name || 'INFO'
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {a.alertTimestamp ? new Date(a.alertTimestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : formatDate(a.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${LEVEL_BADGE[levelName] || LEVEL_BADGE.INFO}`}>
                          {levelName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 max-w-[120px] truncate" title={a.subaccountName}>
                        {a.subaccountName || '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[250px] truncate text-xs" title={a.message}>{a.message || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{a.totalCu != null ? Number(a.totalCu).toFixed(4) : '—'}</td>
                      <td className="px-4 py-3 text-right text-xs">{a.percentageUsed != null ? `${Number(a.percentageUsed).toFixed(1)}%` : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {a.smtpSent ? <span className="text-green-600">✓</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {a.ansSent ? <span className="text-green-600">✓</span> : <span className="text-gray-300">—</span>}
                      </td>
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