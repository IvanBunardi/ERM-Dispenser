'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Keyboard, Droplets, Hash } from 'lucide-react';

export default function ScanPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  const normalizedCode = code.trim().toUpperCase();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (normalizedCode.length < 4) {
      setCodeError('Min. 4 characters');
      return;
    }

    router.push(`/scan/result?code=${encodeURIComponent(normalizedCode)}&mode=tablet`);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50">
            <Droplets size={30} className="text-primary-700" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Machine</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Enter the machine code printed on the dispenser.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
          <div>
            <label htmlFor="machine-code" className="block text-sm font-semibold text-slate-700">
              Machine Code
            </label>
            <div className="mt-2 flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 transition-colors focus-within:border-primary-600 focus-within:bg-white">
              <Hash size={18} className="shrink-0 text-slate-400" />
              <input
                id="machine-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().slice(0, 12));
                  setCodeError('');
                }}
                placeholder="VM-002 or 654321"
                className="min-w-0 flex-1 bg-transparent font-mono text-lg font-semibold uppercase tracking-wide text-slate-900 outline-none placeholder:text-slate-300"
                maxLength={12}
                autoComplete="off"
                autoCapitalize="characters"
                autoFocus
              />
            </div>
            {codeError && <p className="mt-2 text-xs font-medium text-red-500">{codeError}</p>}
          </div>

          <button
            type="submit"
            disabled={!normalizedCode}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-800 py-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-40"
          >
            <Keyboard size={18} />
            Verify Machine
          </button>
        </form>
      </div>
    </main>
  );
}
