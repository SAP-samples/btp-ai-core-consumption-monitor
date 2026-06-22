export default function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
      {Icon && <Icon size={48} className="mx-auto mb-4 opacity-30" />}
      {title && <p className="text-lg font-medium">{title}</p>}
      {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
    </div>
  )
}