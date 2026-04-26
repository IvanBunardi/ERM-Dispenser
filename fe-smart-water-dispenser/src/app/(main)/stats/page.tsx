'use client';
import { useEffect, useState } from 'react';
import { Waves, Gem, Trophy } from 'lucide-react';
import CircularProgress from '@/components/stats/CircularProgress';
import { useCountUp } from '@/hooks/useCountUp';
import { useAppStore } from '@/store/appStore';
import { api } from '@/lib/api';
import Image from 'next/image';

interface UserStats {
  bottlesSaved: number;
  co2ReducedKg: number;
  weeklyChangePct: number;
  ecoLevel: string;
  totalSpent: number;
  totalVolumeMl: number;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  location: string;
  points: number;
  isYou?: boolean;
}

export default function StatsPage() {
  const guest = useAppStore((s) => s.guest);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<UserStats>('/api/user/stats').catch(() => null),
      api.get<LeaderboardEntry[]>('/api/leaderboard').catch(() => []),
    ]).then(([statsRes, boardRes]) => {
      setStats(statsRes);
      // Mark "You" if matches current guest
      const board = Array.isArray(boardRes) ? boardRes : [];
      setLeaderboard(board.map((entry) => ({
        ...entry,
        isYou: guest ? entry.name === guest.displayName : false,
      })));
      setLoading(false);
    });
  }, [guest]);

  const bottles = useCountUp(stats?.bottlesSaved ?? 0);
  const co2 = useCountUp(Math.round((stats?.co2ReducedKg ?? 0) * 10), 1500);

  return (
    <div className="bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">

        {/* Header */}
        <div className="flex flex-col items-center mb-6 md:mb-8">
          <Image src="/logo.png" alt="Eco-Flow" width={48} height={48} style={{ height: 'auto' }} />
          <p className="text-slate-500 text-sm mt-2 font-medium">Your environmental impact</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 rounded-3xl bg-slate-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

              {/* Bottles Saved */}
              <div className="bg-slate-100/80 rounded-3xl p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <Waves size={24} className="text-primary-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-slate-500 mb-1">Plastic Bottles Saved</p>
                    <p className="text-5xl font-extrabold text-primary-900 leading-none">{bottles}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-xs font-bold text-eco-600 bg-eco-100 px-2 py-0.5 rounded-full">
                        +{stats?.weeklyChangePct ?? 0}% this week
                      </span>
                      <span className="text-xs text-slate-400">Keep it up, hero!</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CO2 Reduction */}
              <div className="bg-slate-100/80 rounded-3xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-slate-500 mb-1">CO2 Reduction</p>
                    <p className="text-4xl font-bold text-slate-800 leading-none">
                      {(co2 / 10).toFixed(1)}
                      <span className="text-xl font-medium text-slate-500 ml-1">kg</span>
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Gem size={14} className="text-eco-500" />
                      <span className="text-xs font-semibold text-eco-600">
                        {stats?.ecoLevel ?? guest?.ecoLevel ?? 'Seedling'} Level
                      </span>
                    </div>
                  </div>
                  <CircularProgress
                    value={Math.min(100, (stats?.bottlesSaved ?? 0) / 5)}
                    size={80}
                    strokeWidth={8}
                    color="#22C55E"
                  />
                </div>
              </div>
            </div>

            {/* Leaderboard */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Trophy size={20} className="text-amber-500" />
                  Campus Leaderboard
                </h2>
                <span className="text-sm text-slate-400">{leaderboard.length} users</span>
              </div>

              {leaderboard.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm bg-white rounded-3xl">
                  No leaderboard data yet
                </div>
              ) : (
                <div className="bg-white rounded-3xl overflow-hidden shadow-sm divide-y divide-slate-100">
                  {leaderboard.slice(0, 10).map((item, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${
                        item.isYou ? 'bg-primary-50 border-l-4 border-primary-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Rank */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        item.rank === 1 ? 'bg-amber-100 text-amber-700'
                        : item.rank === 2 ? 'bg-slate-100 text-slate-600'
                        : item.rank === 3 ? 'bg-orange-100 text-orange-600'
                        : 'bg-transparent text-slate-500'
                      }`}>
                        {item.rank}
                      </div>

                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
                        item.isYou
                          ? 'bg-gradient-to-br from-primary-600 to-eco-500 text-white ring-2 ring-primary-300'
                          : 'bg-slate-200 text-slate-500'
                      }`}>
                        {item.name.charAt(0)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${item.isYou ? 'text-primary-800' : 'text-slate-800'}`}>
                          {item.name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{item.location}</p>
                      </div>

                      {/* Points */}
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-bold ${item.isYou ? 'text-primary-700' : 'text-slate-700'}`}>
                          {item.points.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-400">pts</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
