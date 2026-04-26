'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Bell,
  Search,
  Navigation,
  X,
  AlertTriangle,
  CheckCircle2,
  Info,
  Wallet,
  Route,
} from 'lucide-react';
import FilterChip from '@/components/shared/FilterChip';
import StationCard from '@/components/map/StationCard';
import CapacityBar from '@/components/shared/CapacityBar';
import Image from 'next/image';
import { type Station, useAppStore } from '@/store/appStore';
import { api } from '@/lib/api';

const StationMap = dynamic(() => import('@/components/map/StationMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full" style={{ background: 'linear-gradient(to right, #f1f5f9 8%, #e2e8f0 18%, #f1f5f9 33%)', backgroundSize: '800px 100%' }} />,
});

type GeoState = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable';
type PermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

function calculateDistanceKm(
  lat1?: number | null,
  lng1?: number | null,
  lat2?: number | null,
  lng2?: number | null,
) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;

  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function formatDistanceKm(distanceKm: number | null) {
  if (distanceKm == null) return 'Enable location';
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km away`;
  return `${distanceKm.toFixed(0)} km away`;
}

function estimateWalkMinutes(distanceKm: number | null) {
  if (distanceKm == null) return null;
  return Math.max(1, Math.round((distanceKm / 4.8) * 60));
}

async function requestLocationOnce() {
  if (!navigator.geolocation) return { ok: false as const, error: 'unavailable' as const };

  return new Promise<
    | { ok: true; lat: number; lng: number }
    | { ok: false; error: 'denied' | 'unavailable' }
  >((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => resolve({ ok: false as const, error: 'denied' as const }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

async function getBrowserGeoPermission(): Promise<PermissionState> {
  if (!navigator.geolocation) return 'unsupported';

  const permissionsApi = navigator.permissions as
    | { query?: (descriptor: PermissionDescriptor) => Promise<{ state: PermissionState | PermissionStatus['state'] }> }
    | undefined;

  if (!permissionsApi?.query) return 'prompt';

  try {
    const result = await permissionsApi.query({ name: 'geolocation' } as PermissionDescriptor);
    if (result.state === 'granted' || result.state === 'prompt' || result.state === 'denied') {
      return result.state;
    }
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

export default function ExplorePage() {
  const {
    activeFilter,
    setFilter,
    selectedStationId,
    selectStation,
    guest,
    preferences,
    notifications,
    setNotificationCount,
    permissionPrefs,
    updatePermissionPrefs,
  } = useAppStore();
  const [search, setSearch] = useState('');
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [geoState, setGeoState] = useState<GeoState>('idle');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const requestLocation = async () => {
    setGeoState('requesting');
    const res = await requestLocationOnce();
    if (res.ok) {
      setUserLocation({ lat: res.lat, lng: res.lng });
      setGeoState('ready');
      updatePermissionPrefs({ locationEnabled: true });
      return true;
    }

    setGeoState(res.error);
    updatePermissionPrefs({ locationEnabled: false });
    return false;
  };

  useEffect(() => {
    if (permissionPrefs.locationEnabled && geoState === 'idle' && !userLocation) {
      void requestLocation();
    }
  }, [geoState, permissionPrefs.locationEnabled, userLocation]);

  useEffect(() => {
    let cancelled = false;

    const syncBrowserLocationPermission = async () => {
      const permissionState = await getBrowserGeoPermission();
      if (cancelled) return;

      if (permissionState === 'granted') {
        updatePermissionPrefs({ locationEnabled: true });
        if (!userLocation && geoState !== 'requesting') {
          void requestLocation();
        }
        return;
      }

      if (permissionState === 'denied') {
        setGeoState('denied');
        updatePermissionPrefs({ locationEnabled: false });
        return;
      }

      if (permissionState === 'unsupported') {
        setGeoState('unavailable');
      }
    };

    void syncBrowserLocationPermission();
    return () => {
      cancelled = true;
    };
  }, [geoState, updatePermissionPrefs, userLocation]);

  useEffect(() => {
    if (!selectedStationId || userLocation || !permissionPrefs.locationEnabled || geoState === 'requesting') return;
    void requestLocation();
  }, [geoState, permissionPrefs.locationEnabled, selectedStationId, userLocation]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeFilter && activeFilter !== 'nearest') params.set('filter', activeFilter);
    if (activeFilter === 'nearest') params.set('filter', 'nearest');
    if (search) params.set('search', search);
    if (userLocation?.lat != null) params.set('lat', String(userLocation.lat));
    if (userLocation?.lng != null) params.set('lng', String(userLocation.lng));

    setLoading(true);
    setError('');
    api.get<Station[]>(`/api/stations?${params.toString()}`)
      .then((data) => setStations(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load stations'))
      .finally(() => setLoading(false));
  }, [activeFilter, search, userLocation]);

  const displayStations = useMemo(() => (
    stations.map((station) => {
      const computedDistanceKm = calculateDistanceKm(
        userLocation?.lat,
        userLocation?.lng,
        station.lat,
        station.lng,
      );

      let distanceLabel = station.distance;
      if (computedDistanceKm != null) {
        distanceLabel = formatDistanceKm(computedDistanceKm);
      } else if (!permissionPrefs.locationEnabled) {
        distanceLabel = 'Enable location';
      } else if (geoState === 'requesting') {
        distanceLabel = 'Locating...';
      } else if (geoState === 'denied') {
        distanceLabel = 'Location denied';
      } else {
        distanceLabel = 'Location unavailable';
      }

      return {
        ...station,
        distance: distanceLabel,
        distanceMeters: computedDistanceKm != null ? Math.round(computedDistanceKm * 1000) : station.distanceMeters,
      };
    })
  ), [geoState, permissionPrefs.locationEnabled, stations, userLocation]);

  const selectedStation = displayStations.find((s) => s.id === selectedStationId) ?? null;
  const selectedDistanceKm = selectedStation
    ? calculateDistanceKm(userLocation?.lat, userLocation?.lng, selectedStation.lat, selectedStation.lng)
    : null;
  const walkingMinutes = estimateWalkMinutes(selectedDistanceKm);

  const notificationItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      body: string;
      tone: 'info' | 'success' | 'warning';
      time: string;
    }> = [];

    const nearestAvailable = displayStations.find((station) => station.status === 'available');
    if (nearestAvailable) {
      items.push({
        id: `near-${nearestAvailable.id}`,
        title: 'Nearest station ready',
        body: `${nearestAvailable.name} is available, about ${nearestAvailable.distance}.`,
        tone: 'success',
        time: 'Live',
      });
    }

    displayStations
      .filter((station) => station.capacity > 0 && station.capacity < 50)
      .slice(0, 2)
      .forEach((station) => {
        items.push({
          id: `low-${station.id}`,
          title: 'Low capacity alert',
          body: `${station.name} is at ${station.capacity}% and may run out soon.`,
          tone: 'warning',
          time: 'Seed data',
        });
      });

    if (guest) {
      items.push({
        id: 'guest-summary',
        title: 'Eco summary',
        body:
          guest.bottlesSaved > 0
            ? `You have saved ${guest.bottlesSaved} bottles and spent IDR ${guest.totalSpent.toLocaleString('id-ID')}.`
            : 'Your guest profile is active. Start a refill to generate history and impact stats.',
        tone: 'info',
        time: 'Today',
      });
    }

    if (!permissionPrefs.locationEnabled) {
      items.push({
        id: 'location-off',
        title: 'Location is off',
        body: 'Enable location to calculate real station distances and preview routes on the map.',
        tone: 'warning',
        time: 'Permission',
      });
    }

    if (!preferences.notificationsEnabled) {
      items.push({
        id: 'prefs-off',
        title: 'Notifications disabled',
        body: 'Turn notifications back on in Settings to receive station and dispense updates.',
        tone: 'warning',
        time: 'Settings',
      });
    }

    if (items.length === 0) {
      items.push({
        id: 'fallback',
        title: 'No alerts yet',
        body: 'Once live device data arrives from Wokwi and backend, alerts will appear here.',
        tone: 'info',
        time: 'Pending',
      });
    }

    return items;
  }, [displayStations, guest, permissionPrefs.locationEnabled, preferences.notificationsEnabled]);

  useEffect(() => {
    setNotificationCount(notificationItems.length);
  }, [notificationItems.length, setNotificationCount]);

  return (
    <div className="flex flex-col bg-white" style={{ height: 'calc(100dvh - 64px)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <header className="z-10 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <MiniLogo />
          <span className="text-lg font-bold tracking-tight text-primary-800 md:hidden">Eco-Flow</span>
          <h1 className="hidden text-xl font-bold text-slate-800 md:block">Explore Stations</h1>
        </div>
        <button
          onClick={() => setShowNotifications(true)}
          className="relative rounded-full p-2 transition-colors hover:bg-slate-100"
        >
          <Bell size={20} className="text-slate-600" />
          {notifications > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {notifications > 9 ? '9+' : notifications}
            </span>
          )}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-full flex-col md:w-96 md:border-r md:border-slate-100">
          <div className="flex-shrink-0 space-y-3 bg-white px-4 py-3">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find water stations near you..."
                className="w-full rounded-full bg-slate-100 py-2.5 pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <FilterChip label="Nearest" active={activeFilter === 'nearest'} onClick={() => setFilter('nearest')} />
              <FilterChip label="Verified" active={activeFilter === 'verified'} onClick={() => setFilter('verified')} showBadge />
              <FilterChip label="High Capacity" active={activeFilter === 'highCapacity'} onClick={() => setFilter('highCapacity')} />
            </div>
          </div>

          <div className="hidden flex-1 overflow-y-auto px-4 pb-4 space-y-2 md:block">
            {loading && (
              <div className="space-y-2 pt-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            )}
            {!loading && error && (
              <div className="py-12 text-center text-sm text-slate-400">{error}</div>
            )}
            {!loading && !error && displayStations.map((station) => (
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
            {!loading && !error && displayStations.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-400">No stations found</div>
            )}
          </div>

          <div className="relative flex-1 md:hidden">
            <StationMap
              stations={displayStations}
              selectedId={selectedStationId}
              onSelect={(id) => selectStation(id === selectedStationId ? null : id)}
              userLocation={userLocation}
              routeStation={selectedStation}
            />
          </div>
        </div>

        <div className="relative hidden flex-1 md:block">
          <StationMap
            stations={displayStations}
            selectedId={selectedStationId}
            onSelect={(id) => selectStation(id === selectedStationId ? null : id)}
            userLocation={userLocation}
            routeStation={selectedStation}
          />

          {userLocation && selectedStation && selectedDistanceKm != null && (
            <div className="absolute left-6 top-6 w-[320px] rounded-[28px] border border-white/70 bg-white/92 p-5 shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Route Preview</p>
                  <h3 className="mt-2 text-lg font-black text-slate-950">{selectedStation.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Live route path from your current location to the selected dispenser.
                  </p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                  <Route size={20} />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <RouteMetric label="Distance" value={formatDistanceKm(selectedDistanceKm).replace(' away', '')} />
                <RouteMetric label="Walk time" value={walkingMinutes ? `${walkingMinutes} min` : '--'} />
              </div>
            </div>
          )}

          {selectedStation && (
            <div className="absolute bottom-6 left-1/2 w-[420px] -translate-x-1/2 rounded-2xl bg-white p-4 shadow-[0_8px_32px_rgba(0,0,0,0.15)]">
              <button
                onClick={() => selectStation(null)}
                className="absolute right-3 top-3 rounded-full p-1 hover:bg-slate-100"
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

      <div
        className="fixed left-0 right-0 z-30 md:hidden"
        style={{
          bottom: '64px',
          transform: selectedStation ? 'translateY(0)' : 'translateY(calc(100% + 64px))',
          transition: 'transform 0.4s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <div className="mx-0 rounded-t-3xl bg-white px-4 pb-4 pt-2.5 shadow-[0_-4px_24px_rgba(0,0,0,0.12)]">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
          {selectedStation && (
            <BottomSheetCard station={selectedStation} onClose={() => selectStation(null)} />
          )}
        </div>
      </div>

      {selectedStation && (
        <div
          className="fixed inset-0 z-20 md:hidden"
          onClick={() => selectStation(null)}
        />
      )}

      <NotificationDrawer
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
        items={notificationItems}
      />
    </div>
  );
}

function MiniLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 100 100" fill="none" className="md:hidden">
      <circle cx="50" cy="50" r="44" stroke="#7DD3E8" strokeWidth="1.5" strokeDasharray="4 3" fill="none" opacity="0.6" />
      <path d="M35 65 C35 45 55 30 65 28 C63 38 58 50 48 58 C44 61 40 63 35 65Z" fill="#5BA83A" />
      <path d="M58 30 C58 30 70 48 70 58 C70 65 64.5 70 58 70 C51.5 70 46 65 46 58 C46 48 58 30 58 30Z" fill="#3B82F6" />
    </svg>
  );
}

function RouteMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function BottomSheetCard({ station, onClose }: { station: Station; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
        {station.imageUrl ? (
          <Image src={station.imageUrl} alt={station.name} width={64} height={64} className="h-full w-full object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary-50 text-xs text-primary-400">💧</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-bold uppercase tracking-wide text-primary-900 leading-tight">{station.name}</h3>
        <p className="mt-0.5 text-xs text-slate-400">{station.distance} &bull; {station.lastRefilled}</p>
        <div className="mt-1.5 w-36">
          <CapacityBar capacity={station.capacity} status={station.status} />
        </div>
      </div>
      {station.status !== 'unavailable' ? (
        <button
          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`)}
          className="flex-shrink-0 rounded-xl bg-primary-800 px-3 py-2 text-xs font-semibold text-white flex items-center gap-1.5"
        >
          <Navigation size={12} />
          Directions
        </button>
      ) : (
        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100">
          <X size={16} className="text-slate-400" />
        </button>
      )}
    </div>
  );
}

function NotificationDrawer({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: Array<{
    id: string;
    title: string;
    body: string;
    tone: 'info' | 'success' | 'warning';
    time: string;
  }>;
}) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-slate-950/30" onClick={onClose} />}
      <aside
        className="fixed right-0 top-0 z-50 h-full w-full max-w-sm bg-white shadow-2xl transition-transform duration-300"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Notifications</h2>
            <p className="text-xs text-slate-400">Seed-aware alerts from backend and device state</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
        <div className="h-[calc(100%-72px)] space-y-3 overflow-y-auto p-4">
          {items.map((item) => {
            const tone =
              item.tone === 'warning'
                ? {
                    icon: <AlertTriangle size={16} className="text-amber-600" />,
                    ring: 'bg-amber-50 border-amber-100',
                  }
                : item.tone === 'success'
                  ? {
                      icon: <CheckCircle2 size={16} className="text-eco-600" />,
                      ring: 'bg-eco-50 border-eco-100',
                    }
                  : {
                      icon: <Info size={16} className="text-primary-700" />,
                      ring: 'bg-primary-50 border-primary-100',
                    };

            return (
              <div key={item.id} className={`rounded-2xl border p-4 ${tone.ring}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white">
                    {item.tone === 'info' ? <Wallet size={16} className="text-primary-700" /> : tone.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{item.time}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
