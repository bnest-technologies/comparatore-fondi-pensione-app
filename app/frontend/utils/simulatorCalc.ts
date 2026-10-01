/**
 * Simulator Calculations - Pure functions for pension fund simulation
 * All calculations happen client-side, no data is sent to any server.
 */

import type { PensionFund } from '../types';

// Constants from D.Lgs. 252/2005
export const MAX_CONTRIBUTO_DEDUCIBILE = 5300;

// IRPEF tax brackets for 2025
export const SCAGLIONI_IRPEF = [
  { min: 0, max: 28000, aliquota: 0.23 },
  { min: 28000.01, max: 50000, aliquota: 0.35 },
  { min: 50000.01, max: Infinity, aliquota: 0.43 },
] as const;

// TFR revaluation rates (based on ISTAT FOI: 1.5% + 75% of inflation)
export const TFR_RATES = {
  ultimoAnno: 9.97,
  ultimi3Anni: 6.69,
  ultimi5Anni: 4.54,
  ultimi10Anni: 2.91,
  ultimi20Anni: 3.10,
} as const;

/**
 * Get the best available return rate from a pension fund.
 * Priority: 10 years > 20 years (proxy for 15y) > 5 years > 3 years > 1 year
 * Returns both the rate and the label describing which horizon was used.
 */
export function getRendimentoProxy(fund: PensionFund): number | null {
  const info = getRendimentoProxyWithLabel(fund);
  return info ? info.rate : null;
}

export interface RendimentoProxyInfo {
  rate: number;
  label: string; // e.g. "10 anni", "20 anni", "5 anni"
  years: 1 | 3 | 5 | 10 | 20;
}

export function getRendimentoProxyWithLabel(fund: PensionFund): RendimentoProxyInfo | null {
  const { rendimenti } = fund;
  
  if (rendimenti.ultimi10Anni !== null) return { rate: rendimenti.ultimi10Anni, label: '10 anni', years: 10 };
  if (rendimenti.ultimi20Anni !== null) return { rate: rendimenti.ultimi20Anni, label: '20 anni', years: 20 };
  if (rendimenti.ultimi5Anni !== null) return { rate: rendimenti.ultimi5Anni, label: '5 anni', years: 5 };
  if (rendimenti.ultimi3Anni !== null) return { rate: rendimenti.ultimi3Anni, label: '3 anni', years: 3 };
  if (rendimenti.ultimoAnno !== null) return { rate: rendimenti.ultimoAnno, label: '1 anno', years: 1 };
  
  return null;
}

/**
 * Calculate the marginal IRPEF tax rate based on annual gross income (RAL)
 */
export function getAliquotaMarginaleIRPEF(ral: number): number {
  for (const scaglione of SCAGLIONI_IRPEF) {
    if (ral >= scaglione.min && ral <= scaglione.max) {
      return scaglione.aliquota;
    }
  }
  return SCAGLIONI_IRPEF[SCAGLIONI_IRPEF.length - 1].aliquota;
}

/**
 * Calculate annual tax savings from deductible pension contributions
 */
export function calcolaRisparmioFiscaleAnnuo(
  contributoAnnuo: number,
  ral: number
): { risparmioAnnuo: number; aliquotaMarginale: number } {
  const contributoDeducibile = Math.min(contributoAnnuo, MAX_CONTRIBUTO_DEDUCIBILE);
  const aliquotaMarginale = getAliquotaMarginaleIRPEF(ral);
  const risparmioAnnuo = contributoDeducibile * aliquotaMarginale;

  return { risparmioAnnuo, aliquotaMarginale };
}

/**
 * Calculate the substitute tax rate on pension fund withdrawals
 * Starts at 15% and decreases by 0.30% per year after the 15th year, minimum 9%
 */
export function calcolaAliquotaSostitutiva(
  annoPrimaAdesione: number,
  annoCorrente: number,
  orizzonteAnni: number
): { aliquota: number; anniPartecipazione: number } {
  const anniPartecipazione = annoCorrente + orizzonteAnni - annoPrimaAdesione;
  
  if (anniPartecipazione <= 15) {
    return { aliquota: 0.15, anniPartecipazione };
  }
  
  const anniOltre15 = anniPartecipazione - 15;
  const riduzione = anniOltre15 * 0.003; // 0.30% per year
  const aliquota = Math.max(0.09, 0.15 - riduzione);
  
  return { aliquota, anniPartecipazione };
}

/**
 * Inflazione attesa, come nelle istruzioni COVIP sulle proiezioni (Sezione V): 2% annuo.
 * Tutto il simulatore ragiona in EURO DI OGGI (termini reali): i rendimenti storici, che sono
 * nominali, vengono ridotti dell'inflazione; i versamenti crescono solo con il salario reale.
 */
export const INFLAZIONE_ATTESA = 2;

/** Crescita reale del salario selezionabile. 0% = il salario segue solo l'inflazione. */
export const CRESCITE_SALARIO_REALI = [0, 0.5, 1] as const;
export const CRESCITA_SALARIO_PREDEFINITA = 0.5;

/** Tasso reale da un tasso nominale: (1 + nominale) / (1 + inflazione) - 1, in percentuale. */
export function tassoReale(nominale: number, inflazione: number = INFLAZIONE_ATTESA): number {
  return ((1 + nominale / 100) / (1 + inflazione / 100) - 1) * 100;
}

/** Somma dei versamenti di `anni` anni che crescono del `crescita`% reale all'anno (il primo e `annuo`). */
export function sommaContributi(annuo: number, anni: number, crescita: number = 0): number {
  if (anni <= 0) return 0;
  const g = crescita / 100;
  return g === 0 ? annuo * anni : annuo * ((1 + g) ** anni - 1) / g;
}

/** Valore nominale (euro di quell'anno) di un importo espresso in euro di oggi. */
export function inEuroNominali(valoreReale: number, anni: number, inflazione: number = INFLAZIONE_ATTESA): number {
  return valoreReale * (1 + inflazione / 100) ** anni;
}

/**
 * Montante anno per anno, in euro di oggi.
 * `tassoRendimento` e il rendimento storico NOMINALE del fondo: qui viene reso reale.
 * Il versamento dell'anno t cresce del `crescitaSalario`% reale rispetto all'anno prima
 * (contributi e TFR sono legati alla retribuzione).
 */
export function calcolaMontante(
  montanteIniziale: number,
  contributoAnnuo: number,
  tassoRendimento: number, // nominale, es. 5.5 per 5,5%
  anniOrizzonte: number,
  crescitaSalario: number = 0, // reale, es. 0.5 per 0,5%
): number[] {
  const tasso = tassoReale(tassoRendimento) / 100;
  const g = crescitaSalario / 100;
  const serie: number[] = new Array(anniOrizzonte + 1);

  // Anno 0: capitale iniziale con il rendimento del primo anno
  serie[0] = montanteIniziale * (1 + tasso);

  // Anni successivi: capitale dell'anno prima + versamento dell'anno, entrambi rivalutati
  for (let t = 1; t <= anniOrizzonte; t++) {
    serie[t] = (serie[t - 1] + contributoAnnuo * (1 + g) ** (t - 1)) * (1 + tasso);
  }

  return serie;
}

/**
 * TFR lasciato in azienda, per confronto: rivalutazione media degli ultimi 10 anni,
 * resa reale come il resto della simulazione.
 */
export function calcolaMontanteTFR(
  montanteIniziale: number,
  contributoAnnuo: number,
  anniOrizzonte: number,
  crescitaSalario: number = 0,
): number[] {
  return calcolaMontante(montanteIniziale, contributoAnnuo, TFR_RATES.ultimi10Anni, anniOrizzonte, crescitaSalario);
}

export interface SimulatorInput {
  montanteIniziale: number;
  contributoAnnuo: number;
  orizzonteAnni: number;
  ral: number;
  annoPrimaAdesione: number;
  tassoRendimento: number; // From selected fund(s)
  /** crescita reale del salario, in % */
  crescitaSalario?: number;
}

export interface MontanteSeriesPoint {
  anno: number;
  montanteSenzaFiscale: number;
  montanteConFiscale: number;
  montanteTFR: number;
}

export interface SimulatorResult {
  series: MontanteSeriesPoint[];
  totaleVersato: number;
  montanteLordoSenzaFiscale: number;
  montanteLordoConFiscale: number;
  rendimentoTotale: number;
  risparmioFiscaleAnnuo: number;
  risparmioFiscaleTotale: number;
  aliquotaMarginaleIRPEF: number;
  anniPartecipazione: number;
  aliquotaSostitutiva: number;
  impostaSostitutiva: number;
  montanteNetto: number;
  rendimentoNettoPercentuale: number;
}

/**
 * Main calculation function - computes full simulation results
 */
export function calcolaSimulazione(input: SimulatorInput): SimulatorResult {
  const {
    montanteIniziale,
    contributoAnnuo,
    orizzonteAnni,
    ral,
    annoPrimaAdesione,
    tassoRendimento,
    crescitaSalario = 0,
  } = input;

  // Step 1: Calculate capital accumulation without tax benefits
  const serieSenzaFiscale = calcolaMontante(
    montanteIniziale,
    contributoAnnuo,
    tassoRendimento,
    orizzonteAnni,
    crescitaSalario
  );

  // Step 2: Calculate tax savings
  const { risparmioAnnuo, aliquotaMarginale } = calcolaRisparmioFiscaleAnnuo(
    contributoAnnuo,
    ral
  );
  const risparmioTotale = sommaContributi(risparmioAnnuo, orizzonteAnni, crescitaSalario);

  // Step 2b: Calculate capital accumulation with reinvested tax savings
  const contributoEffettivo = contributoAnnuo + risparmioAnnuo;
  const serieConFiscale = calcolaMontante(
    montanteIniziale,
    contributoEffettivo,
    tassoRendimento,
    orizzonteAnni,
    crescitaSalario
  );

  // TFR benchmark
  const serieTFR = calcolaMontanteTFR(
    montanteIniziale,
    contributoAnnuo,
    orizzonteAnni,
    crescitaSalario
  );

  // Combine into time series
  const series: MontanteSeriesPoint[] = [];
  for (let anno = 0; anno <= orizzonteAnni; anno++) {
    series.push({
      anno,
      montanteSenzaFiscale: serieSenzaFiscale[anno],
      montanteConFiscale: serieConFiscale[anno],
      montanteTFR: serieTFR[anno],
    });
  }

  // Step 3: Calculate substitute tax at retirement
  const annoCorrente = new Date().getFullYear();
  const { aliquota: aliquotaSostitutiva, anniPartecipazione } = calcolaAliquotaSostitutiva(
    annoPrimaAdesione,
    annoCorrente,
    orizzonteAnni
  );

  const montanteLordoSenzaFiscale = serieSenzaFiscale[orizzonteAnni];
  const montanteLordoConFiscale = serieConFiscale[orizzonteAnni];
  const impostaSostitutiva = montanteLordoConFiscale * aliquotaSostitutiva;
  const montanteNetto = montanteLordoConFiscale - impostaSostitutiva;

  // Calculate total invested and net return
  const totaleVersato = montanteIniziale + sommaContributi(contributoAnnuo, orizzonteAnni, crescitaSalario);
  const rendimentoTotale = montanteNetto - totaleVersato;
  const rendimentoNettoPercentuale = (montanteNetto / totaleVersato - 1) * 100;

  return {
    series,
    totaleVersato,
    montanteLordoSenzaFiscale,
    montanteLordoConFiscale,
    rendimentoTotale,
    risparmioFiscaleAnnuo: risparmioAnnuo,
    risparmioFiscaleTotale: risparmioTotale,
    aliquotaMarginaleIRPEF: aliquotaMarginale,
    anniPartecipazione,
    aliquotaSostitutiva,
    impostaSostitutiva,
    montanteNetto,
    rendimentoNettoPercentuale,
  };
}

export function calcolaTfrAnnuoDaRal(ral: number): number {
  if (!Number.isFinite(ral) || ral <= 0) {
    return 0;
  }

  return (ral / 13.5) * (1 - 0.005);
}

/**
 * Format currency value for display
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatIntegerInputIT(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function parseIntegerInputIT(raw: string): number {
  const normalized = raw.replace(/[^\d-]/g, '');
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
}

/**
 * Format percentage value for display
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}
