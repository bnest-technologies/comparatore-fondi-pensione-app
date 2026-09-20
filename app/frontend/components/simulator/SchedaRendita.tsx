/**
 * Parte "di consultazione" della rendita, come richiesta dall'incarico del cliente:
 *  - scheda del fondo: convenzione, scadenza, basi demografiche, caricamenti, costo della gestione separata;
 *  - tabella dei coefficienti per eta della tipologia scelta, maschi e femmine affiancati;
 *  - per la reversibile: ipotesi di eta del reversionario e nota sulla reversibilita.
 */
import React, { useMemo } from 'react';
import type { Frequenza, RenditeExtractionResult, TabellaRendita } from '../../types/rendite';
import { setCorrente, type OpzioneRendita } from '../../utils/renditeCalculator';

const fmtPerc = (v: number) => `${v.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
const fmtData = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Coefficiente espresso in per mille, qualunque sia la scala o il verso del documento. */
function perMille(v: number, t: TabellaRendita): number | null {
  const scala = t.scala_originale;
  if (!scala || !v) return null;
  return t.verso_conversione === 'divisore' ? (1000 * scala) / v : (v * 1000) / scala;
}

const stessaOpzione = (t: TabellaRendita, o: OpzioneRendita) =>
  t.tipologia === o.tipologia && t.durata_certa_anni === o.durataCertaAnni
  && t.perc_reversibilita === o.percReversibilita && t.tasso_tecnico === o.tassoTecnico;

/* ── Scheda del fondo ───────────────────────────────────────────── */
export const SchedaFondo: React.FC<{ dati: RenditeExtractionResult; idSet?: string }> = ({ dati, idSet }) => {
  const set = setCorrente(dati, idSet);
  const conv = dati.convenzioni?.find((c) => (c.set ?? []).some((s) => s === set)) ?? dati.convenzioni?.[0];

  const basi = useMemo(() => {
    const b = new Set<string>();
    if (set?.base_demografica) b.add(set.base_demografica);
    (set?.tabelle ?? []).forEach((t) => { if (t.base_demografica) b.add(t.base_demografica); });
    return Array.from(b);
  }, [set]);

  const costi = set?.costi ?? [];
  const eGestione = (c: { tipo_costo: unknown }) => /gestion|trattenut|rendiment|commission/i.test(String(c.tipo_costo));
  const eCaricamento = (c: { tipo_costo: unknown }) =>
    /erogaz|caricament|spes|rata|frazion/i.test(String(c.tipo_costo)) && !/premio|versament|contribut/i.test(String(c.tipo_costo));
  const caricamenti = costi.filter((c) => eCaricamento(c) && !eGestione(c));
  const gestione = costi.filter(eGestione);

  const Riga: React.FC<{ etichetta: string; children: React.ReactNode }> = ({ etichetta, children }) => (
    <div className="grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-0.5 sm:gap-4 py-2.5">
      <dt className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">{etichetta}</dt>
      <dd className="text-sm text-slate-800 dark:text-slate-200">{children}</dd>
    </div>
  );
  const nd = <span className="text-slate-400 dark:text-slate-500">non indicato nel documento</span>;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 px-4 sm:px-5 py-2">
      <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Scheda rendite del fondo</p>
      <dl className="divide-y divide-slate-100 dark:divide-slate-700/50">
        <Riga etichetta="Compagnia che paga la rendita">{conv?.compagnia ?? nd}</Riga>
        <Riga etichetta="Scadenza della convenzione">
          {conv?.data_scadenza ? fmtData(conv.data_scadenza) : <span className="text-slate-400 dark:text-slate-500">non prevista o non indicata</span>}
        </Riga>
        <Riga etichetta={basi.length > 1 ? 'Basi demografiche' : 'Base demografica'}>
          {basi.length ? basi.join(' · ') : nd}
        </Riga>
        <Riga etichetta="Caricamenti sulla rendita">
          {caricamenti.length ? (
            <ul className="space-y-0.5">
              {caricamenti.map((c, i) => (
                <li key={i}>
                  {c.valore_perc != null ? fmtPerc(c.valore_perc) : '—'}
                  {c.frequenza ? ` (rata ${c.frequenza})` : ''}
                  {c.note ? <span className="text-slate-500 dark:text-slate-400"> — {c.note}</span> : null}
                </li>
              ))}
            </ul>
          ) : nd}
        </Riga>
        <Riga etichetta="Costo della gestione separata">
          {gestione.length ? (
            <ul className="space-y-0.5">
              {gestione.map((c, i) => (
                <li key={i}>
                  {c.valore_perc != null ? fmtPerc(c.valore_perc) : '—'}
                  {c.note ? <span className="text-slate-500 dark:text-slate-400"> — {c.note}</span> : null}
                </li>
              ))}
            </ul>
          ) : nd}
        </Riga>
      </dl>
    </div>
  );
};

/* ── Tabella dei coefficienti per eta ───────────────────────────── */
export const TabellaCoefficienti: React.FC<{
  dati: RenditeExtractionResult;
  opzione: OpzioneRendita;
  frequenza: Frequenza;
  etaEvidenziata?: number;
  idSet?: string;
}> = ({ dati, opzione, frequenza, etaEvidenziata, idSet }) => {
  const tabelle = (setCorrente(dati, idSet)?.tabelle ?? []).filter((t) => stessaOpzione(t, opzione));
  if (!tabelle.length) return null;

  const perSesso = ['M', 'F', 'U']
    .map((s) => tabelle.find((t) => t.sesso === s))
    .filter((t): t is TabellaRendita => Boolean(t));
  const nomeSesso: Record<string, string> = { M: 'Uomo', F: 'Donna', U: 'Uomo e donna' };

  // tabelle per rateazione: una colonna per sesso, sulla rateazione scelta
  const aFrequenze = perSesso.every((t) => t.tipo_colonne === 'frequenza');
  let intestazioni: string[];
  let righe: { eta: number; valori: (number | null)[] }[];
  if (aFrequenze) {
    intestazioni = perSesso.map((t) => nomeSesso[t.sesso] ?? t.sesso);
    const eta = Array.from(new Set(perSesso.flatMap((t) => t.righe.map((r) => r[0])))).sort((a, b) => a - b);
    righe = eta.map((e) => ({
      eta: e,
      valori: perSesso.map((t) => {
        const j = t.colonne.indexOf(frequenza) >= 0 ? t.colonne.indexOf(frequenza) : t.colonne.indexOf('annuale');
        const r = t.righe.find((x) => x[0] === e);
        return r && j >= 0 && typeof r[j + 1] === 'number' ? perMille(r[j + 1], t) : null;
      }),
    }));
  } else {
    // reversibile a matrice: colonne = eta (o differenza di eta) del reversionario
    const t = perSesso[0];
    const delta = t.tipo_colonne === 'delta_eta_reversionario';
    intestazioni = t.colonne.map((c) => (delta ? `rev. ${Number(c) > 0 ? '+' : ''}${c}` : `rev. ${c} anni`));
    righe = t.righe.map((r) => ({ eta: r[0], valori: r.slice(1).map((v) => (typeof v === 'number' ? perMille(v, t) : null)) }));
  }

  const troppeColonne = intestazioni.length > 8;

  return (
    <details className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 sm:px-5 py-3">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Coefficienti di trasformazione per età
          <span className="font-normal text-slate-500 dark:text-slate-400">
            {' '}— {opzione.etichetta}{aFrequenze ? `, rata ${frequenza}` : ', rata annuale'}
          </span>
        </span>
        <span className="text-slate-400 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="px-4 sm:px-5 pb-4 space-y-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Rendita annua lorda per 1.000 euro di capitale (per mille), all'età assicurativa. Valori ufficiali del documento sulle rendite del fondo.
          {!aFrequenze && ' Colonne: età del beneficiario della reversibilità.'}
        </p>
        <div className={`overflow-auto ${troppeColonne ? 'max-h-96' : 'max-h-80'} rounded-lg border border-slate-100 dark:border-slate-700/50`}>
          <table className="w-full text-xs sm:text-sm">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Età</th>
                {intestazioni.map((h) => (
                  <th key={h} className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {righe.map((r) => (
                <tr key={r.eta} className={r.eta === etaEvidenziata ? 'bg-emerald-50 dark:bg-emerald-950/30 font-semibold' : ''}>
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.eta}</td>
                  {r.valori.map((v, i) => (
                    <td key={i} className="px-3 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-200">
                      {v == null ? '—' : v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {etaEvidenziata != null && righe.some((r) => r.eta === etaEvidenziata) && (
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Evidenziata la riga usata nel calcolo.</p>
        )}
      </div>
    </details>
  );
};

/* ── Reversibile: ipotesi e nota ────────────────────────────────── */
export const NotaReversibilita: React.FC<{ dati: RenditeExtractionResult; opzione: OpzioneRendita; idSet?: string }> = ({ dati, opzione, idSet }) => {
  const ipotesi = Array.from(new Set(
    (setCorrente(dati, idSet)?.tabelle ?? [])
      .filter((t) => stessaOpzione(t, opzione) && t.eta_reversionario_ipotesi)
      .map((t) => t.eta_reversionario_ipotesi as string),
  ));
  return (
    <div className="rounded-2xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/70 dark:bg-sky-950/20 p-4 sm:p-5 space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      <p className="font-semibold text-slate-900 dark:text-slate-100">
        Rendita reversibile{opzione.percReversibilita != null ? ` al ${opzione.percReversibilita}%` : ''}
      </p>
      {ipotesi.length > 0 && (
        <p>
          <strong>Ipotesi della compagnia sull'età del reversionario:</strong> {ipotesi.join('; ')}.
        </p>
      )}
      <p>
        La reversibilità nel fondo pensione è un'opzione assicurativa facoltativa: l'aderente la attiva al momento della
        conversione del montante in rendita, designa liberamente la seconda testa nei limiti della convenzione e ne fissa la
        quota, di norma 60%, 80% o 100%. Nell'INPS è invece una prestazione obbligatoria, con platea e aliquote stabilite
        dalla legge: 60% al coniuge solo, 80% con un figlio, 100% con due o più figli aventi diritto.
      </p>
      <p>
        Per avere una stima precisa della rendita reversibile, che tenga conto dell'età e del sesso del reversionario,
        bisogna chiedere un preventivo al fondo pensione.
      </p>
    </div>
  );
};
