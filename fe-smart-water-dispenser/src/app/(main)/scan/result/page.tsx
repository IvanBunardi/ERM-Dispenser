'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Droplets, CheckCircle } from 'lucide-react';
import { Suspense } from 'react';

const VOLUMES = [
  { label: '250ml', value: 250, price: 1000 },
  { label: '500ml', value: 500, price: 1500 },
  { label: '750ml', value: 750, price: 2000 },
  { label: '1000ml', value: 1000, price: 2500 },
];

function ScanResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('code') || 'PRASMUL1';
  const [selected, setSelected] = useState(1); // 500ml default
  const [dispensing, setDispensing] = useState(false);
  const [done, setDone] = useState(false);

  const handleStart = () => {
    setDispensing(true);
    setTimeout(() => { setDone(true); }, 800);
    setTimeout(() => { router.push('/explore'); }, 3000);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-eco-100 flex items-center justify-center mb-6">
          <CheckCircle size={40} className="text-eco-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Dispensing Started!</h2>
        <p className="text-slate-500 text-sm">Hold your bottle under the dispenser nozzle</p>
        <p className="text-slate-400 text-xs mt-4">Redirecting in a moment...</p>
      </div>
    );
  }

  const vol = VOLUMES[selected];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100">
        <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h1 className="text-base font-semibold text-slate-800">Confirm Refill</h1>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Station info */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
              <Droplets size={24} className="text-primary-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Station Code</p>
              <h3 className="font-bold text-slate-800 font-mono">{code}</h3>
            </div>
            <div className="ml-auto">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-eco-500" />
                <span className="text-xs font-medium text-eco-600">Available</span>
              </div>
              <p className="text-xs text-slate-400 text-right mt-0.5">92% Full</p>
            </div>
          </div>
        </div>

        {/* Volume selection */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Select Volume</h3>
          <div className="grid grid-cols-2 gap-3">
            {VOLUMES.map((v, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                  selected === i
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className={`text-lg font-bold ${selected === i ? 'text-primary-800' : 'text-slate-700'}`}>
                  {v.label}
                </p>
                <p className={`text-xs mt-0.5 ${selected === i ? 'text-primary-600' : 'text-slate-400'}`}>
                  IDR {v.price.toLocaleString('id-ID')}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Volume</span>
            <span className="font-semibold text-slate-800">{vol.label}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Price</span>
            <span className="font-semibold text-slate-800">IDR {vol.price.toLocaleString('id-ID')}</span>
          </div>
          <div className="border-t border-slate-100 pt-3 flex justify-between text-sm">
            <span className="text-slate-400 text-xs">Charged after dispense</span>
            <span className="text-xs text-slate-400">Eco-Flow wallet</span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleStart}
          disabled={dispensing}
          className="w-full bg-primary-800 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-primary-700 transition-colors disabled:opacity-70"
        >
          <Droplets size={18} />
          {dispensing ? 'Starting...' : 'Start Dispensing'}
        </button>
      </div>
    </div>
  );
}

export default function ScanResultPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <ScanResultContent />
    </Suspense>
  );
}
