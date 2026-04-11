'use client';
import { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';

const LANGS = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'id', label: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'zh', label: 'Chinese', native: '中文' },
];

export default function LanguagePage() {
  const router = useRouter();
  const [selected, setSelected] = useState('en');

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100 sticky top-0">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <h1 className="text-base font-semibold text-slate-800 flex-1 text-center">Language</h1>
        <div className="w-9" />
      </div>
      <div className="max-w-md mx-auto px-4 py-5">
        <div className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {LANGS.map((lang) => (
            <button key={lang.code} onClick={() => setSelected(lang.code)} className="w-full flex items-center gap-3 px-4 py-4 hover:bg-slate-50 transition-colors text-left">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{lang.label}</p>
                <p className="text-xs text-slate-400">{lang.native}</p>
              </div>
              {selected === lang.code && <Check size={18} className="text-primary-700 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
