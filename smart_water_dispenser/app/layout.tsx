import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Eco-Flow Smart Dispenser',
  description: 'Smart Hydration - Sustainable Future',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}