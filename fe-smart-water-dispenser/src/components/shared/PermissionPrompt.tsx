'use client';

import { Camera, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type PermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

async function requestCameraPermission() {
  if (!navigator.mediaDevices?.getUserMedia) return false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

async function requestLocationPermission() {
  if (!navigator.geolocation) return false;

  return new Promise<boolean>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

export default function PermissionPrompt({
  open,
  locationState,
  cameraState,
  onComplete,
}: {
  open: boolean;
  locationState: PermissionState;
  cameraState: PermissionState;
  onComplete: (result: { locationEnabled: boolean; cameraEnabled: boolean }) => void;
}) {
  const [requesting, setRequesting] = useState(false);
  const [locationWanted, setLocationWanted] = useState(locationState !== 'granted');
  const [cameraWanted, setCameraWanted] = useState(cameraState !== 'granted');

  const missingLocation = locationState !== 'granted';
  const missingCamera = cameraState !== 'granted';

  const title = useMemo(() => {
    if (missingLocation && missingCamera) return 'Enable quick access';
    if (missingLocation) return 'Enable location';
    return 'Enable camera';
  }, [missingCamera, missingLocation]);

  if (!open) return null;

  const finish = (locationEnabled: boolean, cameraEnabled: boolean) => {
    onComplete({ locationEnabled, cameraEnabled });
  };

  const handleContinue = async () => {
    setRequesting(true);

    let locationEnabled = locationState === 'granted';
    let cameraEnabled = cameraState === 'granted';

    if (missingLocation && locationWanted && locationState !== 'unsupported') {
      locationEnabled = await requestLocationPermission();
    }

    if (missingCamera && cameraWanted && cameraState !== 'unsupported') {
      cameraEnabled = await requestCameraPermission();
    }

    setRequesting(false);
    finish(locationEnabled, cameraEnabled);
  };

  const handleSkip = () => {
    finish(locationState === 'granted', cameraState === 'granted');
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/35 px-4 pb-5 md:items-center md:p-6">
      <div className="w-full max-w-md rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_62%,#f5faf7_100%)] p-5 shadow-[0_32px_96px_rgba(15,23,42,0.26)]">
        <div className="mb-4">
          <div className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-700">
            Eco-Flow Access
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-primary-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Turn on only what you need.
          </p>
        </div>

        <div className="space-y-3">
          {missingLocation && (
            <PermissionRow
              icon={<MapPin size={16} className="text-primary-700" />}
              title="Location"
              state={locationState}
              wanted={locationWanted}
              onToggle={() => setLocationWanted((value) => !value)}
            />
          )}

          {missingCamera && (
            <PermissionRow
              icon={<Camera size={16} className="text-emerald-700" />}
              title="Camera"
              state={cameraState}
              wanted={cameraWanted}
              onToggle={() => setCameraWanted((value) => !value)}
            />
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={handleSkip}
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            Skip
          </button>
          <button
            onClick={handleContinue}
            disabled={requesting}
            className="flex-1 rounded-2xl bg-primary-800 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-wait disabled:opacity-70"
          >
            {requesting ? 'Checking...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PermissionRow({
  icon,
  title,
  state,
  wanted,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  state: PermissionState;
  wanted: boolean;
  onToggle: () => void;
}) {
  const statusLabel =
    state === 'denied'
      ? 'Blocked'
      : state === 'unsupported'
        ? 'Unsupported'
        : wanted
          ? 'On'
          : 'Off';

  return (
    <div className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50">
          {icon}
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="text-xs text-slate-400">{statusLabel}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={state === 'unsupported'}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
          wanted ? 'bg-primary-800' : 'bg-slate-200'
        } ${state === 'unsupported' ? 'opacity-40' : ''}`}
      >
        <span
          className={`absolute h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            wanted ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
