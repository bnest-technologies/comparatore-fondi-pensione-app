/**
 * Sezione "Rendite": confronto delle condizioni di rendita fra fondi.
 *
 * Il consulente fissa le condizioni del cliente (tipo di rendita, eta, sesso, anno di nascita,
 * rateazione, tasso tecnico) e vede i fondi ordinati per rendita annua lorda per 1.000 euro,
 * con i dati che servono a leggerla: tasso tecnico, base demografica, caricamenti, costo della
 * gestione separata. Non e una classifica assoluta: cambia con le condizioni, e lo dichiara.
 * Espandendo una riga si vedono la scheda della convenzione e la tavola completa; spuntando
 * piu righe si ottiene la tabella comparata dei coefficienti per eta.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PensionFund } from '../../types';
import type { Frequenza } from '../../types/rendite';
import { SUBSCRIPTION_URL } from '../../constants';
import { useAccessoRendite, useCoperturaRendite, useRenditeConfronto, type FondoConfronto } from '../../lib/rendite';
import type { OpzioneRendita } from '../../utils/renditeCalculator';
import {
  ETICHETTA_TIPOLOGIA, MONTANTE_RIFERIMENTO, OPZIONI_CONFRONTO, confrontaRendite, etichettaTariffa, fmtPerc,
  nomeBreve, serieCoefficienti, testoCosti, type ParametriConfronto, type RigaConfronto,
} from '../../utils/renditeConfronto';
import { NotaReversibilita, SchedaFondo, TabellaCoefficienti } from '../../components/simulator/SchedaRendita';

interface RenditePageProps {
  funds: PensionFund[];
  onFundClick?: (fund: PensionFund) => void;
  /** fondo da mettere in evidenza all'apertura (arrivando dalla scheda del fondo) */
  alboIniziale?: number | null;
}

const RATEAZIONI: { id: Frequenza; label: string }[] = [
  { id: 'mensile', label: 'Mensile' },
  { id: 'trimestrale', label: 'Trimestrale' },
  { id: 'semestrale', label: 'Semestrale' },
  { id: 'annuale', label: 'Annuale' },
];
const ETA_TABELLA = Array.from({ length: 21 }, (_, i) => 55 + i);
const MAX_CONFRONTO = 6;
const ORDINE_TIPOLOGIE = ['vitalizia_immediata', 'certa_poi_vitalizia', 'controassicurata', 'reversibile', 'ltc'] as const;

const fmtPm = (v: number) => v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEuro = (v: number) => v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const campo = 'w-full min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-primary-rgb)/1)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const Etichetta: React.FC<{ children: React.ReactNode; aiuto?: string }> = ({ children, aiuto }) => (
  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" title={aiuto}>
    {children}{aiuto && <span className="ml-1 cursor-help normal-case text-slate-400">ⓘ</span>}
  </span>
);

const Badge: React.FC<{ children: React.ReactNode; tono?: 'viola' | 'grigio' | 'ambra' | 'verde' }> = ({ children, tono = 'grigio' }) => {
  const toni = {
    viola: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    grigio: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    ambra: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    verde: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${toni[tono]}`}>{children}</span>;
};

/** L'opzione nel formato dei componenti di scheda (tabella dei coefficienti, nota reversibile). */
const opzioneScheda = (r: RigaConfronto, etichetta: string): OpzioneRendita => ({
  tipologia: r.tabella.tipologia,
  durataCertaAnni: r.tabella.durata_certa_anni,
  percReversibilita: r.tabella.perc_reversibilita,
  tassoTecnico: r.tabella.tasso_tecnico,
  baseDemografica: r.tabella.base_demografica ?? r.set.base_demografica,
  etaReversionarioIpotesi: r.tabella.eta_reversionario_ipotesi,
  etichetta,
});

/* ── Riga della classifica ─────────────────────────────────────── */
const RigaRendita: React.FC<{
  riga: RigaConfronto;
  posizione: number | null;
  massimo: number;
  nome: string;
  tipoFondo: string | null;
  params: ParametriConfronto;
  aperta: boolean;
  onApri: () => void;
  inConfronto: boolean;
  onConfronto: () => void;
  confrontoPieno: boolean;
  evidenziata: boolean;
  comparto: PensionFund | null;
  onFundClick?: (fund: PensionFund) => void;
}> = ({ riga, posizione, massimo, nome, tipoFondo, params, aperta, onApri, inConfronto, onConfronto, confrontoPieno, evidenziata, comparto, onFundClick }) => {
  const r = riga.risultato;
  const s = riga.sintesi;
  const perSesso = r.sesso !== 'U';
  const riferimento = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (evidenziata) riferimento.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [evidenziata]);

  const avvisi = [
    r.interpolato ? 'età interpolata' : null,
    r.correzioneEtaApplicata !== 0 ? `età corretta ${r.correzioneEtaApplicata > 0 ? '+' : ''}${r.correzioneEtaApplicata}` : null,
    riga.tabella.qualita === 'da_verificare' ? 'dato da verificare' : null,
    riga.tabella.tipologia === 'ltc' && params.opzione.tipologia !== 'ltc' ? 'solo con LTC' : null,
  ].filter(Boolean) as string[];

  return (
    <div
      ref={riferimento}
      className={`rounded-xl border bg-white dark:bg-slate-900 transition-shadow ${
        evidenziata ? 'border-violet-400 ring-2 ring-violet-200 dark:ring-violet-900' : 'border-slate-200 dark:border-slate-800'
      } ${aperta ? 'shadow-md' : 'hover:shadow-sm'}`}
    >
      <div className="flex items-stretch">
        <button type="button" onClick={onApri} className="flex-1 min-w-0 text-left px-3 sm:px-4 py-3" aria-expanded={aperta}>
          <div className="grid grid-cols-[2rem_1fr] sm:grid-cols-[2.5rem_minmax(0,1.6fr)_minmax(0,1.4fr)_9rem] gap-x-3 gap-y-2 items-center">
            <span className={`row-span-2 sm:row-span-1 self-start sm:self-center text-center text-sm font-bold tabular-nums ${
              posizione != null && posizione <= 3 ? 'text-violet-700 dark:text-violet-300' : 'text-slate-400'
            }`}>
              {posizione != null ? posizione : '—'}
            </span>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100" title={nome}>{nome}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {tipoFondo ? `${tipoFondo} · ` : ''}Albo {riga.albo}{s.compagnia ? ` · ${s.compagnia}` : ''}
              </p>
              {(riga.piuTariffe || riga.tariffaStorica) && (
                <p className="mt-0.5 truncate text-[11px] text-violet-700 dark:text-violet-300" title={etichettaTariffa(riga.set)}>
                  {riga.tariffaStorica ? 'Tariffa per adesioni passate: ' : 'Tariffa: '}{etichettaTariffa(riga.set)}
                </p>
              )}
            </div>

            <div className="col-start-2 sm:col-start-auto min-w-0 flex flex-wrap gap-1">
              <Badge tono="viola">tasso {r.tassoTecnico != null ? fmtPerc(r.tassoTecnico) : 'n.d.'}</Badge>
              <Badge>{perSesso ? 'per sesso' : 'unisex'}</Badge>
              {s.basi[0] && <Badge><span className="max-w-[10rem] truncate" title={s.basi.join(' · ')}>{s.basi[0]}</span></Badge>}
              <Badge>caric. {testoCosti(s.caricamenti) ?? 'n.d.'}</Badge>
              <Badge>gest. sep. {testoCosti(s.gestione) ?? 'n.d.'}</Badge>
              {avvisi.map((a) => <Badge key={a} tono="ambra">{a}</Badge>)}
            </div>

            <div className="col-start-2 sm:col-start-auto sm:text-right">
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{fmtPm(riga.perMilleAnnuo)}‰</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{fmtEuro(r.renditaAnnuaLorda)} l'anno ogni {fmtEuro(MONTANTE_RIFERIMENTO)}</p>
              {!riga.nonConfrontabile && massimo > 0 && (
                <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${Math.max(4, (riga.perMilleAnnuo / massimo) * 100)}%` }} />
                </div>
              )}
              {riga.nonConfrontabile && <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">{riga.nonConfrontabile}</p>}
            </div>
          </div>
        </button>

        <div className="flex flex-col items-center justify-center gap-2 border-l border-slate-100 dark:border-slate-800 px-2 sm:px-3">
          <label className="flex flex-col items-center gap-0.5 text-[10px] text-slate-500 dark:text-slate-400 cursor-pointer" title="Aggiungi alla tabella comparata">
            <input
              type="checkbox"
              checked={inConfronto}
              disabled={!inConfronto && confrontoPieno}
              onChange={onConfronto}
              className="h-4 w-4 accent-violet-600"
            />
            confronta
          </label>
          <button
            type="button"
            onClick={onApri}
            aria-label={aperta ? 'Chiudi il dettaglio' : 'Apri il dettaglio'}
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${aperta ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {aperta && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-3 sm:px-4 py-4 space-y-4 bg-slate-50/60 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Il fondo offre:</span>
            {ORDINE_TIPOLOGIE.filter((t) => (riga.dati as Partial<FondoConfronto>).riepilogo?.tipologie.includes(t)).map((t) => (
              <Badge key={t} tono="verde">{ETICHETTA_TIPOLOGIA[t] ?? t}</Badge>
            ))}
            {comparto && onFundClick && (
              <button type="button" onClick={() => onFundClick(comparto)} className="ml-auto text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">
                Scheda completa del fondo →
              </button>
            )}
          </div>
          <SchedaFondo dati={riga.dati} idSet={riga.set.id_set} />
          <TabellaCoefficienti
            dati={riga.dati}
            opzione={opzioneScheda(riga, params.opzione.etichetta)}
            frequenza={params.frequenza}
            etaEvidenziata={r.etaAssicurativa}
            idSet={riga.set.id_set}
          />
          {params.opzione.tipologia === 'reversibile' && (
            <NotaReversibilita dati={riga.dati} opzione={opzioneScheda(riga, params.opzione.etichetta)} idSet={riga.set.id_set} />
          )}
          {r.avvertenze.length > 0 && (
            <ul className="list-disc pl-5 space-y-1 text-xs text-amber-700 dark:text-amber-400">
              {r.avvertenze.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Tabella comparata ─────────────────────────────────────────── */
const TabellaComparata: React.FC<{
  righe: RigaConfronto[];
  nomi: Record<string, string>;
  params: ParametriConfronto;
  onRimuovi: (chiave: string) => void;
}> = ({ righe, nomi, params, onRimuovi }) => {
  const serie = useMemo(() => righe.map((r) => serieCoefficienti(r, params, ETA_TABELLA)), [righe, params]);
  const massimiPerEta = ETA_TABELLA.map((_, i) => Math.max(...serie.map((s) => s[i] ?? -Infinity)));

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-slate-900 p-3 sm:p-4 space-y-3">
      <div>
        <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">Tabella comparata dei coefficienti</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {params.opzione.etichetta}, {params.sesso === 'M' ? 'uomo' : 'donna'}, rata {params.frequenza}. Rendita annua lorda per 1.000 € a ogni età di uscita,
          per un cliente della stessa generazione. In verde il valore più alto per età; «—» dove il fondo non pubblica il dato.
        </p>
      </div>
      <div className="overflow-auto max-h-[28rem] rounded-lg border border-slate-100 dark:border-slate-800">
        <table className="w-full text-xs sm:text-sm">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Età</th>
              {righe.map((r) => (
                <th key={r.chiave} className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200 min-w-[8rem] align-top">
                  <span className="block truncate max-w-[12rem] ml-auto" title={nomi[r.albo]}>{nomi[r.albo]}</span>
                  <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">
                    tasso {r.tassoTecnico != null ? fmtPerc(r.tassoTecnico) : 'n.d.'} · {r.risultato.sesso === 'U' ? 'unisex' : 'per sesso'}
                  </span>
                  <button type="button" onClick={() => onRimuovi(r.chiave)} className="text-[10px] font-normal text-violet-700 hover:underline dark:text-violet-300">togli</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {ETA_TABELLA.map((eta, i) => (
              <tr key={eta} className={eta === params.eta ? 'bg-violet-50 dark:bg-violet-950/30 font-semibold' : ''}>
                <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{eta}</td>
                {serie.map((s, j) => {
                  const v = s[i];
                  const migliore = v != null && v === massimiPerEta[i] && righe.length > 1;
                  return (
                    <td key={righe[j].chiave} className={`px-3 py-1.5 text-right tabular-nums ${migliore ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-slate-800 dark:text-slate-200'}`}>
                      {v == null ? '—' : fmtPm(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ── Pagina ────────────────────────────────────────────────────── */
const RenditePage: React.FC<RenditePageProps> = ({ funds, onFundClick, alboIniziale }) => {
  const { abbonato, token } = useAccessoRendite();
  const fondiCoperti = useCoperturaRendite();
  const annoCorrente = new Date().getFullYear();

  const [chiaveOpzione, setChiaveOpzione] = useState('vitalizia');
  const [eta, setEta] = useState(67);
  const [annoNascita, setAnnoNascita] = useState(annoCorrente - 67);
  const [annoToccato, setAnnoToccato] = useState(false);
  const [sesso, setSesso] = useState<'M' | 'F'>('M');
  const [frequenza, setFrequenza] = useState<Frequenza>('mensile');
  const [etaReversionario, setEtaReversionario] = useState(64);
  const [tasso, setTasso] = useState<number | 'tutti'>('tutti');
  const [includiStorici, setIncludiStorici] = useState(false);
  const [tipoFondo, setTipoFondo] = useState<'all' | 'FPN' | 'FPA' | 'PIP'>('all');
  const [cerca, setCerca] = useState('');
  const [soloConfronto, setSoloConfronto] = useState(false);
  const [confronto, setConfronto] = useState<string[]>([]);
  const [aperta, setAperta] = useState<string | null>(null);
  const [evidenziato, setEvidenziato] = useState<string | null>(alboIniziale != null ? String(alboIniziale) : null);

  // finche il consulente non tocca l'anno di nascita, segue l'eta: cliente che va in pensione quest'anno
  useEffect(() => { if (!annoToccato) setAnnoNascita(annoCorrente - eta); }, [eta, annoToccato, annoCorrente]);

  const opzione = OPZIONI_CONFRONTO.find((o) => o.chiave === chiaveOpzione) ?? OPZIONI_CONFRONTO[0];
  const { stato, fondi } = useRenditeConfronto(opzione.tipologia, token, abbonato);

  // albo -> comparti del dataset: nome del fondo, tipo, scheda completa
  const perAlbo = useMemo(() => {
    const m = new Map<string, PensionFund>();
    funds.forEach((f) => { if (!m.has(String(f.nAlbo))) m.set(String(f.nAlbo), f); });
    return m;
  }, [funds]);
  const nomi = useMemo(() => {
    const out: Record<string, string> = {};
    Object.entries<FondoConfronto>(fondi ?? {}).forEach(([albo, d]) => { out[albo] = nomeBreve(perAlbo.get(albo)?.pip ?? d.nome_fondo ?? `Albo ${albo}`); });
    return out;
  }, [fondi, perAlbo]);

  const params: ParametriConfronto = useMemo(() => ({
    opzione, eta, annoNascita, sesso, frequenza, etaReversionario, tasso, includiStorici,
  }), [opzione, eta, annoNascita, sesso, frequenza, etaReversionario, tasso, includiStorici]);

  const tassiDisponibili = useMemo(() => {
    const t = new Set<number>();
    Object.values<FondoConfronto>(fondi ?? {}).forEach((d) => d.convenzioni.forEach((c) => c.set.forEach((s) => s.tabelle.forEach((x) => {
      if (x.tasso_tecnico != null) t.add(x.tasso_tecnico);
    }))));
    return Array.from(t).sort((a, b) => a - b);
  }, [fondi]);
  useEffect(() => { if (tasso !== 'tutti' && fondi && !tassiDisponibili.includes(tasso)) setTasso('tutti'); }, [tassiDisponibili, tasso, fondi]);

  const esito = useMemo(() => (fondi ? confrontaRendite(fondi, params) : null), [fondi, params]);

  const filtra = (r: RigaConfronto) => {
    const f = perAlbo.get(r.albo);
    if (tipoFondo !== 'all' && f?.type !== tipoFondo) return false;
    if (soloConfronto && !confronto.includes(r.chiave)) return false;
    const q = cerca.trim().toLowerCase();
    if (q && !`${nomi[r.albo]} ${r.sintesi.compagnia ?? ''} ${r.albo}`.toLowerCase().includes(q)) return false;
    return true;
  };
  const confrontabili = (esito?.confrontabili ?? []).filter(filtra);
  const nonConfrontabili = (esito?.nonConfrontabili ?? []).filter(filtra);
  const massimo = confrontabili[0]?.perMilleAnnuo ?? 0;
  const nFondi = new Set(confrontabili.map((r) => r.albo)).size;
  const tutteLeRighe = [...(esito?.confrontabili ?? []), ...(esito?.nonConfrontabili ?? [])];
  const righeConfronto = confronto.map((k) => tutteLeRighe.find((r) => r.chiave === k)).filter((r): r is RigaConfronto => Boolean(r));

  // arrivando dalla scheda di un fondo: si apre la sua prima riga
  useEffect(() => {
    if (!evidenziato || !esito) return;
    const prima = tutteLeRighe.find((r) => r.albo === evidenziato);
    if (prima) setAperta(prima.chiave);
  }, [evidenziato, esito]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (alboIniziale != null) setEvidenziato(String(alboIniziale)); }, [alboIniziale]);

  const toggleConfronto = (k: string) =>
    setConfronto((c) => (c.includes(k) ? c.filter((x) => x !== k) : c.length >= MAX_CONFRONTO ? c : [...c, k]));

  /* piano Free */
  if (!abbonato) {
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/20 p-5 sm:p-6 text-sm text-slate-700 dark:text-slate-300">
        <div className="flex items-start gap-3">
          <span className="text-lg" aria-hidden>🔒</span>
          <div className="space-y-2">
            <p className="font-semibold text-slate-900 dark:text-slate-100">Confronto delle rendite fra fondi</p>
            <p>
              Con il piano <strong>Full Access</strong> puoi confrontare le condizioni di rendita
              {fondiCoperti ? <> di <strong>{fondiCoperti} fondi pensione</strong></> : ''}: coefficienti di trasformazione per età,
              sesso e rateazione, tasso tecnico, base demografica, caricamenti e costo della gestione separata, fondo per fondo.
            </p>
            <a href={SUBSCRIPTION_URL} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-1 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg shadow-sm">
              Acquista Full Access
            </a>
          </div>
        </div>
      </div>
    );
  }

  const nomeRiga = (r: RigaConfronto) => nomi[r.albo] ?? `Albo ${r.albo}`;
  const rendiRiga = (r: RigaConfronto, posizione: number | null) => (
    <RigaRendita
      key={r.chiave}
      riga={r}
      posizione={posizione}
      massimo={massimo}
      nome={nomeRiga(r)}
      tipoFondo={perAlbo.get(r.albo)?.type ?? null}
      params={params}
      aperta={aperta === r.chiave}
      onApri={() => setAperta(aperta === r.chiave ? null : r.chiave)}
      inConfronto={confronto.includes(r.chiave)}
      onConfronto={() => toggleConfronto(r.chiave)}
      confrontoPieno={confronto.length >= MAX_CONFRONTO}
      evidenziata={evidenziato === r.albo && tutteLeRighe.find((x) => x.albo === r.albo)?.chiave === r.chiave}
      comparto={perAlbo.get(r.albo) ?? null}
      onFundClick={onFundClick}
    />
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Filtri: le condizioni del cliente, uguali per tutti i fondi */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Condizioni del confronto</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Imposta il cliente e il tipo di rendita: i fondi che la offrono vengono ordinati per rendita annua a parità di condizioni.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <label className="sm:col-span-2 space-y-1.5">
            <Etichetta>Tipo di rendita</Etichetta>
            <select value={chiaveOpzione} onChange={(e) => { setChiaveOpzione(e.target.value); setAperta(null); setConfronto([]); }} className={campo}>
              {OPZIONI_CONFRONTO.map((o) => <option key={o.chiave} value={o.chiave}>{o.etichetta}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <Etichetta aiuto="Un tasso tecnico più alto dà una rata iniziale più alta ma rivalutazioni future più basse: confronta preferibilmente a parità di tasso.">Tasso tecnico</Etichetta>
            <select value={String(tasso)} onChange={(e) => setTasso(e.target.value === 'tutti' ? 'tutti' : Number(e.target.value))} className={campo}>
              <option value="tutti">Tutti i tassi</option>
              {tassiDisponibili.map((t) => <option key={t} value={t}>{fmtPerc(t)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <Etichetta>Rateazione</Etichetta>
            <select value={frequenza} onChange={(e) => setFrequenza(e.target.value as Frequenza)} className={campo}>
              {RATEAZIONI.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>

          <div className="space-y-1.5">
            <Etichetta aiuto="Le tavole unisex valgono uguali per uomo e donna: per un uomo possono essere penalizzanti, per una donna favorevoli.">Sesso del cliente</Etichetta>
            <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
              {(['M', 'F'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setSesso(s)}
                  className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${sesso === s ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                  {s === 'M' ? 'Uomo' : 'Donna'}
                </button>
              ))}
            </div>
          </div>
          <label className="space-y-1.5">
            <Etichetta>Età al pensionamento</Etichetta>
            <input type="number" min={50} max={80} value={eta} onChange={(e) => setEta(Math.min(80, Math.max(50, Number(e.target.value) || 67)))} className={campo} />
          </label>
          <label className="space-y-1.5">
            <Etichetta aiuto="Alcuni fondi correggono l'età in base all'anno di nascita (tavole per generazione).">Anno di nascita</Etichetta>
            <input type="number" min={1930} max={annoCorrente} value={annoNascita}
              onChange={(e) => { setAnnoToccato(true); setAnnoNascita(Number(e.target.value) || annoCorrente - eta); }} className={campo} />
          </label>
          {opzione.tipologia === 'reversibile' ? (
            <label className="space-y-1.5">
              <Etichetta>Età del reversionario</Etichetta>
              <input type="number" min={30} max={90} value={etaReversionario} onChange={(e) => setEtaReversionario(Number(e.target.value) || 64)} className={campo} />
            </label>
          ) : (
            <label className="space-y-1.5">
              <Etichetta>Tipo di fondo</Etichetta>
              <select value={tipoFondo} onChange={(e) => setTipoFondo(e.target.value as typeof tipoFondo)} className={campo}>
                <option value="all">Tutti</option>
                <option value="FPN">Negoziali (FPN)</option>
                <option value="FPA">Aperti (FPA)</option>
                <option value="PIP">PIP</option>
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca fondo o compagnia…" className={`${campo} sm:max-w-xs`} />
          {opzione.tipologia === 'reversibile' && (
            <select value={tipoFondo} onChange={(e) => setTipoFondo(e.target.value as typeof tipoFondo)} className={`${campo} sm:max-w-[12rem]`} aria-label="Tipo di fondo">
              <option value="all">Tutti i tipi di fondo</option>
              <option value="FPN">Negoziali (FPN)</option>
              <option value="FPA">Aperti (FPA)</option>
              <option value="PIP">PIP</option>
            </select>
          )}
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={includiStorici} onChange={(e) => setIncludiStorici(e.target.checked)} className="h-4 w-4 accent-violet-600" />
            Includi le tariffe per chi ha aderito in passato
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={soloConfronto} onChange={(e) => setSoloConfronto(e.target.checked)} disabled={!confronto.length} className="h-4 w-4 accent-violet-600" />
            Mostra solo i fondi spuntati ({confronto.length})
          </label>
        </div>
      </div>

      {stato === 'caricamento' || stato === 'idle' ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />)}</div>
      ) : stato !== 'pronto' || !esito ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          Non è stato possibile caricare i coefficienti. Riprova tra qualche istante.
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-violet-50/70 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/50 px-4 py-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300 space-y-1">
            <p>
              <strong>{confrontabili.length}</strong> {confrontabili.length === 1 ? 'tariffa' : 'tariffe'} di <strong>{nFondi}</strong> {nFondi === 1 ? 'fondo' : 'fondi'} {confrontabili.length === 1 ? 'ordinata' : 'ordinate'} per
              rendita annua lorda per 1.000 € — {opzione.etichetta.toLowerCase()}, {sesso === 'M' ? 'uomo' : 'donna'} di {eta} anni nato nel {annoNascita}, rata {frequenza}
              {tasso !== 'tutti' ? `, tasso tecnico ${fmtPerc(tasso)}` : ''}.
            </p>
            <p className="text-slate-500 dark:text-slate-400">
              Non è una classifica assoluta: un tasso tecnico più alto alza la rata iniziale ma riduce le rivalutazioni, contano i costi della gestione
              separata e, per le tavole unisex, il sesso del cliente. Spunta fino a {MAX_CONFRONTO} righe per la tabella comparata per età.
            </p>
          </div>

          {righeConfronto.length >= 2 && (
            <TabellaComparata righe={righeConfronto} nomi={nomi} params={params} onRimuovi={toggleConfronto} />
          )}

          <div className="space-y-2.5">
            {confrontabili.length ? confrontabili.map((r, i) => rendiRiga(r, i + 1)) : (
              <p className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-sm text-slate-500">Nessun fondo corrisponde ai filtri.</p>
            )}
          </div>

          {nonConfrontabili.length > 0 && (
            <details className="group rounded-xl border border-slate-200 dark:border-slate-800">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Fondi non confrontabili alle condizioni scelte ({nonConfrontabili.length})</span>
                <span className="text-slate-400 transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="px-3 pb-3 space-y-2.5">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Offrono questa rendita ma non pubblicano il dato per la rateazione o l'età richieste: il valore mostrato si riferisce a condizioni diverse.
                </p>
                {nonConfrontabili.map((r) => rendiRiga(r, null))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
};

export default RenditePage;
