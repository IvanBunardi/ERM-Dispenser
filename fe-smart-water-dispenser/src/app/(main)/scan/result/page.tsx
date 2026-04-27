'use client';

import { useEffect, useEffectEvent, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Droplets,
  CheckCircle,
  AlertCircle,
  Loader2,
  QrCode,
  Circle,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import Image from 'next/image';

type PageState = 'verifying' | 'ready' | 'creating' | 'processing' | 'success' | 'error';
type DeviceStage =
  | 'WAITING_PAYMENT'
  | 'WAITING_BOTTLE'
  | 'READY_TO_FILL'
  | 'FILLING'
  | 'COMPLETED';

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

interface TransactionSnapshot {
  transaction: {
    id?: string;
    paymentStatus: string;
    dispenseStatus: string;
    volumeMl: number;
    grossAmount: number;
  };
  payment: PaymentInfo | null;
  dispenseSession: {
    actualFilledMl?: number | null;
    resultStatus?: string | null;
  } | null;
  latestStatus: {
    state?: string | null;
    source?: string | null;
    filledMl?: number | null;
    bottleDetected?: boolean | null;
    pumpRunning?: boolean | null;
    flowRateLpm?: number | string | null;
  } | null;
  recentEvents: Array<{
    eventType: string;
    occurredAt: string;
  }>;
}

interface MachineLookupResponse {
  machine: Record<string, unknown>;
  volumeOptions: VolumeOption[];
  status?: {
    state?: string | null;
    filledMl?: number | null;
    bottleDetected?: boolean | null;
    pumpRunning?: boolean | null;
    flowRateLpm?: number | string | null;
  } | null;
  busyState?: string | null;
  activeTransaction?: {
    id: string;
    paymentStatus: string;
    dispenseStatus: string;
    volumeMl: number;
    grossAmount: number;
  } | null;
}

function getMachineLookupPath(machineCode: string, isTabletMode: boolean) {
  const query = isTabletMode ? "?mode=tablet" : "";
  return `/api/customer/machines/${machineCode}${query}`;
}

function getDeviceStage(snapshot: TransactionSnapshot | null): DeviceStage {
  const status = snapshot?.transaction.dispenseStatus;
  if (status === 'WAITING_BOTTLE') return 'WAITING_BOTTLE';
  if (status === 'READY_TO_FILL') return 'READY_TO_FILL';
  if (status === 'FILLING') return 'FILLING';
  if (status === 'COMPLETED') return 'COMPLETED';
  return 'WAITING_PAYMENT';
}

function getStageCopy(stage: DeviceStage) {
  switch (stage) {
    case 'WAITING_PAYMENT':
      return {
        label: 'Step 1 of 4',
        title: 'Scan To Pay',
        description: 'Open your banking or e-wallet app and complete the QRIS payment.',
      };
    case 'WAITING_BOTTLE':
      return {
        label: 'Step 2 of 4',
        title: 'Payment Received',
        description: 'Payment is confirmed. Place your bottle under the nozzle.',
      };
    case 'READY_TO_FILL':
      return {
        label: 'Step 3 of 4',
        title: 'Bottle Detected',
        description: 'The machine sees your bottle. Press START on the dispenser to begin filling.',
      };
    case 'FILLING':
      return {
        label: 'Step 4 of 4',
        title: 'Dispensing Water',
        description: 'Your bottle is being filled right now. Keep it steady until the process finishes.',
      };
    case 'COMPLETED':
      return {
        label: 'Completed',
        title: 'Refill Complete',
        description: 'Dispensing finished successfully. You can remove the bottle now.',
      };
  }
}

function getStageIcon(stage: DeviceStage) {
  switch (stage) {
    case 'WAITING_PAYMENT':
      return <QrCode size={16} className="text-primary-700" />;
    case 'WAITING_BOTTLE':
      return <CheckCircle size={16} className="text-emerald-700" />;
    case 'READY_TO_FILL':
      return <Droplets size={16} className="text-cyan-700" />;
    case 'FILLING':
      return <Loader2 size={16} className="animate-spin text-sky-700" />;
    case 'COMPLETED':
      return <CheckCircle size={16} className="text-emerald-700" />;
  }
}

function formatEventLabel(eventType: string | undefined) {
  if (!eventType) return 'Waiting';
  return eventType.toLowerCase().replace(/_/g, ' ');
}

function formatProcessEventLabel(eventType: string | undefined) {
  switch (eventType) {
    case 'PAYMENT_CONFIRMED_BY_BUTTON':
      return 'QRIS confirmed on machine';
    case 'PAYMENT_PAID_MQTT':
      return 'Payment confirmed by backend';
    case 'BOTTLE_DETECTED':
      return 'Bottle detected';
    case 'BOTTLE_SIMULATED':
    case 'BOTTLE_SIMULATED_READY':
      return 'Bottle button pressed';
    case 'FILLING_STARTED':
      return 'Filling started';
    case 'FILLING_COMPLETED':
    case 'FILLING_FORCE_COMPLETED':
    case 'FILLING_COMPLETE':
      return 'Filling completed';
    case 'TRANSACTION_CANCELLED':
    case 'CANCEL_BUTTON':
      return 'Transaction cancelled';
    case 'ERROR_RAISED':
      return 'Machine error';
    default:
      return formatEventLabel(eventType);
  }
}

function formatMachineStateLabel(state: string | null | undefined) {
  if (!state) return 'waiting signal';

  switch (state) {
    case 'WAIT_PAYMENT':
      return 'waiting payment';
    case 'PAYMENT_SUCCESS':
      return 'payment success';
    case 'WAIT_BOTTLE':
      return 'waiting bottle';
    case 'READY_TO_FILL':
      return 'ready to fill';
    case 'FILLING':
      return 'filling';
    case 'COMPLETE':
      return 'complete';
    default:
      return state.toLowerCase().replace(/_/g, ' ');
  }
}

function getFilledMl(snapshot: TransactionSnapshot | null) {
  return snapshot?.latestStatus?.filledMl
    ?? snapshot?.dispenseSession?.actualFilledMl
    ?? 0;
}

function getFillPercent(snapshot: TransactionSnapshot | null) {
  if (!snapshot) return 0;
  const stage = getDeviceStage(snapshot);
  if (stage === 'WAITING_PAYMENT') return 0;
  if (stage === 'WAITING_BOTTLE') return 14;
  if (stage === 'READY_TO_FILL') return 28;
  if (stage === 'COMPLETED') return 100;

  const filledMl = getFilledMl(snapshot);
  const targetMl = snapshot.transaction.volumeMl || 0;
  if (!targetMl) return 55;
  return Math.max(36, Math.min(96, Math.round((filledMl / targetMl) * 100)));
}

function getFlowRate(snapshot: TransactionSnapshot | null) {
  const raw = snapshot?.latestStatus?.flowRateLpm;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw.length > 0) return Number(raw);
  return 0;
}

function isTerminalDispenseStatus(status: string | undefined) {
  return status === 'COMPLETED' || status === 'CANCELLED' || status === 'FAILED';
}

function ScanResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('code') ?? '';
  const mode = params.get('mode');
  const isTabletMode = mode === 'tablet';

  const [pageState, setPageState] = useState<PageState>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [machine, setMachine] = useState<MachineInfo | null>(null);
  const [volumeOptions, setVolumeOptions] = useState<VolumeOption[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<TransactionSnapshot | null>(null);
  const [machineBusyState, setMachineBusyState] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const machineWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetToMachineReadyState = () => {
    setTransactionId(null);
    setPayment(null);
    setLiveSnapshot(null);
    setMachineBusyState(null);
    setPageState('ready');
  };

  const startPolling = (txId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get<TransactionSnapshot>(`/api/customer/transactions/${txId}`);
        setLiveSnapshot(res);
        setMachineBusyState(null);
        if (res.payment) setPayment(res.payment);

        const tx = res.transaction;
        if (tx.dispenseStatus === 'COMPLETED') {
          clearInterval(pollRef.current!);
          setPageState('success');
          if (isTabletMode) {
            setTimeout(() => {
              resetToMachineReadyState();
            }, 5000);
          } else {
            setTimeout(() => router.push('/explore'), 3000);
          }
          return;
        }

        if (
          tx.dispenseStatus === 'CANCELLED'
          || tx.dispenseStatus === 'FAILED'
          || tx.paymentStatus === 'FAILED'
          || tx.paymentStatus === 'EXPIRED'
        ) {
          clearInterval(pollRef.current!);
          setErrorMsg('Transaction was cancelled, failed, or expired');
          setPageState('error');
        }
      } catch {
        // ignore polling errors
      }
    }, 1500);
  };

  const attachToExistingTransaction = useEffectEvent(async (txId: string) => {
    const snapshot = await api.get<TransactionSnapshot>(`/api/customer/transactions/${txId}`);
    setTransactionId(txId);
    setLiveSnapshot(snapshot);
    setMachineBusyState(null);
    if (snapshot.payment) setPayment(snapshot.payment);
    setPageState(snapshot.transaction.dispenseStatus === 'COMPLETED' ? 'success' : 'processing');
    if (snapshot.transaction.dispenseStatus !== 'COMPLETED') {
      startPolling(txId);
    }
  });

  useEffect(() => {
    if (!code) {
      setErrorMsg('No QR code provided');
      setPageState('error');
      return;
    }

    api.post<{ machine: MachineInfo }>('/api/scan/verify', { code })
      .then(async (res) => {
        setMachine(res.machine);
        const machineRes = await api.get<MachineLookupResponse>(getMachineLookupPath(res.machine.machineCode, isTabletMode));
        const activeOptions = (machineRes.volumeOptions ?? []).filter((v) => v.isActive);
        setVolumeOptions(activeOptions);
        const activeTransaction = machineRes.activeTransaction;
        if (activeTransaction?.id && !isTerminalDispenseStatus(activeTransaction.dispenseStatus)) {
          const matchingIndex = activeOptions.findIndex((option) => option.volumeMl === activeTransaction.volumeMl);
          if (matchingIndex >= 0) setSelectedIdx(matchingIndex);
          await attachToExistingTransaction(activeTransaction.id);
          return;
        }
        const reportedState =
          typeof machineRes.busyState === 'string' && machineRes.busyState.length > 0
            ? machineRes.busyState
            : typeof machineRes.status?.state === 'string' && machineRes.status.state.length > 0
              ? machineRes.status.state
              : null;
        setMachineBusyState(isTabletMode ? null : (reportedState && reportedState !== 'IDLE' ? reportedState : null));
        setPageState('ready');
      })
      .catch((err: unknown) => {
        const msg = err instanceof ApiError ? err.message : 'Machine not found or unavailable';
        setErrorMsg(msg);
        setPageState('error');
      });
  }, [code]);

  const handleStart = async () => {
    if (!machine || volumeOptions.length === 0) return;
    const vol = volumeOptions[selectedIdx];
    setPageState('creating');

    try {
      const res = await api.post<{
        transactionId: string;
        orderId: string;
        paymentStatus: string;
        dispenseStatus: string;
        payment: PaymentInfo;
      }>('/api/customer/transactions', {
        machineCode: machine.machineCode,
        volumeMl: vol.volumeMl,
        sourceChannel: isTabletMode ? 'TABLET_KIOSK' : 'CUSTOMER_APP',
      });

      const initialSnapshot: TransactionSnapshot = {
        transaction: {
          id: res.transactionId,
          paymentStatus: res.paymentStatus,
          dispenseStatus: res.dispenseStatus,
          volumeMl: vol.volumeMl,
          grossAmount: vol.priceAmount,
        },
        payment: res.payment,
        dispenseSession: null,
        latestStatus: null,
        recentEvents: [],
      };

      setTransactionId(res.transactionId);
      setPayment(res.payment);
      setLiveSnapshot(initialSnapshot);
      setMachineBusyState(null);
      setPageState('processing');
      startPolling(res.transactionId);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create transaction';
      setErrorMsg(msg);
      setPageState('error');
    }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (machineWatchRef.current) clearInterval(machineWatchRef.current);
    };
  }, []);

  useEffect(() => {
    if (pageState !== 'ready' || !machine?.machineCode) {
      if (machineWatchRef.current) {
        clearInterval(machineWatchRef.current);
        machineWatchRef.current = null;
      }
      return;
    }

    const syncMachineStatus = async () => {
      try {
        const machineRes = await api.get<MachineLookupResponse>(getMachineLookupPath(machine.machineCode, isTabletMode));
        const activeOptions = (machineRes.volumeOptions ?? []).filter((v) => v.isActive);
        if (activeOptions.length > 0) {
          setVolumeOptions(activeOptions);
        }

        const activeTransaction = machineRes.activeTransaction;
        if (activeTransaction?.id && !isTerminalDispenseStatus(activeTransaction.dispenseStatus)) {
          const matchingIndex = activeOptions.findIndex((option) => option.volumeMl === activeTransaction.volumeMl);
          if (matchingIndex >= 0) setSelectedIdx(matchingIndex);
          if (machineWatchRef.current) {
            clearInterval(machineWatchRef.current);
            machineWatchRef.current = null;
          }
          await attachToExistingTransaction(activeTransaction.id);
          return;
        }

        const reportedState =
          typeof machineRes.busyState === 'string' && machineRes.busyState.length > 0
            ? machineRes.busyState
            : typeof machineRes.status?.state === 'string' && machineRes.status.state.length > 0
              ? machineRes.status.state
              : null;
        setMachineBusyState(isTabletMode ? null : (reportedState && reportedState !== 'IDLE' ? reportedState : null));
      } catch {
        // ignore machine watch errors
      }
    };

    void syncMachineStatus();
    machineWatchRef.current = setInterval(() => {
      void syncMachineStatus();
    }, 2000);

    return () => {
      if (machineWatchRef.current) {
        clearInterval(machineWatchRef.current);
        machineWatchRef.current = null;
      }
    };
  }, [machine?.machineCode, pageState]);

  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mb-6">
          <AlertCircle size={40} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Something went wrong</h2>
        <p className="text-slate-500 text-sm mb-6">{errorMsg}</p>
        <button
          onClick={() => {
            if (isTabletMode) {
              setPageState('verifying');
              window.location.reload();
            } else {
              router.back();
            }
          }}
          className="bg-primary-800 text-white font-semibold px-6 py-3 rounded-2xl"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (pageState === 'verifying') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <Loader2 size={36} className="text-primary-600 animate-spin" />
        <p className="text-slate-500 text-sm">Verifying machine code...</p>
      </div>
    );
  }

  if (pageState === 'creating') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <Loader2 size={36} className="text-primary-600 animate-spin" />
        <p className="text-slate-500 text-sm">Creating transaction...</p>
      </div>
    );
  }

  if (pageState === 'processing' || pageState === 'success') {
    const snapshot = liveSnapshot;
    const stage = pageState === 'success' ? 'COMPLETED' : getDeviceStage(snapshot);
    const copy = getStageCopy(stage);
    const showBottleFill = stage !== 'WAITING_PAYMENT';
    const targetMl = snapshot?.transaction.volumeMl ?? volumeOptions[selectedIdx]?.volumeMl ?? 0;
    const priceAmount = snapshot?.transaction.grossAmount ?? volumeOptions[selectedIdx]?.priceAmount ?? 0;
    const filledMl = stage === 'COMPLETED' ? targetMl : getFilledMl(snapshot);
    const fillPercent = stage === 'COMPLETED' ? 100 : getFillPercent(snapshot);
    const flowRate = getFlowRate(snapshot);
    const recentEvent = snapshot?.recentEvents?.[0]?.eventType;
    const recentTimelineEvents = snapshot?.recentEvents?.slice(0, 4) ?? [];
    const machineSignal = snapshot?.latestStatus?.state ?? null;

    return (
      <div className="bg-[radial-gradient(circle_at_top,_#e0f2fe,_#f8fafc_45%,_#eef2ff)]">
        <div className="bg-white/85 backdrop-blur px-4 py-4 flex items-center gap-3 border-b border-white/60">
          {!isTabletMode && pageState !== 'success' && (
            <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{copy.label}</p>
            <h1 className="text-base font-semibold text-slate-800">{copy.title}</h1>
          </div>
        </div>

        <div className="max-w-md mx-auto px-4 py-6 space-y-4">
          <section className="bg-white/88 backdrop-blur rounded-[24px] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Process Timeline</p>
                <p className="mt-1 text-sm text-slate-500">{machine?.displayName ?? code}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {formatProcessEventLabel(recentEvent)}
              </span>
            </div>
            <StageTimeline currentStage={stage} />
            <div className="rounded-2xl bg-slate-50 px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Machine Signal</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{formatMachineStateLabel(machineSignal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Source</p>
                  <p className="mt-1 text-xs font-medium text-slate-600">{snapshot?.latestStatus?.source ?? 'MQTT'}</p>
                </div>
              </div>
              {recentTimelineEvents.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {recentTimelineEvents.map((event) => (
                    <span
                      key={`${event.eventType}-${event.occurredAt}`}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600"
                    >
                      {formatProcessEventLabel(event.eventType)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* <section className="rounded-[24px] border border-sky-100 bg-white/90 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-50">
                {getStageIcon(stage)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">{copy.title}</h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {machine?.machineCode}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{copy.description}</p>
              </div>
            </div>
          </section> */}

          {stage === 'WAITING_PAYMENT' && (
            <section className="bg-white/88 backdrop-blur rounded-[24px] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Payment Gateway</p>
                  <h3 className="mt-1 text-2xl font-black text-slate-900">IDR {priceAmount.toLocaleString('id-ID')}</h3>
                </div>
                <div className="rounded-2xl bg-slate-100 px-3 py-2 text-right">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Status</p>
                  <p className="text-sm font-semibold text-slate-700">{snapshot?.transaction.paymentStatus ?? 'PENDING'}</p>
                </div>
              </div>

              {payment?.qrUrl ? (
                <div className="w-full aspect-square max-w-[260px] mx-auto relative rounded-[26px] overflow-hidden bg-slate-100 ring-1 ring-slate-200">
                  <Image src={payment.qrUrl} alt="QRIS Payment Code" fill className="object-contain p-4" unoptimized />
                </div>
              ) : payment?.qrString ? (
                <div className="w-full aspect-square max-w-[260px] mx-auto bg-slate-100 rounded-[26px] flex flex-col items-center justify-center gap-3 p-4">
                  <QrCode size={48} className="text-primary-600" />
                  <p className="text-xs text-slate-500 text-center break-all font-mono">{payment.qrString.slice(0, 60)}...</p>
                </div>
              ) : (
                <div className="w-full aspect-square max-w-[260px] mx-auto bg-slate-100 rounded-[26px] flex flex-col items-center justify-center gap-3">
                  <Loader2 size={32} className="text-primary-600 animate-spin" />
                  <p className="text-xs text-slate-400">Loading payment...</p>
                </div>
              )}

              <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
                Setelah pembayaran berhasil, halaman ini akan lanjut otomatis ke tahap botol dan pengisian.
              </p>

              {payment?.expiresAt && (
                <p className="text-xs text-red-400 mt-2 text-center">
                  Expires at {new Date(payment.expiresAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
            </section>
          )}

          {showBottleFill && (
            <section className="bg-white/88 backdrop-blur rounded-[24px] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Live Bottle Fill</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {stage === 'WAITING_BOTTLE' && 'Taruh botol di bawah nozzle.'}
                    {stage === 'READY_TO_FILL' && 'Botol terdeteksi. Tekan START di mesin.'}
                    {stage === 'FILLING' && 'Level air naik mengikuti progress dari IoT.'}
                    {stage === 'COMPLETED' && 'Pengisian selesai. Botol bisa diangkat.'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-slate-900">{fillPercent}%</p>
                  <p className="text-[11px] text-slate-400">progress</p>
                </div>
              </div>

              <BottleFillVisual fillPercent={fillPercent} isActive={stage === 'FILLING'} />

              <div className="mt-4 grid grid-cols-3 gap-2.5 text-center">
                <MetricCard label="Target" value={`${targetMl} ml`} />
                <MetricCard label="Filled" value={`${filledMl} ml`} />
                <MetricCard label="Flow" value={stage === 'FILLING' ? `${flowRate.toFixed(1)} L/m` : '--'} />
              </div>
            </section>
          )}

          <button
            onClick={async () => {
              if (transactionId) {
                try {
                  await api.post(`/api/customer/transactions/${transactionId}/cancel`);
                } catch {
                  // ignore cancel error
                }
              }
              if (isTabletMode) {
                resetToMachineReadyState();
              } else {
                router.back();
              }
            }}
            className="w-full border-2 border-slate-200 text-slate-600 font-semibold py-3 rounded-2xl text-sm bg-white/80"
          >
            {stage === 'COMPLETED' ? 'Back To Explore' : 'Cancel Transaction'}
          </button>
          <div className="h-4" />
        </div>
      </div>
    );
  }

  const vol = volumeOptions[selectedIdx];

  if (isTabletMode) {
    return (
      <div className="bg-slate-50 min-h-screen">
        <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100">
          <h1 className="text-base font-semibold text-slate-800">Tablet Payment Screen</h1>
        </div>

        <div className="max-w-md mx-auto px-4 py-6 space-y-6">
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
                <p className="text-xs text-slate-400 text-right mt-0.5">{machine?.capacityPct ?? 0}% Fill</p>
              </div>
            </div>
          </div>

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
                <span className="text-slate-400 text-xs">Tablet QRIS</span>
                <span className="text-xs text-slate-400">IoT will override if WAIT_PAYMENT arrives</span>
              </div>
            </div>
          )}

          <div className="rounded-[28px] border border-sky-100 bg-sky-50 p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">IoT Priority</p>
            <p className="mt-2 text-sm leading-relaxed text-sky-900/80">
              Tablet bisa memulai pembayaran dari sini. Tetapi jika IoT untuk <span className="font-semibold">{machine?.machineCode ?? code}</span>
              masuk ke state <span className="font-semibold">WAIT_PAYMENT</span>, transaksi tablet akan dibatalkan dan layar ini otomatis
              berpindah ke transaksi dari IoT.
            </p>
          </div>

          <button
            onClick={handleStart}
            disabled={volumeOptions.length === 0 || !vol}
            className="w-full bg-primary-800 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-primary-700 transition-colors disabled:opacity-40"
          >
            <Droplets size={18} />
            Start Tablet Payment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50">
      <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100">
        {!isTabletMode && (
          <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
        )}
        <h1 className="text-base font-semibold text-slate-800">Confirm Refill</h1>
      </div>

        <div className="max-w-md mx-auto px-4 py-6 space-y-6">
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
              <p className="text-xs text-slate-400 text-right mt-0.5">{machine?.capacityPct ?? 0}% Fill</p>
            </div>
          </div>
        </div>

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

        <button
          onClick={handleStart}
          disabled={volumeOptions.length === 0 || !vol || !!machineBusyState}
          className="w-full bg-primary-800 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-primary-700 transition-colors disabled:opacity-40"
        >
          <Droplets size={18} />
          {machineBusyState ? 'Machine In Use' : 'Start Dispensing'}
        </button>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function StageTimeline({ currentStage }: { currentStage: DeviceStage }) {
  const stageOrder: DeviceStage[] = ['WAITING_PAYMENT', 'WAITING_BOTTLE', 'READY_TO_FILL', 'FILLING', 'COMPLETED'];
  const currentIndex = stageOrder.indexOf(currentStage);

  const steps = [
    { key: 'WAITING_PAYMENT' as const, title: 'Pay', icon: <QrCode size={14} /> },
    { key: 'WAITING_BOTTLE' as const, title: 'Bottle', icon: <Circle size={14} /> },
    { key: 'READY_TO_FILL' as const, title: 'Ready', icon: <Droplets size={14} /> },
    { key: 'FILLING' as const, title: 'Fill', icon: <Loader2 size={14} className={currentStage === 'FILLING' ? 'animate-spin' : ''} /> },
    { key: 'COMPLETED' as const, title: 'Done', icon: <CheckCircle size={14} /> },
  ];

  return (
    <div className="grid grid-cols-5 gap-2">
      {steps.map((step, index) => {
        const isDone = index < currentIndex || currentStage === 'COMPLETED';
        const isActive = step.key === currentStage;
        return (
          <div key={step.key} className="text-center">
            <div
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-2xl transition-all ${
                isDone || isActive
                  ? 'bg-primary-800 text-white shadow-lg shadow-primary-200'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {step.icon}
            </div>
            <p className={`mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${isDone || isActive ? 'text-slate-800' : 'text-slate-400'}`}>
              {step.title}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function BottleFillVisual({ fillPercent, isActive }: { fillPercent: number; isActive: boolean }) {
  return (
    <div className="relative mx-auto w-44 h-72 flex items-end justify-center">
      <div className="absolute inset-x-5 top-3 h-5 rounded-full bg-slate-100 blur-xl opacity-80" />
      <div className="relative w-28 h-64">
        <div className="absolute left-1/2 -translate-x-1/2 top-0 w-12 h-10 rounded-t-[18px] border-[5px] border-slate-300 border-b-0 bg-white/70" />
        <div className="absolute inset-x-0 top-7 bottom-0 rounded-[26px] border-[5px] border-slate-300 bg-white/60 backdrop-blur overflow-hidden shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]">
          <div
            className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,#67e8f9_0%,#38bdf8_50%,#2563eb_100%)] transition-all duration-700 ease-out"
            style={{ height: `${fillPercent}%` }}
          >
            <div className="absolute inset-x-0 top-0 h-4 bg-white/25 blur-sm" />
            <div className={`absolute inset-x-0 top-1 h-3 ${isActive ? 'animate-pulse' : ''}`}>
              <div className="w-full h-full bg-white/20 rounded-full blur-sm" />
            </div>
            {isActive && (
              <>
                <span className="absolute left-4 bottom-6 w-2.5 h-2.5 rounded-full bg-white/70 animate-bounce" />
                <span className="absolute right-5 bottom-14 w-2 h-2 rounded-full bg-white/60 animate-bounce [animation-delay:160ms]" />
                <span className="absolute left-8 bottom-24 w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce [animation-delay:320ms]" />
              </>
            )}
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.18),transparent_28%,transparent_72%,rgba(255,255,255,0.24))]" />
        </div>
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
