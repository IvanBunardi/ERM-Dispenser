'use client';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-primary-700' : 'bg-slate-300'}`}>
      <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200" style={{ left: checked ? '22px' : '2px' }} />
    </button>
  );
}

export default function PrivacyPage() {
  const router = useRouter();
  const preferences = useAppStore((s) => s.preferences);
  const updatePreferences = useAppStore((s) => s.updatePreferences);
  const [saving, setSaving] = useState(false);

  const toggleLeaderboard = async () => {
    setSaving(true);
    try {
      await updatePreferences({ publicLeaderboard: !preferences.publicLeaderboard });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100 sticky top-0">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <h1 className="text-base font-semibold text-slate-800 flex-1 text-center">Privacy & Social</h1>
        <div className="w-9" />
      </div>
      <div className="max-w-md mx-auto px-4 py-5 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">Leaderboard Visibility</p>
              <p className="text-xs text-slate-400 mt-0.5">Show your name on campus leaderboard</p>
            </div>
            <Toggle checked={preferences.publicLeaderboard} onChange={() => { void toggleLeaderboard(); }} />
          </div>
        </div>
        {saving && <p className="text-xs text-slate-400 px-1">Saving preference...</p>}
        <p className="text-xs text-slate-400 px-1">
          Eco-Flow does not require registration. Your data is linked to your browser session only and is not shared with third parties.
        </p>
      </div>
    </div>
  );
}
