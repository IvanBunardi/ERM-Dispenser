'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Compass, QrCode, BarChart2, User } from 'lucide-react';
import { Suspense } from 'react';

const tabs = [
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/scan', label: 'Scan', icon: QrCode },
  { href: '/stats', label: 'Stats', icon: BarChart2 },
  { href: '/profile', label: 'Profile', icon: User },
];

function BottomNavContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isTabletMode = searchParams.get('mode') === 'tablet';

  if (isTabletMode) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 md:hidden"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around h-16">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href}
              className="flex flex-col items-center gap-0.5 flex-1 py-2 transition-colors"
            >
              <Icon size={active ? 22 : 20}
                className={active ? 'text-primary-800' : 'text-slate-400'}
                strokeWidth={active ? 2.5 : 1.8}
              />
              <span className={`text-[10px] font-medium ${active ? 'text-primary-800' : 'text-slate-400'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavContent />
    </Suspense>
  );
}
