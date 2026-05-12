'use client'

import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import '../admin.css'
import Link from 'next/link'

export default function RegisterProviderPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    institutionName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (formData.password !== formData.confirmPassword) {
      setError('Password tidak cocok')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/admin/auth/register-provider', {
        fullName: formData.fullName,
        institutionName: formData.institutionName,
        email: formData.email,
        phoneNumber: formData.phoneNumber,
        password: formData.password,
      })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registrasi gagal')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="admin-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="wave-bg">
          <div className="wave-layer wave-layer-1" /><div className="wave-layer wave-layer-2" /><div className="wave-layer wave-layer-3" />
        </div>
        <div style={{ position: 'relative', zIndex: 1, background: 'white', borderRadius: 20, padding: 36, width: '100%', maxWidth: 450, boxShadow: '0 8px 40px rgba(0,0,0,0.12)', textAlign: 'center' }}>
          <div style={{ fontSize: 60, marginBottom: 20 }}>✅</div>
          <h2 style={{ fontFamily: 'Montserrat', fontWeight: 800, fontSize: 22, color: '#1B3A8A', marginBottom: 12 }}>Registrasi Berhasil!</h2>
          <p style={{ fontFamily: 'Montserrat', fontSize: 14, color: '#64748b', marginBottom: 24 }}>
            Akun penyedia mesin Anda telah berhasil dibuat. Silakan lanjut ke dashboard untuk mengelola mesin Anda.
          </p>
          <Link href="/admin" style={{ display: 'block', width: '100%', background: '#1B3A8A', color: 'white', textDecoration: 'none', borderRadius: 10, padding: '12px 0', fontSize: 15, fontWeight: 700, fontFamily: 'Montserrat' }}>
            Ke Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '40px 20px' }}>
      <div className="wave-bg">
        <div className="wave-layer wave-layer-1" /><div className="wave-layer wave-layer-2" /><div className="wave-layer wave-layer-3" />
      </div>
      <form onSubmit={handleSubmit} style={{ position: 'relative', zIndex: 1, background: 'white', borderRadius: 24, padding: 40, width: '100%', maxWidth: 480, boxShadow: '0 12px 50px rgba(0,0,0,0.15)' }}>
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'Montserrat', fontWeight: 800, fontSize: 24, color: '#1B3A8A', marginBottom: 8 }}>Daftar Penyedia Mesin</h2>
          <p style={{ fontFamily: 'Montserrat', fontSize: 14, color: '#64748b' }}>Bergabung dengan ekosistem Smart Dispenser Prasmul</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Nama Lengkap</label>
            <input name="fullName" value={formData.fullName} onChange={handleChange} required placeholder="Budi Santoso"
              style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontFamily: 'Montserrat', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Institusi/Perusahaan</label>
            <input name="institutionName" value={formData.institutionName} onChange={handleChange} required placeholder="CV. Maju Jaya"
              style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontFamily: 'Montserrat', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Email Bisnis</label>
          <input name="email" value={formData.email} onChange={handleChange} type="email" required placeholder="budi@perusahaan.com"
            style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontFamily: 'Montserrat', outline: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Nomor Telepon / WhatsApp</label>
          <input name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} type="tel" required placeholder="081234567890"
            style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontFamily: 'Montserrat', outline: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Password</label>
            <input name="password" value={formData.password} onChange={handleChange} type="password" required
              style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontFamily: 'Montserrat', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Konfirmasi Password</label>
            <input name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} type="password" required
              style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontFamily: 'Montserrat', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{error}</p>}
        
        <button type="submit" disabled={loading}
          style={{ width: '100%', background: '#1B3A8A', color: 'white', border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 16, fontWeight: 700, fontFamily: 'Montserrat', cursor: 'pointer', transition: 'all 0.2s', opacity: loading ? 0.7 : 1, boxShadow: '0 4px 12px rgba(27, 58, 138, 0.3)' }}>
          {loading ? 'Memproses...' : 'Daftar Sekarang'}
        </button>

        <p style={{ marginTop: 24, textAlign: 'center', fontFamily: 'Montserrat', fontSize: 13, color: '#64748b' }}>
          Sudah punya akun? <Link href="/admin" style={{ color: '#1B3A8A', fontWeight: 700, textDecoration: 'none' }}>Login di sini</Link>
        </p>
      </form>
    </div>
  )
}
