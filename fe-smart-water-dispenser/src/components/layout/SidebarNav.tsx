'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, QrCode, BarChart2, User } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

const navItems = [
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/scan', label: 'Scan', icon: QrCode },
  { href: '/stats', label: 'Stats', icon: BarChart2 },
  { href: '/profile', label: 'Profile', icon: User },
];

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function SidebarNav() {
  const pathname = usePathname();
  const guest = useAppStore((s) => s.guest);

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-60 bg-white border-r border-slate-200 z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 h-16 border-b border-slate-100">
        <EcoFlowLogo size={32} />
        <span className="text-primary-800 font-bold text-lg tracking-tight">Eco-Flow</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-primary-50 text-primary-800 border-l-[3px] border-primary-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Guest info */}
      {guest && (
        <div className="px-4 py-4 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-600 to-eco-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
              {getInitials(guest.displayName)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{guest.displayName}</p>
              <p className="text-[11px] text-slate-400 font-mono">ID: {guest.displayId}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export function EcoFlowLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      {/* Outer circuit ring */}
      <circle cx="50" cy="50" r="44" stroke="#7DD3E8" strokeWidth="1.5" strokeDasharray="4 3" fill="none" opacity="0.6"/>
      {/* Leaf */}
      <path d="M35 65 C35 45 55 30 65 28 C63 38 58 50 48 58 C44 61 40 63 35 65Z" fill="#5BA83A"/>
      {/* Water drop */}
      <path d="M58 30 C58 30 70 48 70 58 C70 65 64.5 70 58 70 C51.5 70 46 65 46 58 C46 48 58 30 58 30Z" fill="#3B82F6"/>
      {/* Dots on ring */}
      <circle cx="50" cy="6" r="2" fill="#7DD3E8" opacity="0.8"/>
      <circle cx="94" cy="50" r="2" fill="#7DD3E8" opacity="0.8"/>
      <circle cx="50" cy="94" r="2" fill="#7DD3E8" opacity="0.8"/>
      <circle cx="6" cy="50" r="2" fill="#7DD3E8" opacity="0.8"/>
    </svg>
  );
}
