import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
          <AlertTriangle size={36} className="mx-auto mb-3 text-red-400" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Something went wrong</h3>
          <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
            {this.state.error?.message || 'An unexpected error occurred while rendering this section.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-4 py-2 bg-sap-blue text-white rounded-lg text-sm hover:bg-blue-700 mx-auto"
          >
            <RefreshCw size={14} /> Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}