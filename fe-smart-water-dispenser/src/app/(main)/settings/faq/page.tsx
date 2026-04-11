'use client';
import { useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

const FAQS = [
  { q: 'What is a Guest ID?', a: 'Your Guest ID is a unique 6-character code that identifies your session. It is automatically created when you first open Eco-Flow. No registration needed!' },
  { q: 'How do I keep my history?', a: "Your history is stored in your browser's cookies. Don't clear your cookies or browse in private/incognito mode to keep your data." },
  { q: 'How do I refill water?', a: 'Find a nearby station on the Explore page, then tap Scan on the bottom bar and align the QR code on the dispenser within the frame.' },
  { q: 'How is the price calculated?', a: 'Prices are based on volume: 250ml = IDR 1,000, 500ml = IDR 1,500, 750ml = IDR 2,000, 1L = IDR 2,500. Payment is processed after dispensing.' },
  { q: 'What eco levels are available?', a: 'There are 5 levels: Seedling (0–49 bottles), Sprout (50–149), Sapling (150–299), Tree (300–599), and Emerald (600+).' },
];

export default function FAQPage() {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100 sticky top-0">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <h1 className="text-base font-semibold text-slate-800 flex-1 text-center">FAQ</h1>
        <div className="w-9" />
      </div>
      <div className="max-w-md mx-auto px-4 py-5">
        <div className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {FAQS.map((faq, i) => (
            <div key={i}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                <p className="flex-1 text-sm font-medium text-slate-800">{faq.q}</p>
                <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 flex-shrink-0 ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-slate-500 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
