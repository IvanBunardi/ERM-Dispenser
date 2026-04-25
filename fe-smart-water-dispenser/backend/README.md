# Eco-Flow Backend Service

Backend ini berjalan sebagai service terpisah di dalam repo yang sama dengan frontend.

## Menjalankan Lokal

1. Salin `backend/.env.example` menjadi `backend/.env`
2. Jalankan:

```bash
npm --prefix backend install
npm --prefix backend run dev
```

Service default berjalan di `http://localhost:4000`.

## Scripts

- `npm run backend:dev`
- `npm run backend:build`
- `npm run backend:test`
- `npm run backend:typecheck`

## Mode Infrastruktur

### Default lokal/test

- database: `pglite://memory`
- Midtrans: `mock`
- MQTT: `mock`

Mode ini dipakai agar backend bisa langsung jalan dan lolos test tanpa Postgres/MQTT broker eksternal.

### Production-like

Set:

- `DATABASE_URL=postgres://...`
- `MIDTRANS_MODE=live`
- `MQTT_MODE=live`
- `MQTT_URL=...`

## Database Management (Migrate & Seed)

Proyek ini menggunakan Drizzle ORM. Berikut cara mengelola database:

1. **Migrasi Database**
   Database secara otomatis menjalankan `INIT_SCHEMA_SQL` saat aplikasi berjalan. Jika Anda melakukan perubahan schema di `src/db/schema.ts`, Anda bisa mengenerate file migrasi:
   ```bash
   npx drizzle-kit generate
   ```
   Lalu untuk mem-push perubahan ke database secara langsung (berguna saat development):
   ```bash
   npx drizzle-kit push
   ```

2. **Seeding Database**
   Database akan di-seed otomatis saat backend di-start (`npm run dev`) JIKA tabel `machines` masih kosong. 
   
   Jika Anda ingin mengulang proses seed:
   1. Buka Drizzle Studio: `npx drizzle-kit studio`
   2. Hapus semua data di tabel `machines` dan `sites`
   3. Restart backend server (`npm run dev`)
   4. Server akan mendeteksi tabel kosong dan mengisi ulang data awal.

   > *Catatan:* Kode QR dummy untuk mesin adalah **123456**, **654321**, dan **112233**. Anda bisa memasukkan angka ini di halaman `/scan` pada frontend.

## Endpoint Utama

- guest session: `/api/guest/*`
- customer app/kiosk: `/api/stations`, `/api/dispense`, `/api/customer/*`
- user stats/profile/settings: `/api/user/*`, `/api/settings/*`, `/api/leaderboard`
- admin: `/api/admin/*`
- integrations: `/api/integrations/midtrans/notifications`, `/api/integrations/device/events`
