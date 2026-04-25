'use client';
import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Bell, Search, Navigation, X } from 'lucide-react';
import FilterChip from '@/components/shared/FilterChip';
import StationCard from '@/components/map/StationCard';
import CapacityBar from '@/components/shared/CapacityBar';
import Image from 'next/image';
import { type Station, useAppStore } from '@/store/appStore';
import { api } from '@/lib/api';

const StationMap = dynamic(() => import('@/components/map/StationMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full" style={{ background: 'linear-gradient(to right, #f1f5f9 8%, #e2e8f0 18%, #f1f5f9 33%)', backgroundSize: '800px 100%' }} />,
});

export default function ExplorePage() {
  const { activeFilter, setFilter, selectedStationId, selectStation } = useAppStore();
  const [search, setSearch] = useState('');
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Get user geolocation for distance calculation
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
        },
        () => {}, // ignore if denied
      );
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeFilter && activeFilter !== 'nearest') params.set('filter', activeFilter);
    if (activeFilter === 'nearest') params.set('filter', 'nearest');
    if (search) params.set('search', search);
    if (userLat !== null) params.set('lat', String(userLat));
    if (userLng !== null) params.set('lng', String(userLng));

    setLoading(true);
    setError('');
    api.get<Station[]>(`/api/stations?${params.toString()}`)
      .then((data) => setStations(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load stations'))
      .finally(() => setLoading(false));
  }, [activeFilter, search, userLat, userLng]);

  const filtered = stations;
  const selectedStation = stations.find((s) => s.id === selectedStationId) ?? null;

  return (
    <div className="flex flex-col bg-white" style={{ height: '100dvh', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white z-10 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <MiniLogo />
          <span className="text-primary-800 font-bold text-lg tracking-tight md:hidden">Eco-Flow</span>
          <h1 className="hidden md:block text-xl font-bold text-slate-800">Explore Stations</h1>
        </div>
        <button className="relative p-2 rounded-full hover:bg-slate-100 transition-colors">
          <Bell size={20} className="text-slate-600" />
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="flex flex-col w-full md:w-96 md:border-r md:border-slate-100">
          {/* Search + Filters */}
          <div className="px-4 py-3 space-y-3 bg-white flex-shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find water stations near you..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-100 rounded-full text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <FilterChip label="Nearest" active={activeFilter === 'nearest'} onClick={() => setFilter('nearest')} />
              <FilterChip label="Verified" active={activeFilter === 'verified'} onClick={() => setFilter('verified')} showBadge />
              <FilterChip label="High Capacity" active={activeFilter === 'highCapacity'} onClick={() => setFilter('highCapacity')} />
            </div>
          </div>

          {/* Desktop station list */}
          <div className="hidden md:block flex-1 overflow-y-auto px-4 pb-4 space-y-2">
            {loading && (
              <div className="space-y-2 pt-2">
                {[1,2,3].map((i) => (
                  <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            )}
            {!loading && error && (
              <div className="text-center py-12 text-slate-400 text-sm">{error}</div>
            )}
            {!loading && !error && filtered.map((station) => (
              <div
                key={station.id}
                onClick={() => selectStation(station.id === selectedStationId ? null : station.id)}
                className={`cursor-pointer rounded-2xl border-2 transition-all duration-200 ${
                  selectedStationId === station.id
                    ? 'border-primary-600 shadow-md'
                    : 'border-transparent hover:border-slate-200'
                }`}
              >
                <StationCard
                  station={station}
                  onDirections={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`)}
                />
              </div>
            ))}
            {!loading && !error && filtered.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-sm">No stations found</div>
            )}
          </div>

          {/* Mobile: map only */}
          <div className="flex-1 md:hidden relative">
            <StationMap
              stations={filtered}
              selectedId={selectedStationId}
              onSelect={(id) => selectStation(id === selectedStationId ? null : id)}
            />
          </div>
        </div>

        {/* Desktop map panel */}
        <div className="hidden md:block flex-1 relative">
          <StationMap
            stations={filtered}
            selectedId={selectedStationId}
            onSelect={(id) => selectStation(id === selectedStationId ? null : id)}
          />

          {selectedStation && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-80 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] p-4">
              <button
                onClick={() => selectStation(null)}
                className="absolute top-3 right-3 p-1 rounded-full hover:bg-slate-100"
              >
                <X size={14} className="text-slate-400" />
              </button>
              <StationCard
                station={selectedStation}
                onDirections={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${selectedStation.lat},${selectedStation.lng}`)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <div
        className="md:hidden fixed left-0 right-0 z-30"
        style={{
          bottom: '64px',
          transform: selectedStation ? 'translateY(0)' : 'translateY(calc(100% + 64px))',
          transition: 'transform 0.4s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <div className="bg-white rounded-t-3xl shadow-[0_-4px_24px_rgba(0,0,0,0.12)] px-4 pt-2.5 pb-4 mx-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" />
          {selectedStation && (
            <BottomSheetCard station={selectedStation} onClose={() => selectStation(null)} />
          )}
        </div>
      </div>

      {selectedStation && (
        <div
          className="md:hidden fixed inset-0 z-20"
          onClick={() => selectStation(null)}
        />
      )}
    </div>
  );
}

function MiniLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 100 100" fill="none" className="md:hidden">
      <circle cx="50" cy="50" r="44" stroke="#7DD3E8" strokeWidth="1.5" strokeDasharray="4 3" fill="none" opacity="0.6"/>
      <path d="M35 65 C35 45 55 30 65 28 C63 38 58 50 48 58 C44 61 40 63 35 65Z" fill="#5BA83A"/>
      <path d="M58 30 C58 30 70 48 70 58 C70 65 64.5 70 58 70 C51.5 70 46 65 46 58 C46 48 58 30 58 30Z" fill="#3B82F6"/>
    </svg>
  );
}

function BottomSheetCard({ station, onClose }: { station: Station; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
        {station.imageUrl ? (
          <Image src={station.imageUrl} alt={station.name} width={64} height={64} className="w-full h-full object-cover" unoptimized />
        ) : (
          <div className="w-full h-full bg-primary-50 flex items-center justify-center text-primary-400 text-xs">💧</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-xs font-bold text-primary-900 uppercase tracking-wide leading-tight">{station.name}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{station.distance} &bull; {station.lastRefilled}</p>
        <div className="mt-1.5 w-36">
          <CapacityBar capacity={station.capacity} status={station.status} />
        </div>
      </div>
      {station.status !== 'unavailable' ? (
        <button
          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`)}
          className="flex-shrink-0 bg-primary-800 text-white text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5"
        >
          <Navigation size={12} />
          Directions
        </button>
      ) : (
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100">
          <X size={16} className="text-slate-400" />
        </button>
      )}
    </div>
  );
}
