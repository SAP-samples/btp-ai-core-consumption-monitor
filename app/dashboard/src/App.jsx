import { useState, useEffect, useRef, createContext, useContext } from 'react'
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

// ── Searchable subaccount dropdown ───────────────────────────────────────────
function SearchableSelect({ subaccounts, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const selected = subaccounts.find(s => s.subaccountId === value)
  const filtered = query
    ? subaccounts.filter(s => s.subaccountName?.toLowerCase().includes(query.toLowerCase()))
    : subaccounts

  function handleFocus() {
    setQuery('')
    setOpen(true)
  }

  function handleSelect(id) {
    onChange(id || null)
    setQuery('')
    setOpen(false)
  }

  if (!subaccounts.length) return null

  return (
    <div ref={ref} className="relative w-52">
      <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-sap-blue">
        <Building2 size={14} className="ml-2.5 text-gray-400 shrink-0" />
        <input
          type="text"
          value={open ? query : (selected?.subaccountName || '')}
          onFocus={handleFocus}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          placeholder="All Subaccounts"
          className="w-full text-sm px-2 py-1.5 bg-transparent dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
        />
        {value && !open && (
          <button
            onClick={() => handleSelect(null)}
            className="mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            title="Clear"
          >✕</button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          <button
            onMouseDown={() => handleSelect(null)}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-b dark:border-gray-700"
          >
            All Subaccounts
          </button>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
          ) : (
            filtered.map(sa => (
              <button
                key={sa.subaccountId}
                onMouseDown={() => handleSelect(sa.subaccountId)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  sa.subaccountId === value
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-sap-blue font-medium'
                    : 'text-gray-700 dark:text-gray-200'
                }`}
              >
                {sa.subaccountName}
              </button>
            ))
          )}
        </div>
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
                <SearchableSelect
                  subaccounts={subaccounts}
                  value={selectedSubaccount}
                  onChange={setSelectedSubaccount}
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
