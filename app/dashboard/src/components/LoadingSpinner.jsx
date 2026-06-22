export default function LoadingSpinner({ size = 'h-10 w-10' }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className={`animate-spin rounded-full ${size} border-b-2 border-sap-blue`}></div>
    </div>
  )
}