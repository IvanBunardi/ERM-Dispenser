'use client';
import Image from 'next/image';
import { Navigation } from 'lucide-react';
import CapacityBar from '@/components/shared/CapacityBar';
import type { Station } from '@/store/appStore';

interface Props {
  station: Station;
  onDirections?: () => void;
}

export default function StationCard({ station, onDirections }: Props) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-2xl">
      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
        <Image
          src={station.imageUrl}
          alt={station.name}
          width={56}
          height={56}
          className="w-full h-full object-cover"
          unoptimized
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-xs font-bold text-primary-900 uppercase tracking-wide leading-tight truncate">
          {station.name}
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {station.distance} &bull; {station.lastRefilled}
        </p>
        <div className="mt-1.5 w-32">
          <CapacityBar capacity={station.capacity} status={station.status} />
        </div>
      </div>

      {/* Directions */}
      {station.status !== 'unavailable' && (
        <button
          onClick={onDirections}
          className="flex-shrink-0 bg-primary-800 text-white text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 hover:bg-primary-700 transition-colors"
        >
          <Navigation size={12} />
          Directions
        </button>
      )}
    </div>
  );
}
