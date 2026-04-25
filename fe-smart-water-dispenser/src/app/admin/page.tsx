'use client'

import { useState } from 'react'
import './admin.css' // Import isolated admin styles

const transactions = [
  { id: '#TRX-001245', waktu: 'Hari ini, 10:45 WIB', volume: '1000 ml', total: 'Rp 4.000', status: 'Sukses' },
  { id: '#TRX-001244', waktu: 'Hari ini, 10:30 WIB', volume: '500 ml',  total: 'Rp 2.000', status: 'Sukses' },
  { id: '#TRX-001243', waktu: 'Hari ini, 09:55 WIB', volume: '1500 ml', total: 'Rp 6.000', status: 'Sukses' },
  { id: '#TRX-001242', waktu: 'Hari ini, 09:20 WIB', volume: '500 ml',  total: 'Rp 2.000', status: 'Pending' },
  { id: '#TRX-001241', waktu: 'Hari ini, 08:47 WIB', volume: '1000 ml', total: 'Rp 4.000', status: 'Batal' },
]

const iotLogs = [
  { timestamp: '10:45:02', sensor: 'Flow Meter',   nilai: '1000 ml',    status: 'Normal' },
  { timestamp: '10:44:58', sensor: 'Suhu Air',     nilai: '28°C',       status: 'Normal' },
  { timestamp: '10:44:55', sensor: 'Tekanan',      nilai: '2.1 bar',    status: 'Normal' },
  { timestamp: '10:30:12', sensor: 'Flow Meter',   nilai: '500 ml',     status: 'Normal' },
  { timestamp: '10:29:47', sensor: 'QRIS Scanner', nilai: 'Terdeteksi', status: 'Normal' },
  { timestamp: '09:55:33', sensor: 'Flow Meter',   nilai: '1500 ml',    status: 'Normal' },
  { timestamp: '09:20:01', sensor: 'QRIS Scanner', nilai: 'Timeout',    status: 'Warning' },
]

type TabId = 'dashboard' | 'riwayat' | 'kontrol' | 'lingkungan'

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [dispenserOn, setDispenserOn] = useState(true)
  const [qrisOn, setQrisOn]           = useState(true)
  const [filterOn, setFilterOn]       = useState(true)
  const [ledOn, setLedOn]             = useState(false)

  const tabs: { id: TabId; label: string }[] = [
    { id: 'dashboard',  label: 'Dashboard Utama' },
    { id: 'riwayat',    label: 'Riwayat & Log IoT' },
    { id: 'kontrol',    label: 'Kontrol Dispenser' },
    { id: 'lingkungan', label: 'Laporan Dampak Lingkungan' },
  ]

  const badgeClass = (status: string) => {
    if (status === 'Sukses' || status === 'Normal') return 'badge badge-success'
    if (status === 'Pending' || status === 'Warning') return 'badge badge-pending'
    return 'badge badge-cancel'
  }

  return (
    <div className="admin-body">
      <div className="wave-bg">
        <div className="wave-layer wave-layer-1" />
        <div className="wave-layer wave-layer-2" />
        <div className="wave-layer wave-layer-3" />
      </div>

      <div className="dashboard-container">
        {/* Header */}
        <div className="header">
          <div className="header-subtitle">Smart Hydration – Sustainable Future</div>
          <h1 className="header-title">Eco-Flow Smart Dispenser</h1>
        </div>

        {/* Tabs */}
        <div className="nav-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? 'active' : 'inactive'}`}
              onClick={() => setActiveTab(tab.id)}
            >
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
                <div className="stat-value blue">1,245</div>
              </div>
              <div className="stat-card stat-card-border-green">
                <div className="stat-label">Transaksi Sukses</div>
                <div className="stat-value green">1,230</div>
              </div>
              <div className="stat-card stat-card-border-orange">
                <div className="stat-label">Menunggu (Pending)</div>
                <div className="stat-value orange">10</div>
              </div>
              <div className="stat-card stat-card-border-red">
                <div className="stat-label">Transaksi Batal</div>
                <div className="stat-value red">5</div>
              </div>
              <div className="stat-card stat-card-border-orange">
                <div className="stat-label">Total Pendapatan</div>
                <div className="stat-value orange" style={{ fontSize: '30px' }}>Rp 3.450.000</div>
              </div>
              <div className="stat-card stat-card-border-green">
                <div className="stat-label">Botol Plastik Dihemat 🌿</div>
                <div className="stat-value-row">
                  <div className="stat-value green">2,100</div>
                  <div className="stat-unit">Botol</div>
                </div>
              </div>
            </div>

            <div className="table-card">
              <div className="table-title">5 Transaksi Terakhir</div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>ID Transaksi</th>
                      <th>Waktu</th>
                      <th>Volume Air</th>
                      <th>Total Bayar</th>
                      <th>Status QRIS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 600, color: '#2563EB' }}>{t.id}</td>
                        <td>{t.waktu}</td>
                        <td>{t.volume}</td>
                        <td style={{ fontWeight: 600 }}>{t.total}</td>
                        <td><span className={badgeClass(t.status)}>{t.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Riwayat & Log IoT ── */}
        {activeTab === 'riwayat' && (
          <>
            <div className="iot-grid">
              <div className="iot-card">
                <div className="iot-card-title">Total Volume Terdistribusi</div>
                <div className="iot-card-value green">6.250 L</div>
              </div>
              <div className="iot-card">
                <div className="iot-card-title">Rata-rata Volume/Transaksi</div>
                <div className="iot-card-value">502 ml</div>
              </div>
              <div className="iot-card">
                <div className="iot-card-title">Sensor Aktif</div>
                <div className="iot-card-value green">4 / 4</div>
              </div>
              <div className="iot-card">
                <div className="iot-card-title">Peringatan Sensor</div>
                <div className="iot-card-value orange">2</div>
              </div>
            </div>

            <div className="table-card">
              <div className="table-title">Log IoT Terkini</div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Sensor</th>
                      <th>Nilai</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iotLogs.map((log, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', color: '#2563EB', fontWeight: 600 }}>{log.timestamp}</td>
                        <td>{log.sensor}</td>
                        <td style={{ fontWeight: 600 }}>{log.nilai}</td>
                        <td><span className={badgeClass(log.status)}>{log.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Kontrol Dispenser ── */}
        {activeTab === 'kontrol' && (
          <>
            <div className="control-grid">
              {[
                { label: 'Dispenser Utama', on: dispenserOn, set: setDispenserOn },
                { label: 'QRIS Payment',    on: qrisOn,      set: setQrisOn },
                { label: 'Filter Air',      on: filterOn,    set: setFilterOn },
                { label: 'LED Indikator',   on: ledOn,       set: setLedOn },
              ].map(({ label, on, set }) => (
                <div className="control-card" key={label}>
                  <div className="control-label">{label}</div>
                  <div className="toggle-row">
                    <div
                      className={`toggle ${on ? '' : 'off'}`}
                      onClick={() => set(!on)}
                      role="switch"
                      aria-checked={on}
                    >
                      <div className="toggle-knob" />
                    </div>
                    <span className={`toggle-status ${on ? 'on' : 'off'}`}>
                      {on ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="table-card">
              <div className="table-title">Status Sensor Real-time</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
                {[
                  { name: 'Suhu Air',    value: '28°C',     color: '#2563EB', pct: null },
                  { name: 'Tekanan Air', value: '2.1 bar',  color: '#16A34A', pct: null },
                  { name: 'Level Tank',  value: '78%',      color: '#F97316', pct: 78 },
                  { name: 'Flow Rate',   value: '125 ml/s', color: '#2563EB', pct: null },
                ].map((s) => (
                  <div key={s.name} style={{ padding: '16px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '13px', color: '#64748b', fontFamily: 'Montserrat', fontWeight: 600, marginBottom: '4px' }}>{s.name}</div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: s.color, fontFamily: 'Montserrat' }}>{s.value}</div>
                    {s.pct && (
                      <div className="progress-bar-wrap" style={{ marginTop: '8px' }}>
                        <div className="progress-bar-fill" style={{ width: `${s.pct}%` }} />
                      </div>
                    )}
                  </div>
                ))}
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
                <div className="stat-value green">2,100</div>
              </div>
              <div className="stat-card stat-card-border-blue">
                <div className="stat-label">CO₂ Dikurangi</div>
                <div className="stat-value blue" style={{ fontSize: '28px' }}>42 kg</div>
              </div>
              <div className="stat-card stat-card-border-orange">
                <div className="stat-label">Air Tersalurkan</div>
                <div className="stat-value orange" style={{ fontSize: '28px' }}>6.250 L</div>
              </div>
            </div>

            <div className="env-card">
              <div className="table-title">Rincian Dampak Lingkungan</div>
              {[
                { label: '🌊 Air Minum Bersih Tersalurkan', value: '6.250 Liter', pct: 80 },
                { label: '♻️ Botol Plastik Tidak Terpakai',  value: '2.100 Botol', pct: 70 },
                { label: '🌿 Pengurangan Emisi CO₂',         value: '42 kg CO₂',   pct: 42 },
                { label: '⚡ Efisiensi Energi',              value: '94%',          pct: 94 },
                { label: '💧 Pemborosan Air Dicegah',        value: '312 Liter',    pct: 30 },
              ].map((item) => (
                <div key={item.label} style={{ paddingBottom: '14px', marginBottom: '14px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontFamily: 'Montserrat', fontSize: '14px', fontWeight: 600, color: '#334155' }}>{item.label}</span>
                    <span style={{ fontFamily: 'Montserrat', fontSize: '16px', fontWeight: 800, color: '#16A34A' }}>{item.value}</span>
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
