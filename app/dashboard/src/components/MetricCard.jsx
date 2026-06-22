import { Info } from 'lucide-react'

const COLORS = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  green: 'border-green-200 bg-green-50 text-green-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  gray: 'border-gray-200 bg-gray-50 text-gray-700',
  purple: 'border-purple-200 bg-purple-50 text-purple-700',
  yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700'
}

export default function MetricCard({ icon: Icon, label, value, subtitle, color = 'blue', infoTooltip }) {
  return (
    <div className={`rounded-xl border p-5 ${COLORS[color] || COLORS.gray}`}>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={16} />}
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