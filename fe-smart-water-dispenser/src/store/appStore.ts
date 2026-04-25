'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

export type EcoLevel = 'Seedling' | 'Sprout' | 'Sapling' | 'Tree' | 'Emerald';

export interface GuestUser {
  id: string;
  displayId: string;
  displayName: string;
  createdAt: string;
  bottlesSaved: number;
  totalSpent: number;
  co2Reduced: number;
  ecoLevel: EcoLevel;
  weeklyChange: number;
}

export interface Station {
  id: string;
  machineCode: string;
  shortCode?: string;
  name: string;
  distance: string;
  distanceMeters: number | null;
  lastRefilled: string;
  capacity: number;
  status: 'available' | 'partial' | 'unavailable';
  imageUrl: string | null;
  lat: number | null;
  lng: number | null;
  isVerified: boolean;
}

export interface RefillHistory {
  id: string;
  stationName: string;
  waterType: string;
  amount: number;
  currency: string;
  date: string;
  time: string;
  paymentStatus?: string;
  dispenseStatus?: string;
}

export type FilterType = 'nearest' | 'verified' | 'highCapacity';

interface AppStore {
  guest: GuestUser | null;
  isInitialized: boolean;
  hasSeenOnboarding: boolean;
  activeFilter: FilterType;
  selectedStationId: string | null;
  notifications: number;

  initGuest: () => Promise<void>;
  refreshGuest: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  resetGuest: () => Promise<void>;
  setFilter: (f: FilterType) => void;
  selectStation: (id: string | null) => void;
  setOnboarded: () => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      guest: null,
      isInitialized: false,
      hasSeenOnboarding: false,
      activeFilter: 'nearest',
      selectedStationId: null,
      notifications: 0,

      initGuest: async () => {
        try {
          // Try to hydrate from existing session first
          const meRes = await api.get<{ guest: any; preferences: any }>('/api/guest/me');
          const g = meRes.guest;
          set({
            guest: {
              id: g.id,
              displayId: g.displayId,
              displayName: g.displayName,
              createdAt: g.createdAt ?? g.lastActiveAt ?? new Date().toISOString(),
              bottlesSaved: g.bottlesSaved ?? 0,
              totalSpent: g.totalSpent ?? 0,
              co2Reduced: g.co2Reduced ?? 0,
              ecoLevel: (g.ecoLevel as EcoLevel) ?? 'Seedling',
              weeklyChange: g.weeklyChange ?? 0,
            },
            isInitialized: true,
          });
        } catch {
          // No session — create new guest
          try {
            const initRes = await api.post<{ guest: any; preferences: any }>('/api/guest/init', {});
            const g = initRes.guest;
            set({
              guest: {
                id: g.id,
                displayId: g.displayId,
                displayName: g.displayName,
                createdAt: g.createdAt ?? new Date().toISOString(),
                bottlesSaved: 0,
                totalSpent: 0,
                co2Reduced: 0,
                ecoLevel: 'Seedling',
                weeklyChange: 0,
              },
              isInitialized: true,
            });
          } catch (err) {
            console.error('Failed to init guest:', err);
            set({ isInitialized: true });
          }
        }
      },

      refreshGuest: async () => {
        try {
          const meRes = await api.get<{ guest: any; preferences: any }>('/api/guest/me');
          const g = meRes.guest;
          set({
            guest: {
              id: g.id,
              displayId: g.displayId,
              displayName: g.displayName,
              createdAt: g.createdAt ?? g.lastActiveAt ?? new Date().toISOString(),
              bottlesSaved: g.bottlesSaved ?? 0,
              totalSpent: g.totalSpent ?? 0,
              co2Reduced: g.co2Reduced ?? 0,
              ecoLevel: (g.ecoLevel as EcoLevel) ?? 'Seedling',
              weeklyChange: g.weeklyChange ?? 0,
            },
          });
        } catch (err) {
          console.error('Failed to refresh guest:', err);
        }
      },

      updateDisplayName: async (name: string) => {
        const guest = get().guest;
        if (!guest) return;
        await api.put('/api/user/profile', { displayName: name });
        set({ guest: { ...guest, displayName: name } });
      },

      resetGuest: async () => {
        try {
          await api.delete('/api/guest/reset');
        } catch {
          // ignore
        }
        set({ guest: null, isInitialized: false, hasSeenOnboarding: false });
      },

      setFilter: (f) => set({ activeFilter: f }),
      selectStation: (id) => set({ selectedStationId: id }),
      setOnboarded: () => set({ hasSeenOnboarding: true }),
    }),
    {
      name: 'ecoflow-guest',
      partialize: (state) => ({
        hasSeenOnboarding: state.hasSeenOnboarding,
        activeFilter: state.activeFilter,
      }),
    },
  ),
);
