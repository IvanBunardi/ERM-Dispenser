'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { EcoFlowLogo } from '@/components/layout/SidebarNav';

const STEPS = [
  { pct: 20, label: 'Connecting to network...' },
  { pct: 50, label: 'Initializing station...' },
  { pct: 80, label: 'Loading stations near you...' },
  { pct: 100, label: 'Ready!' },
];

export default function SplashPage() {
  const router = useRouter();
  const { initGuest, isInitialized } = useAppStore();
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState('Connecting to network...');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    initGuest();

    let stepIdx = 0;
    const tick = () => {
      if (stepIdx >= STEPS.length) return;
      const step = STEPS[stepIdx];
      setProgress(step.pct);
      setStepLabel(step.label);
      stepIdx++;
      if (stepIdx < STEPS.length) {
        setTimeout(tick, stepIdx === 1 ? 500 : stepIdx === 2 ? 400 : 350);
      } else {
        setTimeout(() => router.push('/explore'), 600);
      }
    };
    setTimeout(tick, 400);
  }, []);

  return (
    <div className="relative min-h-screen bg-white flex flex-col items-center justify-center overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-0 left-0 w-48 h-64 bg-slate-100 rounded-br-[80px] rounded-tr-[80px] opacity-70" />
      <div className="absolute bottom-0 right-0 w-52 h-72 bg-slate-100 rounded-tl-[80px] rounded-bl-[80px] opacity-70" />

      {/* Center card */}
      <div className={`relative z-10 flex flex-col items-center transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}>
        {/* Logo */}
        <div className="mb-10" style={{ animationDelay: '0ms' }}>
          <div className={`transition-all duration-600 ${visible ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}>
            <EcoFlowLogo size={120} />
          </div>
        </div>

        {/* Title */}
        <div className={`text-center mb-12 transition-all duration-500 delay-200 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}>
          <h1 className="text-4xl font-extrabold text-primary-800 tracking-tight">Eco-Flow</h1>
          <p className="text-slate-500 text-base mt-1.5 font-normal">Pure Hydration, Zero Waste</p>
        </div>

        {/* Progress */}
        <div className={`w-64 transition-all duration-500 delay-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-slate-400 font-medium">{stepLabel}</span>
            <span className="text-xs text-slate-400 font-medium">{progress}%</span>
          </div>
          <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-800 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
