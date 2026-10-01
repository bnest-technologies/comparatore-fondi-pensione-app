/**
 * Test del simulatore in euro reali.
 * Eseguire: npx tsx utils/simulatorCalc.test.ts
 */
import {
  calcolaMontante, calcolaSimulazione, inEuroNominali, sommaContributi, tassoReale, INFLAZIONE_ATTESA,
} from './simulatorCalc';

let passati = 0, falliti = 0;
const vicino = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
function check(nome: string, ok: boolean, dettaglio = '') {
  if (ok) { passati++; console.log(`  ok   ${nome}`); }
  else { falliti++; console.log(`  FAIL ${nome} ${dettaglio}`); }
}

console.log('\n== tasso reale ==');
check('inflazione al 2%', INFLAZIONE_ATTESA === 2);
check('2% nominale = 0% reale', vicino(tassoReale(2), 0, 1e-9));
check('5% nominale = 2,94% reale', vicino(tassoReale(5), 2.9412, 0.0001));

console.log('\n== montante in euro di oggi ==');
{
  // rendimento nominale 2% = 0% reale: il montante e solo la somma dei versamenti
  const s = calcolaMontante(1000, 500, 2, 3, 0);
  check('senza rendimento reale il montante e la somma versata', vicino(s[3], 1000 + 500 * 3, 1e-6), String(s[3]));
  const g = calcolaMontante(0, 1000, 2, 3, 1);
  check('versamenti crescenti dell\'1% reale', vicino(g[3], 1000 + 1010 + 1020.1, 1e-6), String(g[3]));
}

console.log('\n== somme e conversione nominale ==');
check('somma costante', sommaContributi(1000, 10, 0) === 10000);
check('somma crescente 0,5%', vicino(sommaContributi(1000, 2, 0.5), 2005, 1e-9));
check('100 euro di oggi fra 10 anni', vicino(inEuroNominali(100, 10), 121.90, 0.01));

console.log('\n== crescita del salario nella simulazione completa ==');
{
  const base = { montanteIniziale: 5000, contributoAnnuo: 2000, orizzonteAnni: 20, ral: 30000, annoPrimaAdesione: 2020, tassoRendimento: 5 };
  const zero = calcolaSimulazione({ ...base, crescitaSalario: 0 });
  const uno = calcolaSimulazione({ ...base, crescitaSalario: 1 });
  check('con crescita del salario il montante e piu alto', uno.montanteLordoConFiscale > zero.montanteLordoConFiscale);
  check('e anche il versato', uno.totaleVersato > zero.totaleVersato);
}

console.log(`\n${passati} test superati, ${falliti} falliti\n`);
if (falliti > 0) process.exit(1);
