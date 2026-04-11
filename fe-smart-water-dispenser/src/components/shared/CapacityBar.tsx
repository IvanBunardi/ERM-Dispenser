'use client';
import { useEffect, useState } from 'react';

interface Props {
  capacity: number;
  status: 'available' | 'partial' | 'unavailable';
}

export default function CapacityBar({ capacity, status }: Props) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setWidth(capacity), 100);
    return () => clearTimeout(t);
  }, [capacity]);

  const color = status === 'available' ? 'bg-status-full'
    : status === 'partial' ? 'bg-status-partial'
    : 'bg-status-unavailable';

  const label = status === 'unavailable' ? 'Unavailable'
    : `${capacity}% Full`;

  const textColor = status === 'available' ? 'text-green-600'
    : status === 'partial' ? 'text-amber-600'
    : 'text-red-500';

  return (
    <div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700 ease-out`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={`text-xs font-semibold mt-1 inline-block ${textColor}`}>{label}</span>
    </div>
  );
}
