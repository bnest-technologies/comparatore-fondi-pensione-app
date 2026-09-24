/**
 * Riquadro "Rendite" nella scheda di dettaglio del fondo.
 *
 * Tutti vedono COSA offre il fondo (tipologie, tassi tecnici, tavole per sesso o unisex):
 * e un'informazione aperta. Gli abbonati vedono anche A QUALI CONDIZIONI: compagnia,
 * convenzione, base demografica, caricamenti, costo della gestione separata e i
 * coefficienti della vitalizia a due eta di riferimento.
 */
import React, { useMemo } from 'react';
import type { PensionFund } from '../../types';
import { useAccessoRendite, useRenditeFondo, useRiepilogoRendite } from '../../lib/rendite';
import { calcolaRendita, setDisponibili, tariffaDaScegliere } from '../../utils/renditeCalculator';
import {
  ETICHETTA_TIPOLOGIA, MONTANTE_RIFERIMENTO, etichettaTariffa, fmtPerc, sintesiTariffa, testoCosti,
} from '../../utils/renditeConfronto';
import type { RenditeExtractionResult, SetCoefficienti } from '../../types/rendite';

const ETA_RIFERIMENTO = [65, 67];

const fmtData = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fmtPm = (v: number) => `${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}‰`;

const Riga: React.FC<{ etichetta: string; children: React.ReactNode }> = ({ etichetta, children }) => (
  <div className="py-2 sm:py-2.5">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{etichetta}</p>
    <div className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-100">{children}</div>
  </div>
);

const Chip: React.FC<{ children: React.ReactNode; tono?: 'verde' | 'neutro' }> = ({ children, tono = 'neutro' }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] sm:text-xs font-medium ${
    tono === 'verde'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
      : 'bg-slate-200/70 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
  }`}>{children}</span>
);

/** Vitalizia annua per 1.000 euro, uomo e donna, sulla tariffa indicata e al tasso tecnico piu basso. */
function coefficientiVitalizia(dati: RenditeExtractionResult, set: SetCoefficienti) {
  const tassi = (set.tabelle ?? []).filter((t) => t.tipologia === 'vitalizia_immediata' || t.tipologia === 'ltc')
    .map((t) => t.tasso_tecnico).filter((t): t is number => t != null);
  const tasso = tassi.length ? Math.min(...tassi) : undefined;
  const anno = new Date().getFullYear();
  const valore = (eta: number, sesso: 'M' | 'F') => {
    try {
      const r = calcolaRendita(dati, {
        idSet: set.id_set, tassoTecnico: tasso, etaPensionamento: eta, annoNascita: anno - eta, sesso,
        tipologia: 'vitalizia_immediata', frequenza: 'annuale', montante: MONTANTE_RIFERIMENTO,
      });
      return (r.renditaAnnuaLorda / MONTANTE_RIFERIMENTO) * 1000;
    } catch {
      return null;
    }
  };
  const righe = ETA_RIFERIMENTO.map((eta) => ({ eta, uomo: valore(eta, 'M'), donna: valore(eta, 'F') }));
  return { tasso, righe, unisex: righe.every((r) => r.uomo === r.donna) };
}

const RenditeFondoBox: React.FC<{ fund: PensionFund; onApriRendite?: (nAlbo: number) => void }> = ({ fund, onApriRendite }) => {
  const { abbonato, token } = useAccessoRendite();
  const { riepilogo, caricamento } = useRiepilogoRendite(fund.nAlbo);
  const { stato, dati } = useRenditeFondo(fund.nAlbo, token, abbonato && Boolean(riepilogo?.disponibile));

  const dettaglio = useMemo(() => {
    if (!dati || stato !== 'pronto') return null;
    const tariffe = setDisponibili(dati);
    const inVigore = tariffe.find((s) => s.set_corrente === true) ?? tariffe[0];
    if (!inVigore) return null;
    return {
      tariffe,
      inVigore,
      daScegliere: tariffaDaScegliere(dati),
      sintesi: sintesiTariffa(dati, inVigore),
      vitalizia: coefficientiVitalizia(dati, inVigore),
    };
  }, [dati, stato]);

  const intestazione = (
    <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 dark:text-slate-200 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 10v2m9-6a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Rendite
    </h3>
  );
  const contenitore = 'divide-y divide-gray-200 dark:divide-slate-700 bg-violet-50/60 dark:bg-slate-700/50 rounded-lg px-2.5 sm:px-3 md:px-4 text-xs sm:text-sm';

  if (caricamento && !riepilogo) {
    return <div>{intestazione}<div className="h-40 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" /></div>;
  }

  if (!riepilogo?.disponibile) {
    return (
      <div>
        {intestazione}
        <div className={contenitore}>
          <Riga etichetta="Coefficienti di conversione">
            Il fondo non pubblica le tavole dei coefficienti di trasformazione in rendita: le condizioni si conoscono solo al momento della richiesta.
          </Riga>
        </div>
      </div>
    );
  }

  const s = dettaglio?.sintesi;
  const nd = <span className="text-slate-400 dark:text-slate-500">non indicato nel documento</span>;

  return (
    <div>
      {intestazione}
      <div className={contenitore}>
        <Riga etichetta="Tipologie offerte">
          <div className="flex flex-wrap gap-1.5">
            {(['vitalizia_immediata', 'certa_poi_vitalizia', 'controassicurata', 'reversibile', 'ltc'] as const)
              .filter((t) => riepilogo.tipologie.includes(t))
              .map((t) => <Chip key={t} tono="verde">{ETICHETTA_TIPOLOGIA[t]}</Chip>)}
          </div>
        </Riga>
        <Riga etichetta="Basi di calcolo">
          <div className="flex flex-wrap gap-1.5">
            {riepilogo.tassi_tecnici.length > 0 && (
              <Chip>Tasso tecnico {riepilogo.tassi_tecnici.map((t) => fmtPerc(t)).join(' / ')}</Chip>
            )}
            <Chip>{riepilogo.distingue_sesso ? 'Tavole distinte per sesso' : 'Tavole unisex'}</Chip>
            {riepilogo.eta_minima != null && <Chip>Età {riepilogo.eta_minima}–{riepilogo.eta_massima}</Chip>}
          </div>
        </Riga>

        {!abbonato ? (
          <Riga etichetta="Condizioni e coefficienti">
            <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span aria-hidden>🔒</span>
              Compagnia, basi demografiche, caricamenti, costo della gestione separata e coefficienti sono riservati al piano Full Access.
            </span>
          </Riga>
        ) : stato === 'caricamento' || stato === 'idle' ? (
          <div className="py-3"><div className="h-24 rounded bg-slate-100 dark:bg-slate-700/60 animate-pulse" /></div>
        ) : !dettaglio || !s ? (
          <Riga etichetta="Condizioni">Non è stato possibile caricare le condizioni del fondo.</Riga>
        ) : (
          <>
            <Riga etichetta="Compagnia e convenzione">
              {s.compagnia ?? nd}
              <span className="block text-slate-500 dark:text-slate-400">
                {s.scadenza ? `Convenzione in scadenza il ${fmtData(s.scadenza)}` : 'Scadenza della convenzione non indicata'}
              </span>
            </Riga>
            <Riga etichetta={s.basi.length > 1 ? 'Basi demografiche' : 'Base demografica'}>{s.basi.length ? s.basi.join(' · ') : nd}</Riga>
            <Riga etichetta="Costi della rendita">
              <span className="block">Caricamenti: {testoCosti(s.caricamenti) ?? <span className="text-slate-400 dark:text-slate-500">non indicati</span>}</span>
              <span className="block">Gestione separata: {testoCosti(s.gestione) ?? <span className="text-slate-400 dark:text-slate-500">non indicata</span>}</span>
            </Riga>
            {dettaglio.tariffe.length > 1 && (
              <Riga etichetta={`Tariffe (${dettaglio.tariffe.length})`}>
                {dettaglio.daScegliere
                  ? 'Il tasso tecnico si sceglie alla conversione: valori qui sotto al tasso più basso.'
                  : `Dati della tariffa in vigore: ${etichettaTariffa(dettaglio.inVigore)}`}
              </Riga>
            )}
            <Riga etichetta={`Vitalizia, rata annuale${dettaglio.vitalizia.tasso != null ? `, tasso ${fmtPerc(dettaglio.vitalizia.tasso)}` : ''}`}>
              <table className="w-full tabular-nums">
                <tbody>
                  {dettaglio.vitalizia.righe.map((r) => (
                    <tr key={r.eta}>
                      <td className="py-0.5 text-slate-600 dark:text-slate-300">a {r.eta} anni</td>
                      {dettaglio.vitalizia.unisex ? (
                        <td className="py-0.5 text-right font-semibold">{r.uomo != null ? fmtPm(r.uomo) : '—'}</td>
                      ) : (
                        <>
                          <td className="py-0.5 text-right"><span className="text-slate-500 dark:text-slate-400">U </span><span className="font-semibold">{r.uomo != null ? fmtPm(r.uomo) : '—'}</span></td>
                          <td className="py-0.5 text-right"><span className="text-slate-500 dark:text-slate-400">D </span><span className="font-semibold">{r.donna != null ? fmtPm(r.donna) : '—'}</span></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <span className="block mt-1 text-[11px] text-slate-500 dark:text-slate-400">Rendita annua lorda per 1.000 € di capitale.</span>
            </Riga>
          </>
        )}

        {onApriRendite && (
          <div className="py-2.5">
            <button
              type="button"
              onClick={() => onApriRendite(fund.nAlbo)}
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 transition"
            >
              Confronta le rendite con altri fondi
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RenditeFondoBox;
