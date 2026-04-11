'use client';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-primary-700' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${checked ? 'left-5.5' : 'left-0.5'}`}
        style={{ left: checked ? '22px' : '2px' }}
      />
    </button>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState({
    stationRefill: true,
    weeklyStats: true,
    promotions: false,
    lowCapacity: true,
  });

  const toggle = (key: keyof typeof settings) => setSettings(s => ({ ...s, [key]: !s[key] }));

  const items = [
    { key: 'stationRefill' as const, label: 'Station Refilled', desc: 'When a nearby station is restocked' },
    { key: 'weeklyStats' as const, label: 'Weekly Stats', desc: 'Your weekly environmental impact summary' },
    { key: 'lowCapacity' as const, label: 'Low Capacity Alert', desc: 'When favorite stations are running low' },
    { key: 'promotions' as const, label: 'Promotions', desc: 'Special offers and new features' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100 sticky top-0">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <h1 className="text-base font-semibold text-slate-800 flex-1 text-center">Notifications</h1>
        <div className="w-9" />
      </div>
      <div className="max-w-md mx-auto px-4 py-5">
        <div className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {items.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center gap-3 px-4 py-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
              </div>
              <Toggle checked={settings[key]} onChange={() => toggle(key)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
