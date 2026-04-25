'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Droplets, CheckCircle, AlertCircle, Loader2, QrCode } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import Image from 'next/image';

type PageState =
  | 'verifying'
  | 'ready'
  | 'creating'
  | 'paying'
  | 'success'
  | 'error';

interface MachineInfo {
  id: string;
  machineCode: string;
  displayName: string;
  status: string;
  capacityPct: number;
}

interface VolumeOption {
  id: string;
  volumeMl: number;
  priceAmount: number;
  isActive: boolean;
}

interface PaymentInfo {
  provider: string;
  paymentType: string;
  qrString: string | null;
  qrUrl: string | null;
  expiresAt: string | null;
}

function ScanResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('code') ?? '';

  const [pageState, setPageState] = useState<PageState>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [machine, setMachine] = useState<MachineInfo | null>(null);
  const [volumeOptions, setVolumeOptions] = useState<VolumeOption[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 1: verify the scanned code
  useEffect(() => {
    if (!code) {
      setErrorMsg('No QR code provided');
      setPageState('error');
      return;
    }

    api.post<{ machine: MachineInfo }>('/api/scan/verify', { code })
      .then(async (res) => {
        setMachine(res.machine);
        // Fetch volume options for this machine
        const machineRes = await api.get<{
          machine: any;
          volumeOptions: VolumeOption[];
        }>(`/api/customer/machines/${res.machine.machineCode}`);
        const activeOptions = (machineRes.volumeOptions ?? []).filter((v) => v.isActive);
        setVolumeOptions(activeOptions);
        setPageState('ready');
      })
      .catch((err: unknown) => {
        const msg = err instanceof ApiError ? err.message : 'Machine not found or unavailable';
        setErrorMsg(msg);
        setPageState('error');
      });
  }, [code]);

  // Step 2: create transaction
  const handleStart = async () => {
    if (!machine || volumeOptions.length === 0) return;
    const vol = volumeOptions[selectedIdx];
    setPageState('creating');

    try {
      const res = await api.post<{
        transactionId: string;
        orderId: string;
        payment: PaymentInfo;
      }>('/api/customer/transactions', {
        machineId: machine.id,
        volumeMl: vol.volumeMl,
        sourceChannel: 'CUSTOMER_APP',
      });

      setTransactionId(res.transactionId);
      setPayment(res.payment);
      setPageState('paying');
      startPolling(res.transactionId);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create transaction';
      setErrorMsg(msg);
      setPageState('error');
    }
  };

  // Step 3: poll transaction status
  const startPolling = (txId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get<{ transaction: any }>(`/api/customer/transactions/${txId}`);
        const tx = res.transaction;
        if (
          tx.paymentStatus === 'PAID' ||
          tx.dispenseStatus === 'COMPLETED' ||
          tx.dispenseStatus === 'READY_TO_FILL' ||
          tx.dispenseStatus === 'FILLING'
        ) {
          clearInterval(pollRef.current!);
          setPageState('success');
          setTimeout(() => router.push('/explore'), 3000);
        }
        if (
          tx.dispenseStatus === 'CANCELLED' ||
          tx.dispenseStatus === 'FAILED' ||
          tx.dispenseStatus === 'EXPIRED'
        ) {
          clearInterval(pollRef.current!);
          setErrorMsg('Transaction was cancelled or expired');
          setPageState('error');
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Error state ──
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mb-6">
          <AlertCircle size={40} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Something went wrong</h2>
        <p className="text-slate-500 text-sm mb-6">{errorMsg}</p>
        <button
          onClick={() => router.back()}
          className="bg-primary-800 text-white font-semibold px-6 py-3 rounded-2xl"
        >
          Try Again
        </button>
      </div>
    );
  }

  // ── Verifying state ──
  if (pageState === 'verifying') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <Loader2 size={36} className="text-primary-600 animate-spin" />
        <p className="text-slate-500 text-sm">Verifying machine code...</p>
      </div>
    );
  }

  // ── Success state ──
  if (pageState === 'success') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-eco-100 flex items-center justify-center mb-6">
          <CheckCircle size={40} className="text-eco-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Payment Confirmed!</h2>
        <p className="text-slate-500 text-sm">Hold your bottle under the dispenser nozzle</p>
        <p className="text-slate-400 text-xs mt-4">Redirecting in a moment...</p>
      </div>
    );
  }

  // ── Paying state (QRIS) ──
  if (pageState === 'paying') {
    const vol = volumeOptions[selectedIdx];
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100">
          <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <h1 className="text-base font-semibold text-slate-800">Scan to Pay</h1>
        </div>
        <div className="max-w-md mx-auto px-4 py-6 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Payment Amount</p>
            <p className="text-3xl font-extrabold text-primary-800 mb-4">
              IDR {vol?.priceAmount.toLocaleString('id-ID')}
            </p>

            {payment?.qrUrl ? (
              <div className="w-56 h-56 relative rounded-2xl overflow-hidden bg-slate-100">
                <Image src={payment.qrUrl} alt="QRIS Payment Code" fill className="object-contain" unoptimized />
              </div>
            ) : payment?.qrString ? (
              <div className="w-56 h-56 bg-slate-100 rounded-2xl flex flex-col items-center justify-center gap-2 p-4">
                <QrCode size={48} className="text-primary-600" />
                <p className="text-xs text-slate-500 text-center break-all font-mono">{payment.qrString.slice(0, 60)}...</p>
              </div>
            ) : (
              <div className="w-56 h-56 bg-slate-100 rounded-2xl flex flex-col items-center justify-center gap-3">
                <Loader2 size={32} className="text-primary-600 animate-spin" />
                <p className="text-xs text-slate-400">Loading payment...</p>
              </div>
            )}

            <p className="text-xs text-slate-400 mt-4 text-center">
              Open your banking / e-wallet app and scan the QRIS code above
            </p>

            {payment?.expiresAt && (
              <p className="text-xs text-red-400 mt-2">
                Expires: {new Date(payment.expiresAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            )}

            <div className="flex items-center gap-2 mt-4 text-slate-400">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">Waiting for payment confirmation...</span>
            </div>
          </div>

          <button
            onClick={async () => {
              if (transactionId) {
                await api.post(`/api/customer/transactions/${transactionId}/cancel`);
              }
              router.back();
            }}
            className="w-full border-2 border-slate-200 text-slate-600 font-semibold py-3 rounded-2xl text-sm"
          >
            Cancel Transaction
          </button>
        </div>
      </div>
    );
  }

  // ── Creating state ──
  if (pageState === 'creating') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <Loader2 size={36} className="text-primary-600 animate-spin" />
        <p className="text-slate-500 text-sm">Creating transaction...</p>
      </div>
    );
  }

  // ── Ready state ──
  const vol = volumeOptions[selectedIdx];

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
        {/* Machine info */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
              <Droplets size={24} className="text-primary-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Station</p>
              <h3 className="font-bold text-slate-800">{machine?.displayName ?? code}</h3>
              <p className="text-xs text-slate-400 font-mono">{machine?.machineCode}</p>
            </div>
            <div className="ml-auto">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${machine?.status === 'available' ? 'bg-eco-500' : 'bg-amber-400'}`} />
                <span className="text-xs font-medium text-slate-600 capitalize">{machine?.status ?? 'Unknown'}</span>
              </div>
              <p className="text-xs text-slate-400 text-right mt-0.5">{machine?.capacityPct ?? 0}% Full</p>
            </div>
          </div>
        </div>

        {/* Volume selection */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Select Volume</h3>
          {volumeOptions.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">No volume options available</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {volumeOptions.map((v, i) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedIdx(i)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                    selectedIdx === i
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <p className={`text-lg font-bold ${selectedIdx === i ? 'text-primary-800' : 'text-slate-700'}`}>
                    {v.volumeMl}ml
                  </p>
                  <p className={`text-xs mt-0.5 ${selectedIdx === i ? 'text-primary-600' : 'text-slate-400'}`}>
                    IDR {v.priceAmount.toLocaleString('id-ID')}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        {vol && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Volume</span>
              <span className="font-semibold text-slate-800">{vol.volumeMl}ml</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Price</span>
              <span className="font-semibold text-slate-800">IDR {vol.priceAmount.toLocaleString('id-ID')}</span>
            </div>
            <div className="border-t border-slate-100 pt-3 flex justify-between text-sm">
              <span className="text-slate-400 text-xs">Pay via QRIS</span>
              <span className="text-xs text-slate-400">After confirmation</span>
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleStart}
          disabled={volumeOptions.length === 0 || !vol}
          className="w-full bg-primary-800 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-primary-700 transition-colors disabled:opacity-40"
        >
          <Droplets size={18} />
          Start Dispensing
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
