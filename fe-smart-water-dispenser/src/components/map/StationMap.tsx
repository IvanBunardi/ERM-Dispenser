'use client';
import { useEffect, useRef } from 'react';
import type { Station } from '@/store/appStore';

interface Props {
  stations: Station[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function StationMap({ stations, selectedId, onSelect }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);
  const markersRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    if (typeof window === 'undefined' || mapInstance.current) return;

    // Dynamic import to avoid SSR issues
    import('leaflet').then((L) => {
      if (!mapRef.current || mapInstance.current) return;

      // Fix default icons
      const DefaultIcon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41],
      });
      L.Marker.prototype.options.icon = DefaultIcon;

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

      // Zoom control custom position
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Add markers
      stations.forEach((st) => {
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

    return () => {
      if (mapInstance.current) {
        (mapInstance.current as { remove: () => void }).remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Pan to selected station
  useEffect(() => {
    if (!mapInstance.current || !selectedId) return;
    const station = stations.find(s => s.id === selectedId);
    if (station) {
      (mapInstance.current as { panTo: (latlng: [number, number]) => void })
        .panTo([station.lat, station.lng]);
    }
  }, [selectedId]);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} className="w-full h-full" />
    </>
  );
}
