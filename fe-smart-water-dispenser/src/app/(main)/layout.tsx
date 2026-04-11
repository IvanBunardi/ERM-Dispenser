'use client';
import SidebarNav from '@/components/layout/SidebarNav';
import BottomNav from '@/components/layout/BottomNav';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-screen">
      <SidebarNav />
      <main className="flex-1 md:ml-60 pb-16 md:pb-0 min-h-screen">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
