import React, { useMemo, useState } from 'react';
import type { PensionFund } from '../../types';
import type { Sesso } from '../../types/rendite';
import { calcolaRendita, requisitiInput, RenditaNonCalcolabile } from '../../utils/renditeCalculator';
import { formatCurrency } from '../../utils/simulatorCalc';
import { useAuth } from '../../auth';
import { useRenditeFondo } from '../../lib/rendite';
import SimulatorSlider from './SimulatorSlider';

export interface FondoPerRendita {
  fund: PensionFund;
  color: string;
  montanteLordo: number;
  aliquotaSostitutiva: number;
}

interface RenditaConfrontoProps {
  fondi: FondoPerRendita[];
  orizzonteAnni: number;
}

/** Una riga per fondo: ogni riga scarica i coefficienti del proprio fondo. */
const RigaFondo: React.FC<{ f: FondoPerRendita; eta: number; sesso: Sesso; orizzonteAnni: number }> = ({
  f, eta, sesso, orizzonteAnni,
}) => {
  const { token } = useAuth();
  const { stato, dati } = useRenditeFondo(f.fund.nAlbo, token, true);

  const esito = useMemo(() => {
    if (stato !== 'pronto' || !dati) return null;
    const req = requisitiInput(dati);
    try {
      const r = calcolaRendita(dati, {
        etaPensionamento: eta,
        annoNascita: new Date().getFullYear() + orizzonteAnni - eta,
        sesso: req.richiedeSesso ? sesso : undefined,
        tipologia: 'vitalizia_immediata',
        frequenza: 'mensile',
        // con piu tassi tecnici si usa il piu basso, il piu prudente
        tassoTecnico: req.tassiTecnici.length > 1 ? Math.min(...req.tassiTecnici) : undefined,
        montante: f.montanteLordo,
      });
      const nettaAnnua = r.renditaAnnuaLorda * (1 - f.aliquotaSostitutiva);
      return { r, nettaAnnua, rataNetta: nettaAnnua / 12, distingueSesso: req.richiedeSesso, errore: null as string | null };
    } catch (e) {
      return { r: null, nettaAnnua: 0, rataNetta: 0, distingueSesso: false,
               errore: e instanceof RenditaNonCalcolabile ? e.motivo : 'Calcolo non riuscito' };
    }
  }, [stato, dati, eta, sesso, orizzonteAnni, f.montanteLordo, f.aliquotaSostitutiva]);

  let valore: React.ReactNode;
  let dettaglio: React.ReactNode = null;
  if (stato === 'caricamento' || stato === 'idle') {
    valore = <span className="inline-block w-20 h-5 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" />;
  } else if (stato === 'assente') {
    valore = <span className="text-sm text-slate-400">—</span>;
    dettaglio = 'Il fondo non pubblica i coefficienti di conversione';
  } else if (stato !== 'pronto' || !esito) {
    valore = <span className="text-sm text-slate-400">—</span>;
    dettaglio = 'Coefficienti non disponibili al momento';
  } else if (esito.errore || !esito.r) {
    valore = <span className="text-sm text-slate-400">—</span>;
    dettaglio = esito.errore;
  } else {
    const r = esito.r;
    valore = <span className="text-base sm:text-lg font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(esito.rataNetta)}</span>;
    const parti = [
      `${formatCurrency(r.renditaAnnuaLorda)} lordi l'anno`,
      r.tassoTecnico != null ? `tasso tecnico ${String(r.tassoTecnico).replace('.', ',')}%` : null,
      esito.distingueSesso ? `tavole per ${sesso === 'M' ? 'uomo' : 'donna'}` : null,
    ].filter(Boolean);
    dettaglio = (
      <>
        {parti.join(' · ')}
        {r.avvertenze.length > 0 && (
          <span className="block text-amber-600 dark:text-amber-400 mt-0.5">{r.avvertenze[0]}</span>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4">
      <div className="flex items-start gap-2 min-w-0">
        <span className="mt-1.5 w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: f.color }} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{f.fund.pip} — {f.fund.linea}</p>
          {dettaglio && <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 mt-0.5">{dettaglio}</p>}
        </div>
      </div>
      <div className="sm:text-right flex-shrink-0">{valore}</div>
    </div>
  );
};

const RenditaConfronto: React.FC<RenditaConfrontoProps> = ({ fondi, orizzonteAnni }) => {
  const [eta, setEta] = useState(67);
  const [sesso, setSesso] = useState<Sesso>('M');

  return (
    <div className="space-y-4" data-tour="simulator-rendita-confronto">
      <div>
        <h4 className="text-sm sm:text-base font-medium text-slate-700 dark:text-slate-300">Rendita mensile netta a confronto</h4>
        <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1">
          Il capitale di ciascun fondo convertito in rendita vitalizia con i coefficienti ufficiali del fondo, a rate mensili,
          al netto della stessa imposta sostitutiva.
        </p>
      </div>

      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-3 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10 items-end">
          <SimulatorSlider
            label="Età del cliente al pensionamento"
            value={eta}
            onChange={setEta}
            min={57}
            max={75}
            step={1}
            format={(v) => `${v} anni`}
            accent="emerald"
          />
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Sesso del cliente</span>
            <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              {(['M', 'F'] as Sesso[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSesso(s)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                    sesso === s ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {s === 'M' ? 'Uomo' : 'Donna'}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Conta solo per i fondi che usano tavole diverse per uomini e donne.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 divide-y divide-slate-100 dark:divide-slate-700/50">
        {fondi.map((f) => (
          <RigaFondo key={f.fund.id} f={f} eta={eta} sesso={sesso} orizzonteAnni={orizzonteAnni} />
        ))}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        La rendita è rivalutata ogni anno con i rendimenti della gestione. I coefficienti sono quelli in vigore oggi e la
        compagnia può aggiornarli prima del pensionamento.
      </p>
    </div>
  );
};

export default RenditaConfronto;
