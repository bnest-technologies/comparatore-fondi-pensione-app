import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { MontanteSeriesPoint } from '../../types';
import { formatCurrency } from '../../utils/simulatorCalc';

/* ── Custom tooltip for simulator charts ──────────────────────── */
const SERIES_META: Record<string, { label: string; color: string }> = {
  montanteSenzaFiscale: { label: 'Senza beneficio fiscale', color: 'rgb(var(--brand-chart-1-rgb) / 1)' },
  montanteConFiscale: { label: 'Con beneficio fiscale', color: 'rgb(var(--brand-chart-2-rgb) / 1)' },
  montanteTFR: { label: 'TFR in azienda', color: 'rgb(var(--brand-chart-5-rgb) / 1)' },
  versatoCumulato: { label: 'Importi versati', color: 'rgb(var(--brand-chart-4-rgb) / 1)' },
};

const SimulatorTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: number; theme: string }> = ({
  active,
  payload,
  label,
  theme,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const isDark = theme === 'dark';
  const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 640;

  return (
    <div
      className="rounded-lg border shadow-lg px-2.5 py-2 sm:px-3 sm:py-2.5"
      style={{
        backgroundColor: isDark ? 'rgb(var(--brand-primary-deep-rgb) / 1)' : 'rgb(var(--brand-white-rgb) / 1)',
        borderColor: isDark ? 'rgb(var(--brand-primary-bright-rgb) / 1)' : 'rgb(var(--brand-accent-surface-rgb) / 1)',
        maxWidth: isSmallScreen ? 200 : 280,
      }}
    >
      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
        Anno {label}
      </p>
      <div className="space-y-1">
        {[...payload]
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map((entry: any) => {
            const meta = SERIES_META[entry.dataKey as string];
            const seriesLabel = meta?.label ?? entry.name ?? entry.dataKey;
            const color = meta?.color ?? entry.color ?? 'rgb(var(--brand-primary-rgb) / 1)';
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

interface MontanteChartProps {
  data: MontanteSeriesPoint[];
  theme: string;
  showFiscale?: boolean;
  showTFR?: boolean;
  showVersatoCumulato?: boolean;
}

const MontanteChart: React.FC<MontanteChartProps> = ({
  data,
  theme,
  showFiscale = false,
  showTFR = true,
  showVersatoCumulato = false,
}) => {
  const tickColor = theme === 'dark' ? 'rgb(var(--brand-accent-surface-rgb) / 1)' : 'rgb(var(--brand-primary-rgb) / 1)';
  const gridColor = theme === 'dark' ? 'rgb(var(--brand-primary-bright-rgb) / 1)' : 'rgb(var(--brand-accent-surface-rgb) / 1)';

  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
        <div className="text-center">
          <svg
            className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <p className="text-sm font-medium">Nessun dato da visualizzare</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
    <ResponsiveContainer width="100%" height={isMobile ? 260 : 300}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 16 }}>
        <defs>
          <linearGradient id="colorMontanteSenzaFiscale" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={SERIES_META.montanteSenzaFiscale.color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={SERIES_META.montanteSenzaFiscale.color} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorMontanteConFiscale" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={SERIES_META.montanteConFiscale.color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={SERIES_META.montanteConFiscale.color} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorMontanteTFR" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={SERIES_META.montanteTFR.color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={SERIES_META.montanteTFR.color} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorVersatoCumulato" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={SERIES_META.versatoCumulato.color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={SERIES_META.versatoCumulato.color} stopOpacity={0} />
          </linearGradient>
        </defs>
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
          tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
          label={{
            value: 'Montante (€)',
            angle: -90,
            position: 'insideLeft',
            style: { fill: tickColor, fontSize: isMobile ? '11px' : '12px', textAnchor: 'middle' },
          }}
        />
        <Tooltip
          content={<SimulatorTooltip theme={theme} />}
          allowEscapeViewBox={{ x: false, y: false }}
          wrapperStyle={{ pointerEvents: 'none', zIndex: 10 }}
        />
        <Legend
          wrapperStyle={{ fontSize: isMobile ? '11px' : '12px', paddingTop: 12 }}
          iconType="line"
          iconSize={isMobile ? 12 : 14}
        />

        {showTFR && (
          <Area
            type="monotone"
            dataKey="montanteTFR"
            name="TFR in azienda"
            stroke={SERIES_META.montanteTFR.color}
            strokeWidth={2}
            strokeDasharray="5 5"
            fill="url(#colorMontanteTFR)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        )}

        <Area
          type="monotone"
          dataKey="montanteSenzaFiscale"
          name="Senza beneficio fiscale"
          stroke={SERIES_META.montanteSenzaFiscale.color}
          strokeWidth={2.5}
          fill="url(#colorMontanteSenzaFiscale)"
          dot={false}
          activeDot={{ r: 5 }}
        />

        {showFiscale && (
          <Area
            type="monotone"
            dataKey="montanteConFiscale"
            name="Con beneficio fiscale"
            stroke={SERIES_META.montanteConFiscale.color}
            strokeWidth={2.5}
            fill="url(#colorMontanteConFiscale)"
            dot={false}
            activeDot={{ r: 5 }}
          />
        )}

        {showVersatoCumulato && (
          <Area
            type="monotone"
            dataKey="versatoCumulato"
            name="Importi versati"
            stroke={SERIES_META.versatoCumulato.color}
            strokeWidth={2.5}
            fill="url(#colorVersatoCumulato)"
            dot={false}
            activeDot={{ r: 5 }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
    </div>
  );
};

export default MontanteChart;
