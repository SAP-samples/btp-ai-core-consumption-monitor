export default function ProgressBar({ percentage, color = '#0057d2', height = 'h-4' }) {
  const width = Math.min(percentage || 0, 100)
  return (
    <div className={`w-full bg-gray-200 rounded-full ${height} overflow-hidden`}>
      <div
        className={`${height} rounded-full transition-all duration-500`}
        style={{ width: `${width}%`, backgroundColor: color }}
      />
    </div>
  )
}