'use client';
import { ArrowLeft, Droplets } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MOCK_HISTORY } from '@/store/appStore';

export default function HistoryPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100">
        <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-slate-100">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h1 className="text-base font-semibold text-slate-800">Refill History</h1>
      </div>
      <div className="max-w-lg mx-auto px-4 py-4 space-y-2.5">
        {MOCK_HISTORY.map((item) => (
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
