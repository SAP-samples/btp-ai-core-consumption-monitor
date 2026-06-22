import { AlertTriangle } from 'lucide-react'

const LEVEL_STYLES = {
  INFO: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', dot: 'bg-green-500' },
  WARNING: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  ALERT: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', dot: 'bg-red-500' }
}

const LEVEL_MESSAGES = {
  INFO: '✅ All Good',
  WARNING: '⚠️ Warning — Approaching Limit',
  ALERT: '🚨 Alert — Near or Over Limit'
}

export default function AlertBanner({ level, percentageUsed }) {
  if (!level) return null
  const style = LEVEL_STYLES[level] || LEVEL_STYLES.INFO
  const pct = Number(percentageUsed || 0)

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4 flex items-center gap-3`}>
      <div className={`w-3 h-3 rounded-full ${style.dot}`} />
      <div className={`font-semibold ${style.text}`}>{LEVEL_MESSAGES[level] || level}</div>
      <div className={`ml-auto text-sm ${style.text}`}>{pct.toFixed(1)}% of limit used</div>
    </div>
  )
}

export function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
      <AlertTriangle size={16} />
      <span>{message}</span>
    </div>
  )
}

export function WarningBanner({ message }) {
  if (!message) return null
  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center gap-2">
      <AlertTriangle size={16} />
      <span className="text-sm">{message}</span>
    </div>
  )
}