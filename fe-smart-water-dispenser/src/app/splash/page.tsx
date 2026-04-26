'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAppStore } from '@/store/appStore';
import PermissionPrompt from '@/components/shared/PermissionPrompt';

type PermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

const STEPS = [
  { pct: 28, label: 'Preparing app...' },
  { pct: 62, label: 'Checking access...' },
  { pct: 100, label: 'Opening stations...' },
];

async function getPermissionState(name: 'geolocation' | 'camera'): Promise<PermissionState> {
  if (typeof navigator === 'undefined') return 'unsupported';

  if (name === 'geolocation' && !navigator.geolocation) {
    return 'unsupported';
  }

  if (name === 'camera' && !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }

  const permissionsApi = navigator.permissions as
    | { query?: (descriptor: PermissionDescriptor) => Promise<{ state: PermissionState | PermissionStatus['state'] }> }
    | undefined;
  if (!permissionsApi?.query) return 'prompt';

  try {
    const result = await permissionsApi.query({ name } as PermissionDescriptor);
    if (result.state === 'granted' || result.state === 'prompt' || result.state === 'denied') {
      return result.state;
    }
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

export default function SplashPage() {
  const router = useRouter();
  const { initGuest, updatePermissionPrefs } = useAppStore();
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState('Preparing app...');
  const [visible, setVisible] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [locationState, setLocationState] = useState<PermissionState>('prompt');
  const [cameraState, setCameraState] = useState<PermissionState>('prompt');
  const navigatedRef = useRef(false);

  useEffect(() => {
    setVisible(true);

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      for (const step of STEPS) {
        setProgress(step.pct);
        setStepLabel(step.label);
        await new Promise((resolve) => {
          timeoutId = setTimeout(resolve, step.pct === 28 ? 450 : 360);
        });
        if (cancelled) return;
      }

      await initGuest();
      if (cancelled) return;

      const [nextLocationState, nextCameraState] = await Promise.all([
        getPermissionState('geolocation'),
        getPermissionState('camera'),
      ]);
      if (cancelled) return;

      setLocationState(nextLocationState);
      setCameraState(nextCameraState);

      const locationEnabled = nextLocationState === 'granted';
      const cameraEnabled = nextCameraState === 'granted';

      updatePermissionPrefs({
        hasSeenPrompt: false,
        locationEnabled,
        cameraEnabled,
      });

      if (locationEnabled && cameraEnabled) {
        navigatedRef.current = true;
        router.replace('/explore');
        return;
      }

      setShowPrompt(true);
    };

    void run();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [initGuest, router, updatePermissionPrefs]);

  const handlePermissionComplete = ({
    locationEnabled,
    cameraEnabled,
  }: {
    locationEnabled: boolean;
    cameraEnabled: boolean;
  }) => {
    if (navigatedRef.current) return;

    updatePermissionPrefs({
      hasSeenPrompt: true,
      locationEnabled,
      cameraEnabled,
    });
    setShowPrompt(false);
    navigatedRef.current = true;
    router.replace('/explore');
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_52%,#f3faf6_100%)]">
      <div className="absolute left-0 top-0 h-56 w-56 rounded-br-[96px] bg-primary-50/90" />
      <div className="absolute bottom-0 right-0 h-64 w-64 rounded-tl-[96px] bg-emerald-50/90" />
      <div className="absolute left-1/2 top-12 h-32 w-32 -translate-x-1/2 rounded-full bg-cyan-100/60 blur-3xl" />

      <div
        className={`relative z-10 flex flex-col items-center transition-all duration-700 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        <div className="mb-10 rounded-[32px] bg-white/80 p-5 shadow-[0_24px_70px_rgba(37,99,235,0.08)] backdrop-blur">
          <Image src="/logo.png" alt="Eco-Flow Logo" width={96} height={96} priority style={{ height: 'auto' }} />
        </div>

        <div className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-primary-800">Eco-Flow</h1>
          <p className="mt-1.5 text-sm text-slate-500">Pure Hydration, Zero Waste</p>
        </div>

        <div className="w-72">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">{stepLabel}</span>
            <span className="text-xs font-medium text-slate-400">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#1d4ed8_0%,#0ea5e9_48%,#22c55e_100%)] transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <PermissionPrompt
        open={showPrompt}
        locationState={locationState}
        cameraState={cameraState}
        onComplete={handlePermissionComplete}
      />
    </div>
  );
}
