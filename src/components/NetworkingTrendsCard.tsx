import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, TrendingUp, Users } from 'lucide-react';
import { apiFetch } from '../lib/apiClient';
import type { AppLanguage } from '../lib/i18n';
import { UI_COPY } from '../lib/i18n';
import { buildNetworkingTrends30Days } from '../lib/networkingTrends';
import { readOfflineCache, writeOfflineCache } from '../lib/offlineSync';
import type {
  ContactConnection,
  EventRegistration,
  NetworkingTrendsResponse,
  ScannedBadgeContact,
} from '../types/domain';

interface NetworkingTrendsCardProps {
  userId?: string;
  lang: AppLanguage;
  registrations: EventRegistration[];
  connections?: ContactConnection[];
  scannedBadges?: ScannedBadgeContact[];
  darkMode?: boolean;
}

type ChartMetricMode = 'both' | 'connections' | 'interactions';

export const NetworkingTrendsCard: React.FC<NetworkingTrendsCardProps> = ({
  userId,
  lang,
  registrations,
  connections = [],
  scannedBadges = [],
  darkMode = false,
}) => {
  const t = UI_COPY[lang];
  const [metricMode, setMetricMode] = useState<ChartMetricMode>('both');
  const [trends, setTrends] = useState<NetworkingTrendsResponse>(() =>
    buildNetworkingTrends30Days({
      connections,
      messages: [],
      groupMessages: [],
      registrations,
      scannedBadges,
      userId,
      lang,
    })
  );

  useEffect(() => {
    let active = true;
    const cacheKey = userId ? `networking_trends_${userId}_${lang}` : `networking_trends_public_${lang}`;

    apiFetch<NetworkingTrendsResponse>(`/api/analytics/networking-trends?lang=${lang}`)
      .then(async (res) => {
        if (!active) return;
        setTrends(res);
        await writeOfflineCache(cacheKey, res);
      })
      .catch(async () => {
        const cached = await readOfflineCache<NetworkingTrendsResponse>(cacheKey);
        if (active && cached) {
          setTrends(cached);
        } else if (active) {
          setTrends(
            buildNetworkingTrends30Days({
              connections,
              messages: [],
              groupMessages: [],
              registrations,
              scannedBadges,
              userId,
              lang,
            })
          );
        }
      });

    return () => {
      active = false;
    };
  }, [userId, lang, registrations.length, connections.length, scannedBadges.length]);

  const strokeConnections = '#E85002';
  const strokeInteractions = darkMode ? '#D9C3AB' : '#333333';
  const gridStroke = darkMode ? 'rgba(249,249,249,0.10)' : 'rgba(0,0,0,0.08)';
  const axisTickColor = darkMode ? '#A7A7A7' : '#646464';

  return (
    <section
      aria-labelledby="networking-trends-heading"
      className="porcelain-card rounded-[26px] p-5 sm:p-6 space-y-5 min-w-0"
    >
      {/* Header Row + Segmented Control */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E85002]/15 text-[#E85002] border border-[#E85002]/25">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <h2
              id="networking-trends-heading"
              className="text-base sm:text-lg font-bold text-[#000000] dark:text-[#F9F9F9]"
            >
              {t.networkingTrendsTitle}
            </h2>
            <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">{t.networkingTrendsSub}</p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label={lang === 'en' ? 'Filter networking trends chart' : 'Filtrer la courbe de réseautage'}
          className="ios-segmented inline-flex self-start sm:self-auto"
        >
          {(
            [
              { id: 'both', label: lang === 'en' ? 'All' : 'Tout' },
              { id: 'connections', label: lang === 'en' ? 'Connections' : 'Connexions' },
              { id: 'interactions', label: 'Interactions' },
            ] as const
          ).map((opt) => {
            const active = metricMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMetricMode(opt.id)}
                className={`min-h-[32px] rounded-full px-3.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  active
                    ? 'bg-[#E85002] text-[#F9F9F9] shadow-xs'
                    : 'text-[#333333] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3 Inset Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        <div className="rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-3.5 py-3">
          <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-[#E85002] shrink-0" />
            <span className="truncate">{lang === 'en' ? 'Connections' : 'Connexions'}</span>
          </p>
          <p className="mt-1 font-mono text-xl sm:text-2xl font-bold text-[#000000] dark:text-[#F9F9F9] tabular-nums">
            {trends.summary.totalConnections30d}
          </p>
        </div>

        <div className="rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-3.5 py-3">
          <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-[#F16001] shrink-0" />
            <span className="truncate">{lang === 'en' ? 'Interactions (30d)' : 'Interactions (30j)'}</span>
          </p>
          <p className="mt-1 font-mono text-xl sm:text-2xl font-bold text-[#000000] dark:text-[#F9F9F9] tabular-nums">
            {trends.summary.totalInteractions30d}
          </p>
        </div>

        <div className="rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-3.5 py-3">
          <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] truncate">
            {lang === 'en' ? '30d Growth' : 'Progression 30j'}
          </p>
          <p className="mt-1 font-mono text-xl sm:text-2xl font-bold text-[#E85002] dark:text-[#F16001] tabular-nums">
            +{trends.summary.growthPct}%
          </p>
        </div>
      </div>

      {/* Recharts 30-Day Responsive Area Visualization */}
      <div className="h-56 sm:h-64 w-full min-w-0" data-testid="networking-trends-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trends.series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="aeConnGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeConnections} stopOpacity={0.42} />
                <stop offset="95%" stopColor={strokeConnections} stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="aeInterGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeInteractions} stopOpacity={0.32} />
                <stop offset="95%" stopColor={strokeInteractions} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: axisTickColor, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fill: axisTickColor, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                return (
                  <div className="rounded-2xl border border-[var(--ae-border)] bg-white/95 dark:bg-[#121214]/95 px-3.5 py-2.5 shadow-lg backdrop-blur-md text-xs">
                    <p className="font-bold text-[#000000] dark:text-[#F9F9F9] mb-1">{label}</p>
                    {payload.map((entry) => (
                      <div key={entry.dataKey as string} className="flex items-center justify-between gap-4 py-0.5">
                        <span className="flex items-center gap-1.5 text-[#333333] dark:text-[#A7A7A7]">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          {entry.name}
                        </span>
                        <span className="font-mono font-bold text-[#000000] dark:text-[#F9F9F9] tabular-nums">
                          {entry.value}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {(metricMode === 'both' || metricMode === 'connections') && (
              <Area
                type="monotone"
                dataKey="connections"
                name={lang === 'en' ? 'Connections' : 'Connexions'}
                stroke={strokeConnections}
                strokeWidth={2.5}
                fill="url(#aeConnGrad)"
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            )}
            {(metricMode === 'both' || metricMode === 'interactions') && (
              <Area
                type="monotone"
                dataKey="interactions"
                name="Interactions"
                stroke={strokeInteractions}
                strokeWidth={2.5}
                fill="url(#aeInterGrad)"
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};
