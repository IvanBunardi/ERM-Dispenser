# PRD - Smart Water Dispenser Admin Frontend

## 1. Executive Summary

### Problem Statement

Admin page yang ada saat ini masih berupa prototype statis, sehingga operator belum bisa memonitor transaksi, status mesin, log IoT, pembayaran, dan isu operasional secara real-time dari satu dashboard.

### Proposed Solution

Bangun admin frontend berbasis web dashboard yang berfungsi sebagai pusat monitoring dan operasi untuk seluruh mesin dispenser, transaksi, pembayaran Midtrans, telemetri device, alert, dan tindakan maintenance terkontrol.

### Success Criteria

- Operator dapat mengetahui status online/offline tiap mesin dalam <= 5 detik dari event terbaru.
- Mean time to identify incident turun ke < 2 menit dari munculnya alert.
- >= 90% kasus operasional harian dapat diselesaikan tanpa akses langsung ke database.
- Semua aksi admin penting terekam pada audit log.
- Dashboard dapat menangani minimal 100 mesin aktif tanpa degradasi UX signifikan.

## 2. User Experience & Functionality

### User Personas

- **Operations Admin**: memonitor transaksi, pembayaran, dan availability mesin.
- **Technician**: melihat device logs, sensor state, serta menjalankan command maintenance.
- **Finance/Support**: menelusuri status pembayaran, refund candidate, dan dispute operasional.
- **Owner/Manager**: melihat KPI, revenue, volume terjual, dan health mesin.

### User Stories

#### Story 1 - Monitor fleet mesin

Sebagai operator, saya ingin melihat daftar semua mesin dan status terkininya agar saya cepat tahu mesin mana yang bermasalah.

Acceptance Criteria:

- Dashboard menampilkan list mesin dengan status `online`, `offline`, `idle`, `busy`, `error`, dan `maintenance`.
- Daftar mesin dapat difilter berdasarkan lokasi, status, dan konektivitas.
- Setiap row menampilkan last heartbeat, availability, volume terjual hari ini, dan transaksi aktif.

#### Story 2 - Pantau transaksi dan pembayaran

Sebagai admin, saya ingin melihat transaksi dan status pembayarannya agar bisa menangani komplain dan rekonsiliasi.

Acceptance Criteria:

- Tersedia tabel transaksi dengan filter `date range`, `machineId`, `payment status`, dan `dispense status`.
- Detail transaksi menampilkan timeline: dibuat, QRIS issued, paid, bottle detected, filling started, complete, cancel, atau error.
- Admin dapat melihat `order_id`, `midtrans transaction_id`, nominal, volume, dan sumber status terakhir.
- Status pembayaran yang tidak sinkron dapat ditandai untuk rekonsiliasi.

#### Story 3 - Lihat log IoT dan status sensor

Sebagai teknisi, saya ingin melihat event device dan pembacaan sensor agar diagnosis masalah lebih cepat.

Acceptance Criteria:

- Detail mesin menampilkan log event real-time dari MQTT/backend.
- UI menampilkan snapshot sensor utama: bottle sensor, flow reading, pump status, tank status, dan uptime.
- Operator dapat melihat riwayat error per mesin dan frekuensinya.

#### Story 4 - Lakukan tindakan operasional

Sebagai admin, saya ingin menjalankan aksi terkontrol pada mesin agar saya bisa memulihkan layanan tanpa kunjungan fisik bila aman dilakukan.

Acceptance Criteria:

- Aksi minimal v1: `cancel transaction`, `mark machine maintenance`, `resume machine`, `resend command`, `trigger status sync`.
- Aksi berisiko tinggi harus memakai dialog konfirmasi.
- Setiap aksi menghasilkan audit log yang menyimpan `adminId`, waktu, payload, dan hasil.
- UI harus membedakan aksi yang hanya ke backend dan aksi yang mengirim command ke device.

#### Story 5 - Lihat KPI dan alert

Sebagai owner atau operator, saya ingin melihat metrik bisnis dan alert prioritas agar keputusan harian lebih cepat.

Acceptance Criteria:

- Dashboard utama menampilkan revenue, transaksi sukses, transaksi gagal, volume air terdistribusi, dan machine utilization.
- Alert panel menampilkan issue prioritas seperti `device offline`, `payment stuck`, `low tank`, atau `sensor anomaly`.
- KPI dapat difilter per hari, minggu, bulan, dan per lokasi.

### Non-Goals

- Tidak membangun ERP penuh, inventory procurement, atau akuntansi lengkap.
- Tidak membangun mobile native admin app pada v1.
- Tidak membangun OTA firmware deployment UI pada MVP.
- Tidak membangun BI dashboard kompleks lintas departemen pada v1.

## 3. AI System Requirements

Tidak berlaku untuk v1. Alert dan observability berbasis rule engine biasa, bukan AI.

## 4. Technical Specifications

### Architecture Overview

Admin frontend adalah web dashboard yang mengambil data dari backend melalui:

- REST API untuk query data historis dan mutasi
- WebSocket atau SSE untuk live status mesin dan transaksi
- RBAC-protected session untuk semua route admin

### Core Modules

- `Overview Dashboard`
- `Machine Fleet`
- `Machine Detail`
- `Transactions`
- `Payment Reconciliation`
- `IoT Logs`
- `Alerts`
- `Pricing & Product Config`
- `Admin Audit Log`

### Recommended Information Architecture

- `/admin`
- `/admin/machines`
- `/admin/machines/[machineId]`
- `/admin/transactions`
- `/admin/transactions/[transactionId]`
- `/admin/alerts`
- `/admin/payments`
- `/admin/settings/pricing`
- `/admin/settings/users`
- `/admin/audit-logs`

### Integration Points

- `GET /api/admin/dashboard/summary`
- `GET /api/admin/machines`
- `GET /api/admin/machines/:machineId`
- `POST /api/admin/machines/:machineId/actions`
- `GET /api/admin/transactions`
- `GET /api/admin/transactions/:transactionId`
- `POST /api/admin/transactions/:transactionId/reconcile`
- `GET /api/admin/alerts`
- `GET /api/admin/audit-logs`

### Security & Privacy

- Admin dashboard wajib memakai authentication dan RBAC.
- Roles minimum: `owner`, `ops_admin`, `technician`, `finance_support`.
- Semua mutasi admin harus memakai CSRF protection dan audit logging.
- Sensitive data seperti server key payment tidak pernah ditampilkan ke UI.
- Masking diterapkan untuk data yang tidak perlu dilihat semua role.

### UX Constraints

- Halaman utama harus usable pada laptop operasional 1366px.
- Machine detail harus bisa dipakai tanpa berpindah-pindah halaman untuk diagnosis dasar.
- Realtime panel harus tetap terbaca walau koneksi fluktuatif; tampilkan `last updated`.

## 5. Risks & Roadmap

### Phased Rollout

#### MVP

- Dashboard summary
- Machine list dan machine detail
- Transaction table dan detail
- IoT log viewer
- Alert list
- Aksi admin dasar dan audit log

#### v1.1

- Pricing management
- Role management UI
- Payment reconciliation queue
- Export CSV untuk transaksi dan log

#### v2.0

- SLA tracking
- Preventive maintenance scheduling
- OTA firmware management
- Multi-tenant lokasi/franchise

### Technical Risks

- Volume log real-time dapat membebani browser bila tidak dibatasi.
- Aksi admin yang tidak idempotent bisa memicu command duplikat ke mesin.
- Jika RBAC lemah, pengguna non-authorized bisa mengakses fungsi berbahaya.
- KPI dapat salah bila sumber data transaksi dan device event tidak direkonsiliasi.

### Mitigations

- Gunakan paginated logs dan ring buffer pada live viewer.
- Semua action endpoint harus idempotent dan memiliki audit trail.
- Batasi aksi sensitif berdasarkan role dan machine scope.
- Definisikan event sourcing ringan atau canonical transaction timeline di backend.

