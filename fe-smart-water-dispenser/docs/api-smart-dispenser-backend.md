# API Detail - Smart Water Dispenser Backend

## Tujuan

Dokumen ini merinci endpoint backend yang dibutuhkan agar kompatibel dengan:

- frontend customer existing di repo
- target customer kiosk/tablet flow
- frontend admin existing di repo
- integrasi Midtrans dan device MQTT

## Konvensi

- response sukses dibungkus `success: true`
- response gagal dibungkus `success: false`, `error.code`, `error.message`
- semua timestamp ISO 8601 UTC
- amount integer dalam rupiah
- customer guest auth via httpOnly cookie
- admin auth via session/JWT admin

## 1. Customer Existing App APIs

### 1.1 Guest Session

#### `POST /api/guest/init`

Dipakai oleh:

- `/splash`

Tujuan:

- membuat guest identity saat pertama kali app dibuka

Request body:

```json
{
  "deviceFingerprint": "optional-client-generated-id"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "guest": {
      "id": "uuid",
      "displayId": "A3F7B2",
      "displayName": "Guest_A3F7B2",
      "createdAt": "2026-04-25T05:00:00.000Z"
    },
    "preferences": {
      "language": "en",
      "notificationsEnabled": true,
      "publicLeaderboard": true
    }
  }
}
```

#### `POST /api/guest/refresh`

Dipakai oleh:

- session refresh app customer

#### `GET /api/guest/me`

Dipakai oleh:

- `/profile`
- `/settings/profile`

#### `DELETE /api/guest/reset`

Dipakai oleh:

- `/settings`

Perilaku:

- invalidate session lama
- buat guest baru
- reset cookie

### 1.2 Explore / Stations

#### `GET /api/stations`

Dipakai oleh:

- `/explore`

Query params:

- `lat`
- `lng`
- `filter` = `nearest | verified | highCapacity`
- `search`

Response fields minimum:

- `id`
- `name`
- `shortCode`
- `distanceMeters`
- `lastRefilledAt`
- `capacityPct`
- `status`
- `imageUrl`
- `lat`
- `lng`
- `isVerified`

#### `GET /api/stations/:stationId`

Dipakai oleh:

- detail selection di explore
- scan verification fallback

#### `GET /api/stations/nearby`

Optional specialized endpoint bila mau memisahkan geospatial query.

### 1.3 Scan & Start Dispense

#### `POST /api/scan/verify`

Dipakai oleh:

- `/scan`

Request:

```json
{
  "code": "PRASMUL1"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "machine": {
      "id": "uuid",
      "machineCode": "VM-001",
      "shortCode": "PRASMUL1",
      "displayName": "Auditorium Prasmul",
      "status": "available",
      "capacityPct": 92
    }
  }
}
```

#### `POST /api/dispense`

Dipakai oleh:

- `/scan/result`

Request:

```json
{
  "machineId": "uuid",
  "volumeMl": 500,
  "sourceChannel": "CUSTOMER_APP"
}
```

Perilaku:

- create transaction
- create Midtrans QRIS payment jika mode flow butuh pembayaran dulu
- atau create deferred transaction bila mode existing frontend tetap pakai mock start flow

Response:

```json
{
  "success": true,
  "data": {
    "transactionId": "uuid",
    "orderId": "TRX-20260425-0001",
    "paymentStatus": "PENDING",
    "dispenseStatus": "CREATED",
    "machine": {
      "machineCode": "VM-001",
      "displayName": "Auditorium Prasmul"
    },
    "payment": {
      "provider": "midtrans",
      "paymentType": "qris",
      "qrString": "000201010212...",
      "qrUrl": "https://...",
      "expiresAt": "2026-04-25T05:15:00.000Z"
    }
  }
}
```

### 1.4 Profile, Stats, History, Settings

#### `GET /api/user/stats`

Dipakai oleh:

- `/stats`

Response minimum:

- `bottlesSaved`
- `co2ReducedKg`
- `weeklyChangePct`
- `ecoLevel`
- `totalSpent`
- `totalVolumeMl`

#### `GET /api/user/history`

Dipakai oleh:

- `/profile`
- `/profile/history`

Query:

- `page`
- `limit`

#### `PUT /api/user/profile`

Dipakai oleh:

- `/profile`
- `/settings/profile`

Request:

```json
{
  "displayName": "Malik"
}
```

#### `GET /api/leaderboard`

Dipakai oleh:

- `/stats`

#### `GET /api/settings/preferences`

Dipakai oleh:

- `/settings/*`

#### `PATCH /api/settings/preferences`

Dipakai oleh:

- `/settings/notifications`
- `/settings/privacy`
- `/settings/language`

## 2. Customer Kiosk / Tablet APIs

Route target:

- `/vending/:machineId`

### 2.1 Machine Context

#### `GET /api/customer/machines/:machineId`

Tujuan:

- hydrate tablet idle screen

Response minimum:

- machine metadata
- volume options
- current availability
- active transaction summary jika ada

### 2.2 Transaction Flow

#### `POST /api/customer/transactions`

Tujuan:

- create new vending transaction dari tablet

Request:

```json
{
  "machineId": "VM-001",
  "volumeMl": 500,
  "sourceChannel": "TABLET_KIOSK"
}
```

#### `GET /api/customer/transactions/:transactionId`

Tujuan:

- fallback polling state transaksi

#### `POST /api/customer/transactions/:transactionId/cancel`

Tujuan:

- batalkan transaksi sebelum filling selesai

### 2.3 Realtime

#### `GET /api/realtime/transactions/:transactionId/stream`

SSE untuk:

- payment status update
- bottle detected
- filling progress
- completion/error

#### `GET /api/realtime/machines/:machineId/stream`

Optional SSE untuk status idle machine.

## 3. Admin APIs

## 3.1 Auth

#### `POST /api/admin/auth/login`
#### `POST /api/admin/auth/logout`
#### `GET /api/admin/auth/me`

## 3.2 Dashboard Summary

#### `GET /api/admin/dashboard/summary`

Dipakai oleh:

- tab `dashboard`

Response minimum:

- `totalTransactions`
- `successfulTransactions`
- `pendingTransactions`
- `cancelledTransactions`
- `totalRevenue`
- `bottlesSaved`
- `totalWaterDistributedLiters`
- `activeSensors`
- `sensorWarnings`

## 3.3 Transactions

#### `GET /api/admin/transactions`

Dipakai oleh:

- tab `dashboard`
- tab `riwayat`

Query:

- `machineId`
- `paymentStatus`
- `dispenseStatus`
- `dateFrom`
- `dateTo`
- `page`
- `limit`

#### `GET /api/admin/transactions/:transactionId`

Detail timeline transaksi.

#### `POST /api/admin/transactions/:transactionId/reconcile`

Perilaku:

- hit Midtrans status API
- sinkronkan ulang payment state

## 3.4 Fleet & Control

#### `GET /api/admin/machines`

Dipakai oleh:

- admin fleet list

#### `GET /api/admin/machines/:machineId`

Dipakai oleh:

- detail status sensor dan telemetri

Response minimum:

- identity mesin
- status snapshot terbaru
- volume options
- transaksi aktif
- last logs
- open alerts

#### `POST /api/admin/machines/:machineId/actions`

Dipakai oleh:

- tab `kontrol`

Supported `action` minimum:

- `SET_MAINTENANCE`
- `RESUME_OPERATION`
- `CANCEL_ACTIVE_TRANSACTION`
- `SYNC_STATUS`
- `RESEND_LAST_COMMAND`
- `TOGGLE_QRIS_ACCEPTANCE`

Request:

```json
{
  "action": "SYNC_STATUS",
  "payload": {}
}
```

## 3.5 IoT Logs

#### `GET /api/admin/machines/:machineId/logs`

Dipakai oleh:

- tab `riwayat`

Query:

- `cursor`
- `limit`
- `eventType`

## 3.6 Environmental Reporting

#### `GET /api/admin/reports/environmental-impact`

Dipakai oleh:

- tab `lingkungan`

Response minimum:

- `waterDistributedLiters`
- `plasticBottlesSaved`
- `co2ReducedKg`
- `wastePreventedLiters`
- `energyEfficiencyPct`

## 3.7 Alerts & Audit

#### `GET /api/admin/alerts`
#### `POST /api/admin/alerts/:alertId/resolve`
#### `GET /api/admin/audit-logs`

## 4. Integrations

### 4.1 Midtrans

#### `POST /api/integrations/midtrans/notifications`

Perilaku wajib:

- simpan payload mentah ke `payment_notifications`
- idempotent by notification fingerprint
- verify ke Midtrans `GET /v2/[ORDER_ID]/status` untuk state penting
- update `payments`, `transactions`, `transaction_state_logs`

### 4.2 Internal Payment Sync

#### `POST /api/internal/payments/:orderId/status-sync`

Dipakai oleh:

- cron/reconciliation worker

### 4.3 MQTT Ingestion

Walau bukan HTTP endpoint public, backend membutuhkan handler internal untuk topic:

- `vending/{machineId}/status`
- `vending/{machineId}/progress`
- `vending/{machineId}/event`
- `vending/{machineId}/availability`

## 5. Mapping Endpoint ke Frontend yang Sudah Ada

| Frontend Route | Endpoint Minimum |
|---|---|
| `/splash` | `POST /api/guest/init`, `POST /api/guest/refresh` |
| `/explore` | `GET /api/stations` |
| `/scan` | `POST /api/scan/verify` |
| `/scan/result` | `POST /api/dispense`, `GET /api/customer/transactions/:transactionId` |
| `/stats` | `GET /api/user/stats`, `GET /api/leaderboard` |
| `/profile` | `GET /api/guest/me`, `GET /api/user/history`, `PUT /api/user/profile` |
| `/profile/history` | `GET /api/user/history` |
| `/settings` | `GET /api/settings/preferences`, `DELETE /api/guest/reset` |
| `/settings/profile` | `GET /api/guest/me`, `PUT /api/user/profile` |
| `/admin` dashboard tab | `GET /api/admin/dashboard/summary`, `GET /api/admin/transactions` |
| `/admin` riwayat tab | `GET /api/admin/machines/:machineId/logs`, `GET /api/admin/transactions` |
| `/admin` kontrol tab | `GET /api/admin/machines/:machineId`, `POST /api/admin/machines/:machineId/actions` |
| `/admin` lingkungan tab | `GET /api/admin/reports/environmental-impact` |

## 6. Endpoint Prioritas Implementasi

### Prioritas P0

- `POST /api/guest/init`
- `GET /api/stations`
- `POST /api/scan/verify`
- `POST /api/customer/transactions`
- `GET /api/customer/transactions/:transactionId`
- `POST /api/integrations/midtrans/notifications`
- `GET /api/admin/dashboard/summary`
- `GET /api/admin/transactions`
- `GET /api/admin/machines/:machineId`

### Prioritas P1

- `GET /api/user/stats`
- `GET /api/user/history`
- `PUT /api/user/profile`
- `GET /api/leaderboard`
- `GET /api/admin/machines/:machineId/logs`
- `POST /api/admin/machines/:machineId/actions`

