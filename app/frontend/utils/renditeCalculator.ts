/**
 * Motore di calcolo della rendita.
 *
 * Converte un montante in rendita usando i coefficienti estratti dai documenti
 * sulle rendite. Non dipende da dove i dati sono ospitati: riceve la struttura
 * gia estratta e restituisce il risultato con la tracciabilita di come ci e arrivato.
 */
import {
  RenditeExtractionResult,
  SetCoefficienti,
  TabellaRendita,
  TipologiaRendita,
  Frequenza,
  Sesso,
} from '../types/rendite';

export const RATE_PER_ANNO: Record<Frequenza, number> = {
  annuale: 1,
  semestrale: 2,
  quadrimestrale: 3,
  trimestrale: 4,
  bimestrale: 6,
  mensile: 12,
};

export interface ParametriRendita {
  /** eta anagrafica al pensionamento */
  etaPensionamento: number;
  /** serve solo se il fondo prevede la correzione dell'eta */
  annoNascita?: number;
  /** serve solo se il fondo differenzia le tavole per sesso */
  sesso?: Sesso;
  tipologia: TipologiaRendita;
  /** 5 o 10 per la rendita certa */
  durataCertaAnni?: number | null;
  /** percentuale di reversibilita, per la tipologia reversibile */
  percReversibilita?: number | null;
  /** differenza di eta con la testa reversionaria (matrice reversibile) */
  deltaEtaReversionario?: number | null;
  frequenza: Frequenza;
  /** obbligatorio quando il fondo ne offre piu di uno: lo sceglie il consulente */
  tassoTecnico?: number | null;
  montante: number;
  /** forza un set specifico; di default si usa quello corrente */
  idSet?: string;
}

export interface RisultatoRendita {
  renditaAnnuaLorda: number;
  rataLorda: number;
  rataPerAnno: number;

  coefficientePerMille: number;
  /** true se il coefficiente non e stampato nel documento ma ricavato per interpolazione */
  interpolato: boolean;
  etaAnagrafica: number;
  /** eta effettivamente usata per leggere la tavola */
  etaAssicurativa: number;
  correzioneEtaApplicata: number;

  idTabella: string;
  idSet: string;
  tassoTecnico: number | null;
  baseDemografica: string | null;
  sesso: Sesso;
  /** note da mostrare all'utente: interpolazioni, ripieghi, qualita del dato */
  avvertenze: string[];
}

export class RenditaNonCalcolabile extends Error {
  constructor(public motivo: string) {
    super(motivo);
    this.name = 'RenditaNonCalcolabile';
  }
}

/* ------------------------------------------------------------------ *
 * Interrogazione: cosa offre un fondo, cosa serve chiedere all'utente
 * ------------------------------------------------------------------ */

export function setCorrente(dati: RenditeExtractionResult, idSet?: string): SetCoefficienti | null {
  const tutti = (dati.convenzioni ?? []).flatMap(c => c.set ?? []);
  if (!tutti.length) return null;
  if (idSet) return tutti.find(s => s.id_set === idSet) ?? null;
  return tutti.find(s => s.set_corrente === true) ?? tutti[0];
}

/**
 * Dice quali input servono davvero per questo fondo, cosi l'interfaccia puo
 * chiedere sesso e anno di nascita solo dove cambiano il risultato.
 */
export function requisitiInput(dati: RenditeExtractionResult, idSet?: string): {
  richiedeSesso: boolean;
  richiedeAnnoNascita: boolean;
  tassiTecnici: number[];
} {
  const set = setCorrente(dati, idSet);
  if (!set) return { richiedeSesso: false, richiedeAnnoNascita: false, tassiTecnici: [] };

  const sessi = new Set((set.tabelle ?? []).map(t => t.sesso));
  const tassi = Array.from(
    new Set((set.tabelle ?? []).map(t => t.tasso_tecnico).filter((x): x is number => x != null))
  ).sort((a, b) => a - b);

  return {
    richiedeSesso: sessi.has('M') || sessi.has('F'),
    richiedeAnnoNascita: (set.correzione_eta ?? []).length > 0
      || (set.tabelle ?? []).some(t => t.tipo_colonne === 'generazione'),
    tassiTecnici: tassi,
  };
}

export interface OpzioneRendita {
  tipologia: TipologiaRendita;
  durataCertaAnni: number | null;
  percReversibilita: number | null;
  tassoTecnico: number | null;
  baseDemografica: string | null;
  etaReversionarioIpotesi: string | null;
  etichetta: string;
}

/** Popola la tendina delle tipologie richiesta dall'incarico. */
export function opzioniDisponibili(dati: RenditeExtractionResult, idSet?: string): OpzioneRendita[] {
  const set = setCorrente(dati, idSet);
  if (!set) return [];

  const viste = new Map<string, OpzioneRendita>();
  for (const t of set.tabelle ?? []) {
    const chiave = [t.tipologia, t.durata_certa_anni, t.perc_reversibilita, t.tasso_tecnico].join('|');
    if (viste.has(chiave)) continue;
    viste.set(chiave, {
      tipologia: t.tipologia,
      durataCertaAnni: t.durata_certa_anni,
      percReversibilita: t.perc_reversibilita,
      tassoTecnico: t.tasso_tecnico,
      baseDemografica: t.base_demografica ?? set.base_demografica,
      etaReversionarioIpotesi: t.eta_reversionario_ipotesi,
      etichetta: etichettaOpzione(t),
    });
  }
  return Array.from(viste.values());
}

function etichettaOpzione(t: TabellaRendita): string {
  const nomi: Record<TipologiaRendita, string> = {
    vitalizia_immediata: 'Vitalizia immediata',
    certa_poi_vitalizia: `Certa ${t.durata_certa_anni ?? '?'} anni e poi vitalizia`,
    reversibile: `Reversibile${t.perc_reversibilita != null ? ` ${t.perc_reversibilita}%` : ''}`,
    controassicurata: 'Con restituzione del montante residuo (controassicurata)',
    ltc: 'Vitalizia con maggiorazione long term care',
  };
  const tt = t.tasso_tecnico != null ? ` — tasso tecnico ${formattaPerc(t.tasso_tecnico)}` : '';
  return `${nomi[t.tipologia]}${tt}`;
}

function formattaPerc(v: number): string {
  return `${String(v).replace('.', ',')}%`;
}

/* ------------------------------------------------------------------ *
 * Calcolo
 * ------------------------------------------------------------------ */

/** Eta anagrafica -> eta assicurativa, secondo la tabella di correzione del fondo. */
export function correzioneEta(set: SetCoefficienti, annoNascita?: number, sesso: Sesso = 'U'): number {
  const righe = set.correzione_eta ?? [];
  if (!righe.length || annoNascita == null) return 0;

  const candidate = righe.filter(r => r.sesso === sesso || r.sesso === 'U');
  const riga = (candidate.length ? candidate : righe).find(r => {
    const da = r.anno_nascita_da ?? -Infinity;
    const a = r.anno_nascita_a ?? Infinity;
    return annoNascita >= da && annoNascita <= a;
  });
  return riga?.delta_anni ?? 0;
}

function selezionaTabella(set: SetCoefficienti, p: ParametriRendita): TabellaRendita {
  const candidate = (set.tabelle ?? []).filter(t => {
    if (t.tipologia !== p.tipologia) return false;
    if (p.tipologia === 'certa_poi_vitalizia' && p.durataCertaAnni != null
        && t.durata_certa_anni !== p.durataCertaAnni) return false;
    if (p.tipologia === 'reversibile' && p.percReversibilita != null
        && t.perc_reversibilita !== p.percReversibilita) return false;
    if (p.tassoTecnico != null && t.tasso_tecnico !== p.tassoTecnico) return false;
    return true;
  });

  if (!candidate.length) {
    throw new RenditaNonCalcolabile(
      'Il fondo non pubblica una tavola per la combinazione richiesta');
  }

  // il sesso e attributo della tabella: si preferisce quello richiesto, poi l'unisex
  const perSesso = candidate.filter(t => t.sesso === (p.sesso ?? 'U'));
  if (perSesso.length) return perSesso[0];
  const unisex = candidate.filter(t => t.sesso === 'U');
  if (unisex.length) return unisex[0];

  throw new RenditaNonCalcolabile(
    'Le tavole del fondo sono differenziate per sesso: indicare il sesso per ottenere la rendita');
}

/** Colonna numerica piu vicina al valore cercato. */
function colonnaPiuVicina(cols: string[], cercato: number): { idx: number; esatta: boolean; valore: number } {
  const disponibili = cols.map(Number).filter(n => !Number.isNaN(n));
  const vicino = disponibili.reduce((a, b) =>
    Math.abs(b - cercato) < Math.abs(a - cercato) ? b : a, disponibili[0]);
  return { idx: cols.indexOf(String(vicino)), esatta: vicino === cercato, valore: vicino };
}

/** La classe di generazione ("sino al 1939", "dal 1940 al 1948", "dopo il 1977") che contiene l'anno. */
function colonnaGenerazione(cols: string[], anno: number): number {
  return cols.findIndex(c => {
    const anni = (c.match(/\d{4}/g) ?? []).map(Number);
    if (!anni.length) return false;
    if (/sino|fino|prima|entro/i.test(c)) return anno <= anni[0];
    if (/dopo|oltre|in poi/i.test(c) && anni.length === 1) return anno >= anni[0];
    if (anni.length === 1) return anno >= anni[0];
    return anno >= anni[0] && anno <= anni[1];
  });
}

/** Indice della colonna da leggere: frequenza, eta o differenza di eta del reversionario, generazione. */
function indiceColonna(
  t: TabellaRendita, p: ParametriRendita, etaAssicurativa: number
): { idx: number; avvertenze: string[] } {
  const avvertenze: string[] = [];
  const cols = t.colonne ?? [];

  if (t.tipo_colonne === 'eta_reversionario') {
    const cercata = etaAssicurativa + (p.deltaEtaReversionario ?? 0);
    const c = colonnaPiuVicina(cols, cercata);
    if (!c.esatta) {
      avvertenze.push(
        `Il fondo tabula la reversibile per eta del reversionario ${cols.join(', ')}: ` +
        `usata l'eta di ${c.valore} anni invece di ${cercata}.`);
    }
    return { idx: c.idx, avvertenze };
  }

  if (t.tipo_colonne === 'generazione') {
    if (p.annoNascita == null) {
      throw new RenditaNonCalcolabile(
        "Il fondo distingue i coefficienti per anno di nascita: indicare l'anno di nascita");
    }
    const idx = colonnaGenerazione(cols, p.annoNascita);
    if (idx < 0) {
      throw new RenditaNonCalcolabile(
        `Nessuna classe di generazione del fondo comprende il ${p.annoNascita}`);
    }
    return { idx, avvertenze };
  }

  if (t.tipo_colonne === 'delta_eta_reversionario') {
    const delta = p.deltaEtaReversionario ?? 0;
    let idx = cols.indexOf(String(delta));
    if (idx < 0) {
      const disponibili = cols.map(Number).filter(n => !Number.isNaN(n));
      const vicino = disponibili.reduce((a, b) =>
        Math.abs(b - delta) < Math.abs(a - delta) ? b : a, disponibili[0]);
      idx = cols.indexOf(String(vicino));
      avvertenze.push(
        `Il fondo tabula la reversibile per differenze di eta da ${Math.min(...disponibili)} a ` +
        `${Math.max(...disponibili)} anni: usata la differenza di ${vicino} anni.`);
    }
    return { idx, avvertenze };
  }

  let idx = cols.indexOf(p.frequenza);
  if (idx < 0) {
    idx = cols.indexOf('annuale');
    if (idx < 0) idx = 0;
    avvertenze.push(
      `Il fondo non prevede la rateazione ${p.frequenza} per questa rendita: ` +
      `usata la rateazione ${cols[idx]}.`);
  }
  return { idx, avvertenze };
}

/**
 * Coefficiente per l'eta richiesta.
 * Se l'eta non e tabulata si interpola linearmente fra le due piu vicine;
 * fuori dal range pubblicato si usa l'estremo, senza estrapolare.
 */
function coefficientePerEta(
  t: TabellaRendita, idxColonna: number, eta: number
): { valore: number; interpolato: boolean; avvertenze: string[] } {
  const avvertenze: string[] = [];
  const punti = (t.righe ?? [])
    .filter(r => r.length > idxColonna + 1 && typeof r[idxColonna + 1] === 'number')
    .map(r => ({ eta: r[0], v: r[idxColonna + 1] }))
    .sort((a, b) => a.eta - b.eta);

  if (!punti.length) throw new RenditaNonCalcolabile('Tavola priva di valori leggibili');

  const esatto = punti.find(p => p.eta === eta);
  if (esatto) return { valore: esatto.v, interpolato: false, avvertenze };

  const min = punti[0], max = punti[punti.length - 1];
  if (eta < min.eta) {
    avvertenze.push(
      `Il fondo pubblica i coefficienti a partire da ${min.eta} anni: usato il valore a ${min.eta} anni.`);
    return { valore: min.v, interpolato: false, avvertenze };
  }
  if (eta > max.eta) {
    avvertenze.push(
      `Il fondo pubblica i coefficienti fino a ${max.eta} anni: usato il valore a ${max.eta} anni.`);
    return { valore: max.v, interpolato: false, avvertenze };
  }

  const sotto = [...punti].reverse().find(p => p.eta < eta)!;
  const sopra = punti.find(p => p.eta > eta)!;
  const peso = (eta - sotto.eta) / (sopra.eta - sotto.eta);
  const valore = sotto.v + (sopra.v - sotto.v) * peso;
  avvertenze.push(
    `Il fondo non pubblica il coefficiente a ${eta} anni: valore stimato per interpolazione ` +
    `fra ${sotto.eta} e ${sopra.eta} anni.`);
  return { valore, interpolato: true, avvertenze };
}

export function calcolaRendita(
  dati: RenditeExtractionResult, p: ParametriRendita
): RisultatoRendita {
  if (dati.file_pertinente === false) {
    throw new RenditaNonCalcolabile('Per questo fondo non sono disponibili le tavole dei coefficienti');
  }
  const set = setCorrente(dati, p.idSet);
  if (!set) throw new RenditaNonCalcolabile('Nessun set di coefficienti disponibile per il fondo');

  // Alcuni fondi (FONCHIM) offrono la vitalizia solo con la maggiorazione LTC: non esiste una
  // vitalizia "semplice". In quel caso si usa la LTC e lo si dichiara, invece di non rispondere.
  let tabella: TabellaRendita;
  let avvTipologia: string[] = [];
  try {
    tabella = selezionaTabella(set, p);
  } catch (e) {
    const soloLtc = p.tipologia === 'vitalizia_immediata'
      && !(set.tabelle ?? []).some(t => t.tipologia === 'vitalizia_immediata')
      && (set.tabelle ?? []).some(t => t.tipologia === 'ltc');
    if (!soloLtc) throw e;
    tabella = selezionaTabella(set, { ...p, tipologia: 'ltc' });
    avvTipologia = ['Il fondo non prevede una rendita vitalizia semplice: tutte le sue rendite includono la ' +
                    'maggiorazione in caso di non autosufficienza (LTC). Il calcolo usa quella tavola.'];
  }
  const delta = correzioneEta(set, p.annoNascita, tabella.sesso);
  const etaAssicurativa = p.etaPensionamento + delta;

  const { idx, avvertenze: avvCol } = indiceColonna(tabella, p, etaAssicurativa);
  const { valore, interpolato, avvertenze: avvEta } = coefficientePerEta(tabella, idx, etaAssicurativa);

  if (!tabella.scala_originale) {
    throw new RenditaNonCalcolabile('Scala dei coefficienti non determinata: dato non utilizzabile');
  }
  // Un divisore e il capitale necessario per ottenere 1 euro di rendita annua:
  // il coefficiente equivalente e il suo reciproco. Trattarlo come moltiplicatore
  // produce rendite centinaia di volte piu alte, con numeri all'apparenza plausibili.
  const perMille = tabella.verso_conversione === 'divisore'
    ? 1000 * tabella.scala_originale / valore
    : valore * 1000 / tabella.scala_originale;
  const rate = RATE_PER_ANNO[p.frequenza] ?? 1;

  // annuo_corretto: il coefficiente esprime la rendita ANNUA gia corretta per il frazionamento.
  // per_rata:       il coefficiente esprime direttamente l'importo della SINGOLA RATA.
  // Scambiarli introduce un errore pari al numero di rate (fino a dodici volte).
  let renditaAnnuaLorda: number;
  let rataLorda: number;
  if (tabella.base_frazionamento === 'per_rata') {
    rataLorda = p.montante * perMille / 1000;
    renditaAnnuaLorda = rataLorda * rate;
  } else {
    renditaAnnuaLorda = p.montante * perMille / 1000;
    rataLorda = renditaAnnuaLorda / rate;
  }

  const avvertenze = [...avvTipologia, ...avvCol, ...avvEta];
  if (tabella.qualita === 'da_verificare') {
    avvertenze.push('Coefficienti letti da una tavola in forma di immagine: dato da verificare.');
  }
  if (delta !== 0) {
    avvertenze.push(
      `Il fondo applica una correzione di ${delta > 0 ? '+' : ''}${delta} anni all'eta ` +
      `in funzione dell'anno di nascita: coefficiente letto a ${etaAssicurativa} anni.`);
  }

  return {
    renditaAnnuaLorda: arrotonda(renditaAnnuaLorda),
    rataLorda: arrotonda(rataLorda),
    rataPerAnno: rate,
    coefficientePerMille: Number(perMille.toFixed(6)),
    interpolato,
    etaAnagrafica: p.etaPensionamento,
    etaAssicurativa,
    correzioneEtaApplicata: delta,
    idTabella: tabella.id_tabella,
    idSet: set.id_set,
    tassoTecnico: tabella.tasso_tecnico,
    baseDemografica: tabella.base_demografica ?? set.base_demografica,
    sesso: tabella.sesso,
    avvertenze,
  };
}

function arrotonda(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Nota da mostrare accanto alle rendite reversibili, richiesta dall'incarico. */
export const NOTA_REVERSIBILITA =
  "La reversibilità nel fondo pensione è un'opzione assicurativa facoltativa: l'aderente la attiva " +
  "al momento della conversione del montante in rendita, designa liberamente la seconda testa nei " +
  "limiti della convenzione e ne fissa la quota, di norma 60%, 80% o 100%. Nell'INPS è invece una " +
  "prestazione obbligatoria, con platea e aliquote stabilite dalla legge: 60% al coniuge solo, 80% " +
  "con un figlio, 100% con due o più figli aventi diritto. Per avere una stima precisa della rendita " +
  "reversibile (che tenga conto dell'età e sesso del reversionario) bisogna chiedere un preventivo " +
  "al fondo pensione.";
