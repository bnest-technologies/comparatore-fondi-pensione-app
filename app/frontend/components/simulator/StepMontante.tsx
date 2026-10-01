import React, { useState, useMemo } from 'react';
import type { PensionFund, MontanteSeriesPoint } from '../../types';
import {
  getRendimentoProxyWithLabel,
  calcolaMontante,
  calcolaMontanteTFR,
  calcolaTfrAnnuoDaRal,
  sommaContributi,
  CRESCITE_SALARIO_REALI,
  INFLAZIONE_ATTESA,
  formatCurrency,
  formatIntegerInputIT,
  formatPercentage,
  parseIntegerInputIT,
} from '../../utils/simulatorCalc';
import { useCrescitaSalario, useImpostaCrescitaSalario } from './scenarioSalario';
import MontanteChart from './MontanteChart';
import SimulatorSlider from './SimulatorSlider';
import StepComparisonResults from './StepComparisonResults';

interface StepMontanteProps {
  selectedFunds: PensionFund[];
  theme: string;
  ral: number;
  onValuesChange?: (values: {
    montanteIniziale: number;
    contributoVolontarioAnnuo: number;
    orizzonteAnni: number;
    tassoRendimento: number;
  }) => void;
  onRalChange?: (ral: number) => void;
  /** Comparison mode props */
  isComparisonMode?: boolean;
  comparisonFunds?: PensionFund[];
  annoPrimaAdesione?: number;
  onRemoveComparisonFund?: (fundId: string) => void;
}

const StepMontante: React.FC<StepMontanteProps> = ({
  selectedFunds,
  theme,
  ral,
  onValuesChange,
  onRalChange,
  isComparisonMode = false,
  comparisonFunds = [],
  annoPrimaAdesione = 2020,
  onRemoveComparisonFund,
}) => {
  const [montanteIniziale, setMontanteIniziale] = useState(5000);
  const [contributoVolontarioAnnuo, setContributoVolontarioAnnuo] = useState(2000);
  const [orizzonteAnni, setOrizzonteAnni] = useState(20);
  const [showVersatoCumulato, setShowVersatoCumulato] = useState(false);

  const fundProxyInfos = useMemo(() => {
    return selectedFunds
      .map((fund) => ({ fund, info: getRendimentoProxyWithLabel(fund) }))
      .filter((entry): entry is { fund: PensionFund; info: NonNullable<ReturnType<typeof getRendimentoProxyWithLabel>> } => entry.info !== null);
  }, [selectedFunds]);

  const tassoRendimento = useMemo(() => {
    if (fundProxyInfos.length === 0) return 5.0;
    return fundProxyInfos.reduce((sum, e) => sum + e.info.rate, 0) / fundProxyInfos.length;
  }, [fundProxyInfos]);

  const warningRendimentoBreve = useMemo(() => {
    return fundProxyInfos.filter(({ info }) => info.years < 10);
  }, [fundProxyInfos]);

  const iscMedio = useMemo(() => {
    if (selectedFunds.length === 0) return null;
    const costs = selectedFunds
      .map((f) => f.isc.isc10a ?? f.isc.isc5a ?? f.costoAnnuo)
      .filter((c): c is number => c !== null);
    if (costs.length === 0) return null;
    return costs.reduce((s, c) => s + c, 0) / costs.length;
  }, [selectedFunds]);

  const tfrAnnuoDatore = useMemo(() => calcolaTfrAnnuoDaRal(ral), [ral]);
  const crescitaSalario = useCrescitaSalario();
  const impostaCrescitaSalario = useImpostaCrescitaSalario();
  const contributoTotaleAnnuo = contributoVolontarioAnnuo + tfrAnnuoDatore;

  const chartData = useMemo((): MontanteSeriesPoint[] => {
    const serieSenzaFiscale = calcolaMontante(montanteIniziale, contributoTotaleAnnuo, tassoRendimento, orizzonteAnni, crescitaSalario);
    const serieTFR = calcolaMontanteTFR(montanteIniziale, contributoTotaleAnnuo, orizzonteAnni, crescitaSalario);
    return Array.from({ length: orizzonteAnni + 1 }, (_, anno) => ({
      anno,
      montanteSenzaFiscale: serieSenzaFiscale[anno],
      montanteConFiscale: serieSenzaFiscale[anno],
      montanteTFR: serieTFR[anno],
      versatoCumulato: montanteIniziale + sommaContributi(contributoTotaleAnnuo, anno, crescitaSalario),
    }));
  }, [montanteIniziale, contributoTotaleAnnuo, tassoRendimento, orizzonteAnni, crescitaSalario]);

  const totaleVersato = montanteIniziale + sommaContributi(contributoTotaleAnnuo, orizzonteAnni, crescitaSalario);
  const montanteFinale = chartData[orizzonteAnni]?.montanteSenzaFiscale || 0;
  const rendimentoTotale = montanteFinale - totaleVersato;
  const rendimentoPercentuale = totaleVersato > 0 ? (montanteFinale / totaleVersato - 1) * 100 : 0;

  React.useEffect(() => {
    onValuesChange?.({ montanteIniziale, contributoVolontarioAnnuo, orizzonteAnni, tassoRendimento });
  }, [montanteIniziale, contributoVolontarioAnnuo, orizzonteAnni, tassoRendimento, onValuesChange, crescitaSalario]);

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="flex items-start gap-4">
        <span className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm sm:text-base font-bold">1</span>
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">Crescita del capitale cliente nel tempo</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed max-w-xl">
            Ogni anno versi una quota nel fondo pensione. Il simulatore separa il tuo contributo volontario dal TFR annuale del datore di lavoro, così il calcolo fiscale resta coerente.
          </p>
        </div>
      </div>

      <div
        data-tour="simulator-inputs"
        className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-3 sm:p-5 md:p-6 lg:p-8 space-y-5 sm:space-y-6 md:space-y-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
          <div>
            <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">I tuoi dati</h4>
            <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-0.5 sm:mt-1">Muovi gli slider o digita un valore per personalizzare la simulazione</p>
          </div>
          <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-[11px] sm:text-xs font-medium text-emerald-700 dark:text-emerald-300 leading-tight">
              Privacy garantita — tutti i calcoli avvengono nel tuo browser.<br className="hidden sm:inline" />{' '}Nessun dato viene salvato o trasmesso.
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6 sm:gap-y-8">
          <SimulatorSlider
            label="Capitale già accumulato"
            tooltip="L'importo che hai già nel fondo pensione, oppure quanto vuoi versare come primo conferimento iniziale."
            value={montanteIniziale}
            onChange={setMontanteIniziale}
            min={0}
            max={100000}
            step={500}
            format={(v) => formatCurrency(v)}
            inputSuffix="€"
            useThousandsInput={true}
            parseText={parseIntegerInputIT}
            formatText={formatIntegerInputIT}
            accent="blue"
          />
          <SimulatorSlider
            label="Contributo volontario annuo"
            tooltip="Solo la quota che versi volontariamente: è la parte fiscalmente deducibile."
            value={contributoVolontarioAnnuo}
            onChange={setContributoVolontarioAnnuo}
            min={0}
            max={20000}
            step={100}
            format={(v) => formatCurrency(v)}
            inputSuffix="€"
            useThousandsInput={true}
            parseText={parseIntegerInputIT}
            formatText={formatIntegerInputIT}
            accent="emerald"
          />

          <SimulatorSlider
            label="RAL"
            tooltip="Stipendio lordo annuo del cliente (Retribuzione Annua Lorda)."
            value={ral}
            onChange={(v) => onRalChange?.(v)}
            min={15000}
            max={150000}
            step={1000}
            format={(v) => formatCurrency(v)}
            inputSuffix="€"
            useThousandsInput={true}
            parseText={parseIntegerInputIT}
            formatText={formatIntegerInputIT}
            accent="blue"
          />

          <SimulatorSlider
            label="Anni alla pensione"
            tooltip="Il numero di anni che mancano prima che tu vada in pensione."
            value={orizzonteAnni}
            onChange={setOrizzonteAnni}
            min={1}
            max={45}
            step={1}
            format={(v) => `${v} ${v === 1 ? 'anno' : 'anni'}`}
            formatMin={() => '1 anno'}
            formatMax={() => '45 anni'}
            inputSuffix="anni"
            accent="amber"
          />

          <div className="space-y-2 sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Crescita reale del salario</span>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Oltre l'inflazione ({INFLAZIONE_ATTESA}% annuo). Contributi e TFR crescono con il salario.
                </p>
              </div>
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5" role="radiogroup" aria-label="Crescita reale del salario">
                {CRESCITE_SALARIO_REALI.map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={crescitaSalario === g}
                    onClick={() => impostaCrescitaSalario(g)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all tabular-nums ${
                      crescitaSalario === g ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {String(g).replace('.', ',')}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">TFR datore automatico (da RAL)</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(tfrAnnuoDatore)}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Formula: RAL/13,5 - 0,5%. Il TFR del datore non è fiscalmente deducibile.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Rendimento annuo stimato</span>
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatPercentage(tassoRendimento, 2)}</span>
            </div>
            {fundProxyInfos.length > 0 ? (
              <div className="space-y-0.5">
                {fundProxyInfos.map(({ fund, info }) => (
                  <p key={fund.id} className="text-xs text-slate-500 dark:text-slate-400">
                    Calcolato da <span className="font-medium text-slate-700 dark:text-slate-300">{fund.pip}</span> ({info.label}: {formatPercentage(info.rate, 2)})
                  </p>
                ))}
                {iscMedio !== null && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-800">
                    I costi di gestione (ISC {formatPercentage(iscMedio, 2)}/anno) sono già inclusi in questo rendimento.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Tasso predefinito. Seleziona un fondo nella sezione sopra per usare il suo rendimento storico reale.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Contributo totale investito ogni anno</p>
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">{formatCurrency(contributoTotaleAnnuo)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Volontario {formatCurrency(contributoVolontarioAnnuo)} + TFR datore {formatCurrency(tfrAnnuoDatore)}
            </p>
          </div>
        </div>

        {warningRendimentoBreve.length > 0 && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Avvertenza sui rendimenti brevi</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              Per alcuni fondi il calcolo usa uno storico inferiore a 10 anni (3/5 anni): la proiezione su orizzonti lunghi può risultare meno coerente.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-300">
              {warningRendimentoBreve.map(({ fund, info }) => (
                <li key={fund.id}>• {fund.pip} — proxy {info.label}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Results: comparison vs single ─────────────────── */}
      {isComparisonMode && comparisonFunds.length >= 2 ? (
        <StepComparisonResults
          activeStep="montante"
          funds={comparisonFunds}
          montanteIniziale={montanteIniziale}
          contributoVolontarioAnnuo={contributoVolontarioAnnuo}
          orizzonteAnni={orizzonteAnni}
          tassoRendimento={tassoRendimento}
          ral={ral}
          annoPrimaAdesione={annoPrimaAdesione}
          theme={theme}
          onRemoveFund={onRemoveComparisonFund}
        />
      ) : (
      <div className="space-y-5 sm:space-y-6">
        <div>
          <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Montante stimato</h4>
          <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500">In euro di oggi: inflazione al {INFLAZIONE_ATTESA}%, crescita reale del salario {String(crescitaSalario).replace('.', ',')}%.</p>
          <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1">I risultati si aggiornano automaticamente quando modifichi i parametri sopra</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 p-5 sm:p-6 text-center">
            <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Totale versato</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totaleVersato)}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">capitale iniziale + volontario + TFR</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-5 sm:p-6 text-center">
            <p className="text-xs sm:text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2">Capitale accumulato</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(montanteFinale)}</p>
            <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-1.5">versato + rendimenti</p>
          </div>
          <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-5 sm:p-6 text-center">
            <p className="text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">Guadagno dai rendimenti</p>
            <p className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-blue-300">+{formatPercentage(rendimentoPercentuale, 1)}</p>
            <p className="text-sm text-blue-500 dark:text-blue-400 mt-1">{formatCurrency(rendimentoTotale)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm sm:text-base font-medium text-slate-700 dark:text-slate-300">Crescita del capitale anno per anno</h4>
            <button
              type="button"
              onClick={() => setShowVersatoCumulato((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                showVersatoCumulato
                  ? 'bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-950/30 dark:border-teal-700 dark:text-teal-300'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
              aria-pressed={showVersatoCumulato}
            >
              {showVersatoCumulato ? 'Nascondi importi versati' : 'Mostra importi versati'}
            </button>
          </div>
          <MontanteChart data={chartData} theme={theme} showFiscale={false} showTFR={true} showVersatoCumulato={showVersatoCumulato} />
          <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-3">
            {showVersatoCumulato
              ? 'Visualizzi la proiezione del capitale con in aggiunta la curva degli importi cumulati versati.'
              : 'Visualizzi la proiezione del capitale con rendimenti nel tempo.'}
          </p>
        </div>
      </div>
      )}
    </div>
  );
};

export default StepMontante;
