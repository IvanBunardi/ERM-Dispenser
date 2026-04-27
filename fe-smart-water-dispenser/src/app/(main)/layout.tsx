'use client';
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import SidebarNav from '@/components/layout/SidebarNav';
import BottomNav from '@/components/layout/BottomNav';
import { useAppStore } from '@/store/appStore';

function MainLayoutContent({ children }: { children: React.ReactNode }) {
  const { guest, initGuest, isInitialized } = useAppStore();
  const searchParams = useSearchParams();
  const isTabletMode = searchParams.get('mode') === 'tablet';

  useEffect(() => {
    // If not initialized (e.g. direct link to profile or scan result), init now
    if (!isInitialized && !guest) {
      initGuest();
    }
  }, [isInitialized, guest, initGuest]);

  return (
    <div className="flex h-full min-h-screen">
      <SidebarNav />
      <main className={`flex-1 min-h-screen ${isTabletMode ? '' : 'md:ml-60'}`}>
        {children}
        {!isTabletMode && <div className="h-36 md:hidden" />}
      </main>
      <BottomNav />
    </div>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen">{children}</div>}>
      <MainLayoutContent>{children}</MainLayoutContent>
    </Suspense>
  );
}
