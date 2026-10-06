import { useState, useEffect, useCallback } from 'react'
import {
  fetchMonitoringConfigs, createMonitoringConfig, updateMonitoringConfig, deleteMonitoringConfig,
  fetchNotificationConfig, updateNotificationConfig, testNotification, sendTestEmail,
  fetchSubaccountsMaster, fetchCmsBusinessUnits, fetchCmsApplications,
  refreshCMSDirectories, enableMonitoring, createSubaccountManual
} from '../services/api'
import {
  Save, Send, Plus, Trash2, Edit2, X, Building2, ToggleLeft, ToggleRight,
  Eye, EyeOff, RefreshCw, Globe, Mail, Zap, ChevronDown, ChevronRight, Check
} from 'lucide-react'

// ── Shared primitives ─────────────────────────────────────────────────────────

function FormField({ label, hint, children }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button" onClick={onChange}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors
        ${checked ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
    >
      {checked ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
      {label}
    </button>
  )
}

function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className={IC} value={value} onChange={onChange}
        placeholder={placeholder || 'Enter password'}
      />
      <button
        type="button" onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

const IC = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm ' +
  'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ' +
  'focus:ring-2 focus:ring-sap-blue focus:border-sap-blue'

function Toast({ msg }) {
  if (!msg.text) return null
  return (
    <div className={`px-4 py-3 rounded-lg text-sm ${
      msg.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700'
                           : 'bg-green-50 border border-green-200 text-green-700'}`}>
      {msg.text}
    </div>
  )
}

// ── Monitoring config edit form (threshold/budget for an already-opted-in account) ──

function MonitoringEditForm({ config, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...config })
  const handleSubmit = (e) => {
    e.preventDefault()
    const { ID, createdAt, createdBy, modifiedAt, modifiedBy, subaccount, ...payload } = form
    onSave(ID, payload)
  }
  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4 border-t bg-blue-50/30 dark:bg-blue-900/10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Monthly Entitlement (CU)">
          <input type="number" step="0.01" className={IC} value={form.spendingLimit || ''} onChange={e => setForm({ ...form, spendingLimit: parseFloat(e.target.value) })} />
        </FormField>
        <FormField label="Tags (comma-separated)">
          <input type="text" className={IC} value={form.tags || ''} onChange={e => setForm({ ...form, tags: e.target.value })} />
        </FormField>
        <FormField label="Warning Threshold (%)">
          <input type="number" step="1" min="0" max="100" className={IC} value={form.warningThresholdPct || ''} onChange={e => setForm({ ...form, warningThresholdPct: parseFloat(e.target.value) })} />
        </FormField>
        <FormField label="Alert Threshold (%)">
          <input type="number" step="1" min="0" max="100" className={IC} value={form.alertThresholdPct || ''} onChange={e => setForm({ ...form, alertThresholdPct: parseFloat(e.target.value) })} />
        </FormField>
        <FormField label="Check Time (UTC HH:MM)">
          <input type="text" className={IC} value={form.checkTimeUtc || '07:00'} onChange={e => setForm({ ...form, checkTimeUtc: e.target.value })} />
        </FormField>
        <FormField label="Display Order">
          <input type="number" className={IC} value={form.displayOrder ?? 0} onChange={e => setForm({ ...form, displayOrder: parseInt(e.target.value) || 0 })} />
        </FormField>
      </div>
      <div className="flex items-center gap-6">
        <Toggle checked={form.isActive || false} onChange={() => setForm({ ...form, isActive: !form.isActive })} label="Active" />
        <Toggle checked={form.receiveDailyEmails || false} onChange={() => setForm({ ...form, receiveDailyEmails: !form.receiveDailyEmails })} label="Daily emails" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-sap-blue text-white rounded-lg text-sm disabled:opacity-50 hover:bg-blue-700">
          <Save size={14} /> Update
        </button>
        <button type="button" onClick={onCancel} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border rounded-lg text-sm">
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  )
}

// ── Subaccount discovery / opt-in panel ──────────────────────────────────────

function SubaccountDiscovery({ onEnabled, monitoredIds }) {
  const [discovered, setDiscovered] = useState([])
  const [businessUnits, setBusinessUnits] = useState([])
  const [applications, setApplications] = useState([])
  const [filterBu, setFilterBu] = useState('')
  const [filterApp, setFilterApp] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [enabling, setEnabling] = useState(null)
  const [expandId, setExpandId] = useState(null)
  const [form, setForm] = useState({ spendingLimit: 100, warningThresholdPct: 70, alertThresholdPct: 90 })

  const load = useCallback(async () => {
    const [subs, bus, apps] = await Promise.all([
      fetchSubaccountsMaster().catch(() => []),
      fetchCmsBusinessUnits().catch(() => []),
      fetchCmsApplications().catch(() => [])
    ])
    setDiscovered(subs)
    setBusinessUnits(bus)
    setApplications(apps)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const r = await refreshCMSDirectories()
      setSyncMsg(r.message || 'Synced!')
      await load()
    } catch (e) { setSyncMsg(`Error: ${e.message}`) }
    finally { setSyncing(false) }
  }

  const handleEnable = async (subaccountId) => {
    setEnabling(subaccountId)
    try {
      await enableMonitoring(subaccountId, form.spendingLimit, form.warningThresholdPct, form.alertThresholdPct)
      setExpandId(null)
      await load()
      onEnabled()
    } catch (e) { alert(e.message) }
    finally { setEnabling(null) }
  }

  // Filter by BU / App via businessUnitGuid / parentDirectoryGuid
  const buGuids = filterApp
    ? [applications.find(a => a.ID === filterApp)?.businessUnitId].filter(Boolean)
    : filterBu ? [filterBu] : null

  const appGuids = filterApp ? [filterApp] : null

  // A subaccount matches if its businessUnitGuid is in buGuids (when BU filter set)
  // and its parentDirectoryGuid is in appGuids (when App filter set)
  const filtered = discovered.filter(sa => {
    if (buGuids && !buGuids.includes(sa.businessUnitGuid)) return false
    if (appGuids && !appGuids.includes(sa.parentDirectoryGuid)) return false
    return true
  })

  const unmonitored = filtered.filter(sa => !monitoredIds.includes(sa.subaccountId))
  const monitored = filtered.filter(sa => monitoredIds.includes(sa.subaccountId))
  const hasCms = businessUnits.length > 0

  return (
    <div className="space-y-4">
      {/* CMS sync bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 px-3 py-1.5 border border-sap-blue text-sap-blue rounded-lg text-sm hover:bg-blue-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync from CMS'}
        </button>
        {syncMsg && <span className="text-xs text-gray-500">{syncMsg}</span>}
        {!hasCms && <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">CMS not configured — showing manually-added subaccounts only</span>}
      </div>

      {/* Hierarchy filters */}
      {hasCms && (
        <div className="flex gap-3 flex-wrap">
          <select
            value={filterBu}
            onChange={e => { setFilterBu(e.target.value); setFilterApp('') }}
            className={IC + ' w-auto flex-1 min-w-[180px]'}
          >
            <option value="">All Business Units</option>
            {businessUnits.map(bu => <option key={bu.ID} value={bu.ID}>{bu.shortName}</option>)}
          </select>
          {filterBu && (
            <select
              value={filterApp}
              onChange={e => setFilterApp(e.target.value)}
              className={IC + ' w-auto flex-1 min-w-[180px]'}
            >
              <option value="">All Applications</option>
              {applications.filter(a => a.businessUnitId === filterBu).map(a => (
                <option key={a.ID} value={a.ID}>{a.shortName}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ── Activated subaccounts ────────────────────────────────────────── */}
      {monitored.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Monitoring Active ({monitored.length})
          </h4>
          <div className="divide-y dark:divide-gray-700 border dark:border-gray-700 rounded-lg overflow-hidden">
            {monitored.map(sa => (
              <div key={sa.subaccountId} className="px-4 py-3 flex items-center justify-between bg-green-50/40 dark:bg-green-900/10">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-sap-dark dark:text-gray-100 truncate">{sa.subaccountName || sa.subaccountId}</div>
                    <div className="text-xs text-gray-400 truncate">{sa.subaccountId}{sa.region ? ` · ${sa.region}` : ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {sa.discoveredViaCms && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">CMS</span>}
                  <span className="text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-full">Activated</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Available to enable ───────────────────────────────────────────── */}
      {(unmonitored.length > 0 || monitored.length === 0) && (
        <div>
          {monitored.length > 0 && (
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
              Available to Enable ({unmonitored.length})
            </h4>
          )}
          {unmonitored.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              {discovered.length === 0
                ? 'No subaccounts discovered yet. Click "Sync from CMS" or add one manually below.'
                : 'All discovered subaccounts are already being monitored.'}
            </div>
          ) : (
            <div className="divide-y dark:divide-gray-700 border dark:border-gray-700 rounded-lg overflow-hidden">
              {unmonitored.map(sa => (
                <div key={sa.subaccountId}>
                  <div
                    className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => setExpandId(expandId === sa.subaccountId ? null : sa.subaccountId)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expandId === sa.subaccountId ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-sap-dark dark:text-gray-100 truncate">{sa.subaccountName || sa.subaccountId}</div>
                        <div className="text-xs text-gray-400 truncate">{sa.subaccountId}{sa.region ? ` · ${sa.region}` : ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {sa.discoveredViaCms && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">CMS</span>}
                      <span className="text-xs text-gray-400">Click to enable</span>
                    </div>
                  </div>
                  {expandId === sa.subaccountId && (
                    <div className="px-4 pb-4 pt-2 bg-blue-50/30 dark:bg-blue-900/10 border-t dark:border-gray-700 space-y-3">
                      <p className="text-xs text-gray-500">Set the monitoring budget and thresholds before enabling:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <FormField label="Monthly Entitlement (CU)">
                          <input type="number" step="0.01" className={IC} value={form.spendingLimit} onChange={e => setForm({ ...form, spendingLimit: parseFloat(e.target.value) || 100 })} />
                        </FormField>
                        <FormField label="Warning (%)">
                          <input type="number" step="1" min="0" max="100" className={IC} value={form.warningThresholdPct} onChange={e => setForm({ ...form, warningThresholdPct: parseFloat(e.target.value) || 70 })} />
                        </FormField>
                        <FormField label="Alert (%)">
                          <input type="number" step="1" min="0" max="100" className={IC} value={form.alertThresholdPct} onChange={e => setForm({ ...form, alertThresholdPct: parseFloat(e.target.value) || 90 })} />
                        </FormField>
                      </div>
                      <button
                        onClick={() => handleEnable(sa.subaccountId)}
                        disabled={enabling === sa.subaccountId}
                        className="flex items-center gap-2 px-4 py-2 bg-sap-blue text-white rounded-lg text-sm disabled:opacity-50 hover:bg-blue-700"
                      >
                        {enabling === sa.subaccountId ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                        Enable Monitoring
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Manual subaccount add form (no CMS) ──────────────────────────────────────

function ManualAddForm({ onSave, onCancel, saving }) {
  const [form, setForm] = useState({ subaccountId: '', subaccountName: '', spendingLimit: 100, warningThresholdPct: 70, alertThresholdPct: 90, checkTimeUtc: '07:00', receiveDailyEmails: false, isActive: true, displayOrder: 0, tags: '' })
  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(null, form)
  }
  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4 border-t bg-blue-50/30">
      <p className="text-sm font-medium text-gray-600">Add subaccount manually (no CMS discovery)</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Subaccount ID (BTP GUID) *">
          <input type="text" required className={IC} value={form.subaccountId} onChange={e => setForm({ ...form, subaccountId: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </FormField>
        <FormField label="Display Name *">
          <input type="text" required className={IC} value={form.subaccountName} onChange={e => setForm({ ...form, subaccountName: e.target.value })} />
        </FormField>
        <FormField label="Monthly Entitlement (CU)">
          <input type="number" step="0.01" className={IC} value={form.spendingLimit} onChange={e => setForm({ ...form, spendingLimit: parseFloat(e.target.value) })} />
        </FormField>
        <FormField label="Tags (comma-separated)">
          <input type="text" className={IC} value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} />
        </FormField>
        <FormField label="Warning (%)">
          <input type="number" step="1" min="0" max="100" className={IC} value={form.warningThresholdPct} onChange={e => setForm({ ...form, warningThresholdPct: parseFloat(e.target.value) })} />
        </FormField>
        <FormField label="Alert (%)">
          <input type="number" step="1" min="0" max="100" className={IC} value={form.alertThresholdPct} onChange={e => setForm({ ...form, alertThresholdPct: parseFloat(e.target.value) })} />
        </FormField>
      </div>
      <div className="flex items-center gap-6">
        <Toggle checked={form.isActive} onChange={() => setForm({ ...form, isActive: !form.isActive })} label="Active" />
        <Toggle checked={form.receiveDailyEmails} onChange={() => setForm({ ...form, receiveDailyEmails: !form.receiveDailyEmails })} label="Daily emails" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-sap-blue text-white rounded-lg text-sm disabled:opacity-50 hover:bg-blue-700">
          <Save size={14} /> Add
        </button>
        <button type="button" onClick={onCancel} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border rounded-lg text-sm">
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [monConfigs, setMonConfigs] = useState([])
  const [notifConfig, setNotifConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [sendingTestEmail, setSendingTestEmail] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [editingId, setEditingId] = useState(null)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(true)
  const [notifTab, setNotifTab] = useState('smtp')  // 'smtp' | 'api' | 'ans'

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 4000) }

  const loadData = async () => {
    try {
      const [configs, notif] = await Promise.all([fetchMonitoringConfigs(), fetchNotificationConfig()])
      setMonConfigs(configs)
      setNotifConfig(notif)
    } catch (err) { flash('error', err.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadData() }, [])

  const monitoredIds = monConfigs.map(c => c.subaccountId)

  const handleSaveSubaccount = async (id, payload) => {
    setSaving(true)
    try {
      if (id) {
        await updateMonitoringConfig(id, payload)
        flash('success', 'Updated!')
      } else {
        // First ensure the subaccount exists in master
        await createSubaccountManual({ subaccountId: payload.subaccountId, subaccountName: payload.subaccountName }).catch(() => {})
        await enableMonitoring(payload.subaccountId, payload.spendingLimit, payload.warningThresholdPct, payload.alertThresholdPct)
        flash('success', 'Subaccount added!')
      }
      setEditingId(null); setShowManualAdd(false)
      await loadData()
    } catch (err) { flash('error', err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Remove "${name}" from monitoring?`)) return
    setSaving(true)
    try { await deleteMonitoringConfig(id); flash('success', 'Removed.'); await loadData() }
    catch (err) { flash('error', err.message) }
    finally { setSaving(false) }
  }

  const handleSaveNotification = async () => {
    if (!notifConfig) return
    setSaving(true)
    try {
      const { ID, createdAt, createdBy, modifiedAt, modifiedBy, ...p } = notifConfig
      await updateNotificationConfig(ID, p)
      flash('success', 'Notification config saved!')
    } catch (err) { flash('error', err.message) }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true)
    try { const r = await testNotification(); flash('success', r.message || 'Test sent!') }
    catch (err) { flash('error', err.message) }
    finally { setTesting(false) }
  }

  const handleSendTestEmail = async () => {
    if (!testEmail) return flash('error', 'Enter a recipient email first')
    setSendingTestEmail(true)
    try { const r = await sendTestEmail(testEmail); flash('success', r.message || 'Test email sent!') }
    catch (err) { flash('error', err.message) }
    finally { setSendingTestEmail(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sap-blue" />
    </div>
  )

  const nc = notifConfig || {}
  const setNC = (patch) => setNotifConfig({ ...nc, ...patch })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-sap-dark dark:text-gray-100">Configuration</h2>
        <p className="text-sm text-gray-500">Manage monitored subaccounts and notification settings</p>
      </div>

      <Toast msg={msg} />

      {/* ── Subaccount Discovery ─────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700">
        <button
          className="w-full px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between text-left"
          onClick={() => setDiscoverOpen(!discoverOpen)}
        >
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-sap-blue" />
            <h3 className="text-lg font-semibold text-sap-dark dark:text-gray-100">Discover Subaccounts</h3>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">CMS</span>
          </div>
          {discoverOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        </button>
        {discoverOpen && (
          <div className="p-6">
            <SubaccountDiscovery onEnabled={loadData} monitoredIds={monitoredIds} />
          </div>
        )}
      </div>

      {/* ── Monitored Subaccounts ────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700">
        <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-sap-blue" />
            <h3 className="text-lg font-semibold text-sap-dark dark:text-gray-100">Monitored Subaccounts</h3>
            <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-600 dark:text-gray-400">{monConfigs.length}</span>
          </div>
          <button
            onClick={() => { setShowManualAdd(true); setEditingId(null) }}
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
          >
            <Plus size={14} /> Add manually
          </button>
        </div>

        {showManualAdd && (
          <ManualAddForm onSave={handleSaveSubaccount} onCancel={() => setShowManualAdd(false)} saving={saving} />
        )}

        {monConfigs.length === 0 && !showManualAdd ? (
          <div className="p-8 text-center text-gray-400">
            <Building2 size={36} className="mx-auto mb-3 opacity-30" />
            <p>No subaccounts monitored. Use the discovery panel above or add manually.</p>
          </div>
        ) : (
          <div className="divide-y dark:divide-gray-700">
            {monConfigs.map(c => (
              <div key={c.ID}>
                <div className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`w-3 h-3 rounded-full shrink-0 ${c.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sap-dark dark:text-gray-100 text-sm truncate">{c.subaccountName}</span>
                        {c.tags && c.tags.split(',').slice(0, 2).map((t, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded text-[10px]">{t.trim()}</span>
                        ))}
                      </div>
                      <div className="text-xs text-gray-400 truncate">{c.subaccountId}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                    <span className="hidden md:inline">{c.spendingLimit} CU ent.</span>
                    <span className="hidden md:inline">{c.warningThresholdPct}%/{c.alertThresholdPct}%</span>
                    <button onClick={() => setEditingId(editingId === c.ID ? null : c.ID)} className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-sap-blue">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(c.ID, c.subaccountName)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {editingId === c.ID && (
                  <MonitoringEditForm config={c} onSave={handleSaveSubaccount} onCancel={() => setEditingId(null)} saving={saving} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Notification Settings ────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700">
        <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send size={18} className="text-sap-blue" />
            <h3 className="text-lg font-semibold text-sap-dark dark:text-gray-100">Notification Settings</h3>
            <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-600 dark:text-gray-400">Shared</span>
          </div>
        </div>

        {/* Transport tabs */}
        <div className="px-6 pt-4 flex gap-1 border-b dark:border-gray-700">
          {[
            { id: 'smtp', icon: Mail, label: 'SMTP Email' },
            { id: 'api', icon: Zap, label: 'API Transport' },
            { id: 'ans', icon: Globe, label: 'SAP ANS' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setNotifTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors ${
                notifTab === tab.id
                  ? 'border-sap-blue text-sap-blue'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {!notifConfig && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
              No notification config found. Save to create one.
            </div>
          )}

          {/* SMTP tab */}
          {notifTab === 'smtp' && (
            <div className="space-y-4">
              <Toggle checked={nc.enableSmtp || false} onChange={() => setNC({ enableSmtp: !nc.enableSmtp })} label="Enable SMTP Email Notifications" />
              {nc.enableSmtp && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pl-4 border-l-2 border-blue-200 dark:border-blue-700">
                  <FormField label="SMTP Host"><input type="text" className={IC} value={nc.smtpHost || ''} onChange={e => setNC({ smtpHost: e.target.value })} /></FormField>
                  <FormField label="SMTP Port"><input type="number" className={IC} value={nc.smtpPort || 587} onChange={e => setNC({ smtpPort: parseInt(e.target.value) })} /></FormField>
                  <FormField label="SMTP User"><input type="text" className={IC} value={nc.smtpUser || ''} onChange={e => setNC({ smtpUser: e.target.value })} /></FormField>
                  <FormField label="SMTP Password"><PasswordInput value={nc.smtpPassword || ''} onChange={e => setNC({ smtpPassword: e.target.value })} /></FormField>
                  <FormField label="From Address"><input type="email" className={IC} value={nc.smtpFrom || ''} onChange={e => setNC({ smtpFrom: e.target.value })} /></FormField>
                  <FormField label="Sender Display Name"><input type="text" className={IC} value={nc.senderName || ''} onChange={e => setNC({ senderName: e.target.value })} /></FormField>
                  <div className="md:col-span-2">
                    <FormField label="Recipients (comma-separated)"><input type="text" className={IC} value={nc.notificationEmails || ''} onChange={e => setNC({ notificationEmails: e.target.value })} /></FormField>
                  </div>
                  <Toggle checked={nc.smtpUseTls || false} onChange={() => setNC({ smtpUseTls: !nc.smtpUseTls })} label="Use TLS" />
                </div>
              )}
            </div>
          )}

          {/* API transport tab */}
          {notifTab === 'api' && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-300 px-4 py-3 rounded-lg text-sm">
                Use any REST-based email service (SendGrid, Mailgun, custom). Set Transport Type to <strong>API</strong> in the main toggle below.
              </div>
              <div className="space-y-4">
                <FormField label="Transport Type" hint="Set to 'API' to use this transport instead of SMTP.">
                  <select className={IC} value={nc.transportType || 'SMTP'} onChange={e => setNC({ transportType: e.target.value })}>
                    <option value="SMTP">SMTP</option>
                    <option value="API">API</option>
                  </select>
                </FormField>
                <FormField label="API Endpoint URL" hint="e.g. https://api.sendgrid.com/v3/mail/send">
                  <input type="url" className={IC} value={nc.apiEndpoint || ''} onChange={e => setNC({ apiEndpoint: e.target.value })} placeholder="https://..." />
                </FormField>
                <FormField label="Auth Type">
                  <select className={IC} value={nc.apiAuthType || 'Bearer'} onChange={e => setNC({ apiAuthType: e.target.value })}>
                    <option value="Bearer">Bearer Token</option>
                    <option value="Basic">Basic Auth</option>
                    <option value="Custom">Custom Header</option>
                  </select>
                </FormField>
                {nc.apiAuthType === 'Custom' && (
                  <FormField label="Custom Auth Header Name" hint="e.g. X-API-Key">
                    <input type="text" className={IC} value={nc.apiCustomHeader || ''} onChange={e => setNC({ apiCustomHeader: e.target.value })} />
                  </FormField>
                )}
                <FormField label="API Key / Token">
                  <PasswordInput value={nc.apiKey || ''} onChange={e => setNC({ apiKey: e.target.value })} placeholder="Enter API key or token" />
                </FormField>
              </div>
            </div>
          )}

          {/* ANS tab */}
          {notifTab === 'ans' && (
            <div className="space-y-4">
              <Toggle checked={nc.enableAns || false} onChange={() => setNC({ enableAns: !nc.enableAns })} label="Enable SAP Alert Notification Service" />
              {nc.enableAns && (
                <div className="space-y-4 pl-4 border-l-2 border-blue-200 dark:border-blue-700">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-300 px-4 py-3 rounded-lg text-sm">
                    <strong>Service Binding:</strong> ANS credentials come from the CF <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">alert-notification</code> service binding — no secrets stored in the database.
                    Uncomment the <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">ai-core-finops-ans</code> resource in your MTA descriptor.
                  </div>
                  <FormField label="ANS Service Binding Name">
                    <input type="text" className={IC} value={nc.ansServiceName || 'ai-core-finops-ans'} onChange={e => setNC({ ansServiceName: e.target.value })} />
                  </FormField>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Test + save row */}
        <div className="px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <input
              type="email" placeholder="test@example.com"
              className={IC + ' w-60'}
              value={testEmail} onChange={e => setTestEmail(e.target.value)}
            />
            <button onClick={handleSendTestEmail} disabled={sendingTestEmail} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-white disabled:opacity-50">
              {sendingTestEmail ? <RefreshCw size={14} className="animate-spin" /> : <Mail size={14} />} Send test
            </button>
            <button onClick={handleTest} disabled={testing} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-white disabled:opacity-50">
              <Send size={14} /> Test alert
            </button>
          </div>
          <button onClick={handleSaveNotification} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-sap-blue text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            <Save size={14} /> Save Notification Config
          </button>
        </div>
      </div>
    </div>
  )
}
