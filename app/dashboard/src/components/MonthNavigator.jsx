const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function MonthNavigator({ selectedYM, onChange }) {
  const y = parseInt(selectedYM.slice(0, 4))
  const m = parseInt(selectedYM.slice(4, 6))
  const label = `${MONTHS[m - 1]} ${y}`

  const handlePrev = () => {
    onChange(m === 1 ? `${y - 1}12` : `${y}${String(m - 1).padStart(2, '0')}`)
  }
  const handleNext = () => {
    onChange(m === 12 ? `${y + 1}01` : `${y}${String(m + 1).padStart(2, '0')}`)
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={handlePrev} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 transition-colors">←</button>
      <span className="text-sm font-semibold px-3 min-w-[90px] text-center">{label}</span>
      <button onClick={handleNext} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 transition-colors">→</button>
    </div>
  )
}