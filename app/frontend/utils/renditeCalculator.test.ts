/**
 * Test del motore di calcolo, su dati reali estratti dai documenti.
 * Eseguire: tsc && node renditeCalculator.test.js
 */
import {
  calcolaRendita, requisitiInput, opzioniDisponibili, correzioneEta, setCorrente,
  RenditaNonCalcolabile,
} from './renditeCalculator';
import { RenditeExtractionResult, TabellaRendita } from '../types/rendite';

let passati = 0, falliti = 0;

function check(nome: string, atteso: unknown, ottenuto: unknown) {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto);
  if (ok) { passati++; console.log(`  ok   ${nome}`); }
  else { falliti++; console.log(`  FAIL ${nome}\n       atteso:   ${JSON.stringify(atteso)}\n       ottenuto: ${JSON.stringify(ottenuto)}`); }
}

function tab(p: Partial<TabellaRendita>): TabellaRendita {
  return {
    id_tabella: 'T', titolo_stampato: null, tipologia: 'vitalizia_immediata',
    durata_certa_anni: null, perc_reversibilita: null, eta_reversionario_ipotesi: null,
    sesso: 'U', base_demografica: 'A62I', tasso_tecnico: 1, variabile_riga: 'eta_assicurativa',
    scala_originale: 1, base_frazionamento: 'annuo_corretto', tipo_colonne: 'frequenza',
    colonne: ['annuale', 'semestrale', 'trimestrale', 'mensile'], righe: [],
    pagina_origine: null, qualita: 'ok', note: null, ...p,
  };
}

function doc(tabelle: TabellaRendita[], correzione: any[] = []): RenditeExtractionResult {
  return {
    id_fondo: '50', nome_fondo: 'TEST', file_origine: null, data_documento: null,
    file_pertinente: true, note_documento: null,
    nuove_prestazioni_2026: { rendita_durata_definita: null, prelievi_liberamente_determinabili: null, erogazione_frazionata: null },
    convenzioni: [{
      id_convenzione: 'C1', compagnia: 'X', data_scadenza: null, tacito_rinnovo: null, note: null,
      set: [{
        id_set: 'S1', base_demografica: 'A62I', valido_da: null, valido_a: null,
        condizioni_applicabilita: null, set_corrente: true,
        correzione_eta: correzione, costi: [], tabelle,
      }],
    }],
    autocontrolli: { progressione_eta: 'ok', ordine_tipologie: 'ok', decrescenza_rateazioni: 'ok', ordine_di_grandezza: 'ok', completezza: 'ok', dettaglio: null },
    warnings: [],
  };
}

// --- dati reali: EURORISPARMIO (albo 50), set A62I tasso 1%, scala 1 ---
const euroVitalizia = tab({
  id_tabella: '50-S1-T01',
  righe: [
    [50, 0.030219, 0.029958, 0.029784, 0.029475],
    [64, 0.042577, 0.042077, 0.041768, 0.041293],
    [65, 0.043925, 0.043394, 0.043068, 0.042574],
    [66, 0.045372, 0.044806, 0.044462, 0.043946],
    [80, 0.084903, 0.083014, 0.081978, 0.080768],
  ],
});

console.log('\n== calcolo base, dati EURORISPARMIO ==');
{
  const r = calcolaRendita(doc([euroVitalizia]), {
    etaPensionamento: 65, tipologia: 'vitalizia_immediata', frequenza: 'annuale', montante: 100000,
  });
  check('coefficiente per mille a 65 anni', 43.925, r.coefficientePerMille);
  check('rendita annua lorda su 100.000 euro', 4392.5, r.renditaAnnuaLorda);
  check('rata annuale = rendita annua', 4392.5, r.rataLorda);
  check('nessuna interpolazione', false, r.interpolato);
}

console.log('\n== frazionamento mensile (annuo_corretto) ==');
{
  const r = calcolaRendita(doc([euroVitalizia]), {
    etaPensionamento: 65, tipologia: 'vitalizia_immediata', frequenza: 'mensile', montante: 100000,
  });
  check('rendita annua da colonna mensile', 4257.4, r.renditaAnnuaLorda);
  check('rata mensile = annua / 12', 354.78, r.rataLorda);
  check('rate per anno', 12, r.rataPerAnno);
}

console.log('\n== frazionamento per_rata: il coefficiente e gia la rata ==');
{
  const perRata = tab({
    base_frazionamento: 'per_rata',
    colonne: ['annuale', 'mensile'],
    righe: [[65, 0.043925, 0.00366]],
  });
  const r = calcolaRendita(doc([perRata]), {
    etaPensionamento: 65, tipologia: 'vitalizia_immediata', frequenza: 'mensile', montante: 100000,
  });
  check('rata mensile letta direttamente', 366, r.rataLorda);
  check('rendita annua = rata x 12', 4392, r.renditaAnnuaLorda);
}

console.log('\n== correzione eta per anno di nascita ==');
{
  const correzione = [
    { sesso: 'U', anno_nascita_da: 1958, anno_nascita_a: 1966, delta_anni: 0 },
    { sesso: 'U', anno_nascita_da: 1967, anno_nascita_a: 1977, delta_anni: -1 },
  ];
  const d = doc([euroVitalizia], correzione);
  check('delta per nato nel 1970', -1, correzioneEta(setCorrente(d)!, 1970, 'U'));
  const r = calcolaRendita(d, {
    etaPensionamento: 66, annoNascita: 1970, tipologia: 'vitalizia_immediata',
    frequenza: 'annuale', montante: 100000,
  });
  check('eta assicurativa 66 - 1 = 65', 65, r.etaAssicurativa);
  check('usa il coefficiente di 65 anni, non di 66', 43.925, r.coefficientePerMille);
  check('avvertenza sulla correzione presente', true, r.avvertenze.some(a => a.includes('correzione')));
}

console.log('\n== interpolazione su tavola a passo 2 (dati UNICREDIT 5087, scala 10000) ==');
{
  const passo2 = tab({
    scala_originale: 10000, colonne: ['annuale'],
    righe: [[49, 325.52], [51, 331.21], [53, 337.4]],
  });
  const r = calcolaRendita(doc([passo2]), {
    etaPensionamento: 50, tipologia: 'vitalizia_immediata', frequenza: 'annuale', montante: 100000,
  });
  check('interpolato a meta fra 49 e 51', 32.8365, r.coefficientePerMille);
  check('marcato come interpolato', true, r.interpolato);
  check('avvertenza esplicita', true, r.avvertenze.some(a => a.includes('interpolazione')));
}

console.log('\n== eta fuori dal range pubblicato: nessuna estrapolazione ==');
{
  const r = calcolaRendita(doc([euroVitalizia]), {
    etaPensionamento: 85, tipologia: 'vitalizia_immediata', frequenza: 'annuale', montante: 100000,
  });
  check('usa il valore a 80 anni', 84.903, r.coefficientePerMille);
  check('non marcato come interpolato', false, r.interpolato);
  check('avvertenza sul limite', true, r.avvertenze.some(a => a.includes('fino a 80')));
}

console.log('\n== tavole per sesso (caso COMETA) ==');
{
  const m = tab({ id_tabella: 'M', sesso: 'M', tasso_tecnico: 0, colonne: ['annuale'], righe: [[65, 0.0458308]] });
  const f = tab({ id_tabella: 'F', sesso: 'F', tasso_tecnico: 0, colonne: ['annuale'], righe: [[65, 0.0392343]] });
  const d = doc([m, f]);
  check('richiede il sesso', true, requisitiInput(d).richiedeSesso);
  check('non richiede anno di nascita', false, requisitiInput(d).richiedeAnnoNascita);

  const ru = calcolaRendita(d, { etaPensionamento: 65, sesso: 'M', tipologia: 'vitalizia_immediata', frequenza: 'annuale', montante: 100000 });
  check('coefficiente maschile', 45.8308, ru.coefficientePerMille);
  const rf = calcolaRendita(d, { etaPensionamento: 65, sesso: 'F', tipologia: 'vitalizia_immediata', frequenza: 'annuale', montante: 100000 });
  check('coefficiente femminile', 39.2343, rf.coefficientePerMille);
  check('rendita femminile inferiore alla maschile', true, rf.renditaAnnuaLorda < ru.renditaAnnuaLorda);
}

console.log('\n== tassi tecnici multipli e tendina ==');
{
  const t0 = tab({ id_tabella: 'A', tasso_tecnico: 0, colonne: ['annuale'], righe: [[65, 0.0458]] });
  const t1 = tab({ id_tabella: 'B', tasso_tecnico: 1, colonne: ['annuale'], righe: [[65, 0.052]] });
  const c5 = tab({ id_tabella: 'C', tipologia: 'certa_poi_vitalizia', durata_certa_anni: 5, tasso_tecnico: 0, colonne: ['annuale'], righe: [[65, 0.0455]] });
  const d = doc([t0, t1, c5]);
  check('due tassi tecnici disponibili', [0, 1], requisitiInput(d).tassiTecnici);
  check('tre voci in tendina', 3, opzioniDisponibili(d).length);
  check('etichetta con tasso tecnico', 'Vitalizia immediata — tasso tecnico 0%', opzioniDisponibili(d)[0].etichetta);

  const r1 = calcolaRendita(d, { etaPensionamento: 65, tipologia: 'vitalizia_immediata', frequenza: 'annuale', tassoTecnico: 1, montante: 100000 });
  check('sceglie la tavola al tasso tecnico indicato', 52, r1.coefficientePerMille);
}

console.log('\n== matrice reversibile ==');
{
  const rev = tab({
    tipologia: 'reversibile', perc_reversibilita: 100, tipo_colonne: 'delta_eta_reversionario',
    colonne: ['-5', '0', '5'], righe: [[65, 0.034913, 0.037664, 0.040007]],
  });
  const r = calcolaRendita(doc([rev]), {
    etaPensionamento: 65, tipologia: 'reversibile', percReversibilita: 100,
    deltaEtaReversionario: 0, frequenza: 'annuale', montante: 100000,
  });
  check('legge la colonna del delta 0', 37.664, r.coefficientePerMille);

  const r2 = calcolaRendita(doc([rev]), {
    etaPensionamento: 65, tipologia: 'reversibile', percReversibilita: 100,
    deltaEtaReversionario: 3, frequenza: 'annuale', montante: 100000,
  });
  check('delta non tabulato: usa il piu vicino', 40.007, r2.coefficientePerMille);
  check('e lo dichiara', true, r2.avvertenze.some(a => a.includes('differenza di')));
}

console.log('\n== casi non calcolabili ==');
{
  const d = doc([euroVitalizia]);
  d.file_pertinente = false;
  try {
    calcolaRendita(d, { etaPensionamento: 65, tipologia: 'vitalizia_immediata', frequenza: 'annuale', montante: 100000 });
    check('fondo senza tavole solleva errore', true, false);
  } catch (e) {
    check('fondo senza tavole solleva errore', true, e instanceof RenditaNonCalcolabile);
  }
  try {
    calcolaRendita(doc([euroVitalizia]), { etaPensionamento: 65, tipologia: 'ltc', frequenza: 'annuale', montante: 100000 });
    check('tipologia assente solleva errore', true, false);
  } catch (e) {
    check('tipologia assente solleva errore', true, e instanceof RenditaNonCalcolabile);
  }
}

console.log(`\n${passati} test superati, ${falliti} falliti\n`);
if (falliti > 0) process.exit(1);
