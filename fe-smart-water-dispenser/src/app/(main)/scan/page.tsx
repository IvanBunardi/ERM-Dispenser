'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Image as ImageIcon, Keyboard, X, CameraOff } from 'lucide-react';

type CameraStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported';

export default function ScanPage() {
  const router = useRouter();

  // ── Shared refs ──
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State ──
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [flash, setFlash] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [detected, setDetected] = useState(false);
  const [desktopTab, setDesktopTab] = useState<'webcam' | 'manual'>('webcam');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  // ── Start camera ──
  const startCamera = useCallback(async (facingMode: 'environment' | 'user' = 'environment') => {
    setStatus('requesting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // Check torch
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
      setTorchSupported(!!caps?.torch);
      setStatus('active');
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setStatus('denied');
      } else {
        setStatus('unsupported');
      }
    }
  }, []);

  // ── Stop camera ──
  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // ── Mount / unmount ──
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // ── QR scan loop ──
  useEffect(() => {
    if (status !== 'active' || detected) return;

    let running = true;

    const loop = async () => {
      if (!running || !videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return; }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      try {
        const { default: jsQR } = await import('jsqr');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (result?.data) {
          setDetected(true);
          running = false;
          if (navigator.vibrate) navigator.vibrate(100);
          stopCamera();
          setTimeout(() => {
            router.push(`/scan/result?code=${encodeURIComponent(result.data)}`);
          }, 400);
          return;
        }
      } catch {
        // jsQR not available or failed — silent
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [status, detected, router, stopCamera]);

  // ── Toggle flash/torch ──
  const toggleFlash = async () => {
    if (!streamRef.current || !torchSupported) return;
    const track = streamRef.current.getVideoTracks()[0];
    const next = !flash;
    await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
    setFlash(next);
  };

  // ── Gallery / file upload ──
  const handleGallery = () => fileInputRef.current?.click();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await new Promise(res => { img.onload = res; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { default: jsQR } = await import('jsqr');
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    URL.revokeObjectURL(url);
    if (result?.data) {
      stopCamera();
      router.push(`/scan/result?code=${encodeURIComponent(result.data)}`);
    } else {
      alert('No QR code found in the image. Please try again.');
    }
    e.target.value = '';
  };

  // ── Manual code submit ──
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) { setCodeError('Min. 4 characters'); return; }
    router.push(`/scan/result?code=${code.trim().toUpperCase()}`);
  };

  return (
    <div className="relative flex flex-col" style={{ height: '100dvh', background: '#000' }}>

      {/* ═══════════════════════════════════════════
          MOBILE — full-screen camera
      ═══════════════════════════════════════════ */}
      <div className="md:hidden relative flex-1 overflow-hidden">

        {/* Camera video feed */}
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: status === 'active' ? 'block' : 'none' }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Dark overlay — outside QR zone (via box-shadow on frame) */}
        <div className="absolute inset-0 bg-black/40" />

        {/* ── States: requesting / denied / unsupported ── */}
        {status === 'requesting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
            <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-sm text-white/80">Requesting camera access...</p>
          </div>
        )}

        {(status === 'denied' || status === 'unsupported') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-8 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
              <CameraOff size={30} className="text-white/70" />
            </div>
            <div>
              <p className="font-semibold">Camera access {status === 'denied' ? 'denied' : 'unavailable'}</p>
              <p className="text-xs text-white/60 mt-1">
                {status === 'denied'
                  ? 'Please allow camera access in your browser settings.'
                  : 'Your browser does not support camera access.'}
              </p>
            </div>
            {status === 'denied' && (
              <button onClick={() => startCamera()} className="bg-white text-black font-semibold text-sm px-5 py-2.5 rounded-full">
                Try Again
              </button>
            )}
          </div>
        )}

        {/* ── Detected flash ── */}
        {detected && (
          <div className="absolute inset-0 bg-white/30 animate-pulse" />
        )}

        {/* ── Title ── */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 pb-4 z-10">
          <div className="w-8" />
          <h1 className="text-white text-base font-semibold tracking-wide drop-shadow">Scan QR Code</h1>
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center"
          >
            <X size={16} className="text-white" />
          </button>
        </div>

        {/* ── QR Frame (center of screen) ── */}
        <div className="absolute inset-0 flex items-center justify-center z-10" style={{ paddingBottom: '100px' }}>
          <div
            className="relative"
            style={{
              width: 240,
              height: 240,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
              borderRadius: 12,
            }}
          >
            {/* Corner brackets */}
            <span className="absolute top-0 left-0 w-9 h-9 border-t-[3px] border-l-[3px] border-white rounded-tl-xl bracket-pulse" />
            <span className="absolute top-0 right-0 w-9 h-9 border-t-[3px] border-r-[3px] border-white rounded-tr-xl bracket-pulse" />
            <span className="absolute bottom-0 left-0 w-9 h-9 border-b-[3px] border-l-[3px] border-white rounded-bl-xl bracket-pulse" />
            <span className="absolute bottom-0 right-0 w-9 h-9 border-b-[3px] border-r-[3px] border-white rounded-br-xl bracket-pulse" />

            {/* Scan line */}
            <div className="absolute left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-transparent via-white to-transparent scan-line opacity-90" />
          </div>
        </div>

        {/* ── Instruction + buttons ── */}
        <div
          className="absolute left-0 right-0 flex flex-col items-center z-10"
          style={{ bottom: '80px' }}
        >
          <p className="text-white/75 text-sm text-center mb-8 px-8 leading-relaxed drop-shadow">
            {detected
              ? '✓ QR Code detected!'
              : 'Align the QR code within the frame to scan'}
          </p>

          <div className="flex gap-12">
            {/* Flash */}
            <button onClick={toggleFlash} className="flex flex-col items-center gap-2">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                flash ? 'bg-yellow-400' : 'bg-white/20 backdrop-blur border border-white/30'
              }`}>
                <Zap size={22} className={flash ? 'text-yellow-900' : 'text-white'} fill={flash ? '#78350f' : 'none'} />
              </div>
              <span className="text-white/80 text-xs font-medium drop-shadow">Flash</span>
            </button>

            {/* Gallery */}
            <button onClick={handleGallery} className="flex flex-col items-center gap-2">
              <div className="w-14 h-14 bg-white/20 backdrop-blur border border-white/30 rounded-full flex items-center justify-center shadow-lg">
                <ImageIcon size={22} className="text-white" />
              </div>
              <span className="text-white/80 text-xs font-medium drop-shadow">Gallery</span>
            </button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* ═══════════════════════════════════════════
          DESKTOP — contained layout
      ═══════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col flex-1" style={{ background: '#1B3A8A' }}>
        {/* Header */}
        <div className="text-center pt-10 pb-4">
          <h1 className="text-white text-lg font-semibold tracking-wide">Scan QR Code</h1>
        </div>

        <div className="flex flex-1 items-center justify-center px-8 pb-12">
          <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 w-full max-w-md">
            {/* Tab */}
            <div className="flex bg-white/10 rounded-2xl p-1 mb-7">
              {(['webcam', 'manual'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDesktopTab(tab)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    desktopTab === tab ? 'bg-white text-primary-800' : 'text-white/70 hover:text-white'
                  }`}
                >
                  {tab === 'webcam' ? 'Scan via Webcam' : 'Enter Code'}
                </button>
              ))}
            </div>

            {desktopTab === 'webcam' ? (
              <DesktopCamera
                videoRef={videoRef}
                canvasRef={canvasRef}
                status={status}
                detected={detected}
                flash={flash}
                torchSupported={torchSupported}
                onToggleFlash={toggleFlash}
                onGallery={handleGallery}
                onRetry={() => startCamera('user')}
                fileInputRef={fileInputRef}
                onFileChange={handleFileChange}
              />
            ) : (
              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">Station Code</label>
                  <input
                    value={code}
                    onChange={e => { setCode(e.target.value.toUpperCase().slice(0, 8)); setCodeError(''); }}
                    placeholder="e.g. PRASMUL1"
                    className="w-full bg-white/10 border-2 border-white/20 text-white placeholder:text-white/30 rounded-2xl px-4 py-3 font-mono text-lg tracking-widest text-center uppercase focus:outline-none focus:border-white/60 transition-colors"
                    maxLength={8}
                  />
                  {codeError && <p className="text-red-300 text-xs mt-1.5">{codeError}</p>}
                </div>
                <p className="text-white/50 text-xs text-center">
                  Find the code printed on the dispenser label
                </p>
                <button
                  type="submit"
                  disabled={!code.trim()}
                  className="w-full bg-white text-primary-800 font-semibold py-3 rounded-2xl hover:bg-primary-50 transition-colors disabled:opacity-40"
                >
                  Verify Code
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Desktop webcam sub-component ──
function DesktopCamera({
  videoRef, canvasRef, status, detected, flash, torchSupported,
  onToggleFlash, onGallery, onRetry, fileInputRef, onFileChange,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  status: CameraStatus;
  detected: boolean;
  flash: boolean;
  torchSupported: boolean;
  onToggleFlash: () => void;
  onGallery: () => void;
  onRetry: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Camera box */}
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/40">
        <video
          ref={videoRef}
          muted playsInline autoPlay
          className="w-full h-full object-cover"
          style={{ display: status === 'active' ? 'block' : 'none' }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {status === 'requesting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-xs text-white/70">Starting camera...</p>
          </div>
        )}
        {(status === 'denied' || status === 'unsupported') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-4 text-center gap-3">
            <CameraOff size={28} className="text-white/50" />
            <p className="text-xs text-white/60">
              {status === 'denied' ? 'Camera blocked. Allow in browser settings.' : 'Camera not supported.'}
            </p>
            {status === 'denied' && (
              <button onClick={onRetry} className="text-xs bg-white/20 px-4 py-1.5 rounded-full text-white">
                Try Again
              </button>
            )}
          </div>
        )}
        {status === 'active' && (
          <>
            {/* Frame overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-32 h-32">
                <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl-md" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr-md" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl-md" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br-md" />
                {!detected && (
                  <div className="absolute left-1 right-1 h-px bg-gradient-to-r from-transparent via-white to-transparent scan-line" />
                )}
              </div>
            </div>
            {detected && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <p className="text-white font-semibold text-sm">✓ QR Detected!</p>
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-white/60 text-xs text-center">
        Point your webcam at the QR code on the dispenser
      </p>

      {/* Buttons */}
      <div className="flex gap-3">
        {torchSupported && (
          <button
            onClick={onToggleFlash}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              flash ? 'bg-yellow-400 text-yellow-900' : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            <Zap size={15} />
            Flash {flash ? 'On' : 'Off'}
          </button>
        )}
        <button
          onClick={onGallery}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/20 text-white hover:bg-white/30 transition-colors flex items-center justify-center gap-2"
        >
          <ImageIcon size={15} />
          From Gallery
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
