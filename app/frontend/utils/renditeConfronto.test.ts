/**
 * Test del confronto delle rendite fra fondi.
 * Eseguire: npx tsx utils/renditeConfronto.test.ts
 */
import { confrontaRendite, OPZIONI_CONFRONTO, serieCoefficienti, type ParametriConfronto } from './renditeConfronto';
import type { RenditeExtractionResult, SetCoefficienti, TabellaRendita } from '../types/rendite';

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
    sesso: 'U', base_demografica: 'A62I', tasso_tecnico: 0, variabile_riga: 'eta_assicurativa',
    scala_originale: 1, base_frazionamento: 'annuo_corretto', tipo_colonne: 'frequenza',
    colonne: ['annuale', 'mensile'], righe: [[65, 0.05, 0.049], [67, 0.054, 0.053], [70, 0.06, 0.059]],
    pagina_origine: null, qualita: 'ok', note: null, ...p,
  };
}
function set(id: string, tabelle: TabellaRendita[], corrente: boolean | null = true): SetCoefficienti {
  return {
    id_set: id, base_demografica: null, valido_da: null, valido_a: null, condizioni_applicabilita: null,
    set_corrente: corrente, correzione_eta: [], costi: [{ tipo_costo: 'caricamento_rata_rendita', valore_perc: 1.25, frequenza: null, note: null }],
    tabelle,
  };
}
function fondo(sets: SetCoefficienti[]): RenditeExtractionResult {
  return {
    id_fondo: 'X', nome_fondo: 'X', file_origine: null, data_documento: null, file_pertinente: true, note_documento: null,
    nuove_prestazioni_2026: { rendita_durata_definita: null, prelievi_liberamente_determinabili: null, erogazione_frazionata: null },
    convenzioni: [{ id_convenzione: 'C', compagnia: 'Compagnia', data_scadenza: null, tacito_rinnovo: null, note: null, set: sets }],
    autocontrolli: { progressione_eta: 'ok', ordine_tipologie: 'ok', decrescenza_rateazioni: 'ok', ordine_di_grandezza: 'ok', completezza: 'ok', dettaglio: null },
    warnings: [],
  };
}
const base: ParametriConfronto = {
  opzione: OPZIONI_CONFRONTO[0], eta: 67, annoNascita: 1959, sesso: 'M', frequenza: 'mensile',
  etaReversionario: 64, tasso: 'tutti', includiStorici: false,
};

console.log('\n== ordine e misura del confronto ==');
{
  const fondi = {
    A: fondo([set('A1', [tab({ id_tabella: 'a' })])]),                                              // 53‰ mensile
    // coefficiente per singola rata mensile: 0,0045 x 12 = 54‰ l'anno, quindi PRIMA di A
    B: fondo([set('B1', [tab({ id_tabella: 'b', base_frazionamento: 'per_rata', righe: [[67, 0.056, 0.0045]] })])]),
    C: fondo([set('C1', [tab({ id_tabella: 'c', colonne: ['annuale'], righe: [[67, 0.07]] })])]),   // niente rata mensile
  };
  const e = confrontaRendite(fondi, base);
  check('ordine per rendita annua, non per coefficiente stampato', ['B', 'A'], e.confrontabili.map((r) => r.albo));
  check('rendita annua per mille della rata per singola rata', 54, e.confrontabili[0].perMilleAnnuo);
  check('fondo senza la rata scelta: fuori classifica', ['C'], e.nonConfrontabili.map((r) => r.albo));
  check('e dice perche', true, /rata mensile/.test(e.nonConfrontabili[0].nonConfrontabile ?? ''));
}

console.log('\n== tariffe e tassi tecnici ==');
{
  const due = fondo([set('T0', [tab({ id_tabella: 'x0', tasso_tecnico: 0 })], null), set('T25', [tab({ id_tabella: 'x25', tasso_tecnico: 2.5, righe: [[67, 0.07, 0.069]] })], null)]);
  const e = confrontaRendite({ K: due }, base);
  check('senza tariffa in vigore: una riga per tariffa', 2, e.confrontabili.length);
  check('e dichiara che il fondo ha piu tariffe', [true, true], e.confrontabili.map((r) => r.piuTariffe));
  check('filtro sul tasso tecnico', ['T0'], confrontaRendite({ K: due }, { ...base, tasso: 0 }).confrontabili.map((r) => r.set.id_set));

  const storico = fondo([set('NUOVO', [tab({ id_tabella: 'n' })], true), set('VECCHIO', [tab({ id_tabella: 'v', tasso_tecnico: 2 })], false)]);
  check('di default solo la tariffa in vigore', ['NUOVO'], confrontaRendite({ S: storico }, base).confrontabili.map((r) => r.set.id_set));
  const conStorici = confrontaRendite({ S: storico }, { ...base, includiStorici: true }).confrontabili;
  check('a richiesta anche quella per adesioni passate, segnata', [false, true],
    ['NUOVO', 'VECCHIO'].map((id) => conStorici.find((r) => r.set.id_set === id)!.tariffaStorica));

  // la tariffa in vigore non ha la reversibile: quella vecchia si, ma non va presentata come attuale
  const soloVecchia = fondo([set('NUOVO', [], true), set('VECCHIO', [tab({ id_tabella: 'r', tipologia: 'reversibile', perc_reversibilita: 100 })], false)]);
  const rev = { ...base, opzione: OPZIONI_CONFRONTO.find((o) => o.chiave === 'rev100')! };
  check('tipologia solo nella tariffa passata: esclusa di default', 0, confrontaRendite({ R: soloVecchia }, rev).confrontabili.length);
}

console.log('\n== vitalizia solo con maggiorazione LTC (FONCHIM) ==');
{
  const e = confrontaRendite({ L: fondo([set('S', [tab({ id_tabella: 'l', tipologia: 'ltc' })])]) }, base);
  check('il fondo entra nel confronto della vitalizia', 1, e.confrontabili.length);
  check('con la tavola LTC', 'ltc', e.confrontabili[0].tabella.tipologia);
}

console.log('\n== tabella comparata per eta ==');
{
  const e = confrontaRendite({ A: fondo([set('A1', [tab({ id_tabella: 'a' })])]) }, base);
  const serie = serieCoefficienti(e.confrontabili[0], base, [60, 65, 67, 70, 75]);
  check('valori solo dove il fondo li pubblica (niente estrapolazione)', [null, 49, 53, 59, null], serie);
}

console.log(`\n${passati} test superati, ${falliti} falliti\n`);
if (falliti > 0) process.exit(1);
