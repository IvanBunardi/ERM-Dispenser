# Breakdown Task Implementation - Smart Water Dispenser

## Tujuan

Breakdown ini memecah implementasi agar sinkron dengan:

- backend target yang sudah didefinisikan
- frontend customer existing yang sudah ada di repo
- frontend admin existing yang sudah ada di repo
- target migrasi ke customer kiosk/tablet

## Prinsip Eksekusi

- backend dibangun dulu sebagai source of truth
- frontend existing dipindahkan dari mock store ke API bertahap
- admin tidak boleh menunggu semua customer migration selesai
- flow vending machine harus diuji end-to-end dengan Midtrans sandbox + MQTT simulator

## Phase 0 - Foundation

### Backend

- setup project backend TypeScript
- setup PostgreSQL
- setup Drizzle ORM + migrations
- setup env management untuk DB, Midtrans, MQTT, auth
- setup logger, error middleware, validation layer
- setup background worker dan scheduler sederhana

### Deliverable

- koneksi database stabil
- migration pertama berjalan
- struktur folder backend final

## Phase 1 - Data Model & Auth

### Backend

- implement `guest_users`, `guest_sessions`, `guest_preferences`
- implement `sites`, `machines`, `machine_volume_options`
- implement `admin_users`, `admin_roles`, `admin_user_roles`
- seed data mesin sesuai UI customer/admin saat ini
- buat guest auth via cookie
- buat admin auth via login session

### Customer Frontend

- ganti `zustand persist guest mock` dengan call `POST /api/guest/init`
- hydrate profile/settings dari `GET /api/guest/me`
- pertahankan local optimistic UI hanya untuk transitional loading

### Admin Frontend

- tambah login gate sederhana sebelum `/admin`
- ganti data statis dengan fetch summary awal

## Phase 2 - Explore, Scan, dan Machine Discovery

### Backend

- implement `GET /api/stations`
- implement `GET /api/stations/:stationId`
- implement `POST /api/scan/verify`
- hitung field kompatibel dengan UI existing:
  - `distance`
  - `capacity`
  - `status`
  - `isVerified`
  - `imageUrl`

### Customer Frontend

- `/explore` pindah dari `MOCK_STATIONS` ke API
- search dan filter gunakan query params backend
- `/scan` gunakan `POST /api/scan/verify`
- `/scan/result` baca machine real dari hasil verify, bukan hardcoded code

### Acceptance

- halaman explore dan scan jalan penuh tanpa mock data

## Phase 3 - Transaction, Midtrans, dan Dispense Lifecycle

### Backend

- implement `transactions`, `payments`, `payment_notifications`, `transaction_state_logs`, `dispense_sessions`
- implement `POST /api/dispense` untuk flow customer existing
- implement `POST /api/customer/transactions` untuk flow kiosk baru
- integrasi Midtrans QRIS sandbox
- implement webhook Midtrans
- implement status verification ke Midtrans
- implement guard transaksi aktif per mesin

### Customer Frontend Existing

- `/scan/result` ubah CTA `Start Dispensing` menjadi:
  - create transaction
  - tampilkan QRIS jika payment required
  - subscribe ke state transaksi

### Kiosk Customer Frontend

- buat route baru `/vending/[machineId]`
- build state screen:
  - idle
  - waiting payment
  - payment success
  - waiting bottle
  - ready to fill
  - filling
  - complete
  - error

### Acceptance

- transaksi berhasil melewati Midtrans sandbox
- payment update masuk ke backend
- customer UI menerima status terbaru

## Phase 4 - MQTT & Device Orchestration

### Backend

- setup MQTT subscriber/publisher
- map topic:
  - `command`
  - `status`
  - `progress`
  - `event`
  - `availability`
- simpan `machine_events`
- simpan `machine_status_snapshots`
- publish `device_commands`
- update lifecycle transaksi dari event device

### Admin Frontend

- tab `kontrol` menampilkan snapshot sensor real-time
- tab `riwayat` menampilkan event log nyata

### Customer Frontend / Kiosk

- status filling dan bottle detection berasal dari event backend, bukan timer lokal

### Acceptance

- Wokwi simulator bisa menggerakkan transaksi dari paid -> wait bottle -> filling -> complete

## Phase 5 - Customer Profile, Stats, History

### Backend

- implement `customer_impact_snapshots` dan `leaderboard_snapshots`
- implement `GET /api/user/stats`
- implement `GET /api/user/history`
- implement `PUT /api/user/profile`
- implement `GET /api/leaderboard`
- implement `GET/PATCH /api/settings/preferences`

### Customer Frontend

- `/stats` pindah dari demo counters ke data backend
- `/profile` dan `/profile/history` pindah ke API history
- `/settings/profile` save ke backend
- `/settings/*` load dan save preferences dari backend

### Acceptance

- seluruh route customer existing tidak lagi bergantung ke `MOCK_HISTORY`, `LEADERBOARD`, atau `DEMO_USER`

## Phase 6 - Admin Dashboard Data Real

### Backend

- implement `GET /api/admin/dashboard/summary`
- implement `GET /api/admin/transactions`
- implement `GET /api/admin/transactions/:transactionId`
- implement `GET /api/admin/machines`
- implement `GET /api/admin/machines/:machineId`
- implement `GET /api/admin/machines/:machineId/logs`
- implement `GET /api/admin/reports/environmental-impact`

### Admin Frontend

- tab `dashboard` render KPI dan transaksi terbaru dari backend
- tab `riwayat` render log IoT dan agregasi volume
- tab `kontrol` render status sensor dan machine action
- tab `lingkungan` render environmental report

### Acceptance

- admin page sepenuhnya hidup dari backend

## Phase 7 - Admin Actions, Alerting, Audit

### Backend

- implement `POST /api/admin/machines/:machineId/actions`
- implement `alerts`
- implement `GET /api/admin/alerts`
- implement `POST /api/admin/alerts/:alertId/resolve`
- implement `audit_logs`
- semua action admin tercatat

### Admin Frontend

- tambahkan confirm dialog untuk action berisiko
- tampilkan success/error result per action
- tampilkan alert state per machine

### Acceptance

- admin bisa sync status, cancel transaksi aktif, dan set maintenance dengan audit trail

## Phase 8 - Hardening & Migration Cleanup

### Backend

- tambahkan idempotency pada webhook dan command processing
- tambahkan reconciliation worker Midtrans
- tambahkan health checks dan metrics
- tambahkan rate limit guest init

### Frontend

- hapus mock data yang tersisa
- sinkronkan copy/UI dari `Eco-Flow` lama ke branding smart dispenser final
- putuskan apakah route lama `explore/stats/profile` tetap dipertahankan sebagai companion app atau dipindah ke mode terpisah

## Matriks Sinkronisasi Backend vs Frontend Existing

| UI Existing | Status | Tindakan |
|---|---|---|
| `/splash` | dipertahankan | hubungkan ke guest session API |
| `/explore` | dipertahankan sementara | isi dari machine fleet public API |
| `/scan` | dipertahankan | verifikasi QR/short code ke machine |
| `/scan/result` | diubah besar | jadikan create transaction + payment state |
| `/stats` | dipertahankan | pakai snapshot impact backend |
| `/profile` | dipertahankan | pakai data user + history backend |
| `/settings/*` | dipertahankan | pakai preference/profile API |
| `/admin` | dipertahankan | hubungkan ke admin summary/log/control/report API |
| `/vending/[machineId]` | baru | kiosk route final untuk mesin |

## Urutan Implementasi yang Direkomendasikan

1. Schema database + auth
2. Station/machine discovery
3. Transaction + Midtrans
4. MQTT ingestion + state machine
5. Customer profile/stats/history
6. Admin dashboard live data
7. Admin actions + alerts
8. Kiosk route final

## Risiko Implementasi

- jika langsung rewrite semua customer route sekaligus, regressions akan tinggi
- jika admin dibuat dulu tanpa state machine backend yang stabil, datanya akan tampak “random”
- jika payment dan MQTT diintegrasikan tanpa idempotency, state transaksi bisa kacau

## Saran Kerja Berikutnya

- turunkan dokumen ini menjadi `OpenAPI spec`
- generate migration Drizzle pertama
- scaffold backend module per domain
- mulai wiring frontend existing ke endpoint P0

