'use client';
import { useEffect } from 'react';
import SidebarNav from '@/components/layout/SidebarNav';
import BottomNav from '@/components/layout/BottomNav';
import { useAppStore } from '@/store/appStore';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { guest, initGuest, isInitialized } = useAppStore();

  useEffect(() => {
    // If not initialized (e.g. direct link to profile or scan result), init now
    if (!isInitialized && !guest) {
      initGuest();
    }
  }, [isInitialized, guest, initGuest]);

  return (
    <div className="flex h-full min-h-screen">
      <SidebarNav />
      <main className="flex-1 md:ml-60 min-h-screen">
        {children}
        <div className="h-36 md:hidden" />
      </main>
      <BottomNav />
    </div>
  );
}
