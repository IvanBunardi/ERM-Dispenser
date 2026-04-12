'use client';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function AboutPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100 sticky top-0">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <h1 className="text-base font-semibold text-slate-800 flex-1 text-center">About</h1>
        <div className="w-9" />
      </div>
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center text-center">
        <Image src="/logo.png" alt="Eco-Flow" width={72} height={72} style={{ height: 'auto' }} />
        <h2 className="text-2xl font-extrabold text-primary-800 mt-4">Eco-Flow</h2>
        <p className="text-slate-500 text-sm mt-1">Pure Hydration, Zero Waste</p>
        <p className="text-xs text-slate-400 mt-1">Version 1.0.0</p>

        <div className="bg-white rounded-2xl p-5 shadow-sm mt-8 w-full text-left space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Mission</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Eco-Flow aims to reduce single-use plastic bottle consumption by providing accessible, affordable smart water dispensers across campuses and public spaces.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">How It Works</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              No registration needed. Open the app, find a nearby station, scan the QR code on the dispenser, choose your volume, and start dispensing.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Privacy</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Your identity is stored locally in your browser. We do not collect personally identifiable information.
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-400 mt-8">&copy; 2026 Eco-Flow. All rights reserved.</p>
      </div>
    </div>
  );
}
