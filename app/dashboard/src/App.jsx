import { useState, useEffect, createContext, useContext } from 'react'
import { HashRouter as Router, Routes, Route, NavLink, useNavigate, useParams } from 'react-router-dom'
import { BarChart3, Settings, Bell, Activity, LayoutDashboard, Building2 } from 'lucide-react'
import { fetchUserInfo, fetchSubaccounts } from './services/api'
import { ErrorBoundary } from './components'
import DashboardPage from './pages/DashboardPage'
import SubaccountPage from './pages/SubaccountPage'
import MonthlyPage from './pages/MonthlyPage'
import ConfigPage from './pages/ConfigPage'
import AlertsPage from './pages/AlertsPage'

// ── Subaccount Context ───────────────────────────────────────────────
export const SubaccountContext = createContext({
  subaccounts: [],
  selectedSubaccount: null,
  setSelectedSubaccount: () => {}
})

export function useSubaccount() {
  return useContext(SubaccountContext)
}

function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive ? 'bg-sap-blue text-white' : 'text-gray-700 hover:bg-gray-100'
        }`
      }
    >
      <Icon size={18} />
      <span className="hidden md:inline">{label}</span>
    </NavLink>
  )
}

function SubaccountSelector({ subaccounts, selected, onChange }) {
  if (!subaccounts || subaccounts.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <Building2 size={14} className="text-gray-400" />
      <select
        value={selected || ''}
        onChange={e => onChange(e.target.value || null)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-sap-blue focus:border-sap-blue"
      >
        <option value="">All Subaccounts</option>
        {subaccounts.map(sa => (
          <option key={sa.subaccountId} value={sa.subaccountId}>
            {sa.subaccountName}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function App() {
  const [userInfo, setUserInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subaccounts, setSubaccounts] = useState([])
  const [selectedSubaccount, setSelectedSubaccount] = useState(null)

  useEffect(() => {
    Promise.all([
      fetchUserInfo(),
      fetchSubaccounts().catch(() => [])
    ]).then(([info, subs]) => {
      setUserInfo(info)
      setSubaccounts(subs)
      setLoading(false)
    })
  }, [])

  // Role-based access disabled for now — all users get full access
  // To re-enable: const isAdmin = userInfo?.roles?.includes('Admin')
  const isAdmin = true

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sap-blue"></div>
      </div>
    )
  }

  return (
    <SubaccountContext.Provider value={{ subaccounts, selectedSubaccount, setSelectedSubaccount }}>
      <Router>
        <div className="min-h-screen bg-gray-50">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-sap-blue text-white p-2 rounded-lg">
                  <Activity size={20} />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-sap-dark">AI Core FinOps</h1>
                  <p className="text-xs text-gray-500">Multi-Account Capacity Monitor</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <SubaccountSelector
                  subaccounts={subaccounts}
                  selected={selectedSubaccount}
                  onChange={setSelectedSubaccount}
                />
                <div className="text-sm text-gray-500">
                  {userInfo?.user} {isAdmin && <span className="ml-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-semibold">Admin</span>}
                </div>
              </div>
            </div>
          </header>

          {/* Navigation */}
          <nav className="bg-white border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto">
              <NavItem to="/" icon={LayoutDashboard} label="Overview" />
              {selectedSubaccount && <NavItem to={`/subaccount/${selectedSubaccount}`} icon={Building2} label="Detail" />}
              <NavItem to="/monthly" icon={BarChart3} label="Monthly" />
              <NavItem to="/alerts" icon={Bell} label="Alerts" />
              {isAdmin && <NavItem to="/config" icon={Settings} label="Configuration" />}
            </div>
          </nav>

          {/* Main Content */}
          <main className="max-w-7xl mx-auto px-4 py-6">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
                <Route path="/subaccount/:subaccountId" element={<ErrorBoundary><SubaccountPage /></ErrorBoundary>} />
                <Route path="/subaccount" element={<ErrorBoundary><SubaccountPage /></ErrorBoundary>} />
                <Route path="/monthly" element={<ErrorBoundary><MonthlyPage /></ErrorBoundary>} />
                <Route path="/alerts" element={<ErrorBoundary><AlertsPage /></ErrorBoundary>} />
                {isAdmin && <Route path="/config" element={<ErrorBoundary><ConfigPage /></ErrorBoundary>} />}
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </Router>
    </SubaccountContext.Provider>
  )
}