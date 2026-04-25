'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, Droplets } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type RefillHistory } from '@/store/appStore';
import { api } from '@/lib/api';

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<RefillHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<RefillHistory[]>('/api/user/history')
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100">
        <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-slate-100">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h1 className="text-base font-semibold text-slate-800">Refill History</h1>
      </div>
      <div className="max-w-lg mx-auto px-4 py-4 space-y-2.5">
        {loading && [1,2,3,4,5].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-slate-200 animate-pulse" />
        ))}
        {!loading && history.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">No refill history yet</div>
        )}
        {!loading && history.map((item) => (
          <div key={item.id} className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
              <Droplets size={18} className="text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{item.stationName}</p>
              <p className="text-xs text-slate-400">{item.waterType}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-slate-700">-{item.currency} {item.amount.toLocaleString('id-ID')}</p>
              <p className="text-[10px] text-slate-400">{item.date}, {item.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
