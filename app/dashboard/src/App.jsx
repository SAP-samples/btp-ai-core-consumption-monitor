import { useState, useEffect, createContext, useContext } from 'react'
import { HashRouter as Router, Routes, Route, NavLink } from 'react-router-dom'
import { BarChart3, Settings, Bell, Activity, LayoutDashboard, Building2, Moon, Sun } from 'lucide-react'
import { fetchUserInfo, fetchSubaccounts, fetchCmsBusinessUnits, fetchCmsApplications } from './services/api'
import { ErrorBoundary } from './components'
import DashboardPage from './pages/DashboardPage'
import SubaccountPage from './pages/SubaccountPage'
import MonthlyPage from './pages/MonthlyPage'
import ConfigPage from './pages/ConfigPage'
import AlertsPage from './pages/AlertsPage'

// ── App Context ──────────────────────────────────────────────────────────────
export const SubaccountContext = createContext({
  subaccounts: [],
  selectedSubaccount: null,
  setSelectedSubaccount: () => {},
  selectedBusinessUnit: null,
  setSelectedBusinessUnit: () => {},
  selectedApplication: null,
  setSelectedApplication: () => {},
  businessUnits: [],
  applications: [],
})

export function useSubaccount() {
  return useContext(SubaccountContext)
}

// ── Nav item ─────────────────────────────────────────────────────────────────
function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-sap-blue text-white'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`
      }
    >
      <Icon size={18} />
      <span className="hidden md:inline">{label}</span>
    </NavLink>
  )
}

// ── Hierarchy selector: BU → App → Subaccount ────────────────────────────────
function HierarchySelector({
  businessUnits, applications, subaccounts,
  selectedBu, onBuChange,
  selectedApp, onAppChange,
  selectedSa, onSaChange,
  hasCms,
}) {
  const filteredApps = selectedBu
    ? applications.filter(a => a.businessUnitId === selectedBu)
    : applications

  // Subaccounts visible: filter by app/BU via tags or show all
  // (detailed filtering requires CMSDirectorySubaccounts; for nav we show the flat list)
  const filteredSas = subaccounts

  if (!hasCms) {
    // No CMS — simple flat selector
    if (!filteredSas.length) return null
    return (
      <div className="flex items-center gap-2">
        <Building2 size={14} className="text-gray-400" />
        <select
          value={selectedSa || ''}
          onChange={e => onSaChange(e.target.value || null)}
          className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-sap-blue"
        >
          <option value="">All Subaccounts</option>
          {filteredSas.map(sa => (
            <option key={sa.subaccountId} value={sa.subaccountId}>{sa.subaccountName}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {businessUnits.length > 0 && (
        <select
          value={selectedBu || ''}
          onChange={e => { onBuChange(e.target.value || null); onAppChange(null); onSaChange(null) }}
          className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-sap-blue max-w-[160px] truncate"
          title="Business Unit"
        >
          <option value="">All BUs</option>
          {businessUnits.map(bu => <option key={bu.ID} value={bu.ID}>{bu.shortName}</option>)}
        </select>
      )}
      {selectedBu && filteredApps.length > 0 && (
        <select
          value={selectedApp || ''}
          onChange={e => { onAppChange(e.target.value || null); onSaChange(null) }}
          className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-sap-blue max-w-[160px]"
          title="Application"
        >
          <option value="">All Apps</option>
          {filteredApps.map(a => <option key={a.ID} value={a.ID}>{a.shortName}</option>)}
        </select>
      )}
      {filteredSas.length > 0 && (
        <select
          value={selectedSa || ''}
          onChange={e => onSaChange(e.target.value || null)}
          className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-sap-blue max-w-[160px]"
          title="Subaccount"
        >
          <option value="">All Subaccounts</option>
          {filteredSas.map(sa => (
            <option key={sa.subaccountId} value={sa.subaccountId}>{sa.subaccountName}</option>
          ))}
        </select>
      )}
    </div>
  )
}

// ── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [userInfo, setUserInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subaccounts, setSubaccounts] = useState([])
  const [businessUnits, setBusinessUnits] = useState([])
  const [applications, setApplications] = useState([])
  const [selectedSubaccount, setSelectedSubaccount] = useState(null)
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState(null)
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Apply dark class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    Promise.all([
      fetchUserInfo(),
      fetchSubaccounts().catch(() => []),
      fetchCmsBusinessUnits().catch(() => []),
      fetchCmsApplications().catch(() => []),
    ]).then(([info, subs, bus, apps]) => {
      setUserInfo(info)
      setSubaccounts(subs)
      setBusinessUnits(bus)
      setApplications(apps)
      setLoading(false)
    })
  }, [])

  const isAdmin = userInfo?.roles?.includes('Admin')
  const hasCms = businessUnits.length > 0

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sap-blue" />
      </div>
    )
  }

  const contextValue = {
    subaccounts,
    selectedSubaccount,
    setSelectedSubaccount,
    selectedBusinessUnit,
    setSelectedBusinessUnit,
    selectedApplication,
    setSelectedApplication,
    businessUnits,
    applications,
  }

  return (
    <SubaccountContext.Provider value={contextValue}>
      <Router>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
          {/* Header */}
          <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 shrink-0">
                <div className="bg-sap-blue text-white p-2 rounded-lg">
                  <Activity size={20} />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-sap-dark dark:text-gray-100">AI Core FinOps</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Multi-Account Capacity Monitor</p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-1 justify-end flex-wrap">
                <HierarchySelector
                  businessUnits={businessUnits}
                  applications={applications}
                  subaccounts={subaccounts}
                  selectedBu={selectedBusinessUnit}
                  onBuChange={setSelectedBusinessUnit}
                  selectedApp={selectedApplication}
                  onAppChange={setSelectedApplication}
                  selectedSa={selectedSubaccount}
                  onSaChange={setSelectedSubaccount}
                  hasCms={hasCms}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDarkMode(d => !d)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                    title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                  </button>
                  <div className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                    {userInfo?.user}
                  </div>
                  {isAdmin && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded text-xs font-semibold">
                      Admin
                    </span>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Navigation */}
          <nav className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
            <div className="max-w-7xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto">
              <NavItem to="/" icon={LayoutDashboard} label="Overview" />
              {selectedSubaccount && (
                <NavItem to={`/subaccount/${selectedSubaccount}`} icon={Building2} label="Detail" />
              )}
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
