'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

export default function SettingsProfilePage() {
  const router = useRouter();
  const { guest, updateDisplayName } = useAppStore();
  const [name, setName] = useState(guest?.displayName ?? '');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const isDirty = name !== guest?.displayName;
  const isValid = /^[\w\s\-]{1,32}$/.test(name.trim()) && name.trim().length > 0;

  const handleSave = () => {
    if (!isValid) { setError('Only letters, numbers, spaces, - and _ allowed (max 32 chars)'); return; }
    updateDisplayName(name.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    const def = `Guest_${guest?.displayId ?? 'USER'}`;
    setName(def);
    updateDisplayName(def);
  };

  const copyId = () => {
    if (guest) { navigator.clipboard.writeText(guest.displayId); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100 sticky top-0 z-10">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <h1 className="text-base font-semibold text-slate-800 flex-1 text-center">Profile</h1>
        <div className="w-9" />
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Display Name */}
        <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Display Name</h2>
          <div>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              maxLength={32}
              className="w-full border-2 border-slate-200 focus:border-primary-500 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none transition-colors"
            />
            <div className="flex justify-between mt-1">
              {error ? <p className="text-xs text-red-500">{error}</p> : (
                <p className="text-xs text-slate-400">Letters, numbers, spaces, - and _</p>
              )}
              <p className="text-xs text-slate-400">{name.length}/32</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">Your name is visible on the leaderboard if public profile is enabled.</p>

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Reset to Default
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty || !isValid}
              className="flex-1 py-2.5 rounded-xl bg-primary-800 text-white text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {saved ? <><Check size={14} /> Saved!</> : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Guest ID */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Your Guest ID</h2>
          <p className="text-xs text-slate-400 mb-4">This ID identifies your session. Keep it safe — losing cookies means losing your history.</p>
          <div className="flex items-center justify-between bg-slate-100 rounded-xl px-4 py-3">
            <span className="text-2xl font-bold font-mono text-slate-700 tracking-widest">{guest?.displayId}</span>
            <button onClick={copyId} className="p-2 rounded-lg hover:bg-slate-200 transition-colors">
              {copied ? <Check size={18} className="text-eco-500" /> : <Copy size={18} className="text-slate-500" />}
            </button>
          </div>
          {copied && <p className="text-xs text-eco-600 mt-2">Copied to clipboard!</p>}
        </div>
      </div>
    </div>
  );
}
