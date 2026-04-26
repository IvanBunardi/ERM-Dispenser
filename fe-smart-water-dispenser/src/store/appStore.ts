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

export interface GuestPreferences {
  notificationsEnabled: boolean;
  publicLeaderboard: boolean;
  languageCode: string;
}

export interface PermissionPreferences {
  hasSeenPrompt: boolean;
  locationEnabled: boolean;
  cameraEnabled: boolean;
}

function normalizePreferences(input: Record<string, unknown> | null | undefined): GuestPreferences {
  return {
    notificationsEnabled: input?.notificationsEnabled !== false,
    publicLeaderboard: input?.publicLeaderboard !== false,
    languageCode:
      typeof input?.languageCode === 'string'
        ? input.languageCode
        : typeof input?.language === 'string'
          ? input.language
          : 'en',
  };
}

interface AppStore {
  guest: GuestUser | null;
  preferences: GuestPreferences;
  permissionPrefs: PermissionPreferences;
  isInitialized: boolean;
  hasSeenOnboarding: boolean;
  activeFilter: FilterType;
  selectedStationId: string | null;
  notifications: number;

  initGuest: () => Promise<void>;
  refreshGuest: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  updatePreferences: (patch: Partial<GuestPreferences>) => Promise<void>;
  updatePermissionPrefs: (patch: Partial<PermissionPreferences>) => void;
  resetGuest: () => Promise<void>;
  setFilter: (f: FilterType) => void;
  selectStation: (id: string | null) => void;
  setOnboarded: () => void;
  setNotificationCount: (count: number) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      guest: null,
      preferences: normalizePreferences(undefined),
      permissionPrefs: {
        hasSeenPrompt: false,
        locationEnabled: false,
        cameraEnabled: false,
      },
      isInitialized: false,
      hasSeenOnboarding: false,
      activeFilter: 'nearest',
      selectedStationId: null,
      notifications: 0,

      initGuest: async () => {
        try {
          // Try to hydrate from existing session first
          const meRes = await api.get<{ guest: Record<string, unknown>; preferences: Record<string, unknown> }>('/api/guest/me');
          const g = meRes.guest;
          set({
            guest: {
              id: String(g.id ?? ''),
              displayId: String(g.displayId ?? ''),
              displayName: String(g.displayName ?? 'Guest'),
              createdAt: String(g.createdAt ?? g.lastActiveAt ?? new Date().toISOString()),
              bottlesSaved: Number(g.bottlesSaved ?? 0),
              totalSpent: Number(g.totalSpent ?? 0),
              co2Reduced: Number(g.co2Reduced ?? 0),
              ecoLevel: (g.ecoLevel as EcoLevel) ?? 'Seedling',
              weeklyChange: Number(g.weeklyChange ?? 0),
            },
            preferences: normalizePreferences(meRes.preferences),
            isInitialized: true,
          });
        } catch {
          // No session — create new guest
          try {
            const initRes = await api.post<{ guest: Record<string, unknown>; preferences: Record<string, unknown> }>('/api/guest/init', {});
            const g = initRes.guest;
            set({
              guest: {
                id: String(g.id ?? ''),
                displayId: String(g.displayId ?? ''),
                displayName: String(g.displayName ?? 'Guest'),
                createdAt: String(g.createdAt ?? new Date().toISOString()),
                bottlesSaved: 0,
                totalSpent: 0,
                co2Reduced: 0,
                ecoLevel: 'Seedling',
                weeklyChange: 0,
              },
              preferences: normalizePreferences(initRes.preferences),
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
          const meRes = await api.get<{ guest: Record<string, unknown>; preferences: Record<string, unknown> }>('/api/guest/me');
          const g = meRes.guest;
          set({
            guest: {
              id: String(g.id ?? ''),
              displayId: String(g.displayId ?? ''),
              displayName: String(g.displayName ?? 'Guest'),
              createdAt: String(g.createdAt ?? g.lastActiveAt ?? new Date().toISOString()),
              bottlesSaved: Number(g.bottlesSaved ?? 0),
              totalSpent: Number(g.totalSpent ?? 0),
              co2Reduced: Number(g.co2Reduced ?? 0),
              ecoLevel: (g.ecoLevel as EcoLevel) ?? 'Seedling',
              weeklyChange: Number(g.weeklyChange ?? 0),
            },
            preferences: normalizePreferences(meRes.preferences),
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

      updatePreferences: async (patch) => {
        await api.patch('/api/settings/preferences', patch);
        set((state) => ({
          preferences: {
            ...state.preferences,
            ...patch,
          },
        }));
      },

      updatePermissionPrefs: (patch) => {
        set((state) => ({
          permissionPrefs: {
            ...state.permissionPrefs,
            ...patch,
          },
        }));
      },

      resetGuest: async () => {
        try {
          await api.delete('/api/guest/reset');
        } catch {
          // ignore
        }
        set({
          guest: null,
          preferences: normalizePreferences(undefined),
          permissionPrefs: {
            hasSeenPrompt: false,
            locationEnabled: false,
            cameraEnabled: false,
          },
          isInitialized: false,
          hasSeenOnboarding: false,
          notifications: 0,
        });
      },

      setFilter: (f) => set({ activeFilter: f }),
      selectStation: (id) => set({ selectedStationId: id }),
      setOnboarded: () => set({ hasSeenOnboarding: true }),
      setNotificationCount: (count) => set({ notifications: count }),
    }),
    {
      name: 'ecoflow-guest',
      partialize: (state) => ({
        hasSeenOnboarding: state.hasSeenOnboarding,
        activeFilter: state.activeFilter,
        permissionPrefs: state.permissionPrefs,
      }),
    },
  ),
);
