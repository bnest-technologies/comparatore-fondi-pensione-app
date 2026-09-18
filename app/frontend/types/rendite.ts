/**
 * Tipi per l'estrazione dei coefficienti di conversione in rendita.
 *
 * Nota di modello: le rendite sono un attributo del FONDO (numero di albo COVIP),
 * non del comparto. A differenza dell'arricchimento da Nota Informativa, che produce
 * un record per ciascun comparto, qui si produce un record per documento/fondo.
 */

export type TipologiaRendita =
  | 'vitalizia_immediata'
  | 'certa_poi_vitalizia'
  | 'reversibile'
  | 'controassicurata'
  | 'ltc';

export type Sesso = 'M' | 'F' | 'U';

export type Frequenza =
  | 'annuale'
  | 'semestrale'
  | 'quadrimestrale'
  | 'trimestrale'
  | 'bimestrale'
  | 'mensile';

/** Cosa rappresentano le colonne della matrice. */
export type TipoColonne = 'frequenza' | 'delta_eta_reversionario';

/** Cosa rappresenta la prima cella di ogni riga. */
export type VariabileRiga = 'eta_assicurativa' | 'anni_trascorsi';

/** Le colonne dei coefficienti esprimono un valore annuo o la singola rata. */
export type BaseFrazionamento = 'annuo_corretto' | 'per_rata';

export type Qualita = 'ok' | 'da_verificare' | 'fallita';

export type EsitoControllo = 'ok' | 'anomalia' | 'non_applicabile';

export interface CorrezioneEta {
  sesso: Sesso;
  anno_nascita_da: number | null;
  anno_nascita_a: number | null;
  delta_anni: number | null;
}

export interface CostoRendita {
  tipo_costo:
    | 'caricamento_rata_rendita'
    | 'caricamento_premio'
    | 'caricamento_inserimento_convenzione'
    | 'costo_gestione_separata';
  valore_perc: number | null;
  /** valorizzata solo se il costo varia per rateazione */
  frequenza: Frequenza | null;
  note: string | null;
}

/**
 * Una tabella di coefficienti, in forma di matrice.
 *
 * `colonne` contiene sempre e solo rateazioni oppure differenze di eta del
 * reversionario: il sesso non e mai una colonna, e un attributo della tabella.
 * Se il PDF affianca le colonne Maschi e Femmine, si producono due tabelle.
 *
 * `righe` ha la forma [eta, v1, v2, ...] con i valori nell'ordine di `colonne`.
 * I valori sono GREZZI, come stampati: la conversione in per mille avviene a valle
 * usando `scala_originale`.
 */
export interface TabellaRendita {
  id_tabella: string;
  titolo_stampato: string | null;
  tipologia: TipologiaRendita;
  durata_certa_anni: number | null;
  perc_reversibilita: number | null;
  eta_reversionario_ipotesi: string | null;
  sesso: Sesso;
  base_demografica: string | null;
  tasso_tecnico: number | null;
  variabile_riga: VariabileRiga;
  /** 1, 100, 1000 o 10000: "rendita per N euro di premio" */
  scala_originale: number | null;
  base_frazionamento: BaseFrazionamento;
  tipo_colonne: TipoColonne;
  /** etichette come stringhe anche per i delta ("-5", "0", "5") */
  colonne: string[];
  righe: number[][];
  pagina_origine: number | null;
  qualita: Qualita;
  note: string | null;
}

export interface SetCoefficienti {
  id_set: string;
  base_demografica: string | null;
  valido_da: string | null;
  valido_a: string | null;
  /** frase letterale che delimita la platea a cui il set si applica */
  condizioni_applicabilita: string | null;
  /** true per il set applicabile a un nuovo aderente oggi */
  set_corrente: boolean | null;
  correzione_eta: CorrezioneEta[];
  costi: CostoRendita[];
  tabelle: TabellaRendita[];
}

export interface ConvenzioneRendita {
  id_convenzione: string;
  compagnia: string | null;
  data_scadenza: string | null;
  tacito_rinnovo: boolean | null;
  note: string | null;
  set: SetCoefficienti[];
}

export interface NuovePrestazioni2026 {
  rendita_durata_definita: boolean | null;
  prelievi_liberamente_determinabili: boolean | null;
  erogazione_frazionata: boolean | null;
}

export interface AutocontrolliRendite {
  progressione_eta: EsitoControllo;
  ordine_tipologie: EsitoControllo;
  decrescenza_rateazioni: EsitoControllo;
  ordine_di_grandezza: EsitoControllo;
  completezza: EsitoControllo;
  dettaglio: string | null;
}

export interface RenditeExtractionResult {
  /** numero di albo COVIP, senza zeri iniziali */
  id_fondo: string;
  nome_fondo: string | null;
  file_origine: string | null;
  data_documento: string | null;
  /** false se il PDF non e un documento sulle rendite o non riporta le tavole */
  file_pertinente: boolean;
  note_documento: string | null;
  nuove_prestazioni_2026: NuovePrestazioni2026;
  convenzioni: ConvenzioneRendita[];
  autocontrolli: AutocontrolliRendite;
  warnings: string[];
}

/** Riga del formato long, prodotta dal flattening lato applicazione. */
export interface CoefficienteLong {
  id_tabella: string;
  id_fondo: string;
  eta: number;
  frequenza: Frequenza;
  delta_eta_reversionario: number | null;
  coefficiente_originale: number;
  coefficiente_per_mille: number;
}

export interface ProblemaValidazione {
  id_fondo: string;
  livello: 'errore' | 'sospetto' | 'info';
  id_tabella?: string;
  messaggio: string;
}
