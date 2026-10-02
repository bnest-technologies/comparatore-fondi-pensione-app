import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { formatCurrency } from '../../utils/simulatorCalc';

/** One series per fund + an optional TFR baseline */
export interface ComparisonSeriesPoint {
  anno: number;
  [fundKey: string]: number;
}

interface FundSeriesMeta {
  dataKey: string;
  label: string;
  color: string;
}

/* ── Tooltip ─────────────────────────────────────────────────── */
const ComparisonTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string; name: string }>;
  label?: number;
  theme: string;
  meta: FundSeriesMeta[];
}> = ({ active, payload, label, theme, meta }) => {
  if (!active || !payload || payload.length === 0) return null;
  const isDark = theme === 'dark';
  const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 640;

  const metaMap = new Map<string, FundSeriesMeta>(meta.map((m) => [m.dataKey, m]));

  return (
    <div
      className="rounded-lg border shadow-lg px-2.5 py-2 sm:px-3 sm:py-2.5"
      style={{
        backgroundColor: isDark ? 'rgb(var(--brand-primary-deep-rgb) / 1)' : 'rgb(var(--brand-white-rgb) / 1)',
        borderColor: isDark ? 'rgb(var(--brand-primary-bright-rgb) / 1)' : 'rgb(var(--brand-accent-surface-rgb) / 1)',
        maxWidth: isSmallScreen ? 200 : 320,
      }}
    >
      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
        Anno {label}
      </p>
      <div className="space-y-1">
        {[...payload]
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map((entry) => {
            const m = metaMap.get(entry.dataKey);
            const seriesLabel = m?.label ?? entry.name ?? entry.dataKey;
            const color = m?.color ?? entry.color ?? 'rgb(var(--brand-primary-rgb) / 1)';
            return (
              <div key={entry.dataKey} className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="truncate text-slate-600 dark:text-slate-300">{seriesLabel}</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums flex-shrink-0">
                  {formatCurrency(entry.value ?? 0)}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
};

/* ── Chart ────────────────────────────────────────────────────── */
interface ComparisonMontanteChartProps {
  data: ComparisonSeriesPoint[];
  fundsMeta: FundSeriesMeta[];
  theme: string;
  /** Optional key for a TFR baseline series */
  tfrDataKey?: string;
}

const ComparisonMontanteChart: React.FC<ComparisonMontanteChartProps> = ({
  data,
  fundsMeta,
  theme,
  tfrDataKey,
}) => {
  const tickColor = theme === 'dark' ? 'rgb(var(--brand-accent-surface-rgb) / 1)' : 'rgb(var(--brand-primary-rgb) / 1)';
  const gridColor = theme === 'dark' ? 'rgb(var(--brand-primary-bright-rgb) / 1)' : 'rgb(var(--brand-accent-surface-rgb) / 1)';

  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
        <p className="text-sm font-medium">Nessun dato da visualizzare</p>
      </div>
    );
  }

  const allMeta: FundSeriesMeta[] = [
    ...fundsMeta,
    ...(tfrDataKey
      ? [{ dataKey: tfrDataKey, label: 'TFR in azienda', color: 'rgb(var(--brand-chart-5-rgb) / 1)' }]
      : []),
  ];

  return (
    <div className="relative overflow-hidden">
    <ResponsiveContainer width="100%" height={isMobile ? 280 : 340}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey="anno"
          stroke={tickColor}
          style={{ fontSize: isMobile ? '11px' : '12px' }}
          label={{
            value: 'Anni',
            position: 'insideBottom',
            offset: -5,
            style: { fill: tickColor, fontSize: isMobile ? '11px' : '12px' },
          }}
        />
        <YAxis
          stroke={tickColor}
          style={{ fontSize: isMobile ? '11px' : '12px' }}
          tickFormatter={(value: number) => `€${(value / 1000).toFixed(0)}k`}
          label={{
            value: 'Montante (€)',
            angle: -90,
            position: 'insideLeft',
            style: { fill: tickColor, fontSize: isMobile ? '11px' : '12px', textAnchor: 'middle' },
          }}
        />
        <Tooltip
          content={<ComparisonTooltip theme={theme} meta={allMeta} />}
          allowEscapeViewBox={{ x: false, y: false }}
          wrapperStyle={{ pointerEvents: 'none', zIndex: 10 }}
        />
        <Legend
          wrapperStyle={{ fontSize: isMobile ? '11px' : '12px', paddingTop: 12 }}
          iconType="line"
          iconSize={isMobile ? 12 : 14}
        />

        {/* TFR baseline (dashed) */}
        {tfrDataKey && (
          <Line
            type="monotone"
            dataKey={tfrDataKey}
            name="TFR in azienda"
            stroke="rgb(var(--brand-chart-5-rgb) / 1)"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 4 }}
          />
        )}

        {/* One solid line per fund */}
        {fundsMeta.map((m) => (
          <Line
            key={m.dataKey}
            type="monotone"
            dataKey={m.dataKey}
            name={m.label}
            stroke={m.color}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
};

export default ComparisonMontanteChart;
