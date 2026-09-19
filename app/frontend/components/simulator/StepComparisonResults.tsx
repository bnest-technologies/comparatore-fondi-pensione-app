import React, { useMemo } from 'react';
import type { PensionFund } from '../../types';
import {
  getRendimentoProxyWithLabel,
  calcolaMontante,
  calcolaMontanteTFR,
  calcolaTfrAnnuoDaRal,
  calcolaRisparmioFiscaleAnnuo,
  calcolaAliquotaSostitutiva,
  formatCurrency,
  formatPercentage,
} from '../../utils/simulatorCalc';
import { CHART_COLORS } from '../../utils/colorMapping';
import { formatShortFundLabel } from '../../utils/fundLabel';
import ComparisonMontanteChart, { type ComparisonSeriesPoint } from './ComparisonMontanteChart';
import RenditaConfronto from './RenditaConfronto';

type ActiveStep = 'montante' | 'fiscale' | 'imposta';

interface StepComparisonResultsProps {
  activeStep: ActiveStep;
  funds: PensionFund[];
  montanteIniziale: number;
  contributoVolontarioAnnuo: number;
  orizzonteAnni: number;
  tassoRendimento: number;
  ral: number;
  annoPrimaAdesione: number;
  theme: string;
  onRemoveFund?: (fundId: string) => void;
}

interface FundSimResult {
  fund: PensionFund;
  color: string;
  tassoRendimento: number;
  rendimentoLabel: string;
  rendimentoYears: number;
  /* Step 1 — Montante */
  totaleVersato: number;
  montanteFinale: number;
  guadagnoRendimenti: number;
  rendimentoPercentuale: number;
  /* Step 2 — Fiscale */
  risparmioAnnuo: number;
  risparmioFiscaleTotale: number;
  montanteSenzaFiscale: number;
  montanteConFiscale: number;
  differenzaMontante: number;
  differenzaPercentuale: number;
  aliquotaMarginale: number;
  /* Step 3 — Netto */
  aliquotaSostitutiva: number;
  anniPartecipazione: number;
  montanteNetto: number;
  impostaSostitutiva: number;
  rendimentoNettoPercentuale: number;
}

const StepComparisonResults: React.FC<StepComparisonResultsProps> = ({
  activeStep,
  funds,
  montanteIniziale,
  contributoVolontarioAnnuo,
  orizzonteAnni,
  tassoRendimento: _defaultTasso,
  ral,
  annoPrimaAdesione,
  theme,
  onRemoveFund,
}) => {
  const annoCorrente = new Date().getFullYear();
  const tfrAnnuoDatore = useMemo(() => calcolaTfrAnnuoDaRal(ral), [ral]);
  const contributoTotaleAnnuo = contributoVolontarioAnnuo + tfrAnnuoDatore;

  /* ── Per-fund simulation results ───────────────────────────── */
  const fundResults: FundSimResult[] = useMemo(() => {
    return funds.map((fund, idx) => {
      const proxyInfo = getRendimentoProxyWithLabel(fund);
      const tasso = proxyInfo?.rate ?? 5.0;
      const label = proxyInfo?.label ?? 'default';
      const years = proxyInfo?.years ?? 10;

      const totaleVersato = montanteIniziale + contributoTotaleAnnuo * orizzonteAnni;

      /* Step 1 - Montante (senza fiscale) */
      const serieSenzaFiscale = calcolaMontante(montanteIniziale, contributoTotaleAnnuo, tasso, orizzonteAnni);
      const montanteFinale = serieSenzaFiscale[orizzonteAnni] ?? 0;
      const guadagnoRendimenti = montanteFinale - totaleVersato;
      const rendimentoPercentuale = totaleVersato > 0 ? (montanteFinale / totaleVersato - 1) * 100 : 0;

      /* Step 2 - Fiscale */
      const { risparmioAnnuo, aliquotaMarginale } = calcolaRisparmioFiscaleAnnuo(contributoVolontarioAnnuo, ral);
      const risparmioFiscaleTotale = risparmioAnnuo * orizzonteAnni;
      const contributoEffettivo = contributoTotaleAnnuo + risparmioAnnuo;
      const serieConFiscale = calcolaMontante(montanteIniziale, contributoEffettivo, tasso, orizzonteAnni);
      const montanteConFiscale = serieConFiscale[orizzonteAnni] ?? 0;
      const differenzaMontante = montanteConFiscale - montanteFinale;
      const differenzaPercentuale = montanteFinale > 0 ? (differenzaMontante / montanteFinale) * 100 : 0;

      /* Step 3 - Netto */
      const { aliquota: aliquotaSostitutiva, anniPartecipazione } = calcolaAliquotaSostitutiva(
        annoPrimaAdesione,
        annoCorrente,
        orizzonteAnni,
      );
      const impostaSostitutiva = montanteConFiscale * aliquotaSostitutiva;
      const montanteNetto = montanteConFiscale - impostaSostitutiva;
      const rendimentoNettoPercentuale = totaleVersato > 0 ? (montanteNetto / totaleVersato - 1) * 100 : 0;

      return {
        fund,
        color: CHART_COLORS[idx % CHART_COLORS.length],
        tassoRendimento: tasso,
        rendimentoLabel: label,
        rendimentoYears: years,
        totaleVersato,
        montanteFinale,
        guadagnoRendimenti,
        rendimentoPercentuale,
        risparmioAnnuo,
        risparmioFiscaleTotale,
        montanteSenzaFiscale: montanteFinale,
        montanteConFiscale,
        differenzaMontante,
        differenzaPercentuale,
        aliquotaMarginale,
        aliquotaSostitutiva,
        anniPartecipazione,
        montanteNetto,
        impostaSostitutiva,
        rendimentoNettoPercentuale,
      };
    });
  }, [funds, montanteIniziale, contributoVolontarioAnnuo, contributoTotaleAnnuo, orizzonteAnni, ral, annoPrimaAdesione, annoCorrente]);

  /* ── Chart data ─────────────────────────────────────────────── */
  const { chartData, fundsMeta } = useMemo(() => {
    const data: ComparisonSeriesPoint[] = Array.from({ length: orizzonteAnni + 1 }, (_, anno) => ({
      anno,
    }));

    const { risparmioAnnuo } = calcolaRisparmioFiscaleAnnuo(contributoVolontarioAnnuo, ral);
    const useFiscale = activeStep !== 'montante';
    const contributoPerChart = useFiscale ? contributoTotaleAnnuo + risparmioAnnuo : contributoTotaleAnnuo;

    // TFR baseline
    const tfrSerie = calcolaMontanteTFR(montanteIniziale, contributoTotaleAnnuo, orizzonteAnni);
    for (let i = 0; i <= orizzonteAnni; i++) {
      data[i].tfr = tfrSerie[i];
    }

    const meta = funds.map((fund, idx) => {
      const proxyInfo = getRendimentoProxyWithLabel(fund);
      const tasso = proxyInfo?.rate ?? 5.0;
      const serie = calcolaMontante(montanteIniziale, contributoPerChart, tasso, orizzonteAnni);
      const key = `fund_${idx}`;
      for (let i = 0; i <= orizzonteAnni; i++) {
        data[i][key] = serie[i];
      }
      return {
        dataKey: key,
        label: formatShortFundLabel(fund, 28),
        color: CHART_COLORS[idx % CHART_COLORS.length],
      };
    });

    return { chartData: data, fundsMeta: meta };
  }, [funds, montanteIniziale, contributoVolontarioAnnuo, contributoTotaleAnnuo, orizzonteAnni, ral, activeStep]);

  /* ── Best fund per step ─────────────────────────────────────── */
  const bestFund = useMemo(() => {
    if (fundResults.length === 0) return null;
    return fundResults.reduce((best, r) => {
      const val = activeStep === 'montante' ? r.montanteFinale
        : activeStep === 'fiscale' ? r.montanteConFiscale
        : r.montanteNetto;
      const bestVal = activeStep === 'montante' ? best.montanteFinale
        : activeStep === 'fiscale' ? best.montanteConFiscale
        : best.montanteNetto;
      return val > bestVal ? r : best;
    }, fundResults[0]);
  }, [fundResults, activeStep]);

  if (funds.length < 2) return null;

  /* ── Step-specific headers ─────────────────────────────────── */
  const stepConfig = {
    montante: {
      title: 'Montante stimato — confronto fondi',
      subtitle: 'I risultati si aggiornano automaticamente quando modifichi i parametri sopra',
      chartTitle: 'Crescita del capitale a confronto',
      chartSubtitle: 'Linea tratteggiata = TFR lasciato in azienda',
    },
    fiscale: {
      title: 'Ecco quanto risparmi — confronto fondi',
      subtitle: 'Risparmio fiscale e impatto sul capitale con reinvestimento IRPEF',
      chartTitle: 'Capitale con reinvestimento fiscale a confronto',
      chartSubtitle: 'Include reinvestimento del risparmio IRPEF. Linea tratteggiata = TFR in azienda.',
    },
    imposta: {
      title: 'Netto stimato al pensionamento — confronto fondi',
      subtitle: 'Netto dopo imposta sostitutiva, per ogni fondo',
      chartTitle: 'Capitale netto stimato a confronto',
      chartSubtitle: 'Include rendimenti, risparmio IRPEF e imposta sostitutiva.',
    },
  }[activeStep];

  const gridCols = funds.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3';

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Section header */}
      <div>
        <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {stepConfig.title}
        </h4>
        <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1">{stepConfig.subtitle}</p>
      </div>

      {/* Fund pills */}
      <div className="flex flex-wrap gap-2">
        {fundResults.map((r) => (
          <div
            key={r.fund.id}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium"
            style={{
              borderColor: r.color,
              backgroundColor: `${r.color}10`,
              color: r.color,
            }}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
            <span className="truncate max-w-[200px]">{r.fund.pip} — {r.fund.linea}</span>
            <span className="text-[10px] opacity-70">({formatPercentage(r.tassoRendimento, 1)}/anno)</span>
            {onRemoveFund && (
              <button
                onClick={() => onRemoveFund(r.fund.id)}
                className="ml-1 hover:opacity-70 transition-opacity"
                title="Rimuovi fondo"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Per-fund result cards (step-specific metrics) ──── */}
      <div className={`grid gap-4 ${gridCols}`}>
        {fundResults.map((r) => {
          const isBest = bestFund?.fund.id === r.fund.id && funds.length > 1;
          return (
            <div
              key={r.fund.id}
              className={`relative rounded-2xl border p-5 sm:p-6 transition-all ${
                isBest
                  ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-200 dark:ring-emerald-800'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60'
              }`}
            >
              {/* Best badge */}
              {isBest && (
                <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider">
                  🏆 Migliore
                </span>
              )}

              {/* Fund identity */}
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-700/50">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{r.fund.pip} — {r.fund.linea}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{r.fund.type}</span>
                    {r.fund.societa && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">· {r.fund.societa}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Rend. {r.rendimentoLabel}: <strong>{formatPercentage(r.tassoRendimento, 2)}</strong>
                  </p>
                </div>
                {onRemoveFund && (
                  <button
                    onClick={() => onRemoveFund(r.fund.id)}
                    className="flex-shrink-0 p-1 rounded text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors"
                    title="Rimuovi fondo"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Step-specific metrics */}
              <div className="grid grid-cols-1 gap-3">
                {activeStep === 'montante' && (
                  <>
                    <MetricCard
                      label="Totale versato"
                      value={formatCurrency(r.totaleVersato)}
                      detail="capitale iniziale + volontario + TFR"
                      variant="default"
                    />
                    <MetricCard
                      label="Capitale accumulato"
                      value={formatCurrency(r.montanteFinale)}
                      detail="versato + rendimenti"
                      variant="emerald"
                    />
                    <MetricCard
                      label="Guadagno dai rendimenti"
                      value={`+${formatPercentage(r.rendimentoPercentuale, 1)}`}
                      detail={formatCurrency(r.guadagnoRendimenti)}
                      variant="blue"
                    />
                  </>
                )}
                {activeStep === 'fiscale' && (
                  <>
                    <MetricCard
                      label="Risparmi ogni anno"
                      value={formatCurrency(r.risparmioAnnuo)}
                      detail={`Aliquota IRPEF ${formatPercentage(r.aliquotaMarginale * 100, 0)}`}
                      variant="emerald"
                    />
                    <MetricCard
                      label="Risparmio fiscale totale"
                      value={formatCurrency(r.risparmioFiscaleTotale)}
                      detail={`${orizzonteAnni} anni di deducibilità`}
                      variant="emerald"
                    />
                    <MetricCard
                      label="Capitale extra se reinvesti"
                      value={`+${formatCurrency(r.differenzaMontante)}`}
                      detail={`+${formatPercentage(r.differenzaPercentuale, 1)} in più`}
                      variant="blue"
                    />
                  </>
                )}
                {activeStep === 'imposta' && (
                  <>
                    <MetricCard
                      label="Capitale lordo accumulato"
                      value={formatCurrency(r.montanteConFiscale)}
                      detail="con reinvestimento IRPEF"
                      variant="default"
                    />
                    <MetricCard
                      label="Tassa alla pensione"
                      value={`-${formatCurrency(r.impostaSostitutiva)}`}
                      detail={`Aliquota ${formatPercentage(r.aliquotaSostitutiva * 100, 1)} (${r.anniPartecipazione} anni)`}
                      variant="rose"
                    />
                    <MetricCard
                      label="Netto stimato cliente"
                      value={formatCurrency(r.montanteNetto)}
                      detail={`+${formatPercentage(r.rendimentoNettoPercentuale, 1)} netto vs versato`}
                      variant="emerald"
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Rendita a confronto (solo nel passaggio del netto) ─ */}
      {activeStep === 'imposta' && (
        <RenditaConfronto
          fondi={fundResults.map((r) => ({
            fund: r.fund,
            color: r.color,
            montanteLordo: r.montanteConFiscale,
            aliquotaSostitutiva: r.aliquotaSostitutiva,
          }))}
          orizzonteAnni={orizzonteAnni}
        />
      )}

      {/* ── Comparison chart ────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 p-5 sm:p-6">
        <div className="mb-4">
          <h4 className="text-sm sm:text-base font-medium text-slate-700 dark:text-slate-300">
            {stepConfig.chartTitle}
          </h4>
          <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1">
            {stepConfig.chartSubtitle}
          </p>
        </div>
        <ComparisonMontanteChart
          data={chartData}
          fundsMeta={fundsMeta}
          theme={theme}
          tfrDataKey="tfr"
        />
      </div>

      {/* ── Delta summary ──────────────────────────────────── */}
      {fundResults.length >= 2 && bestFund && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Differenza tra il migliore e il peggiore
              </p>
              {(() => {
                const keyVal = (r: FundSimResult) =>
                  activeStep === 'montante' ? r.montanteFinale
                  : activeStep === 'fiscale' ? r.montanteConFiscale
                  : r.montanteNetto;
                const worst = fundResults.reduce((w, r) => (keyVal(r) < keyVal(w) ? r : w), fundResults[0]);
                const delta = keyVal(bestFund) - keyVal(worst);
                const labelWhat = activeStep === 'montante'
                  ? 'di capitale accumulato'
                  : activeStep === 'fiscale'
                  ? 'di capitale con reinvestimento fiscale'
                  : 'al netto delle imposte';
                return (
                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                    Scegliendo <strong style={{ color: bestFund.color }}>{bestFund.fund.pip}</strong> anziché{' '}
                    <strong style={{ color: worst.color }}>{worst.fund.pip}</strong>, a parità di parametri potresti
                    ottenere <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(delta)}</strong>{' '}
                    in più {labelWhat}.
                  </p>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Reusable metric card ──────────────────────────────────────── */
const MetricCard: React.FC<{
  label: string;
  value: string;
  detail: string;
  variant: 'default' | 'emerald' | 'blue' | 'rose';
}> = ({ label, value, detail, variant }) => {
  const styles = {
    default: {
      border: 'border-slate-200 dark:border-slate-800',
      bg: 'bg-white dark:bg-slate-800/60',
      label: 'text-slate-500 dark:text-slate-400',
      value: 'text-slate-900 dark:text-slate-100',
      detail: 'text-slate-400 dark:text-slate-500',
    },
    emerald: {
      border: 'border-emerald-200 dark:border-emerald-800',
      bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
      label: 'text-emerald-600 dark:text-emerald-400',
      value: 'text-emerald-700 dark:text-emerald-300',
      detail: 'text-emerald-500 dark:text-emerald-400',
    },
    blue: {
      border: 'border-blue-200 dark:border-blue-800',
      bg: 'bg-blue-50/50 dark:bg-blue-950/20',
      label: 'text-blue-600 dark:text-blue-400',
      value: 'text-blue-700 dark:text-blue-300',
      detail: 'text-blue-500 dark:text-blue-400',
    },
    rose: {
      border: 'border-rose-200 dark:border-rose-800',
      bg: 'bg-rose-50/50 dark:bg-rose-950/20',
      label: 'text-rose-600 dark:text-rose-400',
      value: 'text-rose-700 dark:text-rose-300',
      detail: 'text-rose-500 dark:text-rose-400',
    },
  }[variant];

  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-3 sm:p-4 text-center`}>
      <p className={`text-[10px] sm:text-xs font-medium ${styles.label} mb-1`}>{label}</p>
      <p className={`text-base sm:text-lg font-bold ${styles.value}`}>{value}</p>
      <p className={`text-[10px] ${styles.detail} mt-0.5`}>{detail}</p>
    </div>
  );
};

export default StepComparisonResults;
