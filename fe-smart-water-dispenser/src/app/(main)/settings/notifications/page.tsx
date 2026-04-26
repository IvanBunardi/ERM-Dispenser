'use client';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';

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
  const preferences = useAppStore((s) => s.preferences);
  const updatePreferences = useAppStore((s) => s.updatePreferences);
  const [saving, setSaving] = useState(false);

  const toggleNotifications = async () => {
    const next = !preferences.notificationsEnabled;
    setSaving(true);
    try {
      await updatePreferences({ notificationsEnabled: next });
    } finally {
      setSaving(false);
    }
  };

  const items = [
    { label: 'Station status alerts', desc: 'Nearby station availability and low-capacity warnings' },
    { label: 'Dispense progress updates', desc: 'Payment confirmed, ready to fill, and completion events' },
    { label: 'Weekly eco summary', desc: 'Your environmental impact snapshot and milestones' },
    { label: 'Product updates', desc: 'Announcements about Eco-Flow features and service notices' },
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
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">Enable Notifications</p>
              <p className="text-xs text-slate-400 mt-0.5">Master switch for alerts and reminders</p>
            </div>
            <Toggle checked={preferences.notificationsEnabled} onChange={() => { void toggleNotifications(); }} />
          </div>
          {items.map(({ label, desc }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
              </div>
              <span className={`text-xs font-semibold ${preferences.notificationsEnabled ? 'text-eco-600' : 'text-slate-400'}`}>
                {preferences.notificationsEnabled ? 'On' : 'Off'}
              </span>
            </div>
          ))}
        </div>
        {saving && <p className="text-xs text-slate-400 mt-3 px-1">Saving preference...</p>}
      </div>
    </div>
  );
}
