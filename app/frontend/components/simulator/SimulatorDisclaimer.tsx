import React from 'react';

interface SimulatorDisclaimerProps {
  variant?: 'default' | 'compact';
}

const SimulatorDisclaimer: React.FC<SimulatorDisclaimerProps> = ({ variant = 'default' }) => {
  if (variant === 'compact') {
    return (
      <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
        ⚠️ Valori in euro di oggi (inflazione al 2%). La proiezione usa i rendimenti storici del fondo, che non sono
        indicativi di quelli futuri: non è la proiezione standardizzata COVIP. Simulazione a scopo illustrativo.
        Tutti i dati restano nel tuo browser.
      </p>
    );
  }

  return (
    <div className="rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-800/40 p-5 sm:p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="flex-1 min-w-0">
          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            <li>Valori in euro di oggi: inflazione attesa al 2% annuo, come nelle istruzioni COVIP; il valore nominale è indicato a parte.</li>
            <li>
              La proiezione ipotizza che il fondo mantenga i suoi rendimenti storici: i rendimenti passati non sono indicativi
              di quelli futuri. Non è la proiezione standardizzata COVIP, che stima i rendimenti dall'asset allocation e dai costi:
              per quella servirà il software di pianificazione previdenziale.
            </li>
            <li>Simulazione a scopo illustrativo, non costituisce consulenza finanziaria.</li>
            <li>Calcoli basati su normativa vigente (D.Lgs. 252/2005) e IRPEF 2025.</li>
            <li>Tutti i calcoli avvengono nel browser — nessun dato viene salvato o trasmesso.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SimulatorDisclaimer;
