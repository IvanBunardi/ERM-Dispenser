'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  name: string;
  distance: string;
  lastRefilled: string;
  capacity: number;
  status: 'available' | 'partial' | 'unavailable';
  imageUrl: string;
  lat: number;
  lng: number;
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
}

export type FilterType = 'nearest' | 'verified' | 'highCapacity';

function generateDisplayId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function createGuestUser(): GuestUser {
  const displayId = generateDisplayId();
  return {
    id: crypto.randomUUID(),
    displayId,
    displayName: `Guest_${displayId}`,
    createdAt: new Date().toISOString(),
    bottlesSaved: 0,
    totalSpent: 0,
    co2Reduced: 0,
    ecoLevel: 'Seedling',
    weeklyChange: 0,
  };
}

// Mock demo data for a user that has been using the app
const DEMO_USER: Partial<GuestUser> = {
  bottlesSaved: 250,
  totalSpent: 124000,
  co2Reduced: 14.2,
  ecoLevel: 'Emerald',
  weeklyChange: 12,
};

interface AppStore {
  guest: GuestUser | null;
  isInitialized: boolean;
  hasSeenOnboarding: boolean;
  activeFilter: FilterType;
  selectedStationId: string | null;
  notifications: number;

  initGuest: () => void;
  updateDisplayName: (name: string) => void;
  resetGuest: () => void;
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
      notifications: 2,

      initGuest: () => {
        if (!get().guest) {
          const newGuest = { ...createGuestUser(), ...DEMO_USER };
          set({ guest: newGuest as GuestUser, isInitialized: true });
        } else {
          set({ isInitialized: true });
        }
      },

      updateDisplayName: (name: string) => {
        const guest = get().guest;
        if (guest) set({ guest: { ...guest, displayName: name } });
      },

      resetGuest: () => {
        const newGuest = createGuestUser();
        set({ guest: newGuest, hasSeenOnboarding: false });
      },

      setFilter: (f) => set({ activeFilter: f }),
      selectStation: (id) => set({ selectedStationId: id }),
      setOnboarded: () => set({ hasSeenOnboarding: true }),
    }),
    {
      name: 'ecoflow-guest',
      partialize: (state) => ({
        guest: state.guest,
        hasSeenOnboarding: state.hasSeenOnboarding,
      }),
    }
  )
);

// Mock stations data
export const MOCK_STATIONS: Station[] = [
  {
    id: '1',
    name: 'AUDITORIUM PRASMUL',
    distance: '250m away',
    lastRefilled: 'Refilled 2h ago',
    capacity: 92,
    status: 'available',
    imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=120&h=120&fit=crop',
    lat: -6.3003,
    lng: 106.6395,
    isVerified: true,
  },
  {
    id: '2',
    name: 'LOBBY EKA TJIPTA WIDJAJA',
    distance: '30m away',
    lastRefilled: 'Refilled 20 min ago',
    capacity: 0,
    status: 'unavailable',
    imageUrl: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=120&h=120&fit=crop',
    lat: -6.3008,
    lng: 106.6392,
    isVerified: true,
  },
  {
    id: '3',
    name: 'GEDUNG PMBS',
    distance: '500m away',
    lastRefilled: 'Refilled 5h ago',
    capacity: 50,
    status: 'partial',
    imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=120&h=120&fit=crop',
    lat: -6.3013,
    lng: 106.6400,
    isVerified: false,
  },
  {
    id: '4',
    name: 'EM AND ENGINEERING LAB',
    distance: '700m away',
    lastRefilled: 'Refilled 1h ago',
    capacity: 78,
    status: 'available',
    imageUrl: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=120&h=120&fit=crop',
    lat: -6.3010,
    lng: 106.6404,
    isVerified: true,
  },
];

export const MOCK_HISTORY: RefillHistory[] = [
  { id: '1', stationName: 'Oasis Hub Central', waterType: '1.5L Alkaline Water', amount: 3000, currency: 'IDR', date: 'Today', time: '2:45 PM' },
  { id: '2', stationName: 'GreenWay Station', waterType: '500ml Mineral Water', amount: 1500, currency: 'IDR', date: 'Yesterday', time: '2:45 PM' },
  { id: '3', stationName: 'Metro Park Refill', waterType: '2.0L Purified Water', amount: 5000, currency: 'IDR', date: 'Tuesday', time: '2:45 PM' },
  { id: '4', stationName: 'AUDITORIUM PRASMUL', waterType: '1.0L Mineral Water', amount: 2500, currency: 'IDR', date: 'Monday', time: '11:30 AM' },
  { id: '5', stationName: 'LOBBY EKA TJIPTA', waterType: '750ml Alkaline Water', amount: 2000, currency: 'IDR', date: 'Last Week', time: '3:15 PM' },
];

export const LEADERBOARD = [
  { rank: 1, name: 'Alex Rivers', location: 'Engineering Block', points: 1240, isYou: false },
  { rank: 2, name: 'Sarah Chen', location: 'Design Studio', points: 982, isYou: false },
  { rank: 3, name: 'Budi Santoso', location: 'Science Lab', points: 754, isYou: false },
  { rank: 12, name: 'You', location: 'Main Library', points: 250, isYou: true },
];
