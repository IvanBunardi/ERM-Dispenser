# PRD Bundle Overview - Smart Water Dispenser

## Tujuan

Dokumen ini merangkum paket PRD baru untuk sistem **smart water dispenser** berbasis:

- frontend customer pada tablet/kiosk
- frontend admin operasional
- backend transaksi, device orchestration, dan observability
- database `PostgreSQL`
- ORM `Drizzle`
- payment gateway `Midtrans`

PRD ini disusun dari:

- implementasi frontend yang saat ini ada di repo
- prototype admin page yang sudah tersedia
- guide simulasi Wokwi pada `C:/Users/malik/Downloads/water-vending-iot-final-guide.md`

## Kondisi Saat Ini di Repo

Frontend saat ini masih berangkat dari konsep aplikasi `Eco-Flow` umum:

- customer flow masih berpusat pada `explore station`, `scan`, `stats`, `profile`, dan `settings`
- transaksi masih mock dan belum mengikuti state machine mesin dispenser
- admin page sudah ada, tetapi masih prototype visual dengan data statis
- belum ada backend, database, payment orchestration, dan real-time device sync

## Pergeseran Produk yang Dibutuhkan

Produk target bukan lagi aplikasi pencarian stasiun air, melainkan sistem vending machine yang berpusat pada **satu machine per transaksi**.

Perubahan utama:

1. Customer frontend berubah menjadi **tablet UI fullscreen** di mesin, bukan consumer app eksplorasi lokasi.
2. Admin frontend berubah menjadi **dashboard operasional** untuk monitoring mesin, transaksi, log IoT, alert, dan tindakan maintenance.
3. Backend harus menjadi **pusat orkestrasi** antara Midtrans, MQTT/device events, dashboard admin, dan tablet UI.

## Dokumen dalam Bundle Ini

- [Customer Frontend PRD](/C:/Users/malik/Documents/ERM-Dispenser/fe-smart-water-dispenser/docs/prd-smart-dispenser-customer-frontend.md)
- [Admin Frontend PRD](/C:/Users/malik/Documents/ERM-Dispenser/fe-smart-water-dispenser/docs/prd-smart-dispenser-admin-frontend.md)
- [Backend PRD](/C:/Users/malik/Documents/ERM-Dispenser/fe-smart-water-dispenser/docs/prd-smart-dispenser-backend.md)
- [ERD PostgreSQL](/C:/Users/malik/Documents/ERM-Dispenser/fe-smart-water-dispenser/docs/erd-smart-dispenser-postgresql.md)
- [API Detail Backend](/C:/Users/malik/Documents/ERM-Dispenser/fe-smart-water-dispenser/docs/api-smart-dispenser-backend.md)
- [Drizzle ORM Schema](/C:/Users/malik/Documents/ERM-Dispenser/fe-smart-water-dispenser/docs/drizzle-orm-smart-dispenser-schema.md)
- [Implementation Breakdown](/C:/Users/malik/Documents/ERM-Dispenser/fe-smart-water-dispenser/docs/implementation-breakdown-smart-dispenser.md)

## Asumsi Kerja

- Customer interface berjalan di tablet yang terpasang di mesin.
- Setiap mesin memiliki `machineId` unik, mis. `VM-001`.
- Device controller tetap berada di ESP32/Wokwi dan berkomunikasi ke backend melalui MQTT.
- Metode pembayaran utama untuk v1 adalah **Midtrans QRIS**.
- Frontend customer dan admin tetap berbasis web app.
- Tidak ada login customer pada v1.
- Admin membutuhkan autentikasi dan role-based access.

## Catatan Midtrans yang Diverifikasi

Bagian backend PRD menggunakan terminologi resmi Midtrans yang sudah diverifikasi dari dokumentasi resmi:

- QRIS charge menggunakan endpoint `POST /v2/charge` dengan `payment_type: qris`
- status transaksi dapat direkonsiliasi melalui `GET /v2/[ORDER_ID]/status`
- notifikasi pembayaran dikirim melalui HTTP(S) notification/webhook

Sumber:

- [Midtrans QRIS API](https://docs.midtrans.com/reference/qris)
- [Midtrans HTTP Notification / Webhooks](https://docs.midtrans.com/docs/https-notification-webhooks)
- [Midtrans Get Status API](https://docs.midtrans.com/docs/get-status-api-requests)
