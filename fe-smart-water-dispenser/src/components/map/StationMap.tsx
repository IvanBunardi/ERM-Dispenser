'use client';
import { useEffect, useRef, useState } from 'react';
import type { Station } from '@/store/appStore';

interface Props {
  stations: Station[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  userLocation?: { lat: number; lng: number } | null;
  routeStation?: Station | null;
}

export default function StationMap({ stations, selectedId, onSelect, userLocation = null, routeStation = null }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const userMarkerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const hasFocusedUserRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (typeof window === 'undefined' || mapInstance.current) return;

    import('leaflet').then((L) => {
      if (!mapRef.current || mapInstance.current) return;

      const map = L.map(mapRef.current!, {
        center: [-6.300735, 106.639770],
        zoom: 17,
        zoomControl: false,
        attributionControl: false,
      });
      mapInstance.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
      }).addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);
      setMapReady(true);
    });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      setMapReady(false);
      userMarkerRef.current = null;
      routeLineRef.current = null;
      hasFocusedUserRef.current = false;
    };
  }, []);

  // Update Markers when stations change
  useEffect(() => {
    if (!mapInstance.current) return;

    import('leaflet').then((L) => {
      const map = mapInstance.current;

      // Clear existing markers
      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};

      // Add new markers
      stations.forEach((st) => {
        if (st.lat === null || st.lng === null) return;
        
        const color = st.status === 'available' ? '#22C55E'
          : st.status === 'partial' ? '#F59E0B' : '#EF4444';

        const icon = L.divIcon({
          html: `
            <div style="width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
              background:${color};border:2px solid white;
              box-shadow:0 2px 8px rgba(0,0,0,0.25);
              display:flex;align-items:center;justify-content:center;">
              <svg style="transform:rotate(45deg)" width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white"/>
              </svg>
            </div>`,
          className: '',
          iconSize: [36, 36],
          iconAnchor: [18, 36],
        });

        const marker = L.marker([st.lat, st.lng], { icon })
          .addTo(map)
          .on('click', () => onSelect(st.id));

        markersRef.current[st.id] = marker;
      });
    });
  }, [mapReady, onSelect, stations]);

  // Pan to selected station
  useEffect(() => {
    if (!mapInstance.current || !selectedId) return;
    const station = stations.find(s => s.id === selectedId);
    if (station && station.lat !== null && station.lng !== null) {
      mapInstance.current.panTo([station.lat, station.lng]);
    }
  }, [selectedId, stations]);

  useEffect(() => {
    if (!mapInstance.current) return;

    import('leaflet').then((L) => {
      const map = mapInstance.current;

      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }

      if (!userLocation) return;

      const userIcon = L.divIcon({
        html: `
          <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
            <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(14,165,233,0.22);"></div>
            <div style="width:14px;height:14px;border-radius:9999px;background:#0ea5e9;border:3px solid white;box-shadow:0 6px 18px rgba(14,165,233,0.32);"></div>
          </div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(map);
    });
  }, [mapReady, userLocation]);

  useEffect(() => {
    if (!mapInstance.current || !mapReady) return;

    import('leaflet').then((L) => {
      const map = mapInstance.current;

      if (routeLineRef.current) {
        routeLineRef.current.remove();
        routeLineRef.current = null;
      }

      if (!userLocation || routeStation?.lat == null || routeStation?.lng == null) return;

      routeLineRef.current = L.polyline(
        [
          [userLocation.lat, userLocation.lng],
          [routeStation.lat, routeStation.lng],
        ],
        {
          color: '#1d4ed8',
          weight: 5,
          opacity: 0.82,
          dashArray: '10 12',
          lineCap: 'round',
        },
      ).addTo(map);

      const bounds = L.latLngBounds(
        [userLocation.lat, userLocation.lng],
        [routeStation.lat, routeStation.lng],
      );
      map.fitBounds(bounds.pad(0.28), { animate: true, duration: 0.7 });
    });
  }, [mapReady, routeStation, userLocation]);

  useEffect(() => {
    if (!mapInstance.current || !mapReady || !userLocation || selectedId || routeStation) return;
    if (hasFocusedUserRef.current) return;

    mapInstance.current.setView([userLocation.lat, userLocation.lng], 15, { animate: true });
    hasFocusedUserRef.current = true;
  }, [mapReady, routeStation, selectedId, userLocation]);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} className="w-full h-full" />
    </>
  );
}
