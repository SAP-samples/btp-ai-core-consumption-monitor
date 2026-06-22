import { useState, useEffect } from 'react'
import { fetchMonitoringConfigs, createMonitoringConfig, updateMonitoringConfig, deleteMonitoringConfig, fetchNotificationConfig, updateNotificationConfig, testNotification } from '../services/api'
import { Save, Send, Plus, Trash2, Edit2, X, Building2, ToggleLeft, ToggleRight, Eye, EyeOff } from 'lucide-react'

function FormField({ label, children }) {
  return (<div className="space-y-1"><label className="text-sm font-medium text-gray-700">{label}</label>{children}</div>)
}

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" onClick={onChange} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${checked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {checked ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
      {label}
    </button>
  )
}

function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sap-blue focus:border-sap-blue" value={value} onChange={onChange} placeholder={placeholder || 'Enter password'} />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

const IC = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sap-blue focus:border-sap-blue"

function SubaccountForm({ config, onSave, onCancel, saving }) {
  const [form, setForm] = useState(config || { subaccountId: '', subaccountName: '', spendingLimit: 100, warningThresholdPct: 60, alertThresholdPct: 80, checkTimeUtc: '07:00', receiveDailyEmails: false, isActive: true, displayOrder: 0, tags: '' })
  const handleSubmit = (e) => { e.preventDefault(); const { ID, createdAt, createdBy, modifiedAt, modifiedBy, ...payload } = form; onSave(ID, payload) }
  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4 border-t bg-blue-50/30">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Subaccount ID *"><input type="text" required className={IC} value={form.subaccountId || ''} onChange={e => setForm({...form, subaccountId: e.target.value})} placeholder="UUID" /></FormField>
        <FormField label="Display Name *"><input type="text" required className={IC} value={form.subaccountName || ''} onChange={e => setForm({...form, subaccountName: e.target.value})} /></FormField>
        <FormField label="Monthly Entitlement (CU)"><input type="number" step="0.01" className={IC} value={form.spendingLimit || ''} onChange={e => setForm({...form, spendingLimit: parseFloat(e.target.value)})} /></FormField>
        <FormField label="Tags (comma-sep)"><input type="text" className={IC} value={form.tags || ''} onChange={e => setForm({...form, tags: e.target.value})} /></FormField>
        <FormField label="Warning (%)"><input type="number" step="1" min="0" max="100" className={IC} value={form.warningThresholdPct || ''} onChange={e => setForm({...form, warningThresholdPct: parseFloat(e.target.value)})} /></FormField>
        <FormField label="Alert (%)"><input type="number" step="1" min="0" max="100" className={IC} value={form.alertThresholdPct || ''} onChange={e => setForm({...form, alertThresholdPct: parseFloat(e.target.value)})} /></FormField>
        <FormField label="Check Time (UTC)"><input type="text" className={IC} value={form.checkTimeUtc || ''} onChange={e => setForm({...form, checkTimeUtc: e.target.value})} /></FormField>
        <FormField label="Display Order"><input type="number" className={IC} value={form.displayOrder || 0} onChange={e => setForm({...form, displayOrder: parseInt(e.target.value) || 0})} /></FormField>
      </div>
      <div className="flex items-center gap-6">
        <Toggle checked={form.isActive || false} onChange={() => setForm({...form, isActive: !form.isActive})} label="Active" />
        <Toggle checked={form.receiveDailyEmails || false} onChange={() => setForm({...form, receiveDailyEmails: !form.receiveDailyEmails})} label="Daily emails" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-sap-blue text-white rounded-lg text-sm disabled:opacity-50"><Save size={14} /> {config?.ID ? 'Update' : 'Add'}</button>
        <button type="button" onClick={onCancel} className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-sm"><X size={14} /> Cancel</button>
      </div>
    </form>
  )
}

export default function ConfigPage() {
  const [monConfigs, setMonConfigs] = useState([])
  const [notifConfig, setNotifConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [editingId, setEditingId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const loadData = async () => {
    try {
      const [configs, notif] = await Promise.all([fetchMonitoringConfigs(), fetchNotificationConfig()])
      setMonConfigs(configs); setNotifConfig(notif)
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadData() }, [])

  const handleSaveSubaccount = async (id, payload) => {
    setSaving(true)
    try {
      if (id) { await updateMonitoringConfig(id, payload); setMsg({ type: 'success', text: 'Updated!' }) }
      else { await createMonitoringConfig(payload); setMsg({ type: 'success', text: 'Added!' }) }
      setEditingId(null); setShowAddForm(false); await loadData()
      setTimeout(() => setMsg({ type: '', text: '' }), 3000)
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"?`)) return
    setSaving(true)
    try { await deleteMonitoringConfig(id); setMsg({ type: 'success', text: 'Deleted.' }); await loadData(); setTimeout(() => setMsg({ type: '', text: '' }), 3000) }
    catch (err) { setMsg({ type: 'error', text: err.message }) }
    finally { setSaving(false) }
  }

  const handleSaveNotification = async () => {
    if (!notifConfig) return; setSaving(true)
    try { const { ID, createdAt, createdBy, modifiedAt, modifiedBy, ...p } = notifConfig; await updateNotificationConfig(ID, p); setMsg({ type: 'success', text: 'Saved!' }); setTimeout(() => setMsg({ type: '', text: '' }), 3000) }
    catch (err) { setMsg({ type: 'error', text: err.message }) }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true)
    try { const r = await testNotification(); setMsg({ type: 'success', text: r.message || 'Sent!' }); setTimeout(() => setMsg({ type: '', text: '' }), 5000) }
    catch (err) { setMsg({ type: 'error', text: err.message }) }
    finally { setTesting(false) }
  }

  if (loading) return (<div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sap-blue"></div></div>)

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold text-sap-dark">Configuration</h2><p className="text-sm text-gray-500">Manage monitored subaccounts and notification settings</p></div>

      {msg.text && (<div className={`px-4 py-3 rounded-lg text-sm ${msg.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>{msg.text}</div>)}

      {/* Subaccounts */}
      <div className="bg-white rounded-xl border">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2"><Building2 size={18} className="text-sap-blue" /><h3 className="text-lg font-semibold text-sap-dark">Monitored Subaccounts</h3><span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">{monConfigs.length}</span></div>
          <button onClick={() => { setShowAddForm(true); setEditingId(null) }} className="flex items-center gap-2 px-3 py-1.5 bg-sap-blue text-white rounded-lg text-sm hover:bg-blue-700"><Plus size={14} /> Add</button>
        </div>
        {showAddForm && <SubaccountForm config={null} onSave={handleSaveSubaccount} onCancel={() => setShowAddForm(false)} saving={saving} />}
        {monConfigs.length === 0 && !showAddForm ? (
          <div className="p-8 text-center text-gray-400"><Building2 size={36} className="mx-auto mb-3 opacity-30" /><p>No subaccounts configured.</p></div>
        ) : (
          <div className="divide-y">
            {monConfigs.map(c => (
              <div key={c.ID}>
                <div className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`w-3 h-3 rounded-full ${c.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><span className="font-semibold text-sap-dark text-sm truncate">{c.subaccountName}</span>{c.tags && c.tags.split(',').slice(0,2).map((t,i) => <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">{t.trim()}</span>)}</div>
                      <div className="text-xs text-gray-400 truncate">{c.subaccountId}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="hidden md:inline">{c.spendingLimit} CU</span>
                    <button onClick={() => setEditingId(editingId === c.ID ? null : c.ID)} className="p-1.5 hover:bg-blue-50 rounded text-sap-blue"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(c.ID, c.subaccountName)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
                {editingId === c.ID && <SubaccountForm config={c} onSave={handleSaveSubaccount} onCancel={() => setEditingId(null)} saving={saving} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-xl border">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2"><Send size={18} className="text-sap-blue" /><h3 className="text-lg font-semibold text-sap-dark">Notification Settings</h3><span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">Shared</span></div>
          <button onClick={handleTest} disabled={testing} className="flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"><Send size={14} /> Test</button>
        </div>
        <div className="p-6 space-y-6">
          {!notifConfig && <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">No notification config found. Save to create one.</div>}
          <div>
            <Toggle checked={notifConfig?.enableSmtp || false} onChange={() => setNotifConfig({...(notifConfig || {}), enableSmtp: !(notifConfig?.enableSmtp)})} label="Enable SMTP Email Notifications" />
            {notifConfig?.enableSmtp && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pl-4 border-l-2 border-blue-200">
                <FormField label="SMTP Host"><input type="text" className={IC} value={notifConfig?.smtpHost || ''} onChange={e => setNotifConfig({...notifConfig, smtpHost: e.target.value})} /></FormField>
                <FormField label="SMTP Port"><input type="number" className={IC} value={notifConfig?.smtpPort || 587} onChange={e => setNotifConfig({...notifConfig, smtpPort: parseInt(e.target.value)})} /></FormField>
                <FormField label="SMTP User"><input type="text" className={IC} value={notifConfig?.smtpUser || ''} onChange={e => setNotifConfig({...notifConfig, smtpUser: e.target.value})} /></FormField>
                <FormField label="SMTP Password"><PasswordInput value={notifConfig?.smtpPassword || ''} onChange={e => setNotifConfig({...notifConfig, smtpPassword: e.target.value})} placeholder="Enter SMTP password" /></FormField>
                <FormField label="From Address"><input type="email" className={IC} value={notifConfig?.smtpFrom || ''} onChange={e => setNotifConfig({...notifConfig, smtpFrom: e.target.value})} /></FormField>
                <FormField label="Sender Name"><input type="text" className={IC} value={notifConfig?.senderName || ''} onChange={e => setNotifConfig({...notifConfig, senderName: e.target.value})} /></FormField>
                <div className="md:col-span-2"><FormField label="Recipients (comma-sep)"><input type="text" className={IC} value={notifConfig?.notificationEmails || ''} onChange={e => setNotifConfig({...notifConfig, notificationEmails: e.target.value})} /></FormField></div>
                <Toggle checked={notifConfig?.smtpUseTls || false} onChange={() => setNotifConfig({...notifConfig, smtpUseTls: !notifConfig.smtpUseTls})} label="Use TLS" />
              </div>
            )}
          </div>
          <div className="pt-4 border-t">
            <Toggle checked={notifConfig?.enableAns || false} onChange={() => setNotifConfig({...(notifConfig || {}), enableAns: !(notifConfig?.enableAns)})} label="Enable SAP Alert Notification Service" />
            {notifConfig?.enableAns && (
              <div className="mt-4 pl-4 border-l-2 border-blue-200 space-y-4">
                <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm">
                  <strong>Service Binding:</strong> ANS credentials are provided automatically via the CF service binding in <code className="bg-blue-100 px-1 rounded">mta.yaml</code>. No secrets are stored in the database. Ensure the <code className="bg-blue-100 px-1 rounded">ai-core-finops-ans</code> resource is uncommented in your MTA descriptor.
                </div>
                <FormField label="ANS Service Binding Name"><input type="text" className={IC} value={notifConfig?.ansServiceName || 'ai-core-finops-ans'} onChange={e => setNotifConfig({...(notifConfig || {}), ansServiceName: e.target.value})} placeholder="ai-core-finops-ans" /></FormField>
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
          <button onClick={handleSaveNotification} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-sap-blue text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"><Save size={14} /> Save Notification Config</button>
        </div>
      </div>
    </div>
  )
}
