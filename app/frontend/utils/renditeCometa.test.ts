/**
 * Prova del 9 su COMETA: le rate calcolate dall'app, sui dati reali del database,
 * contro i coefficienti ufficiali del fondo.
 *  - eta 50-70: motore rendite Assofondipensione/Mefop pubblicato su cometafondo.it
 *    (Motori di simulazione > Scegli la tipologia di rendita), interrogato il 01/10/2026;
 *  - eta 71-80: Allegato I - integrazione 12_2022 della convenzione Generali 78932,
 *    tavole stampate nel PDF del fondo.
 * Eseguire: npx tsx utils/renditeCometa.test.ts
 */
import { readFileSync } from 'fs';
import { calcolaRendita, RATE_PER_ANNO, type ParametriRendita } from './renditeCalculator';
import type { RenditeExtractionResult } from '../types/rendite';

let passati = 0, falliti = 0;
function check(nome: string, atteso: unknown, ottenuto: unknown) {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto);
  if (ok) { passati++; console.log(`  ok   ${nome}`); }
  else { falliti++; console.log(`  FAIL ${nome}\n       atteso:   ${JSON.stringify(atteso)}\n       ottenuto: ${JSON.stringify(ottenuto)}`); }
}

const db = JSON.parse(readFileSync(new URL('../../backend/data/rendite_database.json', import.meta.url), 'utf-8'));
const cometa: RenditeExtractionResult = db.fondi['61'];

interface Caso {
  nome: string;
  fonte: 'motore COMETA' | 'Allegato I 12_2022';
  /** coefficiente annuo per 1 euro di capitale, come pubblicato */
  coefficiente: number;
  p: Omit<ParametriRendita, 'idSet'>;
}

const CASI: Caso[] = [
  { nome: 'uomo 67, vitalizia, tasso 0%, mensile, 100.000 €', fonte: 'motore COMETA', coefficiente: 0.0486649,
    p: { etaPensionamento: 67, sesso: 'M', tipologia: 'vitalizia_immediata', frequenza: 'mensile', tassoTecnico: 0, montante: 100000 } },
  { nome: 'donna 67, vitalizia, tasso 0%, mensile, 100.000 €', fonte: 'motore COMETA', coefficiente: 0.0414771,
    p: { etaPensionamento: 67, sesso: 'F', tipologia: 'vitalizia_immediata', frequenza: 'mensile', tassoTecnico: 0, montante: 100000 } },
  { nome: 'uomo 67, vitalizia, tasso 1%, mensile, 100.000 €', fonte: 'motore COMETA', coefficiente: 0.0546427,
    p: { etaPensionamento: 67, sesso: 'M', tipologia: 'vitalizia_immediata', frequenza: 'mensile', tassoTecnico: 1, montante: 100000 } },
  { nome: 'uomo 65, certa 10 anni, tasso 1%, trimestrale, 200.000 €', fonte: 'motore COMETA', coefficiente: 0.049898,
    p: { etaPensionamento: 65, sesso: 'M', tipologia: 'certa_poi_vitalizia', durataCertaAnni: 10, frequenza: 'trimestrale', tassoTecnico: 1, montante: 200000 } },
  { nome: 'donna 70, con restituzione del capitale, tasso 1%, mensile, 150.000 €', fonte: 'motore COMETA', coefficiente: 0.0421228,
    p: { etaPensionamento: 70, sesso: 'F', tipologia: 'controassicurata', frequenza: 'mensile', tassoTecnico: 1, montante: 150000 } },
  { nome: 'uomo 62, maggiorazione LTC, tasso 0%, annuale, 80.000 €', fonte: 'motore COMETA', coefficiente: 0.0398505,
    p: { etaPensionamento: 62, sesso: 'M', tipologia: 'ltc', frequenza: 'annuale', tassoTecnico: 0, montante: 80000 } },
  { nome: 'uomo 67, reversibile 60% su donna di 62, tasso 0%, mensile, 100.000 €', fonte: 'motore COMETA', coefficiente: 0.0375913,
    p: { etaPensionamento: 67, sesso: 'M', tipologia: 'reversibile', percReversibilita: 60, frequenza: 'mensile', tassoTecnico: 0, montante: 100000 } },
  { nome: 'uomo 75, vitalizia, tasso 0%, mensile, 100.000 €', fonte: 'Allegato I 12_2022', coefficiente: 0.0707549,
    p: { etaPensionamento: 75, sesso: 'M', tipologia: 'vitalizia_immediata', frequenza: 'mensile', tassoTecnico: 0, montante: 100000 } },
  { nome: 'donna 80, reversibile 100%, tasso 0%, annuale, 100.000 €', fonte: 'Allegato I 12_2022', coefficiente: 0.0729081,
    p: { etaPensionamento: 80, sesso: 'F', tipologia: 'reversibile', percReversibilita: 100, frequenza: 'annuale', tassoTecnico: 0, montante: 100000 } },
];

const centesimi = (v: number) => Math.round(v * 100) / 100;

console.log('\nRate COMETA: app contro coefficienti ufficiali');
for (const c of CASI) {
  const r = calcolaRendita(cometa, { ...c.p, idSet: c.p.tassoTecnico === 1 ? 'set_tasso_1' : 'set_tasso_0' });
  const rataUfficiale = centesimi((c.coefficiente * c.p.montante) / RATE_PER_ANNO[c.p.frequenza]);
  // tolleranza di 1 centesimo: il fondo arrotonda la rata, noi la rendita annua
  const scarto = Math.abs(centesimi(r.rataLorda) - rataUfficiale);
  check(`${c.nome}: rata ${rataUfficiale.toFixed(2)} € (${c.fonte})`, true, scarto <= 0.01);
  check(`${c.nome}: nessuna avvertenza`, [], r.avvertenze);
}

console.log('\nNessuna tabella COMETA resta da verificare');
const daVerificare = cometa.convenzioni.flatMap((cv) => cv.set.flatMap((s) => s.tabelle))
  .filter((t) => t.qualita !== 'ok').map((t) => t.id_tabella);
check('tutte le tabelle COMETA con qualita ok', [], daVerificare);

console.log(`\n${passati} test superati, ${falliti} falliti\n`);
if (falliti > 0) process.exit(1);
