'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '@/lib/api'
import './admin.css'

// ── Types ──
interface AdminUser { id: string; email: string; fullName: string }
interface DashboardSummary {
  totalTransactions: number
  successTransactions: number
  pendingTransactions: number
  cancelledTransactions: number
  totalRevenue: number
  bottlesSaved: number
}
interface Transaction {
  transaction: { id: string; createdAt: string; volumeMl: number; grossAmount: number; paymentStatus: string; dispenseStatus: string }
  machineName: string
  machineCode: string
}
interface MachineEvent {
  id: string; occurredAt: string; eventType: string; payload: unknown; machineId: string
}
interface Machine {
  id: string; machineCode: string; displayName: string; operationStatus: string
  latestStatus?: { tankLevelPct: number; waterTempC: number; flowRateMlS: number; pressureBar: number; reportedAt: string } | null
  activeTransaction?: unknown
}
interface EnvReport {
  waterDistributedLiters: number
  plasticBottlesSaved: number
  co2ReducedKg: number
  wastePreventedLiters: number
  energyEfficiencyPct: number
}

type TabId = 'dashboard' | 'riwayat' | 'kontrol' | 'lingkungan'

// ── Login Form ──
function LoginForm({ onLogin }: { onLogin: (admin: AdminUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post<{ admin: AdminUser }>('/api/admin/auth/login', { email, password })
      onLogin(res.admin)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="wave-bg">
        <div className="wave-layer wave-layer-1" /><div className="wave-layer wave-layer-2" /><div className="wave-layer wave-layer-3" />
      </div>
      <form onSubmit={handleSubmit} style={{ position: 'relative', zIndex: 1, background: 'white', borderRadius: 20, padding: 36, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <h2 style={{ fontFamily: 'Montserrat', fontWeight: 800, fontSize: 22, color: '#1B3A8A', marginBottom: 4 }}>Admin Login</h2>
        <p style={{ fontFamily: 'Montserrat', fontSize: 13, color: '#64748b', marginBottom: 24 }}>Eco-Flow Smart Dispenser</p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" required
            style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontFamily: 'Montserrat', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" required
            style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontFamily: 'Montserrat', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ width: '100%', background: '#1B3A8A', color: 'white', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 15, fontWeight: 700, fontFamily: 'Montserrat', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  )
}

// ── Main Dashboard ──
export default function AdminDashboard() {
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')

  // Data states
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [selectedMachineId, setSelectedMachineId] = useState<string>('')
  const [machineLogs, setMachineLogs] = useState<MachineEvent[]>([])
  const [envReport, setEnvReport] = useState<EnvReport | null>(null)
  const [actionLoading, setActionLoading] = useState('')
  const [actionMsg, setActionMsg] = useState('')

  // Check existing admin session
  useEffect(() => {
    api.get<{ admin: AdminUser }>('/api/admin/auth/me')
      .then(res => { setAdmin(res.admin); setAuthChecked(true) })
      .catch(() => setAuthChecked(true))
  }, [])

  const loadDashboard = useCallback(async () => {
    const [sumRes, txRes] = await Promise.allSettled([
      api.get<DashboardSummary>('/api/admin/dashboard/summary'),
      api.get<Transaction[]>('/api/admin/transactions'),
    ])
    if (sumRes.status === 'fulfilled') setSummary(sumRes.value)
    if (txRes.status === 'fulfilled') setTransactions(Array.isArray(txRes.value) ? txRes.value : [])
  }, [])

  const loadMachines = useCallback(async () => {
    const res = await api.get<Machine[]>('/api/admin/machines').catch(() => [])
    const list = Array.isArray(res) ? res : []
    setMachines(list)
    if (list.length > 0 && !selectedMachineId) setSelectedMachineId(list[0].id)
  }, [selectedMachineId])

  const loadEnvReport = useCallback(async () => {
    const res = await api.get<EnvReport>('/api/admin/reports/environmental-impact').catch(() => null)
    if (res) setEnvReport(res)
  }, [])

  // Load data on tab switch
  useEffect(() => {
    if (!admin) return
    if (activeTab === 'dashboard') loadDashboard()
    if (activeTab === 'kontrol' || activeTab === 'riwayat') loadMachines()
    if (activeTab === 'lingkungan') loadEnvReport()
  }, [admin, activeTab, loadDashboard, loadMachines, loadEnvReport])

  // Load logs when machine selected
  useEffect(() => {
    if (!selectedMachineId) return
    api.get<MachineEvent[]>(`/api/admin/machines/${selectedMachineId}/logs`)
      .then(res => setMachineLogs(Array.isArray(res) ? res : []))
      .catch(() => setMachineLogs([]))
  }, [selectedMachineId])

  const handleAction = async (machineId: string, action: string) => {
    setActionLoading(action)
    setActionMsg('')
    try {
      await api.post(`/api/admin/machines/${machineId}/actions`, { action })
      setActionMsg(`✓ ${action.replace(/_/g, ' ')} executed`)
      await loadMachines()
    } catch (err) {
      setActionMsg(`✗ ${err instanceof ApiError ? err.message : 'Action failed'}`)
    } finally {
      setActionLoading('')
      setTimeout(() => setActionMsg(''), 3000)
    }
  }

  const handleLogout = async () => {
    await api.post('/api/admin/auth/logout')
    setAdmin(null)
  }

  const badgeClass = (status: string) => {
    const s = status?.toLowerCase()
    if (s === 'sukses' || s === 'normal' || s === 'paid' || s === 'completed' || s === 'settlement') return 'badge badge-success'
    if (s === 'pending' || s === 'warning' || s === 'pending_payment' || s === 'payment_pending') return 'badge badge-pending'
    return 'badge badge-cancel'
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard Utama' },
    { id: 'riwayat', label: 'Riwayat & Log IoT' },
    { id: 'kontrol', label: 'Kontrol Dispenser' },
    { id: 'lingkungan', label: 'Laporan Dampak Lingkungan' },
  ]

  if (!authChecked) return <div className="admin-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: 'white', fontFamily: 'Montserrat' }}>Loading...</div></div>
  if (!admin) return <LoginForm onLogin={setAdmin} />

  const selectedMachine = machines.find(m => m.id === selectedMachineId)

  return (
    <div className="admin-body">
      <div className="wave-bg">
        <div className="wave-layer wave-layer-1" /><div className="wave-layer wave-layer-2" /><div className="wave-layer wave-layer-3" />
      </div>

      <div className="dashboard-container">
        {/* Header */}
        <div className="header">
          <div className="header-subtitle">Smart Hydration – Sustainable Future</div>
          <h1 className="header-title">Eco-Flow Smart Dispenser</h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontFamily: 'Montserrat', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
              Logged in as <strong>{admin.email}</strong>
            </span>
            <button onClick={handleLogout}
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: 8, padding: '4px 14px', fontSize: 12, fontFamily: 'Montserrat', cursor: 'pointer' }}>
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="nav-tabs">
          {tabs.map(tab => (
            <button key={tab.id} className={`nav-tab ${activeTab === tab.id ? 'active' : 'inactive'}`} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Dashboard Utama ── */}
        {activeTab === 'dashboard' && (
          <>
            <div className="stats-grid">
              <div className="stat-card stat-card-border-blue">
                <div className="stat-label">Total Transaksi</div>
                <div className="stat-value blue">{summary?.totalTransactions?.toLocaleString() ?? '—'}</div>
              </div>
              <div className="stat-card stat-card-border-green">
                <div className="stat-label">Transaksi Sukses</div>
                <div className="stat-value green">{summary?.successTransactions?.toLocaleString() ?? '—'}</div>
              </div>
              <div className="stat-card stat-card-border-orange">
                <div className="stat-label">Menunggu (Pending)</div>
                <div className="stat-value orange">{summary?.pendingTransactions ?? '—'}</div>
              </div>
              <div className="stat-card stat-card-border-red">
                <div className="stat-label">Transaksi Batal</div>
                <div className="stat-value red">{summary?.cancelledTransactions ?? '—'}</div>
              </div>
              <div className="stat-card stat-card-border-orange">
                <div className="stat-label">Total Pendapatan</div>
                <div className="stat-value orange" style={{ fontSize: 26 }}>
                  Rp {summary?.totalRevenue?.toLocaleString('id-ID') ?? '—'}
                </div>
              </div>
              <div className="stat-card stat-card-border-green">
                <div className="stat-label">Botol Plastik Dihemat 🌿</div>
                <div className="stat-value-row">
                  <div className="stat-value green">{summary?.bottlesSaved?.toLocaleString() ?? '—'}</div>
                  <div className="stat-unit">Botol</div>
                </div>
              </div>
            </div>

            <div className="table-card">
              <div className="table-title">5 Transaksi Terakhir</div>
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>ID Transaksi</th><th>Waktu</th><th>Volume Air</th><th>Total Bayar</th><th>Status</th></tr></thead>
                  <tbody>
                    {transactions.slice(0, 5).map((t) => (
                      <tr key={t.transaction.id}>
                        <td style={{ fontWeight: 600, color: '#2563EB', fontSize: 12 }}>{t.transaction.id.slice(0, 12)}…</td>
                        <td>{new Date(t.transaction.createdAt).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</td>
                        <td>{t.transaction.volumeMl} ml</td>
                        <td style={{ fontWeight: 600 }}>Rp {t.transaction.grossAmount?.toLocaleString('id-ID')}</td>
                        <td><span className={badgeClass(t.transaction.paymentStatus)}>{t.transaction.paymentStatus}</span></td>
                      </tr>
                    ))}
                    {transactions.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>Belum ada transaksi</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Riwayat & Log IoT ── */}
        {activeTab === 'riwayat' && (
          <>
            {machines.length > 1 && (
              <div style={{ marginBottom: 16 }}>
                <select value={selectedMachineId} onChange={e => setSelectedMachineId(e.target.value)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: 'Montserrat', fontSize: 13 }}>
                  {machines.map(m => <option key={m.id} value={m.id}>{m.displayName} ({m.machineCode})</option>)}
                </select>
              </div>
            )}
            <div className="iot-grid">
              <div className="iot-card"><div className="iot-card-title">Machine</div><div className="iot-card-value">{selectedMachine?.displayName ?? '—'}</div></div>
              <div className="iot-card"><div className="iot-card-title">Status</div><div className="iot-card-value green">{selectedMachine?.operationStatus ?? '—'}</div></div>
              <div className="iot-card"><div className="iot-card-title">Log Entries</div><div className="iot-card-value">{machineLogs.length}</div></div>
              <div className="iot-card"><div className="iot-card-title">Transaksi Aktif</div><div className="iot-card-value orange">{selectedMachine?.activeTransaction ? 'Ada' : 'Tidak Ada'}</div></div>
            </div>
            <div className="table-card">
              <div className="table-title">Log IoT Terkini</div>
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Timestamp</th><th>Event</th><th>Machine</th><th>Status</th></tr></thead>
                  <tbody>
                    {machineLogs.slice(0, 20).map((log, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', color: '#2563EB', fontWeight: 600 }}>{new Date(log.occurredAt).toLocaleTimeString('id-ID')}</td>
                        <td>{log.eventType}</td>
                        <td>{log.machineId?.slice(0, 8)}…</td>
                        <td><span className="badge badge-success">OK</span></td>
                      </tr>
                    ))}
                    {machineLogs.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>Belum ada log</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Kontrol Dispenser ── */}
        {activeTab === 'kontrol' && (
          <>
            {actionMsg && (
              <div style={{ background: actionMsg.startsWith('✓') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${actionMsg.startsWith('✓') ? '#86efac' : '#fca5a5'}`, borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontFamily: 'Montserrat', fontSize: 13, color: actionMsg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>
                {actionMsg}
              </div>
            )}
            {machines.length > 1 && (
              <div style={{ marginBottom: 16 }}>
                <select value={selectedMachineId} onChange={e => setSelectedMachineId(e.target.value)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: 'Montserrat', fontSize: 13 }}>
                  {machines.map(m => <option key={m.id} value={m.id}>{m.displayName} ({m.machineCode})</option>)}
                </select>
              </div>
            )}
            <div className="control-grid">
              {[
                { label: 'Set Maintenance', action: 'SET_MAINTENANCE', color: '#F97316' },
                { label: 'Resume Operasi', action: 'RESUME_OPERATION', color: '#16A34A' },
                { label: 'Cancel Transaksi Aktif', action: 'CANCEL_ACTIVE_TRANSACTION', color: '#DC2626' },
                { label: 'Sync Status', action: 'SYNC_STATUS', color: '#2563EB' },
              ].map(({ label, action, color }) => (
                <div className="control-card" key={action}>
                  <div className="control-label">{label}</div>
                  <button
                    onClick={() => selectedMachineId && handleAction(selectedMachineId, action)}
                    disabled={actionLoading === action || !selectedMachineId}
                    style={{ marginTop: 12, background: color, color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontFamily: 'Montserrat', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: (actionLoading === action || !selectedMachineId) ? 0.6 : 1 }}>
                    {actionLoading === action ? 'Executing...' : 'Execute'}
                  </button>
                </div>
              ))}
            </div>

            <div className="table-card">
              <div className="table-title">Status Sensor Real-time</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
                {selectedMachine?.latestStatus ? [
                  { name: 'Suhu Air', value: `${selectedMachine.latestStatus.waterTempC ?? '—'}°C`, color: '#2563EB', pct: null },
                  { name: 'Tekanan Air', value: `${selectedMachine.latestStatus.pressureBar ?? '—'} bar`, color: '#16A34A', pct: null },
                  { name: 'Level Tank', value: `${selectedMachine.latestStatus.tankLevelPct ?? '—'}%`, color: '#F97316', pct: selectedMachine.latestStatus.tankLevelPct },
                  { name: 'Flow Rate', value: `${selectedMachine.latestStatus.flowRateMlS ?? '—'} ml/s`, color: '#2563EB', pct: null },
                ].map(s => (
                  <div key={s.name} style={{ padding: '16px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'Montserrat', fontWeight: 600, marginBottom: 4 }}>{s.name}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: 'Montserrat' }}>{s.value}</div>
                    {s.pct !== null && s.pct !== undefined && (
                      <div className="progress-bar-wrap" style={{ marginTop: 8 }}>
                        <div className="progress-bar-fill" style={{ width: `${s.pct}%` }} />
                      </div>
                    )}
                  </div>
                )) : (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#94a3b8', padding: 20, fontFamily: 'Montserrat', fontSize: 13 }}>
                    Belum ada data sensor — kirim SYNC_STATUS untuk memperbarui
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Laporan Dampak Lingkungan ── */}
        {activeTab === 'lingkungan' && (
          <>
            <div className="stats-grid">
              <div className="stat-card stat-card-border-green">
                <div className="stat-label">Botol Plastik Dihemat 🌿</div>
                <div className="stat-value green">{envReport?.plasticBottlesSaved?.toLocaleString() ?? '—'}</div>
              </div>
              <div className="stat-card stat-card-border-blue">
                <div className="stat-label">CO₂ Dikurangi</div>
                <div className="stat-value blue" style={{ fontSize: 28 }}>{envReport?.co2ReducedKg?.toFixed(1) ?? '—'} kg</div>
              </div>
              <div className="stat-card stat-card-border-orange">
                <div className="stat-label">Air Tersalurkan</div>
                <div className="stat-value orange" style={{ fontSize: 28 }}>{envReport?.waterDistributedLiters?.toFixed(1) ?? '—'} L</div>
              </div>
            </div>
            <div className="env-card">
              <div className="table-title">Rincian Dampak Lingkungan</div>
              {[
                { label: '🌊 Air Minum Bersih Tersalurkan', value: `${envReport?.waterDistributedLiters?.toFixed(1) ?? '—'} Liter`, pct: Math.min(100, (envReport?.waterDistributedLiters ?? 0) / 100) },
                { label: '♻️ Botol Plastik Tidak Terpakai', value: `${envReport?.plasticBottlesSaved?.toLocaleString() ?? '—'} Botol`, pct: Math.min(100, (envReport?.plasticBottlesSaved ?? 0) / 30) },
                { label: '🌿 Pengurangan Emisi CO₂', value: `${envReport?.co2ReducedKg?.toFixed(1) ?? '—'} kg CO₂`, pct: Math.min(100, (envReport?.co2ReducedKg ?? 0) * 2) },
                { label: '⚡ Efisiensi Energi', value: `${envReport?.energyEfficiencyPct ?? '—'}%`, pct: envReport?.energyEfficiencyPct ?? 0 },
                { label: '💧 Pemborosan Air Dicegah', value: `${envReport?.wastePreventedLiters?.toFixed(0) ?? '—'} Liter`, pct: Math.min(100, (envReport?.wastePreventedLiters ?? 0) / 5) },
              ].map(item => (
                <div key={item.label} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'Montserrat', fontSize: 14, fontWeight: 600, color: '#334155' }}>{item.label}</span>
                    <span style={{ fontFamily: 'Montserrat', fontSize: 16, fontWeight: 800, color: '#16A34A' }}>{item.value}</span>
                  </div>
                  <div className="progress-bar-wrap">
                    <div className="progress-bar-fill" style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
