import React, { useMemo } from 'react';
import type { PensionFund, MontanteSeriesPoint } from '../../types';
import {
  calcolaMontante,
  calcolaMontanteTFR,
  calcolaRisparmioFiscaleAnnuo,
  calcolaTfrAnnuoDaRal,
  sommaContributi,
  formatCurrency,
  formatIntegerInputIT,
  formatPercentage,
  parseIntegerInputIT,
} from '../../utils/simulatorCalc';
import { useCrescitaSalario } from './scenarioSalario';
import { SCAGLIONI_IRPEF } from '../../constants';
import MontanteChart from './MontanteChart';
import SimulatorSlider from './SimulatorSlider';
import StepComparisonResults from './StepComparisonResults';

interface StepFiscaleProps {
  montanteIniziale: number;
  contributoVolontarioAnnuo: number;
  orizzonteAnni: number;
  tassoRendimento: number;
  ral: number;
  theme: string;
  onValuesChange?: (values: { ral: number }) => void;
  /** Comparison mode props */
  isComparisonMode?: boolean;
  comparisonFunds?: PensionFund[];
  annoPrimaAdesione?: number;
  onRemoveComparisonFund?: (fundId: string) => void;
}

const StepFiscale: React.FC<StepFiscaleProps> = ({
  montanteIniziale,
  contributoVolontarioAnnuo,
  orizzonteAnni,
  tassoRendimento,
  ral,
  theme,
  onValuesChange,
  isComparisonMode = false,
  comparisonFunds = [],
  annoPrimaAdesione = 2020,
  onRemoveComparisonFund,
}) => {

  const tfrAnnuoDatore = useMemo(() => calcolaTfrAnnuoDaRal(ral), [ral]);
  const crescitaSalario = useCrescitaSalario();
  const contributoTotaleAnnuo = contributoVolontarioAnnuo + tfrAnnuoDatore;

  const { risparmioAnnuo, aliquotaMarginale } = useMemo(
    () => calcolaRisparmioFiscaleAnnuo(contributoVolontarioAnnuo, ral),
    [contributoVolontarioAnnuo, ral]
  );

  const risparmioTotale = sommaContributi(risparmioAnnuo, orizzonteAnni, crescitaSalario);

  const chartData = useMemo((): MontanteSeriesPoint[] => {
    const serieSenzaFiscale = calcolaMontante(montanteIniziale, contributoTotaleAnnuo, tassoRendimento, orizzonteAnni, crescitaSalario);
    const contributoEffettivo = contributoTotaleAnnuo + risparmioAnnuo;
    const serieConFiscale = calcolaMontante(montanteIniziale, contributoEffettivo, tassoRendimento, orizzonteAnni, crescitaSalario);
    const serieTFR = calcolaMontanteTFR(montanteIniziale, contributoTotaleAnnuo, orizzonteAnni, crescitaSalario);
    return Array.from({ length: orizzonteAnni + 1 }, (_, anno) => ({
      anno,
      montanteSenzaFiscale: serieSenzaFiscale[anno],
      montanteConFiscale: serieConFiscale[anno],
      montanteTFR: serieTFR[anno],
      versatoCumulato: montanteIniziale + sommaContributi(contributoTotaleAnnuo, anno, crescitaSalario),
    }));
  }, [montanteIniziale, contributoTotaleAnnuo, orizzonteAnni, tassoRendimento, risparmioAnnuo, crescitaSalario]);

  const montanteSenzaFiscale = chartData[orizzonteAnni]?.montanteSenzaFiscale || 0;
  const montanteConFiscale = chartData[orizzonteAnni]?.montanteConFiscale || 0;
  const differenzaMontante = montanteConFiscale - montanteSenzaFiscale;
  const differenzaPercentuale = montanteSenzaFiscale > 0 ? (differenzaMontante / montanteSenzaFiscale) * 100 : 0;

  const scaglioneCorrente = SCAGLIONI_IRPEF.find((s) => ral >= s.min && ral <= s.max);

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="flex items-start gap-4">
        <span className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm sm:text-base font-bold">2</span>
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">Risparmio sulle tasse (IRPEF)</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed max-w-xl">
            Solo i contributi volontari sono deducibili dal reddito fino a <strong className="text-slate-700 dark:text-slate-300">€5.300 all&apos;anno</strong>.
            Il TFR versato dal datore non rientra nella deducibilità fiscale.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-5 gap-y-1.5 px-3 sm:px-5 py-2.5 sm:py-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Dal passaggio 1:</span>
        <span className="text-xs text-slate-700 dark:text-slate-300">Contributo volontario <strong>{formatCurrency(contributoVolontarioAnnuo)}</strong></span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span className="text-xs text-slate-700 dark:text-slate-300">TFR datore <strong>{formatCurrency(tfrAnnuoDatore)}</strong></span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span className="text-xs text-slate-700 dark:text-slate-300">Totale annuo investito <strong>{formatCurrency(contributoTotaleAnnuo)}</strong></span>
      </div>

      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-3 sm:p-5 md:p-6 lg:p-8 space-y-5 sm:space-y-6 md:space-y-8">
        <div>
          <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Reddito cliente</h4>
          <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1">Inserisci la RAL per calcolare aliquota e risparmio fiscale annuale</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-10">
          <SimulatorSlider
            label="Stipendio lordo annuo cliente (RAL)"
            tooltip="Retribuzione Annua Lorda del cliente, usata per calcolare fascia IRPEF e risparmio fiscale."
            value={ral}
            onChange={(v) => onValuesChange?.({ ral: v })}
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

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">In quale fascia fiscale rientri?</p>
            </div>
            <div className="space-y-0.5">
              {SCAGLIONI_IRPEF.map((scaglione, index) => {
                const isCurrent = scaglioneCorrente === scaglione;
                return (
                  <div
                    key={index}
                    className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md transition-all ${
                      isCurrent
                        ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 font-semibold text-blue-900 dark:text-blue-100'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <span>{scaglione.label}</span>
                    {isCurrent && <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded">TUO</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Results: comparison vs single ─────────────────── */}
      {isComparisonMode && comparisonFunds.length >= 2 ? (
        <StepComparisonResults
          activeStep="fiscale"
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
          <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ecco quanto risparmi</h4>
          <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1">La deducibilità è calcolata solo sul contributo volontario</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 p-3 sm:p-5 text-center">
            <p className="text-[11px] sm:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1.5 sm:mb-2">Aliquota IRPEF</p>
            <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100">{formatPercentage(aliquotaMarginale * 100, 0)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 sm:p-5 text-center">
            <p className="text-[11px] sm:text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-1.5 sm:mb-2">Risparmi ogni anno</p>
            <p className="text-lg sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(risparmioAnnuo)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 sm:p-5 text-center">
            <p className="text-[11px] sm:text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-1.5 sm:mb-2">Risparmio totale</p>
            <p className="text-lg sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(risparmioTotale)}</p>
          </div>
          <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3 sm:p-5 text-center">
            <p className="text-[11px] sm:text-sm font-medium text-blue-600 dark:text-blue-400 mb-1.5 sm:mb-2">Capitale extra se reinvesti</p>
            <p className="text-lg sm:text-2xl font-bold text-blue-700 dark:text-blue-300">+{formatCurrency(differenzaMontante)}</p>
            <p className="text-[10px] sm:text-xs text-blue-500 dark:text-blue-400 mt-0.5 sm:mt-1">+{formatPercentage(differenzaPercentuale, 1)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 p-5 sm:p-6">
          <div className="mb-4">
            <h4 className="text-sm sm:text-base font-medium text-slate-700 dark:text-slate-300">Confronto: con e senza reinvestimento del risparmio fiscale</h4>
            <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1">
              Il vantaggio fiscale viene aggiunto ai versamenti annuali, mentre il TFR resta non deducibile.
            </p>
          </div>
          <MontanteChart data={chartData} theme={theme} showFiscale={true} showTFR={false} />
        </div>
      </div>
      )}
    </div>
  );
};

export default StepFiscale;
