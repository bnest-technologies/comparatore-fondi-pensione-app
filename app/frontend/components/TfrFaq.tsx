import React, { useMemo } from 'react';
import { ScrollReveal } from './animations/ScrollReveal';
import { RENDITE_FAQ } from '../data/rendite_faq';

// Il testo delle FAQ sul TFR non e versionato (vedi .gitignore): si carica se presente.
// Con l'import diretto la sua assenza bloccava la build dell'intero sito; cosi, se manca,
// la pagina lo segnala e le FAQ sulle rendite restano visibili.
const moduliFaqTfr = (import.meta as any).glob('../data/tfr_faq.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const faqText: string = Object.values(moduliFaqTfr)[0] ?? '';

type ParsedFaq = {
  question: string;
  answer: string;
};

const parseFaqEntries = (raw: string): ParsedFaq[] => {
  const startIndex = raw.indexOf('Domande frequenti (FAQ)');
  if (startIndex === -1) {
    return [];
  }

  const faqSection = raw.slice(startIndex);
  const entries = faqSection.split('❓').slice(1);

  return entries
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const lines = entry.split('\n');
      const firstLine = lines.shift()?.trim() ?? '';
      const questionMarkIndex = firstLine.indexOf('?');

      const question =
        questionMarkIndex >= 0 ? firstLine.slice(0, questionMarkIndex + 1).trim() : firstLine;
      const leadingAnswer =
        questionMarkIndex >= 0 ? firstLine.slice(questionMarkIndex + 1).trim() : '';

      const paragraphs: string[] = [];
      let buffer: string[] = [];

      if (leadingAnswer) {
        buffer.push(leadingAnswer);
      }

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
          if (buffer.length > 0) {
            paragraphs.push(buffer.join(' '));
            buffer = [];
          }
          return;
        }
        buffer.push(trimmed);
      });

      if (buffer.length > 0) {
        paragraphs.push(buffer.join(' '));
      }

      return {
        question,
        answer: paragraphs.join('\n'),
      };
    })
    .filter(faq => faq.question.length > 0);
};

const highlightCards = [
  {
    title: 'Cos’è il TFR',
    body: 'Quota del 6,91% dello stipendio lordo accantonata ogni mese. Lo ricevi alla fine del rapporto di lavoro.',
    badge: 'Basi',
  },
  {
    title: 'Dove va il TFR',
    body: 'Può restare in azienda, andare al fondo pensione o al Fondo Tesoreria INPS (aziende > 50 dipendenti). Silenzio-assenso dopo 6 mesi.',
    badge: 'Scelte',
  },
  {
    title: 'Tassazione',
    body: 'In azienda tassazione separata (23-43%). Nel fondo pensione scende dal 15% al 9% con gli anni, con deduzioni sui contributi volontari.',
    badge: 'Fisco',
  },
];

const TfrFaq: React.FC = () => {
  const faqs = useMemo(() => parseFaqEntries(faqText), []);

  return (
    <div className="space-y-6 sm:space-y-8 md:space-y-10">
      <ScrollReveal variant="slideUp" duration={0.6} threshold={0.15}>
        <div className="grid gap-4 md:gap-6 md:grid-cols-3">
          {highlightCards.map(card => (
            <div
              key={card.title}
              className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                {card.badge}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-50">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{card.body}</p>
            </div>
          ))}
        </div>
      </ScrollReveal>

      <ScrollReveal variant="slideUp" duration={0.6} delay={0.1} threshold={0.15}>
        <section className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-slate-500 dark:text-slate-400">
                FAQ TFR
              </p>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Le domande più frequenti</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Risposte rapide estratte dalla guida completa sul Trattamento di Fine Rapporto.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {faqs.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-900/30 dark:text-amber-50">
                Non siamo riusciti a caricare le FAQ sul TFR. Riprova più tardi.
              </div>
            )}

            {faqs.map((faq, index) => (
              <details
                key={faq.question}
                className="group rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-all duration-200 open:border-blue-200 open:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:open:border-blue-700/70"
                open={index < 2}
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-left">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-[12px] font-bold text-blue-700 ring-1 ring-blue-100 dark:bg-blue-900/40 dark:text-blue-100 dark:ring-blue-700/60">
                      Q
                    </span>
                    <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-50">
                      {faq.question}
                    </p>
                  </div>
                  <span className="ml-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all duration-200 group-open:rotate-180 dark:bg-slate-800 dark:text-slate-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                </summary>
                <div className="mt-3 space-y-2 pl-10 text-sm leading-relaxed text-slate-600 whitespace-pre-line dark:text-slate-300">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal variant="slideUp" duration={0.6} delay={0.15} threshold={0.1}>
        <section
          id="faq-rendite"
          className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
        >
          <div className="mb-5">
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-slate-500 dark:text-slate-400">
              FAQ Rendite
            </p>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              La rendita spiegata al cliente
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Le domande che il cliente fa più spesso sulla pensione complementare in forma di rendita, con risposte semplici
              ed esempi calcolati sui coefficienti ufficiali dei fondi.
            </p>
            <nav className="mt-4 flex flex-wrap gap-2" aria-label="Argomenti FAQ rendite">
              {RENDITE_FAQ.map(gruppo => (
                <a
                  key={gruppo.id}
                  href={`#faq-rendite-${gruppo.id}`}
                  className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-200"
                >
                  {gruppo.titolo}
                </a>
              ))}
            </nav>
          </div>

          <div className="space-y-8">
            {RENDITE_FAQ.map(gruppo => (
              <div key={gruppo.id} id={`faq-rendite-${gruppo.id}`} className="scroll-mt-24">
                <h4 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">{gruppo.titolo}</h4>
                <p className="mt-0.5 mb-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400">{gruppo.sottotitolo}</p>
                <div className="space-y-3">
                  {gruppo.voci.map(voce => (
                    <details
                      key={voce.domanda}
                      className="group rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-all duration-200 open:border-emerald-200 open:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:open:border-emerald-700/70"
                    >
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-left">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[12px] font-bold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-100 dark:ring-emerald-700/60">
                            Q
                          </span>
                          <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-50">{voce.domanda}</p>
                        </div>
                        <span className="ml-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all duration-200 group-open:rotate-180 dark:bg-slate-800 dark:text-slate-300">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      </summary>
                      <div className="mt-3 space-y-2 pl-10 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {voce.risposta.map(p => <p key={p}>{p}</p>)}
                        {voce.elenco && (
                          <ul className="list-disc space-y-1 pl-5">
                            {voce.elenco.map(e => <li key={e}>{e}</li>)}
                          </ul>
                        )}
                        {voce.chiusura?.map(p => <p key={p}>{p}</p>)}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </ScrollReveal>
    </div>
  );
};

export default TfrFaq;
