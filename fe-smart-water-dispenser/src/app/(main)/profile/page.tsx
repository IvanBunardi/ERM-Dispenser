'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Settings, Pencil, Check, X, Copy, Tag, CreditCard, Droplets } from 'lucide-react';
import { useAppStore, type RefillHistory } from '@/store/appStore';
import { api } from '@/lib/api';

function getInitials(name: string) {
  return name.split(/[\s_]/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const ECO_RING: Record<string, string> = {
  Seedling: 'ring-slate-300',
  Sprout: 'ring-green-300',
  Sapling: 'ring-green-500',
  Tree: 'ring-emerald-500',
  Emerald: 'ring-teal-500',
};

export default function ProfilePage() {
  const { guest, updateDisplayName, refreshGuest } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(guest?.displayName ?? '');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<RefillHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    api.get<RefillHistory[]>('/api/user/history')
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  const handleSave = async () => {
    const trimmed = nameInput.trim();
    if (trimmed.length < 1) return;
    setSaving(true);
    try {
      await updateDisplayName(trimmed);
      setEditing(false);
      await refreshGuest();
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setNameInput(guest?.displayName ?? '');
    setEditing(false);
  };

  const copyId = () => {
    if (guest) {
      navigator.clipboard.writeText(guest.displayId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!guest) return <div className="min-h-screen bg-slate-100 animate-pulse" />;

  const ringClass = ECO_RING[guest.ecoLevel] ?? 'ring-slate-300';
  const sinceDate = new Date(guest.createdAt);
  const sinceStr = sinceDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-3xl mx-auto px-4">

        {/* Header */}
        <div className="flex items-center justify-between py-4 md:py-6">
          <h1 className="text-lg font-bold text-primary-800 md:text-xl">Profile</h1>
          <Link href="/settings" className="p-2 rounded-full hover:bg-white/60 transition-colors">
            <Settings size={20} className="text-primary-600" />
          </Link>
        </div>

        {/* Layout: single col mobile, grid desktop */}
        <div className="md:grid md:grid-cols-[280px_1fr] md:gap-6">

          {/* Left: identity card */}
          <div className="space-y-4">
            {/* Avatar + name */}
            <div className="bg-white rounded-3xl p-6 flex flex-col items-center text-center shadow-sm">
              <div className={`w-20 h-20 rounded-full bg-gradient-to-br from-primary-600 to-eco-500 flex items-center justify-center text-white text-2xl font-bold ring-4 ${ringClass} ring-offset-2 mb-3`}>
                {getInitials(guest.displayName)}
              </div>

              {editing ? (
                <div className="flex items-center gap-2 w-full max-w-[200px]">
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value.slice(0, 32))}
                    className="flex-1 text-center text-base font-bold text-slate-800 border-b-2 border-primary-500 bg-transparent focus:outline-none"
                    autoFocus
                    maxLength={32}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
                  />
                  <button onClick={handleSave} disabled={saving} className="p-1 rounded-full bg-eco-100 text-eco-600 disabled:opacity-50">
                    <Check size={14} />
                  </button>
                  <button onClick={handleCancel} className="p-1 rounded-full bg-slate-100 text-slate-500">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h2 className="text-xl font-bold text-slate-800">{guest.displayName}</h2>
                  <button onClick={() => { setEditing(true); setNameInput(guest.displayName); }} className="p-1 rounded-full hover:bg-slate-100 transition-colors">
                    <Pencil size={13} className="text-slate-400" />
                  </button>
                </div>
              )}

              <p className="text-xs text-slate-400 mt-1">Eco-Guardian since {sinceStr}</p>

              <button
                onClick={copyId}
                className="mt-3 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 transition-colors rounded-full px-3 py-1"
              >
                <span className="text-xs text-slate-500 font-mono font-medium">ID: {guest.displayId}</span>
                <Copy size={11} className={copied ? 'text-eco-500' : 'text-slate-400'} />
              </button>
              {copied && <p className="text-[10px] text-eco-600 mt-1">Copied!</p>}
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <Tag size={20} className="text-primary-600 mb-2" />
                <p className="text-xs text-slate-400 font-medium">Saved</p>
                <p className="text-2xl font-extrabold text-slate-800">{guest.bottlesSaved}</p>
                <p className="text-[10px] font-bold text-eco-600 uppercase tracking-wide mt-0.5">Bottles</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <CreditCard size={20} className="text-primary-600 mb-2" />
                <p className="text-xs text-slate-400 font-medium">Spent</p>
                <p className="text-lg font-extrabold text-slate-800 leading-tight">
                  IDR {(guest.totalSpent).toLocaleString('id-ID')}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">Total</p>
              </div>
            </div>
          </div>

          {/* Right: history */}
          <div>
            <div className="flex items-center justify-between mt-4 md:mt-0 mb-3">
              <h3 className="text-base font-bold text-slate-800">Refill History</h3>
              <Link href="/profile/history" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
                View All
              </Link>
            </div>

            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-slate-200 animate-pulse" />)}
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm bg-white rounded-2xl">No refill history yet</div>
            ) : (
              <div className="space-y-2.5">
                {history.slice(0, 3).map((h) => (
                  <HistoryItem key={h.id} item={h} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}

function HistoryItem({ item }: { item: RefillHistory }) {
  return (
    <div className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
        <Droplets size={18} className="text-primary-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{item.stationName}</p>
        <p className="text-xs text-slate-400">{item.waterType}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-red-500">
          -{item.currency} {item.amount.toLocaleString('id-ID')}
        </p>
        <p className="text-[10px] text-slate-400">{item.date}, {item.time}</p>
      </div>
    </div>
  );
}
