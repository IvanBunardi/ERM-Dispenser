'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Keyboard, Droplets, ChevronDown, Check } from 'lucide-react';
import { api } from '@/lib/api';

interface Machine {
  id: string;
  machineCode: string;
  name: string;
  status: string;
}

export default function ScanPage() {
  const router = useRouter();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const res = await api.get<Machine[]>('/api/stations');
        setMachines(res);
        if (res.length > 0) {
          // Default to first machine if available
          setSelectedMachine(null);
        }
      } catch (error) {
        console.error('Failed to fetch machines:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMachines();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMachine) return;

    router.push(`/scan/result?code=${encodeURIComponent(selectedMachine.machineCode)}`);
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
            Select the dispenser machine you want to use.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="relative">
            <label htmlFor="machine-select" className="block text-sm font-semibold text-slate-700">
              Select Machine
            </label>
            
            <div className="mt-2">
              {isLoading ? (
                <div className="flex h-[58px] items-center justify-center rounded-2xl border-2 border-slate-100 bg-slate-50/50">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600"></div>
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 transition-all ${
                      isOpen ? 'border-primary-600 bg-white ring-4 ring-primary-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-1 items-center gap-3 overflow-hidden">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm border border-slate-100">
                        <Droplets size={18} className="text-primary-600" />
                      </div>
                      {selectedMachine ? (
                        <div className="flex flex-col items-start overflow-hidden text-left">
                          <span className="block w-full truncate font-bold text-slate-900 leading-tight">
                            {selectedMachine.name}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                            {selectedMachine.machineCode}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-medium">Choose a machine...</span>
                      )}
                    </div>
                    <ChevronDown size={18} className={`ml-2 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isOpen && (
                    <div className="absolute top-full left-0 z-50 mt-2 w-full overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="max-h-[320px] overflow-y-auto py-2 px-2 scrollbar-hide">
                        {machines.map((machine) => (
                          <button
                            key={machine.id}
                            type="button"
                            onClick={() => {
                              setSelectedMachine(machine);
                              setIsOpen(false);
                            }}
                            className={`group flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-all hover:bg-primary-50/50 ${
                              selectedMachine?.id === machine.id ? 'bg-primary-50/30' : ''
                            }`}
                          >
                            <div className="flex flex-col overflow-hidden">
                              <span className={`truncate text-sm font-bold transition-colors ${
                                selectedMachine?.id === machine.id ? 'text-primary-700' : 'text-slate-700 group-hover:text-primary-600'
                              }`}>
                                {machine.name}
                              </span>
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">
                                {machine.machineCode}
                              </span>
                            </div>
                            {selectedMachine?.id === machine.id && (
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100">
                                <Check size={14} className="text-primary-700" />
                              </div>
                            )}
                          </button>
                        ))}
                        {machines.length === 0 && (
                          <div className="px-4 py-10 text-center">
                            <p className="text-sm font-medium text-slate-400 italic">No machines available</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!selectedMachine || isLoading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-800 py-4 text-sm font-bold text-white transition-all hover:bg-primary-700 hover:shadow-lg active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
          >
            <Keyboard size={18} />
            Verify Machine
          </button>
        </form>
      </div>

      {/* Click outside to close */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-transparent" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </main>
  );
}

