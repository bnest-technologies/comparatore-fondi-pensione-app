import React, { useMemo } from 'react';
import { ScrollReveal } from './animations/ScrollReveal';
import StatusBadge from './common/StatusBadge';
import type { DashboardSection } from '../features/dashboard/types';
import { pensionFundsData } from '../data/funds';
import { DATASET_METADATA } from '../config/datasetMetadata';
import { useCoperturaRendite } from '../lib/rendite';

interface HomePageProps {
  onNavigate: (section: DashboardSection) => void;
}

const Freccia = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
  </svg>
);

/** Il percorso di consulenza: stesso ordine del menu Strumenti, la simulazione per ultima. */
const PERCORSO: {
  id: DashboardSection;
  titolo: string;
  testo: string;
  azione: string;
  premium?: boolean;
  icona: string;
}[] = [
  {
    id: 'select-fund',
    titolo: 'Seleziona il fondo',
    testo: 'Trova il fondo del cliente per tipo, classificazione COVIP o società e apri subito la sua scheda: rendimenti, costi, portafoglio, rating e rendite.',
    azione: 'Apri una scheda',
    icona: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
  },
  {
    id: 'choose-fund',
    titolo: 'Confronta le alternative',
    testo: 'Filtra il mercato, costruisci una shortlist e metti a confronto rendimenti, ISC e caratteristiche dei comparti.',
    azione: 'Confronta i fondi',
    icona: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  },
  {
    id: 'ranking',
    titolo: 'Leggi il ranking',
    testo: 'Classifiche per rendimento e costi e rating proprietario a stelline, costruito su rendimenti netti e ISC.',
    azione: 'Vedi le classifiche',
    icona: 'M8 21V10m4 11V3m4 18v-7M4 21h16',
  },
  {
    id: 'rendite',
    titolo: 'Valuta le rendite',
    testo: 'Cosa offre ogni fondo in rendita e a quali condizioni: coefficienti ufficiali, tasso tecnico, basi demografiche e costi, confrontati a parità di cliente.',
    azione: 'Confronta le rendite',
    premium: true,
    icona: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 10v2m9-6a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    id: 'simulator',
    titolo: 'Stima per il cliente',
    testo: 'Una stima rapida di capitale, risparmio fiscale, netto alla pensione e rendita, con il rendimento storico del fondo scelto.',
    azione: 'Avvia la stima',
    icona: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
];

const NOVITA: { titolo: string; testo: string; id: DashboardSection }[] = [
  { titolo: 'Sezione Rendite', testo: 'Coefficienti di trasformazione ufficiali, ordinati a parità di età, sesso, rateazione e tasso tecnico, con tabella comparata per età.', id: 'rendite' },
  { titolo: 'Rendite nella scheda del fondo', testo: 'Convenzione e scadenza, basi demografiche, caricamenti, gestione separata e coefficienti uomo/donna per ogni tipo di rendita.', id: 'select-fund' },
  { titolo: 'Seleziona Fondo', testo: 'Dal fondo alla sua scheda in un clic, senza passare dal confronto.', id: 'select-fund' },
  { titolo: `Dati COVIP ${DATASET_METADATA.performanceReferenceYear}`, testo: `Rendimenti a fine ${DATASET_METADATA.performanceReferenceYear} e costi ISC ${DATASET_METADATA.releaseYear}; rating a stelline ricalcolato.`, id: 'ranking' },
];

const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const fondiRendite = useCoperturaRendite();
  const { fondi, comparti } = useMemo(() => ({
    fondi: new Set(pensionFundsData.map((f) => `${f.type}|${f.nAlbo}`)).size,
    comparti: pensionFundsData.length,
  }), []);

  const numeri = [
    { valore: String(fondi), etichetta: 'Fondi pensione' },
    { valore: String(comparti), etichetta: 'Comparti analizzati' },
    { valore: fondiRendite != null ? String(fondiRendite) : '—', etichetta: 'Fondi con coefficienti di rendita' },
    { valore: String(DATASET_METADATA.performanceReferenceYear), etichetta: 'Rendimenti COVIP aggiornati a fine anno' },
  ];

  return (
    <div className="min-h-screen">
      {/* Apertura: niente animazioni, i pulsanti rispondono subito */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <div className="absolute inset-0 pointer-events-none bg-grid-slate-100 dark:bg-grid-slate-700/25 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:[mask-image:linear-gradient(0deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-700 dark:text-blue-300 text-sm font-medium mb-6 border border-blue-200 dark:border-blue-800">
              Toolkit per la consulenza previdenziale
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-white mb-6 leading-tight">
              Confronta, valuta, simula
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 dark:from-blue-400 dark:via-cyan-400 dark:to-blue-500">
                i fondi pensione per il consulente
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 mb-10 max-w-3xl mx-auto leading-relaxed">
              {fondi} fondi pensione e {comparti} comparti con dati ufficiali COVIP: schede, confronti, ranking e condizioni di rendita
              {fondiRendite != null ? <> di {fondiRendite} fondi</> : null}, pronti da discutere con il cliente.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => onNavigate('select-fund')}
                className="w-full sm:w-auto px-6 py-3 text-lg font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/30 dark:shadow-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                Seleziona un fondo
                <Freccia />
              </button>
              <button
                onClick={() => onNavigate('choose-fund')}
                className="w-full sm:w-auto px-6 py-3 text-lg font-semibold rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                Confronta i fondi
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Il percorso di consulenza */}
      <section className="py-16 lg:py-24 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">Il percorso di consulenza</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              Cinque strumenti, nell'ordine in cui si usano: si parte dal fondo, la simulazione è l'ultimo passo.
            </p>
          </div>
          <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {PERCORSO.map((p, i) => (
              <li key={p.id}>
                <button
                  onClick={() => onNavigate(p.id)}
                  className="group relative flex h-full w-full flex-col rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all duration-300 hover:border-blue-300 hover:shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-700"
                >
                  {p.premium && (
                    <span className="absolute right-4 top-4 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                      Full Access
                    </span>
                  )}
                  <span className="mb-4 flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgb(var(--brand-primary-rgb)/1)] text-white shadow-md">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d={p.icona} />
                      </svg>
                    </span>
                    <span className="text-sm font-bold tabular-nums text-slate-400 dark:text-slate-500">{i + 1}</span>
                  </span>
                  <h3 className="mb-2 text-lg font-bold text-slate-900 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                    {p.titolo}
                  </h3>
                  <p className="mb-4 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{p.testo}</p>
                  <span className="flex items-center gap-2 text-sm font-semibold text-blue-600 transition-all group-hover:gap-3 dark:text-blue-400">
                    {p.azione}
                    <Freccia />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Novita */}
      <section className="py-16 lg:py-20 bg-slate-50 dark:bg-slate-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal variant="fadeIn" delay={0.05}>
            <div className="mb-10 flex flex-wrap items-center gap-3">
              <h2 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">Le novità</h2>
              <StatusBadge variant="new">Aggiornato</StatusBadge>
            </div>
          </ScrollReveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {NOVITA.map((n) => (
              <button
                key={n.titolo}
                onClick={() => onNavigate(n.id)}
                className="flex h-full flex-col items-start justify-start rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-700"
              >
                <h3 className="mb-1.5 text-base font-semibold text-slate-900 dark:text-white">{n.titolo}</h3>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{n.testo}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Numeri: letti dai dati, non scritti a mano */}
      <section className="py-14 bg-gradient-to-br from-blue-600 to-cyan-600 dark:from-blue-900 dark:to-cyan-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {numeri.map((n) => (
              <div key={n.etichetta} className="text-center">
                <div className="text-4xl lg:text-5xl font-bold tabular-nums text-white mb-2">{n.valore}</div>
                <div className="text-blue-100 font-medium">{n.etichetta}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Risorse */}
      <section className="py-16 lg:py-20 bg-white dark:bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-center text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">Per approfondire</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <button
              onClick={() => onNavigate('playbook')}
              className="group rounded-2xl border border-slate-200 bg-white p-6 text-left transition hover:border-blue-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800"
            >
              <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">Guida alla previdenza complementare</h3>
              <p className="mb-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">Fondi pensione, TFR e fiscalità spiegati in modo chiaro, da usare anche con il cliente.</p>
              <span className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400">Apri la guida <Freccia /></span>
            </button>
            <button
              onClick={() => onNavigate('tfr-faq')}
              className="group rounded-2xl border border-slate-200 bg-white p-6 text-left transition hover:border-blue-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800"
            >
              <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">FAQ su TFR e rendite</h3>
              <p className="mb-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">Le risposte alle domande più frequenti su TFR, tipi di rendita, tassazione e documenti dei fondi.</p>
              <span className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400">Vedi le FAQ <Freccia /></span>
            </button>
          </div>
        </div>
      </section>

      {/* Chiusura */}
      <section className="py-16 bg-slate-50 dark:bg-slate-800/40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white mb-4">Parti dal fondo del cliente</h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-8">
            Apri la sua scheda, confrontalo con le alternative e verifica le condizioni di rendita prima della simulazione.
          </p>
          <button
            onClick={() => onNavigate('select-fund')}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 text-lg font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Seleziona un fondo
            <Freccia />
          </button>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
