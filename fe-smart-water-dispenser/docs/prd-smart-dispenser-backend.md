# PRD - Smart Water Dispenser Backend

## 1. Executive Summary

### Problem Statement

Sistem saat ini belum memiliki backend yang dapat mengorkestrasi pembayaran, status transaksi, telemetry device, dan sinkronisasi realtime antara tablet customer, admin dashboard, dan ESP32 simulator/firmware.

### Proposed Solution

Bangun backend service terpusat berbasis TypeScript dengan `PostgreSQL`, `Drizzle ORM`, integrasi `Midtrans QRIS`, ingestion event dari MQTT, dan realtime delivery ke frontend agar seluruh alur transaksi dispenser berjalan konsisten dan dapat diaudit.

### Success Criteria

- >= 99% transaksi memiliki audit trail lengkap dari `created` sampai `completed/cancelled/failed`.
- Webhook Midtrans tervalidasi dan diproses idempotent pada >= 99.9% notifikasi masuk.
- Event device ke backend diproses dan dipantulkan ke frontend dalam <= 2 detik pada kondisi normal.
- Tidak ada transaksi ganda untuk mesin yang sama pada sesi aktif yang sama.
- Rekonsiliasi status payment stuck dapat dilakukan otomatis atau semi-otomatis tanpa edit database manual.

## 2. User Experience & Functionality

### User Personas

- **Customer frontend** sebagai consumer API dan realtime transaction state.
- **Admin frontend** sebagai consumer API operasional dan observability.
- **ESP32 device** sebagai producer telemetry dan consumer command melalui MQTT.
- **Operations/finance team** sebagai pihak yang membutuhkan histori dan rekonsiliasi yang valid.

### User Stories

#### Story 1 - Buat transaksi baru

Sebagai tablet frontend, saya ingin membuat transaksi untuk satu mesin dan satu volume agar QRIS bisa ditampilkan ke customer.

Acceptance Criteria:

- Backend memvalidasi bahwa mesin tersedia dan tidak sedang memproses transaksi aktif lain.
- Backend membuat `order_id` unik dan record transaksi `PENDING_PAYMENT`.
- Backend membuat charge QRIS Midtrans dan menyimpan respons payment reference.
- Backend mengembalikan payload yang cukup untuk render QRIS dan countdown.

#### Story 2 - Proses pembayaran Midtrans

Sebagai backend, saya ingin menerima notification Midtrans dan memvalidasi status pembayaran agar order hanya lanjut ketika pembayaran sah.

Acceptance Criteria:

- Backend menyediakan notification endpoint publik untuk Midtrans.
- Semua notification diproses idempotent berdasarkan `order_id` dan `transaction_id`.
- Untuk status penting, backend memverifikasi ke Midtrans melalui Get Status API sebelum mengubah state final.
- Backend menyimpan payload mentah notification untuk audit.

#### Story 3 - Orkestrasi ke device

Sebagai backend, saya ingin menerjemahkan transaksi berbayar menjadi command dan menerima status device agar flow vending sinkron.

Acceptance Criteria:

- Setelah payment tervalidasi, backend mengirim command yang sesuai ke topic MQTT mesin terkait.
- Backend menerima telemetry status, progress, event, dan availability dari device.
- Backend memperbarui state transaksi dan state mesin dari event device secara terurut dan idempotent.
- Backend mendeteksi kondisi error seperti `device offline`, `bottle timeout`, `pump error`, atau `flow mismatch`.

#### Story 4 - Kirim update realtime ke frontend

Sebagai frontend customer dan admin, saya ingin menerima update transaksi dan mesin secara realtime agar UI selalu sinkron.

Acceptance Criteria:

- Backend menyediakan WebSocket atau SSE untuk transaksi aktif dan dashboard admin.
- Saat event penting terjadi, backend menyiarkan state baru tanpa menunggu polling periodik.
- Bila channel realtime putus, frontend tetap dapat mengambil state terakhir via endpoint GET.

#### Story 5 - Sediakan data historis, audit, dan rekonsiliasi

Sebagai admin dan finance, saya ingin melihat histori yang konsisten agar komplain customer dan laporan bisnis dapat ditangani.

Acceptance Criteria:

- Setiap transaksi memiliki timeline state change dan payment record.
- Setiap command ke device dan respons dari device tercatat.
- Backend menyediakan endpoint query transaksi, payment, machine health, dan alert.
- Ada job rekonsiliasi untuk kasus webhook terlambat atau status payment menggantung.

### Non-Goals

- Tidak membangun engine machine learning.
- Tidak membangun data warehouse/BI terpisah pada MVP.
- Tidak membangun billing franchise multi-tenant pada MVP.
- Tidak membangun firmware OTA pipeline pada MVP.

## 3. AI System Requirements

Tidak berlaku untuk v1.

## 4. Technical Specifications

### Architecture Overview

Komponen backend:

- **API service**: REST + realtime gateway untuk customer/admin frontend
- **Payment module**: integrasi Midtrans QRIS, webhook handler, status reconciliation
- **Device module**: publisher/subscriber MQTT, machine state manager
- **Persistence layer**: PostgreSQL + Drizzle ORM
- **Background jobs**: timeout handling, payment reconciliation, alert generation

### Recommended Logical Flow

1. Customer frontend memanggil create transaction.
2. Backend membuat transaksi dan memanggil Midtrans untuk QRIS.
3. Midtrans mengirim notification ke backend saat status berubah.
4. Backend memverifikasi status dan menandai transaksi `PAID` atau state lain yang sesuai.
5. Backend publish command ke MQTT topic mesin.
6. ESP32 mengirim event dan progress ke backend.
7. Backend update transaksi, machine status, dan broadcast ke frontend.
8. Saat complete/error/cancel, backend menutup transaksi dan menyimpan audit trail.

### Payment Design

Untuk v1, payment gateway menggunakan Midtrans QRIS.

Kebutuhan sistem:

- Backend membuat charge QRIS dengan `payment_type: qris`.
- Backend menggunakan `order_id` sebagai identitas internal transaksi.
- Backend menerima HTTP notification/webhook dari Midtrans.
- Backend wajib melakukan verifikasi status penting via `GET /v2/[ORDER_ID]/status` sebelum aksi finansial final.
- Backend menyimpan `transaction_id`, `transaction_status`, `status_code`, `gross_amount`, dan payload notification.

Catatan implementasi berdasar dokumentasi resmi Midtrans:

- QRIS charge: `POST /v2/charge`
- Status check: `GET /v2/[ORDER_ID]/status`
- Notification: HTTP(S) POST notification/webhook

### Device Integration Design

MQTT topic minimum:

- `vending/{machineId}/command`
- `vending/{machineId}/status`
- `vending/{machineId}/progress`
- `vending/{machineId}/event`
- `vending/{machineId}/availability`

Payload command minimum:

- `START_ORDER`
- `PAYMENT_PAID`
- `CANCEL_ORDER`
- `SYNC_STATUS`

Event device minimum:

- `BOTTLE_DETECTED`
- `START_BUTTON_PRESSED`
- `FILLING_STARTED`
- `FILLING_PROGRESS`
- `FILLING_COMPLETED`
- `BOTTLE_REMOVED`
- `ERROR_RAISED`
- `TRANSACTION_CANCELLED`

### Transaction State Model

- `CREATED`
- `PENDING_PAYMENT`
- `PAYMENT_PENDING`
- `PAYMENT_PAID`
- `WAIT_BOTTLE`
- `READY_TO_FILL`
- `FILLING`
- `COMPLETED`
- `EXPIRED`
- `CANCELLED`
- `FAILED`
- `REFUND_REVIEW`

### Machine State Model

- `ONLINE_IDLE`
- `ONLINE_BUSY`
- `ONLINE_ERROR`
- `OFFLINE`
- `MAINTENANCE`

### Data Model - PostgreSQL via Drizzle ORM

#### Core Tables

- `machines`
- `machine_configs`
- `machine_price_options`
- `machine_status_snapshots`
- `machine_events`
- `transactions`
- `transaction_state_logs`
- `payments`
- `payment_notifications`
- `dispense_sessions`
- `device_commands`
- `alerts`
- `admin_users`
- `admin_roles`
- `audit_logs`

#### Example Table Responsibilities

- `machines`: metadata mesin, lokasi, status aktif, firmware info
- `machine_price_options`: daftar volume dan harga per mesin
- `transactions`: one row per customer checkout
- `payments`: satu record payment utama per transaksi
- `payment_notifications`: payload mentah Midtrans untuk audit/idempotency
- `machine_events`: semua event yang datang dari MQTT/device
- `device_commands`: command yang dikirim ke mesin dan status delivery/result
- `transaction_state_logs`: timeline lengkap perubahan state
- `alerts`: issue operasional yang perlu ditindak admin

### API Surface

#### Customer APIs

- `GET /api/customer/machines/:machineId`
- `POST /api/customer/transactions`
- `GET /api/customer/transactions/:transactionId`
- `POST /api/customer/transactions/:transactionId/cancel`

#### Admin APIs

- `GET /api/admin/dashboard/summary`
- `GET /api/admin/machines`
- `GET /api/admin/machines/:machineId`
- `POST /api/admin/machines/:machineId/actions`
- `GET /api/admin/transactions`
- `GET /api/admin/transactions/:transactionId`
- `POST /api/admin/transactions/:transactionId/reconcile`
- `GET /api/admin/alerts`
- `GET /api/admin/audit-logs`

#### Internal/External Integration Endpoints

- `POST /api/integrations/midtrans/notifications`
- `GET /api/internal/payments/:orderId/status-sync`
- MQTT consumer/producer service
- Realtime channels for transaction and machine updates

### Security & Privacy

- Midtrans `server key` hanya berada di backend secret store.
- Webhook Midtrans harus diverifikasi dan diproses idempotent.
- Semua admin endpoint wajib authenticated, authorized, dan diaudit.
- MQTT produksi wajib memakai private broker, auth, ACL topic, dan TLS bila tersedia.
- Backend harus mencegah duplicate active transaction per machine.
- Semua timestamp, actor, dan source event harus tersimpan untuk audit.

### Reliability Requirements

- Idempotency key untuk create transaction dan payment notification handling.
- Retry queue untuk publish command ke MQTT bila broker atau device unavailable.
- Scheduled reconciliation job ke Midtrans untuk transaksi `pending` yang melewati SLA.
- Dead-letter strategy untuk payload device atau webhook yang invalid.
- Health checks untuk API, database, broker, dan realtime gateway.

## 5. Risks & Roadmap

### Phased Rollout

#### MVP

- PostgreSQL schema + Drizzle migrations
- Customer create transaction API
- Midtrans QRIS integration
- Webhook handler + status verification
- MQTT integration dasar
- Transaction and machine state management
- Realtime updates ke customer/admin frontend
- Admin query APIs dasar

#### v1.1

- Alert rules engine
- Payment reconciliation console
- Retry dashboard untuk device command
- Export dan reporting dasar

#### v2.0

- Multi-location tenancy
- Pricing rules per waktu/lokasi
- Predictive maintenance hooks
- OTA and device provisioning workflows

### Technical Risks

- Duplicate notification atau out-of-order device events dapat merusak state transaksi.
- Webhook terlambat dapat membuat customer melihat state yang salah.
- Koneksi MQTT atau internet yang tidak stabil bisa memutus sinkronisasi mesin.
- Machine offline setelah payment sukses berpotensi menciptakan kasus refund atau manual intervention.
- Skema database yang tidak memisahkan payment, transaction, dan device event akan menyulitkan audit.

### Mitigations

- Gunakan finite state transition guard di backend.
- Terapkan idempotency pada webhook, command, dan event ingestion.
- Pisahkan canonical transaction log dari raw payment/device logs.
- Buat SLA dan alert untuk transaksi `paid but not dispensing`.
- Siapkan prosedur refund review dan incident handling dari awal.

