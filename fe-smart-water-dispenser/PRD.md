# PRD — Eco-Flow Customer Frontend
**Smart Water Dispenser Management App**

---

## 1. Overview

**Nama Produk:** Eco-Flow Customer App  
**Tipe:** Web Application (Next.js — Mobile-first, Responsive Desktop)  
**Tagline:** *Pure Hydration, Zero Waste*  
**Versi:** 1.1.0  
**Tanggal:** April 2026  

### Deskripsi Singkat

Eco-Flow adalah aplikasi web customer-facing untuk sistem smart water dispenser. Pengguna dapat menemukan stasiun pengisian air terdekat, melakukan scan QR untuk mengisi air, memantau dampak lingkungan pribadi, dan mengelola profil mereka. Aplikasi dirancang **tanpa registrasi/login** — setiap pengguna secara otomatis mendapatkan identitas unik (Guest ID) saat pertama kali membuka aplikasi. Dirancang mobile-first dengan layout responsif yang optimal di desktop.

---

## 2. Tujuan Produk

| Tujuan | Metrik Keberhasilan |
|--------|---------------------|
| Zero-friction onboarding — langsung pakai tanpa daftar | Pengguna bisa transaksi dalam < 30 detik sejak buka app |
| Memudahkan pengguna menemukan stasiun pengisian air | User dapat menemukan stasiun dalam < 3 klik |
| Mendorong gaya hidup ramah lingkungan | Tampilkan gamifikasi & statistik impact |
| Menyederhanakan proses refill via QR | Waktu scan-to-dispense < 10 detik |
| Memberikan transparansi konsumsi & pengeluaran | Riwayat lengkap di halaman Profile |

---

## 3. Target Pengguna

- **Mahasiswa & Civitas Akademika** kampus Prasetiya Mulya BSD
- **Pekerja Kantoran** di gedung-gedung yang terpasang dispenser Eco-Flow
- **Individu sadar lingkungan** yang ingin mengurangi penggunaan botol plastik

---

## 4. Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Framework | **Next.js 14+** (App Router) |
| UI Components | **Shadcn/UI** |
| Styling | **TailwindCSS v3** |
| Icons | **Lucide React** |
| Font | **Inter** (Google Fonts) — weights: 300, 400, 500, 600, 700, 800 |
| Map | **React Leaflet** atau **Google Maps JS API** |
| Animation | **Framer Motion** (digunakan selektif, tidak berat) |
| State Management | **Zustand** |
| HTTP Client | **Axios** + **TanStack Query (React Query)** |
| Auth | **Guest Session** — httpOnly Cookie + JWT signed server-side |
| ID Generation | **UUID v4** (server-side only, via `crypto.randomUUID()`) |

---

## 5. Sistem Autentikasi — Guest Identity

### 5.1 Konsep

Tidak ada login, tidak ada password. Setiap perangkat/browser mendapatkan identitas unik secara otomatis saat pertama kali mengakses aplikasi. Identitas ini tersimpan aman di server dan diakses via **httpOnly cookie** yang tidak bisa dibaca JavaScript.

### 5.2 Alur Inisialisasi

```
1. User buka aplikasi (/ atau /splash)
         │
         ▼
2. Next.js Middleware cek cookie `ecoflow_session`
         │
    ┌────┴────────────────────────────┐
    │ Cookie ada?                     │
    ├── YA  → Validasi JWT di server  │
    │          ├── Valid   → lanjut   │
    │          └── Expired → refresh  │
    │                                 │
    └── TIDAK → POST /api/guest/init  │
                 Server buat user baru│
                 UUID v4 (server-side)│
                 Set httpOnly cookie  │
                 Response: GuestProfile
         │
         ▼
3. Redirect ke /explore
```

### 5.3 Guest Profile — Default

```ts
interface GuestUser {
  id: string;               // UUID v4 — internal, tidak ditampilkan ke user
  displayId: string;        // 6 karakter alfanumerik uppercase: "A3F7B2"
  displayName: string;      // Default: "Guest_A3F7B2" (bisa diubah)
  createdAt: Date;          // Timestamp pertama kali buka app
  bottlesSaved: number;     // Default: 0
  totalSpent: number;       // Default: 0 (dalam IDR)
  co2Reduced: number;       // Default: 0 (kg)
  ecoLevel: EcoLevel;       // Default: 'Seedling'
}

// Format display name default:
// "Guest_" + 6 karakter dari displayId
// Contoh: "Guest_A3F7B2", "Guest_X9K2M4"
```

### 5.4 Keamanan Session

| Aspek | Implementasi |
|-------|-------------|
| **Token storage** | httpOnly cookie — tidak dapat diakses `document.cookie` (XSS-proof) |
| **Cookie flags** | `HttpOnly; Secure; SameSite=Strict; Path=/` |
| **Token format** | JWT signed dengan `HS256` menggunakan server secret (min. 256-bit) |
| **Token expiry** | 90 hari, auto-refresh tiap request aktif (sliding window) |
| **Token payload** | Hanya `userId` + `iat` + `exp` — tidak ada data sensitif |
| **CSRF protection** | Double-submit cookie pattern untuk semua mutasi (POST/PUT/DELETE) |
| **Rate limiting** | Endpoint `/api/guest/init`: max 5 request/menit per IP |
| **Input sanitization** | Display name: max 32 karakter, hanya alfanumerik + spasi + `-` + `_` |
| **Enumeration prevention** | UUID internal tidak pernah terekspos ke client; hanya `displayId` (6 char) yang tampil |
| **Logging** | Semua transaksi dicatat dengan `userId` + IP hash (bukan raw IP) |

### 5.5 Persistensi Identitas

```
Skenario                          Hasil
──────────────────────────────────────────────────────────────────
Browser sama, tab baru            ✅ Identitas tetap (cookie persists)
Browser sama, private/incognito   ⚠️  Identitas baru (session cookie)
Browser berbeda, device sama      ⚠️  Identitas baru
Clear cookies                     ⚠️  Identitas baru (guest baru dibuat)
```

> **Catatan UX:** Tampilkan info di onboarding bahwa "jangan hapus cookies untuk menjaga riwayat Anda." Tambahkan banner satu kali saat pertama buka.

### 5.6 Next.js Middleware (Pseudo-code)

```ts
// middleware.ts
export async function middleware(request: NextRequest) {
  const session = request.cookies.get('ecoflow_session')?.value;

  // Rute yang selalu diizinkan
  if (request.nextUrl.pathname.startsWith('/splash')) return NextResponse.next();

  if (!session) {
    // Redirect ke splash — splash akan trigger inisialisasi guest
    return NextResponse.redirect(new URL('/splash', request.url));
  }

  // Validasi JWT
  const payload = await verifyJWT(session); // throws jika invalid
  if (!payload) {
    const response = NextResponse.redirect(new URL('/splash', request.url));
    response.cookies.delete('ecoflow_session');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

---

## 6. Design System

### 6.1 Warna

```css
/* Primary Palette */
--color-primary-900: #0F2557;   /* Text utama navy */
--color-primary-800: #1B3A8A;   /* Heading utama */
--color-primary-700: #2352B8;   /* Interaktif biru */
--color-primary-600: #2B63D4;   /* Button utama */
--color-primary-500: #3B82F6;   /* Link, active state */
--color-primary-100: #DBEAFE;   /* Background tint biru */
--color-primary-50:  #EFF6FF;   /* Surface sangat muda */

/* Eco Green Palette */
--color-eco-700:  #3A7520;      /* Text hijau gelap */
--color-eco-600:  #4A8F28;      /* Icon hijau */
--color-eco-500:  #5BA83A;      /* Aksen hijau daun */
--color-eco-400:  #6EC148;      /* Highlight positif */
--color-eco-100:  #DCFCE7;      /* Background hijau muda */

/* Neutral */
--color-gray-900: #0F172A;      /* Body text utama */
--color-gray-700: #334155;      /* Secondary text */
--color-gray-500: #64748B;      /* Muted text */
--color-gray-300: #CBD5E1;      /* Border */
--color-gray-100: #F1F5F9;      /* Surface / Card background */
--color-gray-50:  #F8FAFC;      /* Page background */

/* Status Colors */
--color-status-full:         #22C55E;   /* Hijau — stasiun penuh */
--color-status-partial:      #F59E0B;   /* Kuning — stasiun sebagian */
--color-status-unavailable:  #EF4444;   /* Merah — tidak tersedia */

/* Background */
--color-bg-page:    #F8FAFC;
--color-bg-card:    #FFFFFF;
--color-bg-overlay: rgba(15, 37, 87, 0.06);
```

### 6.2 Tipografi

```css
font-family: 'Inter', sans-serif;

/* Type Scale */
--text-xs:   0.75rem;   /* 12px — label kecil */
--text-sm:   0.875rem;  /* 14px — body kecil */
--text-base: 1rem;      /* 16px — body */
--text-lg:   1.125rem;  /* 18px — subheading */
--text-xl:   1.25rem;   /* 20px — section title */
--text-2xl:  1.5rem;    /* 24px — page title */
--text-3xl:  1.875rem;  /* 30px — hero number */
--text-4xl:  2.25rem;   /* 36px — hero desktop */

/* Font Weights */
Regular:    400
Medium:     500
Semibold:   600
Bold:       700
Extrabold:  800  /* Hanya untuk angka statistik besar */
```

### 6.3 Spacing & Radius

```css
/* Spacing: TailwindCSS default (4px base) */
--radius-sm:  6px;
--radius-md:  12px;
--radius-lg:  16px;
--radius-xl:  24px;
--radius-full: 9999px;

/* Shadow */
--shadow-card:  0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
--shadow-modal: 0 8px 32px rgba(0,0,0,0.12);
--shadow-float: 0 4px 20px rgba(27,58,138,0.15);
```

---

## 7. Struktur Navigasi

```
/                    → Middleware check → redirect ke /splash atau /explore
/splash              → Splash screen + inisialisasi guest session
/explore             → Peta & daftar stasiun (halaman utama)
/explore/[stationId] → Detail stasiun
/scan                → QR Code scanner
/scan/result         → Hasil scan & konfirmasi dispense
/stats               → Statistik dampak lingkungan & leaderboard
/profile             → Profil pengguna & riwayat refill
/profile/history     → Riwayat lengkap refill
/settings            → Halaman pengaturan
/settings/profile    → Edit nama tampilan (display name)
/settings/notifications → Pengaturan notifikasi
/settings/privacy    → Privasi & sosial
/settings/language   → Pilihan bahasa
/settings/faq        → FAQ
/settings/contact    → Kontak kami
/settings/about      → Tentang aplikasi

❌ DIHAPUS: /login, /register, /settings/account (password/email)
```

---

## 8. Layout Responsif — Mobile vs Desktop

### Breakpoints (TailwindCSS)

| Breakpoint | Lebar | Keterangan |
|------------|-------|------------|
| `sm` | 640px | Handphone besar |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop kecil |
| `xl` | 1280px | Desktop standar |
| `2xl` | 1536px | Desktop besar |

### Strategi Layout Desktop

**Mobile:** Bottom Navigation Bar (fixed bottom, 64px)  
**Desktop:** Left Sidebar Navigation (fixed left, 240px)

**Mobile:** Full-screen pages dengan scroll vertikal  
**Desktop:** Split-panel / dashboard layout — sidebar kiri + konten kanan dengan max-width 1280px

**Mobile:** Card fullwidth  
**Desktop:** Grid cards (2–3 kolom)

---

## 9. Halaman & Spesifikasi Komponen

---

### 9.1 Splash Screen (`/splash`)

**Tujuan:** Branding intro + inisialisasi guest session (jika belum ada)

#### Proses yang terjadi di background saat splash
1. Cek cookie `ecoflow_session`
2. Jika tidak ada → `POST /api/guest/init` → terima JWT → set cookie
3. Jika ada tapi expired → `POST /api/guest/refresh` → set cookie baru
4. Progress bar divisualisasikan dari langkah-langkah ini (bukan dummy)

#### Tahapan Progress Bar
```
0%   → Halaman dimuat
20%  → "Connecting to network..."
50%  → "Initializing your station..." (guest session dibuat/divalidasi)
80%  → "Loading stations near you..." (fetch awal stasiun)
100% → "Ready!" → redirect ke /explore (500ms delay)
```

#### Mobile Layout
- Background: `#FFFFFF` dengan dua dekorasi blob `#EBF0F7` (kiri atas, kanan bawah)
- Logo di tengah (leaf + water drop SVG, diameter 120px)
- Teks "Eco-Flow" — Inter ExtraBold 32px, warna `#1B3A8A`
- Subtitle "Pure Hydration, Zero Waste" — Inter Regular 16px, warna `#64748B`
- Progress bar: label status (kiri) + persentase (kanan)
- Progress indicator: garis biru `#1B3A8A` dengan rounded cap

#### Desktop Layout
- Centered card (480px × 600px) di tengah layar
- Background halaman: gradient radial dari `#EFF6FF` ke `#F8FAFC`
- Konten identik mobile, padding lebih besar

#### Animasi
- Logo: `fadeIn + scale` 0.8→1.0 selama 600ms ease-out
- Teks: staggered `fadeInUp` — title 200ms delay, subtitle 400ms delay
- Progress bar: transisi width sesuai tahapan async (bukan fixed timer)
- Setelah 100%: `fadeOut` halus → redirect ke `/explore`

#### Banner Satu Kali (First Visit Only)
- Setelah redirect ke `/explore`, tampilkan **toast/snackbar** non-blocking:
  > "You have a Guest ID: **A3F7B2**. Don't clear your browser cookies to keep your history."
- Tombol "Got it" untuk dismiss. Tersimpan di localStorage key `eco_onboarded = true`.

---

### 9.2 Halaman Explore (`/explore`) — Utama

**Tujuan:** Temukan stasiun air terdekat via peta interaktif

#### Komponen Mobile
1. **Header** — Logo Eco-Flow + nama app (kiri), ikon notifikasi Lucide `Bell` (kanan)
2. **Search Bar** — Rounded pill, placeholder "Find water stations near you...", ikon `Search`
3. **Filter Chips** — Horizontal scroll tanpa scrollbar visible:
   - `Nearest` (default aktif, biru solid)
   - `Verified` (dengan ikon `BadgeCheck`)
   - `High Capacity`
4. **Peta** — Mengisi area tengah, markers stasiun dengan warna status
5. **Station Card** (bottom sheet, slide up saat marker dipilih):
   - Foto stasiun (thumbnail kiri, 64×64 rounded)
   - Nama stasiun (Inter SemiBold)
   - Jarak + waktu refill terakhir (abu-abu)
   - Indikator kapasitas (progress bar warna-warni)
   - Status label (Full / Unavailable / xx% Full)
   - Tombol "Directions" (biru solid, Lucide `Navigation`)
6. **Bottom Navigation** — Explore, Scan, Stats, Profile

#### Komponen Desktop
1. **Left Sidebar Navigation** (240px, fixed):
   - Logo Eco-Flow di atas (padding 24px)
   - Menu: Explore (`Compass`), Scan (`QrCode`), Stats (`BarChart2`), Profile (`User`)
   - Guest info di bawah sidebar: avatar inisial + display name + Guest ID kecil
2. **Main Content Area** — Split horizontal:
   - **Panel Kiri** (380px, scrollable): Search bar, filter chips, daftar station cards
   - **Panel Kanan** (flex, full height): Peta interaktif penuh
3. **Station Detail Panel** — slide in dari kanan panel kiri (bukan bottom sheet)

#### Map Markers
| Kondisi | Warna Marker |
|---------|-------------|
| Tersedia, kapasitas > 70% | Hijau `#22C55E` |
| Tersedia, kapasitas 30–70% | Oranye `#F59E0B` |
| Tidak tersedia | Merah `#EF4444` |
| Selected | Lebih besar + drop shadow biru |

#### Station Card Data
| Field | Sumber |
|-------|--------|
| Nama | `station.name` |
| Jarak | Kalkulasi haversine dari koordinat user |
| Waktu refill terakhir | `station.lastRefilled` (relative time) |
| Kapasitas | `station.capacity` 0–100 |
| Status | `available` / `partial` / `unavailable` |
| Foto | `station.imageUrl` |

#### Animasi
- Bottom sheet: spring animation naik saat marker dipilih (`stiffness: 300, damping: 30`)
- Filter chip select: background + scale 200ms
- Map markers: bounce entrance
- Station list desktop: `staggerChildren` 50ms delay tiap card

---

### 9.3 Halaman Scan (`/scan`)

**Tujuan:** Scan QR Code pada dispenser untuk memulai pengisian

#### Mobile Layout
- Background penuh biru primer `#1B3A8A`
- Judul "Scan QR Code" — Inter SemiBold 18px, putih, center
- Area scanner: kotak dengan animated corner brackets (bukan solid border)
- Scanning line: bergerak atas-bawah, looping, semi-transparan putih
- Instruksi: "Align the QR code within the frame to scan" — putih 70% opacity
- 2 tombol aksi (lingkaran putih, ikon biru):
  - **Flash** (Lucide `Flashlight`) — toggle lampu flash kamera
  - **Gallery** (Lucide `Image`) — unggah dari galeri untuk scan dari foto
- Bottom Navigation (background transparan gelap)

#### Desktop Layout
- Karena webcam mungkin tidak tersedia, tampilkan dua opsi tab:
  - **Tab 1: Scan via Webcam** — akses kamera menggunakan `getUserMedia` API
  - **Tab 2: Enter Code** — input teks manual 6–8 digit kode stasiun
- Input manual: monospace font, auto-uppercase, max 8 karakter
- Tombol "Verify" (biru, full-width card)
- Background biru konsisten dengan mobile

#### Animasi
- Scanning line: `translateY` CSS animation loop 2s ease-in-out
- Corner brackets: pulse opacity 2s loop
- Flash toggle: icon color + bg transition 200ms
- Tab switch: slide + fade 250ms

---

### 9.4 Halaman Scan Result (`/scan/result`)

**Tujuan:** Konfirmasi dispenser & pilih volume pengisian

#### Komponen
- Header: tombol back Lucide `ArrowLeft` + judul "Confirm Refill"
- **Stasiun teridentifikasi:** foto, nama, kapasitas saat ini
- **Pilihan Volume** (card grid 2×2 + 1 custom):
  - 250ml | 500ml | 750ml | 1000ml | Custom
  - Selected state: border biru 2px + background `#EFF6FF`
- **Estimasi harga** berdasarkan volume yang dipilih (real-time update)
- **Summary row:** Volume + Harga + info "Charged after dispense"
- Tombol "Start Dispensing" (full-width, biru, Lucide `Droplets`)
- **Success state** (setelah konfirmasi API):
  - Overlay animasi checkmark hijau (Lottie ringan atau SVG CSS)
  - Teks: "Dispensing started! Hold your bottle."
  - Auto-redirect ke `/explore` setelah 3 detik

---

### 9.5 Halaman Stats (`/stats`)

**Tujuan:** Visualisasi dampak lingkungan pengguna + gamifikasi

#### Komponen Mobile (dari atas ke bawah)
1. **Header area** — Logo kecil, teks "Your environmental impact"
2. **Card: Plastic Bottles Saved**
   - Ikon waves (Lucide `Waves`, warna biru)
   - Angka besar: `250` — Inter ExtraBold 48px, navy
   - Label "PLASTIC BOTTLES SAVED"
   - Badge hijau "+12% this week" + teks "Keep it up, hero!"
3. **Card: CO2 Reduction**
   - Label "CO2 Reduction"
   - Angka `14.2 kg` — Inter Bold 32px
   - Circular progress SVG (75%, hijau, animated)
   - Badge level: Lucide `Gem` + "Emerald Level"
4. **Campus Leaderboard**
   - Header "Campus Leaderboard" + link "View All" (biru)
   - 3 baris: rank number, avatar inisial, nama + lokasi, poin
   - Row "You": background tint biru, border kiri 3px biru

#### Komponen Desktop
- **Grid 2 kolom** untuk cards statistik (Bottles + CO2)
- **Row bawah:** Leaderboard (kiri 60%) + Weekly Chart Recharts (kanan 40%)
- Animated counter saat mount

#### Animated Counter Hook

```ts
// hooks/useCountUp.ts
function useCountUp(target: number, duration = 1500): number {
  // Menggunakan requestAnimationFrame untuk smooth counting
  // Returns current display value (integer)
}
```

#### Animasi
- Counter angka: count-up 1.5s saat komponen masuk viewport (IntersectionObserver)
- Circular progress: `stroke-dashoffset` dari 0 ke target 1.5s ease-out
- Leaderboard rows: `staggerChildren` 80ms fadeInLeft

---

### 9.6 Halaman Profile (`/profile`)

**Tujuan:** Info guest user, ringkasan aktivitas, riwayat pengisian

#### Komponen Mobile
1. **Avatar** — Lingkaran dengan inisial dari display name, ring hijau (eco level)
2. **Nama** — Display name user (Inter Bold 22px) + ikon edit Lucide `Pencil` kecil
3. **Label** — "Eco-Guardian since [bulan tahun pertama visit]"
4. **Guest ID Badge** — Kecil, subtle: "ID: A3F7B2" (copyable on tap)
5. **Stats Cards Row** (2 kartu side-by-side):
   - Kiri: Lucide `Tag`, "Saved", "250 BOTTLES"
   - Kanan: Lucide `CreditCard`, "Spent", "IDR 124.000 TOTAL"
6. **Refill History:**
   - Header "Refill History" + link "View All" → `/profile/history`
   - 3 item terbaru
7. **Bottom Navigation**

#### Komponen Desktop
- Layout 3 kolom:
  - **Kolom kiri** (280px, sticky top): avatar, info, stats cards, guest ID
  - **Kolom tengah** (flex): riwayat pengisian scrollable
  - **Kolom kanan** (300px): achievement badges + eco level progress

#### Eco Level System

```ts
type EcoLevel = 'Seedling' | 'Sprout' | 'Sapling' | 'Tree' | 'Emerald';

const levelThresholds = {
  Seedling: 0,    // 0–49 bottles
  Sprout:   50,   // 50–149
  Sapling:  150,  // 150–299
  Tree:     300,  // 300–599
  Emerald:  600,  // 600+
};
```

#### Inline Name Edit
- Tap/klik ikon `Pencil` → nama berubah menjadi input teks inline
- Validasi: max 32 karakter, hanya alfanumerik + spasi + `-_`
- Tombol save (Lucide `Check`) + cancel (Lucide `X`)
- `PUT /api/user/profile` → `{ displayName: string }`
- Toast sukses: "Name updated!"

#### Refill History Item

| Field | Detail |
|-------|--------|
| Ikon | Water drop (background tint biru, border-radius 12px) |
| Nama Stasiun | Inter SemiBold |
| Tipe Air | e.g. "1.5L Alkaline Water" — abu-abu |
| Jumlah | "-IDR 3.000" — warna gelap/merah muda |
| Waktu | "Today, 2:45 PM" |

---

### 9.7 Halaman Settings (`/settings`)

**Tujuan:** Pengaturan preferensi pengguna

> **Catatan:** Tidak ada menu "Account" (password/email) karena sistem tidak menggunakan password.

#### Struktur Menu

```
Account
├── Profile          (Lucide: User)        → Edit display name
└── Notifications    (Lucide: Bell)        → On/off notifikasi

Preferences
├── Privacy & Social  (Lucide: Shield)     → Visibilitas di leaderboard
└── Language          (Lucide: Languages)  → Pilihan bahasa (saat ini: "English")

Help
├── FAQ               (Lucide: HelpCircle)
├── Contact Us        (Lucide: Mail)
└── About             (Lucide: Info)

Session
└── Reset Guest ID    (Lucide: RefreshCw)  → Peringatan: riwayat akan hilang
```

#### Komponen Mobile
- Header: tombol back `ArrowLeft` + judul "Settings"
- Grouped list sections dengan label section abu kecil uppercase
- Setiap item: icon kiri (rounded background warna-warni) + label + chevron `ChevronRight`
- Language: nilai current sebelum chevron
- Reset Guest ID: teks merah, ikon merah — konfirmasi dialog sebelum eksekusi

#### Komponen Desktop
- Layout sidebar settings: navigasi kiri (240px) + konten sub-halaman kanan
- Highlight item aktif
- Panel kanan slide-in dengan konten sub-halaman

#### Reset Guest ID — Flow (Destructive Action)
```
1. User tap "Reset Guest ID"
2. Dialog konfirmasi muncul:
   "This will create a new Guest ID and erase all your history.
    This action cannot be undone."
   [Cancel] [Reset] ← tombol merah
3. Jika konfirmasi:
   → DELETE /api/guest/reset
   → Server hapus cookie lama, buat guest user baru
   → Set cookie baru
   → Redirect ke /splash (dengan fresh init)
```

---

### 9.8 Settings — Edit Profile (`/settings/profile`)

**Tujuan:** Mengubah nama tampilan (satu-satunya data yang bisa diedit)

#### Komponen
- Input: "Display Name" — nilai saat ini sebagai default value
- Helper text: "Your name is visible on the leaderboard if you enable public profile."
- Counter karakter: `12/32`
- Validasi real-time: hanya alfanumerik, spasi, `-`, `_`
- Tombol "Save Changes" (biru, disabled jika tidak ada perubahan atau invalid)
- Tombol "Reset to Default" — kembalikan ke `Guest_XXXXXX`
- **Guest ID Section** (read-only, di bawah):
  - Label "Your Guest ID"
  - Nilai: `A3F7B2` — monospace font, besar
  - Tombol copy (Lucide `Copy`) → toast "Copied to clipboard"
  - Info: "This ID identifies your session. Keep it safe."

---

## 10. Shared Components

### 10.1 Bottom Navigation Bar (Mobile Only)

```tsx
// 4 tab: Explore, Scan, Stats, Profile
// Active: icon + label biru primer (#1B3A8A)
// Inactive: gray-400
// Height: 64px + safe-area-inset-bottom (CSS env())
// Scan tab: QrCode icon — sedikit lebih besar (24px vs 20px)
// Background: white, border-top 1px gray-200
```

### 10.2 Sidebar Navigation (Desktop Only)

```tsx
// Width: 240px, fixed left, full height
// Logo section: 80px height, padding 24px
// Nav items: 48px height, px-4, gap-3 antara icon dan label
// Active: bg-primary-50, text-primary-700, border-left 3px solid primary-700
// Hover: bg-gray-100 (150ms transition)
// Guest info section (bottom, 80px):
//   - Avatar inisial 36px, background primary-100
//   - Display name (semibold 14px)
//   - "ID: XXXXXX" (12px, gray-400, monospace)
```

### 10.3 Guest Avatar

```tsx
// Inisial dari display name (huruf pertama setiap kata, max 2 huruf)
// "Guest_A3F7B2" → "GA" atau "G"
// "Samuel" → "S"
// Background: gradient dari primary-600 ke eco-500
// Ring warna sesuai eco level:
//   Seedling: gray  |  Sprout: green-300  |  Sapling: green-500
//   Tree: emerald-500  |  Emerald: teal-500
```

### 10.4 Station Card

```tsx
interface StationCardProps {
  name: string;
  distance: string;         // "250m away"
  lastRefilled: string;     // "Refilled 2h ago"
  capacity: number;         // 0–100
  status: 'available' | 'partial' | 'unavailable';
  imageUrl: string;
  onDirections: () => void;
}
```

### 10.5 Capacity Progress Bar

```tsx
// Height: 6px, rounded-full
// Background: gray-200
// Fill transition: width 600ms ease-out saat mount
// Warna fill:
//   > 70%: #22C55E  |  30–70%: #F59E0B  |  < 30% atau unavailable: #EF4444
```

### 10.6 Circular Progress (Stats)

```tsx
// SVG circle, stroke-dasharray + stroke-dashoffset
// Animasi dari 0 ke nilai target 1.5s ease-out (CSS atau Framer)
// Teks persentase di tengah (Inter Bold 20px)
// Stroke: #22C55E, stroke-width: 8, background stroke: gray-200
```

### 10.7 Toast / Snackbar

```tsx
// Menggunakan Shadcn Toast
// Posisi: top-center (mobile), bottom-right (desktop)
// Durasi default: 3000ms
// Tipe: default | success (hijau) | error (merah) | warning (oranye)
```

---

## 11. Animasi & Micro-interactions

### Panduan Umum
- **Prinsip:** Purposeful — tiap animasi membantu orientasi atau memberikan feedback
- **Durasi:** 150ms–600ms. Tidak ada yang melebihi 800ms
- **Easing:** `ease-out` enter, `ease-in` exit, `ease-in-out` continuous
- **Prefer CSS transitions** untuk hover/state. Gunakan Framer Motion untuk sequence orchestration saja

### Tabel Animasi

| Komponen | Animasi | Durasi | Library |
|----------|---------|--------|---------|
| Splash logo | fadeIn + scale 0.8→1 | 600ms | CSS |
| Splash progress | width sesuai async progress | variabel | CSS transition |
| Page enter | fadeIn + translateY(8px→0) | 300ms | Framer Motion |
| Bottom sheet | spring slide up | 400ms | Framer Motion |
| Station list | staggered fadeInUp | 50ms gap | Framer Motion |
| Stats counter | count-up dari 0 (viewport trigger) | 1500ms | Custom Hook |
| CO2 ring | stroke-dashoffset | 1500ms | CSS |
| Leaderboard rows | staggered fadeInLeft | 80ms gap | Framer Motion |
| Button hover | scale 1.02 + shadow | 150ms | CSS |
| Button press | scale 0.97 | 100ms | CSS |
| Filter chip | bg + color + scale | 200ms | CSS |
| Map marker | bounce entrance | 300ms | CSS |
| QR scan line | translateY loop | 2000ms | CSS |
| Corner brackets | opacity pulse | 2000ms | CSS |
| Loading skeleton | shimmer slide | looping | CSS |
| Toast in | slideIn + fadeIn | 250ms | Shadcn |
| Name edit focus | border + shadow | 200ms | CSS |
| Success checkmark | draw + scale | 600ms | CSS SVG |

### Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 12. State Management (Zustand)

```ts
interface AppStore {
  // Guest Identity
  guest: GuestUser | null;
  isInitialized: boolean;   // true setelah splash selesai
  
  // Stations
  stations: Station[];
  selectedStation: Station | null;
  userLocation: Coordinates | null;
  
  // Filters
  activeFilter: 'nearest' | 'verified' | 'highCapacity';
  
  // UI
  isBottomSheetOpen: boolean;
  notifications: Notification[];
  hasSeenOnboarding: boolean;  // from localStorage
  
  // Actions
  setGuest: (guest: GuestUser) => void;
  updateDisplayName: (name: string) => void;
  selectStation: (station: Station | null) => void;
  setFilter: (filter: FilterType) => void;
}
```

---

## 13. API Endpoints

```
# Guest Session
POST   /api/guest/init            → Buat guest baru, return JWT (set httpOnly cookie)
POST   /api/guest/refresh         → Refresh JWT yang hampir expired
DELETE /api/guest/reset           → Reset guest (hapus user lama, buat baru)
GET    /api/guest/me              → Info guest user saat ini (dari cookie)

# Stations
GET    /api/stations              → Daftar semua stasiun
GET    /api/stations/:id          → Detail stasiun
GET    /api/stations/nearby       → Terdekat (query: lat, lng, radius)

# Scan & Dispense
POST   /api/scan/verify           → Verifikasi QR code atau manual code
POST   /api/dispense              → Mulai dispense (body: stationId, volumeMl)

# User Data
GET    /api/user/stats            → Statistik dampak pengguna
GET    /api/user/history          → Riwayat refill (query: page, limit)
PUT    /api/user/profile          → Update display name { displayName: string }

# Leaderboard
GET    /api/leaderboard           → Campus leaderboard (query: limit)
```

### Request Authentication
Semua endpoint (kecuali `/api/guest/init`) memerlukan cookie `ecoflow_session` valid.  
Server memvalidasi JWT dari cookie di setiap request.  
Untuk mutasi (POST/PUT/DELETE): sertakan CSRF token di header `X-CSRF-Token`.

### Loading & Error States
- TanStack Query untuk caching & loading management
- **Skeleton loading** (bukan spinner) untuk konten utama
- Shadcn Toast untuk success/error feedback
- Empty state component dengan ilustrasi minimal jika data kosong

---

## 14. Aksesibilitas (a11y)

- Semua elemen interaktif: `aria-label` deskriptif
- Kontras warna memenuhi **WCAG AA** (min 4.5:1 teks kecil, 3:1 teks besar)
- Keyboard navigation penuh (Tab, Enter, Space, Arrow keys)
- Focus ring visible: `outline: 2px solid #2B63D4; outline-offset: 2px`
- Semantic HTML: `<nav>`, `<main>`, `<header>`, `<section>`, `<article>`
- Alt text untuk semua gambar stasiun
- Screen reader: progress bar dengan `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

---

## 15. Performa

- **Next.js Image** untuk semua foto stasiun (WebP, lazy load, blur placeholder)
- **Code splitting** otomatis via App Router
- **Map lazy loading** — Leaflet/Google Maps hanya di-load di halaman Explore
- **`next/font`** untuk Inter (zero layout shift)
- Framer Motion: gunakan `LazyMotion` + `domAnimation` feature bundle (tidak load semua)
- IntersectionObserver untuk trigger animasi counter saat masuk viewport
- Target Lighthouse: Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 90

---

## 16. Struktur Folder (Next.js App Router)

```
src/
├── app/
│   ├── (main)/
│   │   ├── layout.tsx              ← AppShell: sidebar + bottom-nav
│   │   ├── explore/
│   │   │   ├── page.tsx
│   │   │   └── [stationId]/page.tsx
│   │   ├── scan/
│   │   │   ├── page.tsx
│   │   │   └── result/page.tsx
│   │   ├── stats/page.tsx
│   │   ├── profile/
│   │   │   ├── page.tsx
│   │   │   └── history/page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── profile/page.tsx    ← Edit display name + Guest ID
│   │       ├── notifications/page.tsx
│   │       ├── privacy/page.tsx
│   │       ├── language/page.tsx
│   │       ├── faq/page.tsx
│   │       ├── contact/page.tsx
│   │       └── about/page.tsx
│   ├── splash/page.tsx
│   ├── api/
│   │   ├── guest/
│   │   │   ├── init/route.ts       ← POST: buat guest session
│   │   │   ├── refresh/route.ts    ← POST: refresh JWT
│   │   │   ├── reset/route.ts      ← DELETE: reset guest
│   │   │   └── me/route.ts         ← GET: info guest
│   │   └── user/
│   │       ├── stats/route.ts
│   │       ├── history/route.ts
│   │       └── profile/route.ts
│   ├── layout.tsx                  ← Root layout (Inter font, metadata, providers)
│   └── page.tsx                    ← Middleware redirect handler
│
├── components/
│   ├── ui/                         ← Shadcn auto-generated
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── BottomNav.tsx
│   │   └── SidebarNav.tsx
│   ├── map/
│   │   ├── StationMap.tsx
│   │   ├── StationMarker.tsx
│   │   └── StationCard.tsx
│   ├── stats/
│   │   ├── CircularProgress.tsx
│   │   ├── StatCard.tsx
│   │   └── LeaderboardList.tsx
│   ├── profile/
│   │   ├── GuestAvatar.tsx
│   │   ├── InlineNameEdit.tsx
│   │   ├── RefillHistoryItem.tsx
│   │   └── UserStatsCard.tsx
│   └── shared/
│       ├── CapacityBar.tsx
│       ├── FilterChip.tsx
│       ├── GuestIdBadge.tsx
│       ├── NotificationBell.tsx
│       └── OnboardingToast.tsx
│
├── hooks/
│   ├── useGuestSession.ts          ← Inisialisasi & akses guest state
│   ├── useUserLocation.ts
│   ├── useCountUp.ts
│   └── useStations.ts
│
├── lib/
│   ├── api.ts                      ← Axios instance + interceptors
│   ├── auth.ts                     ← JWT verify, cookie helpers (server-side)
│   ├── csrf.ts                     ← CSRF token generation/validation
│   └── utils.ts
│
├── middleware.ts                   ← Session check + redirect logic
│
├── store/
│   └── appStore.ts                 ← Zustand store
│
├── types/
│   ├── guest.ts
│   ├── station.ts
│   └── api.ts
│
└── styles/
    └── globals.css
```

---

## 17. Prioritas Pengembangan (Milestones)

| Milestone | Scope | Sprint |
|-----------|-------|--------|
| M1 | Design system, token CSS, AppShell layout (sidebar + bottom-nav), routing skeleton | 1 |
| M2 | Guest session system: `/api/guest/init`, middleware, Zustand store, splash screen async | 1 |
| M3 | Halaman Explore: peta, markers, filter chips, station cards, bottom sheet | 2 |
| M4 | Halaman Scan: QR camera, manual code input desktop, scan result & volume picker | 2 |
| M5 | Halaman Stats: counter animasi, circular progress, leaderboard | 3 |
| M6 | Halaman Profile: guest avatar, inline name edit, riwayat refill, eco level | 3 |
| M7 | Halaman Settings: semua sub-halaman, reset guest ID flow | 4 |
| M8 | Onboarding toast, responsive desktop polish, animasi final, reduced-motion | 4 |
| M9 | QA, a11y audit, Lighthouse optimasi, CSRF & rate-limit hardening | 5 |

---

## 18. Out of Scope (v1.0)

- Login / registrasi akun permanen
- Pembayaran / top-up saldo in-app (diasumsikan ditangani backend/hardware)
- Push notifications (hanya in-app toast)
- Social features (share, follow, komentar)
- Dark mode
- Offline mode / PWA / Service Worker
- Admin panel (proyek terpisah)
- Email/OTP untuk recover Guest ID yang hilang

---

## 19. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| User clear cookies → kehilangan riwayat | Medium | Onboarding warning + banner pengingat |
| Cookie dicuri (XSS) | High | httpOnly cookie — tidak bisa diakses JS |
| Session hijacking | High | SameSite=Strict + Secure flag + short-lived token + refresh |
| UUID collision | Sangat rendah | UUID v4 memiliki 2^122 kemungkinan; cek uniqueness di DB |
| Rate abuse (bot membuat banyak guest) | Medium | Rate limiting 5/menit per IP pada `/api/guest/init` |
| CSRF attack | Medium | Double-submit cookie pattern untuk semua mutasi |

---

*Dokumen ini adalah PRD versi 1.1.0 untuk Eco-Flow Customer Frontend.*  
*Changelog: v1.1.0 — Menghapus sistem login/register, mengganti dengan Guest Identity System berbasis httpOnly cookie + JWT.*
