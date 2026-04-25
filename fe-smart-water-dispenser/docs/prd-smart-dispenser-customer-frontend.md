# PRD - Smart Water Dispenser Customer Frontend

## 1. Executive Summary

### Problem Statement

Frontend customer yang ada saat ini masih berupa aplikasi eksplorasi stasiun air, padahal kebutuhan bisnis sekarang adalah **tablet UI per mesin** untuk menjalankan transaksi vending dispenser secara langsung, mulai dari pemilihan volume sampai progres pengisian selesai.

### Proposed Solution

Bangun customer frontend baru berbasis web kiosk fullscreen pada route seperti `/vending/[machineId]` yang menampilkan pilihan volume, QRIS Midtrans, status pembayaran, status botol, progres dispensing, dan hasil transaksi secara real-time dari backend.

### Success Criteria

- >= 95% transaksi customer dapat selesai tanpa bantuan admin.
- Waktu dari pilih volume sampai QRIS tampil <= 3 detik pada koneksi normal.
- Waktu propagasi status pembayaran dari backend ke tablet <= 2 detik setelah webhook tervalidasi.
- >= 98% sinkronisasi status antara tablet dan backend untuk transaksi aktif.
- Error abandonment rate akibat UI ambiguity < 3% dari total transaksi.

## 2. User Experience & Functionality

### User Personas

- **Walk-up customer**: pengguna umum yang datang ke mesin, ingin beli air cepat tanpa login.
- **First-time user**: pengguna yang belum familiar dengan flow QRIS dan butuh arahan jelas.
- **Low-attention user**: pengguna yang berdiri di depan mesin dan perlu status singkat, besar, dan mudah dipahami.

### User Stories

#### Story 1 - Pilih volume

Sebagai customer, saya ingin memilih volume air yang tersedia agar saya langsung tahu nominal yang harus dibayar.

Acceptance Criteria:

- Layar idle menampilkan nama mesin, status kesiapan, dan opsi volume aktif.
- Opsi volume menampilkan `volume`, `harga`, dan status ketersediaan.
- Opsi yang tidak tersedia harus disabled dan diberi alasan singkat.
- Ketika volume dipilih, tablet memanggil backend untuk membuat transaksi baru.

#### Story 2 - Bayar dengan QRIS

Sebagai customer, saya ingin melihat QRIS yang besar dan jelas agar saya bisa segera membayar.

Acceptance Criteria:

- Setelah transaksi dibuat, tablet menampilkan QRIS Midtrans, nominal, countdown, dan transaction reference.
- UI menampilkan status `Menunggu Pembayaran`, `Pembayaran Diproses`, `Pembayaran Berhasil`, `Kadaluarsa`, atau `Gagal`.
- Jika pembayaran kadaluarsa, UI menawarkan aksi `Coba Lagi`.
- QRIS tidak di-cache lintas transaksi dan hilang setelah transaksi selesai atau dibatalkan.

#### Story 3 - Ikuti alur pasca pembayaran

Sebagai customer, saya ingin mendapat instruksi setelah pembayaran agar saya tahu langkah berikutnya.

Acceptance Criteria:

- Setelah pembayaran valid, UI otomatis berpindah ke status `Silakan letakkan botol`.
- UI menampilkan status sensor botol dari backend secara real-time.
- Setelah botol terdeteksi, UI menampilkan instruksi `Tekan START pada mesin`.
- Jika botol tidak terdeteksi dalam durasi timeout, UI menampilkan pesan yang jelas dan opsi bantuan.

#### Story 4 - Lihat progres pengisian

Sebagai customer, saya ingin melihat progres pengisian agar saya yakin transaksi berjalan normal.

Acceptance Criteria:

- Saat filling dimulai, UI menampilkan progress bar, `filledMl`, `targetVolumeMl`, dan status pompa.
- Progress diperbarui minimum tiap 1 detik selama transaksi aktif.
- Bila terjadi error device, UI menampilkan state error yang mudah dipahami dan tidak menampilkan status sukses palsu.
- Setelah target tercapai, UI menampilkan halaman sukses dan auto-reset ke idle.

#### Story 5 - Tangani error dan timeout

Sebagai customer, saya ingin sistem memberi penjelasan saat ada gangguan agar saya tidak bingung.

Acceptance Criteria:

- Terdapat state terpisah untuk `payment timeout`, `device offline`, `network issue`, `dispense cancelled`, dan `unexpected error`.
- Setiap error state punya CTA yang sesuai: `Coba Lagi`, `Hubungi Admin`, atau `Kembali ke Awal`.
- UI tidak boleh memulai transaksi baru selama transaksi aktif sebelumnya belum ditutup oleh backend.

### Non-Goals

- Tidak membangun login/register customer.
- Tidak membangun map/explore station untuk v1.
- Tidak membangun gamification, leaderboard, atau eco impact di customer kiosk.
- Tidak membangun wallet internal atau saldo customer.
- Tidak membangun multi-item cart; satu transaksi hanya untuk satu volume pada satu mesin.

## 3. AI System Requirements

Tidak berlaku untuk v1. Sistem ini tidak membutuhkan fitur AI sebagai bagian dari MVP customer frontend.

## 4. Technical Specifications

### Architecture Overview

Alur utama:

1. Tablet membuka route `/vending/[machineId]`.
2. Frontend mengambil `machine configuration`, daftar volume, dan status availability dari backend.
3. Saat user memilih volume, frontend memanggil endpoint create transaction.
4. Backend membuat transaksi, memanggil Midtrans QRIS, lalu mengembalikan detail pembayaran.
5. Frontend subscribe ke channel real-time transaksi aktif.
6. Backend mendorong perubahan state transaksi berdasarkan webhook Midtrans dan event MQTT dari device.
7. Frontend merender state machine transaksi sampai kembali ke idle.

### State Machine Frontend

- `IDLE`
- `CREATING_TRANSACTION`
- `WAITING_PAYMENT`
- `PAYMENT_CONFIRMED`
- `WAITING_BOTTLE`
- `READY_TO_FILL`
- `FILLING`
- `COMPLETE`
- `CANCELLED`
- `EXPIRED`
- `ERROR`

### Key Screens

- Idle / pilih volume
- QRIS payment
- Payment confirmed
- Waiting bottle
- Ready to fill
- Filling progress
- Complete
- Error / timeout / device offline

### Integration Points

- `GET /api/customer/machines/:machineId`
- `POST /api/customer/transactions`
- `GET /api/customer/transactions/:transactionId`
- `POST /api/customer/transactions/:transactionId/cancel`
- Realtime channel via WebSocket atau SSE untuk update transaksi aktif
- Asset QRIS dari response backend, bukan dari frontend langsung ke Midtrans

### Security & Privacy

- Tidak ada `Midtrans server key` atau secret backend di frontend.
- Tablet hanya menerima token session kiosk atau signed machine context dari backend.
- Route customer harus dibatasi ke machine scope, bukan admin scope.
- Transaction polling/realtime channel hanya boleh mengakses transaksi untuk machine yang sedang aktif.
- Setelah transaksi selesai, frontend harus membersihkan local state dan data QRIS.

### Accessibility & UX Constraints

- Font besar dan kontras tinggi untuk dipakai pada tablet di area publik.
- CTA utama minimum tinggi 56px untuk input sentuh.
- Semua state penting harus punya indikator visual dan teks, bukan warna saja.
- Seluruh flow customer target maksimal 3 tap sebelum masuk ke tahap pembayaran.

## 5. Risks & Roadmap

### Phased Rollout

#### MVP

- Route tablet per machine
- Pilih volume
- Create transaction
- Tampil QRIS Midtrans
- Status pembayaran real-time
- Waiting bottle / ready / filling / complete
- Error and timeout handling

#### v1.1

- Multi-language `ID/EN`
- Audio cue dan animasi state
- Remote reset dari admin
- Receipt screen dan kode bantuan transaksi

#### v2.0

- Dukungan promo atau voucher
- Receipt digital via WhatsApp/email
- Aksesibilitas tambahan untuk mode high-contrast dan voice prompt

### Technical Risks

- Latensi status pembayaran atau event device membuat user mengira transaksi macet.
- Tablet kiosk bisa berada pada jaringan yang tidak stabil.
- Jika state machine frontend tidak identik dengan backend, akan muncul false success atau double action.
- Timeout yang tidak konsisten antara frontend, backend, dan firmware dapat menghasilkan UX yang membingungkan.

### Mitigations

- Gunakan single source of truth dari backend untuk status transaksi.
- Semua transisi penting harus bergantung pada state backend, bukan asumsi UI.
- Sediakan fallback polling bila koneksi realtime terputus.
- Definisikan timeout state di konfigurasi backend dan expose ke frontend.

