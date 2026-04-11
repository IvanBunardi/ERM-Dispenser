'use client';
import { BadgeCheck } from 'lucide-react';

interface Props {
  label: string;
  active: boolean;
  onClick: () => void;
  showBadge?: boolean;
}

export default function FilterChip({ label, active, onClick, showBadge }: Props) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
        active
          ? 'bg-primary-800 text-white shadow-sm'
          : 'bg-white text-slate-700 border border-slate-200 hover:border-primary-300'
      }`}
    >
      {label}
      {showBadge && <BadgeCheck size={14} className={active ? 'text-white' : 'text-slate-400'} />}
    </button>
  );
}
