import React, { useState, useMemo, useCallback } from 'react';
import type { PensionFund } from '../../types';
import { pensionFundsData } from '../../data/funds';
import { getRendimentoProxyWithLabel, formatPercentage } from '../../utils/simulatorCalc';
import { useAuth } from '../../auth';
import { SUBSCRIPTION_URL } from '../../constants';
import { useGuidedComparator, MAX_SIMULATION_FUNDS } from '../guided/GuidedComparatorContext';
import StepMontante from './StepMontante';
import StepFiscale from './StepFiscale';
import StepImpostaPensione from './StepImpostaPensione';
import SimulatorDisclaimer from './SimulatorDisclaimer';
import SectionHeader from '../common/SectionHeader';
import GuidedTour, { useGuidedTour, FirstVisitBanner } from '../common/GuidedTour';
import { simulatorTourSteps } from '../../config/tourSteps';

type SimulatorStep = 'montante' | 'fiscale' | 'imposta';

interface SimulatorPageProps {
  theme: string;
}

/* ── Step metadata ──────────────────────────────────────────────── */
const STEPS: {
  id: SimulatorStep;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  { id: 'montante', label: 'Crescita del Capitale', shortLabel: 'Capitale', description: 'Stima del montante nel fondo pensione nel tempo' },
  { id: 'fiscale', label: 'Risparmio sulle Tasse', shortLabel: 'Tasse', description: 'Stima del risparmio IRPEF annuo del cliente' },
  { id: 'imposta', label: 'Netto alla Pensione', shortLabel: 'Netto', description: 'Stima del netto al pensionamento' },
];

/* ── Fund search / selector ─────────────────────────────────────── */
const FundSelector: React.FC<{
  selectedFund: PensionFund | null;
  onSelect: (fund: PensionFund) => void;
  onClear: () => void;
  isFreePlan: boolean;
}> = ({ selectedFund, onSelect, onClear, isFreePlan }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    return pensionFundsData
      .filter((f) => {
        const text = `${f.pip} ${f.linea} ${f.societa ?? ''}`.toLowerCase();
        return text.includes(q);
      })
      .slice(0, 12);
  }, [query]);

  const proxyInfo = selectedFund ? getRendimentoProxyWithLabel(selectedFund) : null;

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        Seleziona fondo cliente
      </label>

      {isFreePlan ? (
        <>
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/20 p-4">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 text-lg mt-0.5">🔒</span>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Selezione fondo non disponibile nel piano Free
                </p>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Nel piano Free la simulazione utilizza un tasso di rendimento predefinito del 5%.
                  Con il piano <strong>Full Access</strong> puoi selezionare qualsiasi fondo pensione e simulare con il suo rendimento storico reale.
                </p>
                <a
                  href={SUBSCRIPTION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-1 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg shadow-sm hover:shadow-md transition-all"
                >
                  Acquista Full Access
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            La simulazione procede con un tasso di rendimento predefinito del 5%.
          </p>
        </>
      ) : (
      <>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
        Cercalo per nome: useremo il rendimento storico del fondo per rendere la simulazione più accurata.
        Se non lo selezioni, verrà usato un tasso di rendimento predefinito del 5%.
      </p>

      {selectedFund ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {selectedFund.pip} — {selectedFund.linea}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {selectedFund.type}{selectedFund.societa ? ` · ${selectedFund.societa}` : ''}
              </span>
              {proxyInfo && (
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  Rend. {proxyInfo.label}: <strong>{formatPercentage(proxyInfo.rate, 2)}</strong>
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => { onClear(); setQuery(''); }}
            className="flex-shrink-0 p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title="Rimuovi fondo"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Cerca fondo pensione cliente..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 200)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow placeholder:text-slate-400"
            />
          </div>

          {open && results.length > 0 && (
            <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 shadow-lg">
              {results.map((fund) => {
                const info = getRendimentoProxyWithLabel(fund);
                return (
                  <button
                    key={fund.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onSelect(fund); setOpen(false); setQuery(''); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-100 dark:border-slate-800/50 last:border-b-0"
                  >
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {fund.pip} — {fund.linea}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {fund.type} · {fund.categoria}{fund.societa ? ` · ${fund.societa}` : ''}
                      </span>
                      {info && (
                        <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                          Rend. {info.label}: {formatPercentage(info.rate, 2)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {open && query.length >= 2 && results.length === 0 && (
            <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 shadow-lg p-3 text-center text-sm text-slate-500">
              Nessun fondo trovato per &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        {selectedFund
          ? 'Il rendimento storico di questo fondo verrà utilizzato come tasso di rivalutazione nella simulazione.'
          : 'Opzionale — puoi procedere anche senza selezionare un fondo.'}
      </p>
      </>
      )}
    </div>
  );
};

/* ── Multi-fund selector (for comparison mode) ──────────────── */
const MultiFundSelector: React.FC<{
  selectedFunds: PensionFund[];
  onAdd: (fund: PensionFund) => void;
  onRemove: (fundId: string) => void;
  maxFunds: number;
}> = ({ selectedFunds, onAdd, onRemove, maxFunds }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selectedIds = useMemo(() => new Set(selectedFunds.map((f) => f.id)), [selectedFunds]);

  const results = useMemo(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    return pensionFundsData
      .filter((f) => {
        if (selectedIds.has(f.id)) return false;
        const text = `${f.pip} ${f.linea} ${f.societa ?? ''}`.toLowerCase();
        return text.includes(q);
      })
      .slice(0, 10);
  }, [query, selectedIds]);

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        Fondi da confrontare ({selectedFunds.length}/{maxFunds})
      </label>

      {/* Selected chips */}
      {selectedFunds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedFunds.map((fund) => {
            const proxy = getRendimentoProxyWithLabel(fund);
            return (
              <div
                key={fund.id}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate max-w-[140px] sm:max-w-[180px]">
                    {fund.pip} — {fund.linea}
                  </p>
                  {fund.societa && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[140px] sm:max-w-[180px]">
                      {fund.societa}
                    </p>
                  )}
                  {proxy && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Rend. {proxy.label}: {formatPercentage(proxy.rate, 2)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onRemove(fund.id)}
                  className="flex-shrink-0 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title="Rimuovi"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Search input */}
      {selectedFunds.length < maxFunds && (
        <div className="relative">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Aggiungi un fondo da confrontare…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 200)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-shadow placeholder:text-slate-400"
            />
          </div>
          {open && results.length > 0 && (
            <div className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 shadow-lg">
              {results.map((fund) => {
                const info = getRendimentoProxyWithLabel(fund);
                return (
                  <button
                    key={fund.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onAdd(fund); setQuery(''); setOpen(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-100 dark:border-slate-800/50 last:border-b-0"
                  >
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{fund.pip} — {fund.linea}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{fund.type} · {fund.categoria}{fund.societa ? ` · ${fund.societa}` : ''}</span>
                      {info && (
                        <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400">Rend. {info.label}: {formatPercentage(info.rate, 2)}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {open && query.length >= 2 && results.length === 0 && (
            <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 shadow-lg p-3 text-center text-sm text-slate-500">
              Nessun fondo trovato
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Main Simulator Page ────────────────────────────────────────── */
const SimulatorPage: React.FC<SimulatorPageProps> = ({ theme }) => {
  const [activeStep, setActiveStep] = useState<SimulatorStep>('montante');
  const { user } = useAuth();
  const currentPlan = user?.plan ?? 'free';
  const userStatus = user?.status ?? 'active';
  const isFreePlan = !(currentPlan === 'full-access' && userStatus === 'active') && !user?.isAdmin;
  
  // Tour guidato
  const { 
    isOpen: isTourOpen, 
    shouldShowBanner, 
    startTour, 
    closeTour, 
    dismissBanner,
    completeTour,
  } = useGuidedTour('simulator');

  // Multi-fund comparison from context (populated by compare page CTA)
  const { simulationFundIds, setSimulationFundIds } = useGuidedComparator();

  // Toggle-driven mode: 'single' (default) or 'compare'
  // Auto-activate comparison when arriving from compare page CTA
  const [simulationMode, setSimulationMode] = useState<'single' | 'compare'>(
    () => (simulationFundIds.length >= 2 ? 'compare' : 'single')
  );
  const isComparisonMode = !isFreePlan && simulationMode === 'compare';

  // Resolve fund objects from IDs (for comparison mode coming from compare page)
  const fundMap = useMemo(() => {
    const map = new Map<string, PensionFund>();
    pensionFundsData.forEach((f) => map.set(f.id, f));
    return map;
  }, []);

  const comparisonFunds = useMemo(() => {
    return simulationFundIds
      .map((id) => fundMap.get(id))
      .filter((f): f is PensionFund => Boolean(f));
  }, [simulationFundIds, fundMap]);

  const handleAddComparisonFund = useCallback((fund: PensionFund) => {
    if (simulationFundIds.length < MAX_SIMULATION_FUNDS && !simulationFundIds.includes(fund.id)) {
      setSimulationFundIds([...simulationFundIds, fund.id]);
    }
  }, [simulationFundIds, setSimulationFundIds]);

  const handleRemoveComparisonFund = useCallback((fundId: string) => {
    const next = simulationFundIds.filter((id) => id !== fundId);
    setSimulationFundIds(next);
  }, [simulationFundIds, setSimulationFundIds]);

  // Fund selection (local to simulator, independent from comparator context)
  // Free plan users cannot select a fund
  const [manualFund, setManualFund] = useState<PensionFund | null>(null);

  const activeFunds = (!isFreePlan && manualFund) ? [manualFund] : [];

  // Shared state across steps
  const [montanteIniziale, setMontanteIniziale] = useState(5000);
  const [contributoVolontarioAnnuo, setContributoVolontarioAnnuo] = useState(2000);
  const [orizzonteAnni, setOrizzonteAnni] = useState(20);
  const [tassoRendimento, setTassoRendimento] = useState(5.0);
  const [ral, setRal] = useState(30000);
  const [annoPrimaAdesione, setAnnoPrimaAdesione] = useState(2020);

  const currentStepIndex = STEPS.findIndex((s) => s.id === activeStep);

  const goNext = useCallback(() => {
    const next = Math.min(STEPS.length - 1, currentStepIndex + 1);
    setActiveStep(STEPS[next].id);
  }, [currentStepIndex]);

  const goPrev = useCallback(() => {
    const prev = Math.max(0, currentStepIndex - 1);
    setActiveStep(STEPS[prev].id);
  }, [currentStepIndex]);

  return (
    <div className="space-y-6 sm:space-y-8 lg:space-y-10">
      {/* Banner piano free per simulatore */}
      {isFreePlan && (
        <div className="rounded-2xl sm:rounded-3xl border-2 border-amber-300 dark:border-amber-700 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-amber-950/30 p-5 sm:p-6 shadow-md">
          <div className="flex items-start gap-4">
            <span className="flex-shrink-0 text-2xl mt-0.5">🔒</span>
            <div className="space-y-2 flex-1">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Simulatore in modalità limitata
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Nel piano Free il simulatore funziona con un <strong>tasso di rendimento predefinito del 5%</strong>.
                Con il piano <strong>Full Access</strong> puoi selezionare qualsiasi fondo pensione e simulare con il suo rendimento storico reale.
              </p>
              <a
                href={SUBSCRIPTION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl shadow-md hover:shadow-lg transition-all transform hover:scale-105 active:scale-100"
              >
                Acquista Full Access
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Banner primo accesso */}
      {shouldShowBanner && (
        <FirstVisitBanner
          onStartTour={startTour}
          onDismiss={dismissBanner}
        />
      )}

      {/* Header unificato */}
      <SectionHeader
        eyebrow="Simulazione"
        title="Simulatore Previdenziale"
        description="Simula montante, risparmio fiscale e netto stimato per uno scenario cliente."
        badge={{ text: "🌟 Nuovo", variant: "new" }}
        tourAction={{
          label: "Tour Guidato",
          onClick: startTour,
        }}
      />

      {/* ── Contenuto originale (con data-tour attributes) ─────────────────────────────────────── */}
      <div className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-900/80 p-4 sm:p-6 md:p-8 lg:p-10 shadow-sm">
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
            Come funziona?
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
            Questo simulatore organizza in <strong className="text-blue-600 dark:text-blue-400">3 passaggi</strong> la stima
            di montante, beneficio fiscale e netto al pensionamento per il cliente.
          </p>
        </div>

        {/* Problema → Soluzione */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-5 sm:mb-6">
          <div className="flex items-start gap-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 sm:p-5">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400 text-sm font-bold">?</span>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Perché serve?</p>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Senza un calcolo concreto, è difficile capire se stai versando abbastanza, quanto risparmierai in tasse
                e quale sarà il capitale disponibile a fine percorso.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 sm:p-5">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-sm font-bold">✓</span>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Cosa otterrai</p>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Una stima chiara di capitale investito, recupero fiscale annuo e importo netto atteso al pensionamento.
              </p>
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            <strong className="font-medium text-slate-600 dark:text-slate-300">Privacy garantita</strong> — tutti i calcoli avvengono nel tuo browser. Nessun dato viene salvato o trasmesso.
          </p>
        </div>
      </div>

      {/* ── Step Navigation (horizontal stepper) ─────────────── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4" data-tour="simulator-tabs">
        {STEPS.map((step, idx) => {
          const isActive = step.id === activeStep;
          const isCompleted = idx < currentStepIndex;
          return (
            <button
              key={step.id}
              onClick={() => setActiveStep(step.id)}
              className={`flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3 rounded-xl sm:rounded-2xl md:rounded-3xl border p-2.5 sm:p-4 md:p-5 text-center sm:text-left transition-all duration-200 ${
                isActive
                  ? 'bg-white/90 dark:bg-slate-800 border-blue-300 dark:border-blue-700 shadow-md ring-1 ring-blue-200 dark:ring-blue-800'
                  : isCompleted
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:shadow-sm'
                  : 'bg-white/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:bg-white/90 dark:hover:bg-slate-800/60 hover:shadow-sm'
              }`}
            >
              <span className={`flex-shrink-0 flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-[10px] sm:text-xs md:text-sm font-bold sm:mt-0.5 ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : isCompleted
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
              }`}>
                {isCompleted ? '✓' : idx + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-xs sm:text-sm font-semibold leading-tight ${
                  isActive
                    ? 'text-slate-900 dark:text-white'
                    : isCompleted
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}>
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{step.shortLabel}</span>
                </p>
                <p className={`hidden sm:block text-xs sm:text-sm mt-1 leading-snug ${
                  isActive
                    ? 'text-slate-500 dark:text-slate-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}>
                  {step.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Fund Selector with mode toggle ────────────────── */}
      <div className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white/90 dark:bg-slate-800/60 dark:border-slate-800 p-3 sm:p-5 md:p-6 shadow-sm" data-tour="fund-selector">
        {/* Mode toggle (only for paid users) */}
        {!isFreePlan && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-5 pb-4 border-b border-slate-200 dark:border-slate-700">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Modalità</span>
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => { setSimulationMode('single'); }}
                className={`relative px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                  simulationMode === 'single'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  Singola
                </span>
              </button>
              <button
                onClick={() => { setSimulationMode('compare'); }}
                className={`relative px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                  simulationMode === 'compare'
                    ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Confronto
                </span>
              </button>
            </div>
            {simulationMode === 'compare' && (
              <span className="text-[10px] text-violet-600 dark:text-violet-400 font-medium">
                Fino a {MAX_SIMULATION_FUNDS} fondi
              </span>
            )}
          </div>
        )}

        {/* Single mode: fund selector */}
        {simulationMode === 'single' && (
          <FundSelector
            selectedFund={manualFund}
            onSelect={setManualFund}
            onClear={() => setManualFund(null)}
            isFreePlan={isFreePlan}
          />
        )}

        {/* Comparison mode: multi-fund selector */}
        {isComparisonMode && (
          <div>
            <MultiFundSelector
              selectedFunds={comparisonFunds}
              onAdd={handleAddComparisonFund}
              onRemove={handleRemoveComparisonFund}
              maxFunds={MAX_SIMULATION_FUNDS}
            />
            {comparisonFunds.length < 2 && (
              <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                Seleziona almeno 2 fondi per visualizzare il confronto simulazione.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Step Content ─────────────────────────────────────── */}
      <div className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white/90 dark:bg-slate-900/80 dark:border-slate-800 p-3 sm:p-5 md:p-8 lg:p-10 shadow-sm" data-tour="simulator-chart">
        {activeStep === 'montante' && (
          <StepMontante
            selectedFunds={activeFunds}
            theme={theme}
            ral={ral}
            onRalChange={setRal}
            onValuesChange={(values) => {
              setMontanteIniziale(values.montanteIniziale);
              setContributoVolontarioAnnuo(values.contributoVolontarioAnnuo);
              setOrizzonteAnni(values.orizzonteAnni);
              setTassoRendimento(values.tassoRendimento);
            }}
            isComparisonMode={isComparisonMode}
            comparisonFunds={comparisonFunds}
            annoPrimaAdesione={annoPrimaAdesione}
            onRemoveComparisonFund={handleRemoveComparisonFund}
          />
        )}

        {activeStep === 'fiscale' && (
          <StepFiscale
            montanteIniziale={montanteIniziale}
            contributoVolontarioAnnuo={contributoVolontarioAnnuo}
            orizzonteAnni={orizzonteAnni}
            tassoRendimento={tassoRendimento}
            ral={ral}
            theme={theme}
            onValuesChange={(values) => {
              setRal(values.ral);
            }}
            isComparisonMode={isComparisonMode}
            comparisonFunds={comparisonFunds}
            annoPrimaAdesione={annoPrimaAdesione}
            onRemoveComparisonFund={handleRemoveComparisonFund}
          />
        )}

        {activeStep === 'imposta' && (
          <StepImpostaPensione
            montanteIniziale={montanteIniziale}
            contributoVolontarioAnnuo={contributoVolontarioAnnuo}
            orizzonteAnni={orizzonteAnni}
            ral={ral}
            tassoRendimento={tassoRendimento}
            theme={theme}
            onValuesChange={(values) => {
              setAnnoPrimaAdesione(values.annoPrimaAdesione);
            }}
            isComparisonMode={isComparisonMode}
            comparisonFunds={comparisonFunds}
            onRemoveComparisonFund={handleRemoveComparisonFund}
            selectedFund={activeFunds[0] ?? null}
            isFreePlan={isFreePlan}
          />
        )}
      </div>

      {/* ── Step Navigation Buttons ──────────────────────────── */}
      <div className="flex items-center justify-between py-2">
        <button
          onClick={goPrev}
          disabled={currentStepIndex === 0}
          className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
            currentStepIndex === 0
              ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:shadow-sm'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden min-[360px]:inline">Indietro</span>
        </button>

        {/* Dot indicators */}
        <div className="flex items-center gap-2">
          {STEPS.map((step, index) => (
            <button
              key={step.id}
              onClick={() => setActiveStep(step.id)}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                index === currentStepIndex
                  ? 'bg-blue-600 w-8'
                  : index < currentStepIndex
                  ? 'bg-emerald-500 w-2.5'
                  : 'bg-slate-300 dark:bg-slate-600 w-2.5'
              }`}
              title={step.label}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          disabled={currentStepIndex === STEPS.length - 1}
          className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
            currentStepIndex === STEPS.length - 1
              ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md'
          }`}
        >
          <span className="hidden min-[360px]:inline">Avanti</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ── Disclaimer ─────────────────────────────────────── */}
      <SimulatorDisclaimer variant="default" />

      {/* ── Tour Guidato ───────────────────────────────────── */}
      <GuidedTour
        steps={simulatorTourSteps}
        isOpen={isTourOpen}
        onClose={closeTour}
        onComplete={completeTour}
        storageKey="simulator"
        showSkipButton={true}
      />

    </div>
  );
};

export default SimulatorPage;
