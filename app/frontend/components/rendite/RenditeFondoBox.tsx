/**
 * Rendite nella scheda di dettaglio del fondo, come chiesto dall'incarico sulle rendite.
 *
 * Due parti:
 *  - RenditeFondoBox: la sintesi (tipologie offerte, convenzione e scadenza, basi demografiche,
 *    caricamenti, costo della gestione separata). Le tipologie e le basi di calcolo sono aperte a
 *    tutti; le condizioni sono riservate agli abbonati.
 *  - RenditeCoefficientiFondo: la tendina delle rendite del fondo (tipo, tasso tecnico, base
 *    demografica, % di reversibilita) e la tabella dei coefficienti per eta, uomo e donna
 *    affiancati. Per la reversibile: ipotesi di eta del reversionario e nota.
 * Qui non si confronta: il confronto fra fondi e nella sezione Rendite.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { PensionFund } from '../../types';
import type { Frequenza, RenditeExtractionResult, SetCoefficienti, TipologiaRendita } from '../../types/rendite';
import { useAccessoRendite, useRenditeFondo, useRiepilogoRendite } from '../../lib/rendite';
import { opzioniDisponibili, setDisponibili, RATE_PER_ANNO, type OpzioneRendita } from '../../utils/renditeCalculator';
import { ETICHETTA_TIPOLOGIA, etichettaTariffa, fmtPerc, sintesiTariffa, testoCosti } from '../../utils/renditeConfronto';
import { NotaReversibilita, TabellaCoefficienti } from '../simulator/SchedaRendita';

const ORDINE_TIPOLOGIE: TipologiaRendita[] = ['vitalizia_immediata', 'certa_poi_vitalizia', 'controassicurata', 'reversibile', 'ltc'];
const ETICHETTE_RATE: Record<Frequenza, string> = {
  annuale: 'Annuale', semestrale: 'Semestrale', quadrimestrale: 'Quadrimestrale',
  trimestrale: 'Trimestrale', bimestrale: 'Bimestrale', mensile: 'Mensile',
};

const fmtData = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const tronca = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

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

const Titolo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 dark:text-slate-200 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 10v2m9-6a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    {children}
  </h3>
);

const contenitore = 'divide-y divide-gray-200 dark:divide-slate-700 bg-violet-50/60 dark:bg-slate-700/50 rounded-lg px-2.5 sm:px-3 md:px-4 text-xs sm:text-sm';

/** Tariffe da mostrare: prima quella in vigore, poi le altre (per data di adesione o tasso scelto). */
function tariffeOrdinate(dati: RenditeExtractionResult): SetCoefficienti[] {
  const t = setDisponibili(dati);
  return [...t.filter((s) => s.set_corrente === true), ...t.filter((s) => s.set_corrente !== true)];
}

/** Base demografica per tipologia: una riga se e unica, altrimenti "base: tipologie". */
function basiPerTipologia(set: SetCoefficienti): { base: string; tipologie: TipologiaRendita[] }[] {
  const m = new Map<string, Set<TipologiaRendita>>();
  (set.tabelle ?? []).forEach((t) => {
    const b = t.base_demografica ?? set.base_demografica;
    if (!b) return;
    if (!m.has(b)) m.set(b, new Set());
    m.get(b)!.add(t.tipologia);
  });
  return Array.from(m.entries()).map(([base, tip]) => ({ base, tipologie: ORDINE_TIPOLOGIE.filter((x) => tip.has(x)) }));
}

/* ── Sintesi ───────────────────────────────────────────────────── */
const RenditeFondoBox: React.FC<{ fund: PensionFund }> = ({ fund }) => {
  const { abbonato, token } = useAccessoRendite();
  const { riepilogo, caricamento } = useRiepilogoRendite(fund.nAlbo);
  const { stato, dati } = useRenditeFondo(fund.nAlbo, token, abbonato && Boolean(riepilogo?.disponibile));

  const dettaglio = useMemo(() => {
    if (!dati || stato !== 'pronto') return null;
    const tariffe = tariffeOrdinate(dati);
    const inVigore = tariffe[0];
    if (!inVigore) return null;
    return { tariffe, inVigore, sintesi: sintesiTariffa(dati, inVigore), basi: basiPerTipologia(inVigore) };
  }, [dati, stato]);

  if (caricamento && !riepilogo) {
    return <div><Titolo>Rendite</Titolo><div className="h-40 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" /></div>;
  }
  if (!riepilogo?.disponibile) {
    return (
      <div>
        <Titolo>Rendite</Titolo>
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
  const negoziale = fund.type === 'FPN';

  return (
    <div>
      <Titolo>Rendite</Titolo>
      <div className={contenitore}>
        <Riga etichetta="Tipologie offerte">
          <div className="flex flex-wrap gap-1.5">
            {ORDINE_TIPOLOGIE.filter((t) => riepilogo.tipologie.includes(t)).map((t) => <Chip key={t} tono="verde">{ETICHETTA_TIPOLOGIA[t]}</Chip>)}
          </div>
        </Riga>
        <Riga etichetta="Basi di calcolo">
          <div className="flex flex-wrap gap-1.5">
            {riepilogo.tassi_tecnici.length > 0 && <Chip>Tasso tecnico {riepilogo.tassi_tecnici.map((t) => fmtPerc(t)).join(' / ')}</Chip>}
            <Chip>{riepilogo.distingue_sesso ? 'Coefficienti distinti per sesso' : 'Coefficienti unisex'}</Chip>
            {riepilogo.eta_minima != null && <Chip>Età {riepilogo.eta_minima}–{riepilogo.eta_massima}</Chip>}
          </div>
        </Riga>

        {!abbonato ? (
          <Riga etichetta="Condizioni e coefficienti">
            <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span aria-hidden>🔒</span>
              Convenzione, basi demografiche, caricamenti, costo della gestione separata e coefficienti sono riservati al piano Full Access.
            </span>
          </Riga>
        ) : stato === 'caricamento' || stato === 'idle' ? (
          <div className="py-3"><div className="h-24 rounded bg-slate-100 dark:bg-slate-700/60 animate-pulse" /></div>
        ) : !dettaglio || !s ? (
          <Riga etichetta="Condizioni">Non è stato possibile caricare le condizioni del fondo.</Riga>
        ) : (
          <>
            {/* nei negoziali paga una compagnia scelta con una convenzione a scadenza; in FPA e PIP di norma la compagnia stessa */}
            <Riga etichetta={negoziale ? 'Convenzione assicurativa' : 'Compagnia che eroga la rendita'}>
              {s.compagnia ?? nd}
              {s.scadenza ? (
                <span className="block text-slate-500 dark:text-slate-400">In vigore fino al {fmtData(s.scadenza)}</span>
              ) : negoziale ? (
                <span className="block text-slate-500 dark:text-slate-400">Scadenza non indicata nel documento</span>
              ) : null}
            </Riga>
            <Riga etichetta={dettaglio.basi.length > 1 ? 'Basi demografiche' : 'Base demografica'}>
              {!dettaglio.basi.length ? nd : dettaglio.basi.length === 1 ? dettaglio.basi[0].base : (
                <ul className="space-y-0.5">
                  {dettaglio.basi.map((b) => (
                    <li key={b.base}>
                      <span className="text-slate-500 dark:text-slate-400">{b.tipologie.map((t) => ETICHETTA_TIPOLOGIA[t]).join(', ')}:</span> {b.base}
                    </li>
                  ))}
                </ul>
              )}
            </Riga>
            <Riga etichetta="Caricamenti sulla rendita">{testoCosti(s.caricamenti) ?? nd}</Riga>
            <Riga etichetta="Costo della gestione separata">{testoCosti(s.gestione) ?? nd}</Riga>
            {dettaglio.tariffe.length > 1 && (
              <Riga etichetta={`Tariffe (${dettaglio.tariffe.length})`}>
                Dati della tariffa {dettaglio.inVigore.set_corrente ? 'in vigore' : 'principale'}: {etichettaTariffa(dettaglio.inVigore)}. Le altre sono nella tendina qui sotto.
              </Riga>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/* ── Tendina e coefficienti per eta ────────────────────────────── */
interface VoceTendina {
  valore: string;
  idSet: string;
  opzione: OpzioneRendita;
  etichetta: string;
}

const chiave = (o: OpzioneRendita) => [o.tipologia, o.durataCertaAnni, o.percReversibilita, o.tassoTecnico].join('|');

/** Rateazioni pubblicate per l'opzione: le matrici reversibili sono solo annuali. */
function rateazioni(dati: RenditeExtractionResult, idSet: string, o: OpzioneRendita): Frequenza[] {
  const set = setDisponibili(dati).find((s) => s.id_set === idSet);
  const trovate = new Set<Frequenza>();
  (set?.tabelle ?? []).forEach((t) => {
    if (t.tipologia !== o.tipologia || t.durata_certa_anni !== o.durataCertaAnni
        || t.perc_reversibilita !== o.percReversibilita || t.tasso_tecnico !== o.tassoTecnico) return;
    if (t.tipo_colonne === 'frequenza') t.colonne.forEach((c) => { if (c in RATE_PER_ANNO) trovate.add(c as Frequenza); });
    else trovate.add('annuale');
  });
  return (Object.keys(RATE_PER_ANNO) as Frequenza[]).filter((f) => trovate.has(f));
}

export const RenditeCoefficientiFondo: React.FC<{ fund: PensionFund }> = ({ fund }) => {
  const { abbonato, token } = useAccessoRendite();
  const { riepilogo } = useRiepilogoRendite(fund.nAlbo);
  const { stato, dati } = useRenditeFondo(fund.nAlbo, token, abbonato && Boolean(riepilogo?.disponibile));

  const gruppi = useMemo(() => {
    if (!dati || stato !== 'pronto') return [];
    const tariffe = tariffeOrdinate(dati);
    return tariffe.map((set) => ({
      set,
      voci: opzioniDisponibili(dati, set.id_set)
        .sort((a, b) => ORDINE_TIPOLOGIE.indexOf(a.tipologia) - ORDINE_TIPOLOGIE.indexOf(b.tipologia)
          || (a.durataCertaAnni ?? 0) - (b.durataCertaAnni ?? 0) || (a.percReversibilita ?? 0) - (b.percReversibilita ?? 0)
          || (a.tassoTecnico ?? 0) - (b.tassoTecnico ?? 0))
        .map((o): VoceTendina => ({
          valore: `${set.id_set}::${chiave(o)}`,
          idSet: set.id_set,
          opzione: o,
          etichetta: `${o.etichetta}${o.baseDemografica ? ` — ${tronca(o.baseDemografica, 45)}` : ''}`,
        })),
    }));
  }, [dati, stato]);
  const voci = useMemo(() => gruppi.flatMap((g) => g.voci), [gruppi]);

  const [scelta, setScelta] = useState<string | null>(null);
  const [frequenza, setFrequenza] = useState<Frequenza>('annuale');
  useEffect(() => {
    if (!voci.length) { setScelta(null); return; }
    if (scelta && voci.some((v) => v.valore === scelta)) return;
    setScelta((voci.find((v) => v.opzione.tipologia === 'vitalizia_immediata') ?? voci[0]).valore);
  }, [voci]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!abbonato || !riepilogo?.disponibile || stato !== 'pronto' || !dati || !voci.length) return null;

  const voce = voci.find((v) => v.valore === scelta) ?? voci[0];
  const rate = rateazioni(dati, voce.idSet, voce.opzione);
  const frequenzaUsata = rate.includes(frequenza) ? frequenza : (rate.includes('annuale') ? 'annuale' : rate[0] ?? 'annuale');
  const haReversibile = voci.some((v) => v.opzione.tipologia === 'reversibile');
  const campo = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100';

  return (
    <div>
      <Titolo>Coefficienti di trasformazione in rendita</Titolo>
      <div className="space-y-3 rounded-lg bg-violet-50/60 dark:bg-slate-700/50 p-2.5 sm:p-3 md:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tipo di rendita</span>
            <select value={voce.valore} onChange={(e) => setScelta(e.target.value)} className={campo}>
              {gruppi.length > 1
                ? gruppi.map((g) => (
                  <optgroup key={g.set.id_set} label={`${g.set.set_corrente === false ? 'Adesioni passate — ' : ''}${tronca(etichettaTariffa(g.set), 90)}`}>
                    {g.voci.map((v) => <option key={v.valore} value={v.valore}>{v.etichetta}</option>)}
                  </optgroup>
                ))
                : voci.map((v) => <option key={v.valore} value={v.valore}>{v.etichetta}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Rateazione</span>
            <select value={frequenzaUsata} onChange={(e) => setFrequenza(e.target.value as Frequenza)} className={campo} disabled={rate.length < 2}>
              {rate.map((f) => <option key={f} value={f}>{ETICHETTE_RATE[f]}</option>)}
            </select>
          </label>
        </div>

        <TabellaCoefficienti
          key={voce.valore}
          dati={dati}
          opzione={voce.opzione}
          frequenza={frequenzaUsata}
          idSet={voce.idSet}
          aperta
        />

        {voce.opzione.tipologia === 'reversibile' && (
          <NotaReversibilita dati={dati} opzione={voce.opzione} idSet={voce.idSet} />
        )}
        {!haReversibile && riepilogo.tipologie.length > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Il documento del fondo non pubblica tavole per la rendita reversibile: il coefficiente dipende da età e sesso del
            reversionario e va chiesto con un preventivo al fondo pensione.
          </p>
        )}
      </div>
    </div>
  );
};

export default RenditeFondoBox;
