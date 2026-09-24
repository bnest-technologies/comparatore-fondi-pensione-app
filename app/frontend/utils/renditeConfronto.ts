/**
 * Confronto delle rendite fra fondi.
 *
 * Non esiste una classifica assoluta delle rendite: dipende da tipologia, eta, sesso,
 * rateazione e tasso tecnico. Qui si ordinano i fondi solo a parita di queste condizioni,
 * scelte dal consulente, per coefficiente di trasformazione. Ogni riga e una tariffa di un
 * fondo (un fondo con due tassi tecnici o due tariffe compare due volte, dichiarandolo).
 *
 * Una riga e "non confrontabile" quando il fondo non pubblica il dato alle condizioni scelte
 * (rateazione assente, eta fuori dalle tavole): il motore userebbe un valore diverso da quello
 * chiesto e metterla in classifica falserebbe l'ordine.
 */
import type {
  CostoRendita, Frequenza, RenditeExtractionResult, Sesso, SetCoefficienti, TabellaRendita, TipologiaRendita,
} from '../types/rendite';
import { calcolaRendita, RenditaNonCalcolabile, type RisultatoRendita } from './renditeCalculator';

export const MONTANTE_RIFERIMENTO = 100000;

/* ── Tipologie confrontabili ─────────────────────────────────────── */

export interface OpzioneConfronto {
  chiave: string;
  etichetta: string;
  tipologia: TipologiaRendita;
  durataCertaAnni: number | null;
  percReversibilita: number | null;
}

export const OPZIONI_CONFRONTO: OpzioneConfronto[] = [
  { chiave: 'vitalizia', etichetta: 'Vitalizia immediata', tipologia: 'vitalizia_immediata', durataCertaAnni: null, percReversibilita: null },
  { chiave: 'certa5', etichetta: 'Certa 5 anni e poi vitalizia', tipologia: 'certa_poi_vitalizia', durataCertaAnni: 5, percReversibilita: null },
  { chiave: 'certa10', etichetta: 'Certa 10 anni e poi vitalizia', tipologia: 'certa_poi_vitalizia', durataCertaAnni: 10, percReversibilita: null },
  { chiave: 'controassicurata', etichetta: 'Controassicurata (restituzione del capitale residuo)', tipologia: 'controassicurata', durataCertaAnni: null, percReversibilita: null },
  { chiave: 'rev100', etichetta: 'Reversibile al 100%', tipologia: 'reversibile', durataCertaAnni: null, percReversibilita: 100 },
  { chiave: 'rev60', etichetta: 'Reversibile al 60%', tipologia: 'reversibile', durataCertaAnni: null, percReversibilita: 60 },
  { chiave: 'ltc', etichetta: 'Con maggiorazione LTC (non autosufficienza)', tipologia: 'ltc', durataCertaAnni: null, percReversibilita: null },
];

export const ETICHETTA_TIPOLOGIA: Record<TipologiaRendita, string> = {
  vitalizia_immediata: 'Vitalizia',
  certa_poi_vitalizia: 'Certa e poi vitalizia',
  reversibile: 'Reversibile',
  controassicurata: 'Controassicurata',
  ltc: 'LTC',
};

/* ── Sintesi di una tariffa (per scheda, righe e popup del fondo) ── */

export const eCostoGestione = (c: Pick<CostoRendita, 'tipo_costo'>) =>
  /gestion|trattenut|rendiment|commission/i.test(String(c.tipo_costo));
export const eCaricamento = (c: Pick<CostoRendita, 'tipo_costo'>) =>
  /erogaz|caricament|spes|rata|frazion/i.test(String(c.tipo_costo))
  && !/premio|versament|contribut/i.test(String(c.tipo_costo)) && !eCostoGestione(c);

export const fmtPerc = (v: number) => `${v.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

export interface SintesiTariffa {
  compagnia: string | null;
  scadenza: string | null;
  basi: string[];
  caricamenti: CostoRendita[];
  gestione: CostoRendita[];
}

export function sintesiTariffa(dati: RenditeExtractionResult, set: SetCoefficienti | null): SintesiTariffa {
  const conv = dati.convenzioni?.find((c) => (c.set ?? []).some((s) => s === set || s.id_set === set?.id_set))
    ?? dati.convenzioni?.[0];
  const basi = new Set<string>();
  if (set?.base_demografica) basi.add(set.base_demografica);
  (set?.tabelle ?? []).forEach((t) => { if (t.base_demografica) basi.add(t.base_demografica); });
  const costi = set?.costi ?? [];
  return {
    compagnia: conv?.compagnia ?? null,
    scadenza: conv?.data_scadenza ?? null,
    basi: Array.from(basi),
    caricamenti: costi.filter(eCaricamento),
    gestione: costi.filter(eCostoGestione),
  };
}

/** Testo breve di una lista di costi: "1,25%; 0,5%". */
export function testoCosti(costi: CostoRendita[]): string | null {
  const valori = Array.from(new Set(costi.filter((c) => c.valore_perc != null).map((c) => fmtPerc(c.valore_perc as number))));
  if (valori.length) return valori.join(' · ');
  // il documento li dichiara ma senza una percentuale (es. COMETA: "inclusi nei coefficienti")
  if (costi.length) return costi.some((c) => /inclus/i.test(c.note ?? '')) ? 'inclusi nei coefficienti' : 'previsti, senza %';
  return null;
}

/** Come si chiama una tariffa: le condizioni di applicazione, altrimenti il tasso tecnico. */
export function etichettaTariffa(t: Pick<SetCoefficienti, 'id_set' | 'condizioni_applicabilita' | 'tabelle'>): string {
  const testo = (t.condizioni_applicabilita ?? '').trim();
  if (testo) return testo.length > 110 ? `${testo.slice(0, 107)}…` : testo;
  const tassi = Array.from(new Set((t.tabelle ?? []).map((x) => x.tasso_tecnico).filter((x): x is number => x != null)));
  return tassi.length ? `Tasso tecnico ${tassi.map((x) => String(x).replace('.', ',')).join(' / ')}%` : t.id_set;
}

/* ── Righe del confronto ─────────────────────────────────────────── */

export interface ParametriConfronto {
  opzione: OpzioneConfronto;
  eta: number;
  annoNascita: number;
  sesso: Exclude<Sesso, 'U'>;
  frequenza: Frequenza;
  etaReversionario: number;
  /** 'tutti' o un tasso tecnico preciso */
  tasso: number | 'tutti';
  /** anche le tariffe riservate a chi ha aderito in passato */
  includiStorici: boolean;
}

export interface RigaConfronto {
  chiave: string;
  albo: string;
  dati: RenditeExtractionResult;
  set: SetCoefficienti;
  /** il fondo ha piu tariffe per questa rendita: la riga va distinta dall'etichetta della tariffa */
  piuTariffe: boolean;
  tariffaStorica: boolean;
  tassoTecnico: number | null;
  /**
   * Rendita annua lorda per 1.000 euro di capitale, alla rata scelta. E la misura del confronto:
   * il coefficiente stampato puo riferirsi all'anno o alla singola rata (ALLEATA PREVIDENZA),
   * e confrontarli cosi come sono metterebbe in fondo alla classifica un fondo solo per il formato.
   */
  perMilleAnnuo: number;
  risultato: RisultatoRendita;
  tabella: TabellaRendita;
  sintesi: SintesiTariffa;
  /** perche il valore non e alle condizioni chieste; null se e confrontabile */
  nonConfrontabile: string | null;
}

export interface EsitoConfronto {
  confrontabili: RigaConfronto[];
  nonConfrontabili: RigaConfronto[];
  /** fondi che hanno la tipologia ma non per le condizioni scelte (es. manca il tasso) */
  esclusi: number;
}

const tavoleOpzione = (set: SetCoefficienti, o: OpzioneConfronto): TabellaRendita[] => {
  const proprie = (set.tabelle ?? []).filter((t) => t.tipologia === o.tipologia
    && (o.durataCertaAnni == null || t.durata_certa_anni === o.durataCertaAnni)
    && (o.percReversibilita == null || t.perc_reversibilita === o.percReversibilita));
  // vitalizia offerta solo con maggiorazione LTC (FONCHIM): il motore usa quella tavola
  if (!proprie.length && o.tipologia === 'vitalizia_immediata') {
    return (set.tabelle ?? []).filter((t) => t.tipologia === 'ltc');
  }
  return proprie;
};

/** Tariffe da considerare: quelle in vigore; se il fondo non ne indica una, tutte (le sceglie l'aderente). */
function tariffe(dati: RenditeExtractionResult, includiStorici: boolean): { set: SetCoefficienti; storica: boolean }[] {
  const tutti = (dati.convenzioni ?? []).flatMap((c) => c.set ?? []);
  const conTavole = tutti.filter((s) => (s.tabelle ?? []).length > 0);
  const esisteCorrente = tutti.some((s) => s.set_corrente === true);
  return conTavole
    .map((s) => ({ set: s, storica: esisteCorrente && s.set_corrente !== true }))
    .filter((x) => includiStorici || !x.storica);
}

function motivoNonConfrontabile(t: TabellaRendita, p: ParametriConfronto, etaAssicurativa: number): string | null {
  if (t.tipo_colonne === 'frequenza' && !(t.colonne ?? []).includes(p.frequenza)) {
    return `Il fondo non prevede la rata ${p.frequenza} per questa rendita`;
  }
  const eta = (t.righe ?? []).map((r) => r[0]);
  if (eta.length && (etaAssicurativa < Math.min(...eta) || etaAssicurativa > Math.max(...eta))) {
    return `Il fondo pubblica i coefficienti solo da ${Math.min(...eta)} a ${Math.max(...eta)} anni`;
  }
  return null;
}

const perMilleAnnuo = (r: RisultatoRendita) => (r.renditaAnnuaLorda / MONTANTE_RIFERIMENTO) * 1000;

/** Una riga per tariffa e tasso tecnico, calcolata alle condizioni scelte. */
export function righeFondo(albo: string, dati: RenditeExtractionResult, p: ParametriConfronto): RigaConfronto[] {
  const disponibili = tariffe(dati, p.includiStorici)
    .map((x) => ({ ...x, tavole: tavoleOpzione(x.set, p.opzione) }))
    .filter((x) => x.tavole.length > 0);
  const righe: RigaConfronto[] = [];
  for (const { set, storica, tavole } of disponibili) {
    const tassi = Array.from(new Set(tavole.map((t) => t.tasso_tecnico)))
      .filter((t) => p.tasso === 'tutti' || t === p.tasso);
    for (const tt of tassi) {
      let r: RisultatoRendita;
      try {
        r = calcolaRendita(dati, {
          idSet: set.id_set,
          tassoTecnico: tt ?? undefined,
          etaPensionamento: p.eta,
          annoNascita: p.annoNascita,
          sesso: p.sesso,
          tipologia: p.opzione.tipologia,
          durataCertaAnni: p.opzione.durataCertaAnni,
          percReversibilita: p.opzione.percReversibilita,
          deltaEtaReversionario: p.opzione.tipologia === 'reversibile' ? p.etaReversionario - p.eta : null,
          frequenza: p.frequenza,
          montante: MONTANTE_RIFERIMENTO,
        });
      } catch (e) {
        if (e instanceof RenditaNonCalcolabile) continue;
        throw e;
      }
      const tabella = (set.tabelle ?? []).find((t) => t.id_tabella === r.idTabella) ?? tavole[0];
      righe.push({
        chiave: `${albo}|${set.id_set}|${tt}`,
        albo,
        dati,
        set,
        piuTariffe: disponibili.length > 1,
        tariffaStorica: storica,
        tassoTecnico: tt ?? null,
        perMilleAnnuo: perMilleAnnuo(r),
        risultato: r,
        tabella,
        sintesi: sintesiTariffa(dati, set),
        nonConfrontabile: motivoNonConfrontabile(tabella, p, r.etaAssicurativa),
      });
    }
  }
  return righe;
}

export function confrontaRendite(fondi: Record<string, RenditeExtractionResult>, p: ParametriConfronto): EsitoConfronto {
  const tutte: RigaConfronto[] = [];
  let esclusi = 0;
  for (const [albo, dati] of Object.entries(fondi)) {
    if (dati.file_pertinente === false) continue;
    const righe = righeFondo(albo, dati, p);
    if (!righe.length) esclusi++;
    tutte.push(...righe);
  }
  const perCoefficiente = (a: RigaConfronto, b: RigaConfronto) => b.perMilleAnnuo - a.perMilleAnnuo;
  return {
    confrontabili: tutte.filter((r) => !r.nonConfrontabile).sort(perCoefficiente),
    nonConfrontabili: tutte.filter((r) => r.nonConfrontabile).sort(perCoefficiente),
    esclusi,
  };
}

/** Coefficienti per mille di una riga a piu eta, per la tabella comparata. null = non pubblicato. */
export function serieCoefficienti(riga: RigaConfronto, p: ParametriConfronto, eta: number[]): (number | null)[] {
  return eta.map((e) => {
    try {
      const r = calcolaRendita(riga.dati, {
        idSet: riga.set.id_set,
        tassoTecnico: riga.tassoTecnico ?? undefined,
        etaPensionamento: e,
        annoNascita: p.annoNascita - (e - p.eta),     // stessa generazione: si sposta solo l'eta di uscita
        sesso: p.sesso,
        tipologia: p.opzione.tipologia,
        durataCertaAnni: p.opzione.durataCertaAnni,
        percReversibilita: p.opzione.percReversibilita,
        deltaEtaReversionario: p.opzione.tipologia === 'reversibile' ? p.etaReversionario - p.eta : null,
        frequenza: p.frequenza,
        montante: MONTANTE_RIFERIMENTO,
      });
      const t = (riga.set.tabelle ?? []).find((x) => x.id_tabella === r.idTabella) ?? riga.tabella;
      return motivoNonConfrontabile(t, p, r.etaAssicurativa) ? null : perMilleAnnuo(r);
    } catch {
      return null;
    }
  });
}

/** Tipologie offerte da un fondo, in parole: "Vitalizia, Certa 5 e 10 anni, Reversibile 60% e 100%". */
export function descriviTipologie(tabelle: TabellaRendita[]): string[] {
  const out: string[] = [];
  const has = (t: TipologiaRendita) => tabelle.some((x) => x.tipologia === t);
  if (has('vitalizia_immediata')) out.push('Vitalizia');
  const certe = Array.from(new Set(tabelle.filter((x) => x.tipologia === 'certa_poi_vitalizia')
    .map((x) => x.durata_certa_anni).filter((x): x is number => x != null && x <= 30))).sort((a, b) => a - b);
  if (certe.length) out.push(`Certa ${certe.join(' e ')} anni`);
  if (has('controassicurata')) out.push('Controassicurata');
  const rev = Array.from(new Set(tabelle.filter((x) => x.tipologia === 'reversibile')
    .map((x) => x.perc_reversibilita).filter((x): x is number => x != null))).sort((a, b) => a - b);
  if (has('reversibile')) out.push(rev.length ? `Reversibile ${rev.map((x) => `${x}%`).join(' e ')}` : 'Reversibile');
  if (has('ltc')) out.push('LTC');
  return out;
}

/**
 * Nome del fondo senza le parti comuni a tutti ("FONDO PENSIONE", "PIANO INDIVIDUALE PENSIONISTICO
 * DI TIPO ASSICURATIVO"): in una colonna stretta resta visibile la parte che lo distingue.
 */
export function nomeBreve(nome: string): string {
  const breve = nome.trim()
    .replace(/^PIANO INDIVIDUALE PENSIONISTICO DI TIPO ASSICURATIVO\s*[-–]\s*FONDO PENSIONE\s+/i, '')
    .replace(/^FONDO PENSIONE (APERTO |NEGOZIALE )?/i, '')
    .replace(/^(.+?)\s*[-–]?\s*PIANO INDIVIDUALE PENSIONISTICO DI TIPO.*$/i, '$1')
    .replace(/^(.+?)\s*[-–]?\s*FONDO PENSIONE APERTO\b.*$/i, '$1')
    .replace(/^(.+?)\s*[-–]\s*FONDO PENSIONE$/i, '$1')
    .replace(/^FONDO NAZIONALE PENSIONE COMPLEMENTARE.*\bCOMETA\b.*$/i, 'COMETA')
    .replace(/[\s.\-–]+$/, '');
  return breve || nome;
}
