/**
 * Sezione "Seleziona fondo": trovare un fondo e aprirne la scheda, senza passare dal confronto.
 *
 * Stessa barra di filtri di "Confronta fondi" (tipo, classificazione COVIP, societa, garanzia,
 * accordi, ricerca). I risultati sono raggruppati per fondo: la scheda e per comparto, quindi
 * si sceglie il comparto e la scheda si apre subito.
 */
import React, { useMemo, useState } from 'react';
import FilterControls from '../../components/FilterControls';
import FundRatingBadge from '../../components/common/FundRatingBadge';
import { CATEGORY_MAP, SUBSCRIPTION_URL } from '../../constants';
import type { CapitalGuaranteeFilter, CollectiveAgreementFilter, FundCategory, PensionFund } from '../../types';
import { getCapitalGuaranteeStatus } from '../../utils/fundAttributes';

interface SelezionaFondoPageProps {
  funds: PensionFund[];
  onFundClick: (fund: PensionFund) => void;
  /** piano Free: quanti comparti si possono aprire (null = nessun limite) */
  limiteFree: number | null;
}

const PAGINA = 30;
const NOME_TIPO: Record<PensionFund['type'], string> = {
  FPN: 'Fondo negoziale',
  FPA: 'Fondo aperto',
  PIP: 'PIP',
};

interface GruppoFondo {
  chiave: string;
  nome: string;
  tipo: PensionFund['type'];
  nAlbo: number;
  societa: string | null;
  comparti: PensionFund[];
}

const SelezionaFondoPage: React.FC<SelezionaFondoPageProps> = ({ funds, onFundClick, limiteFree }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FundCategory | 'all'>('all');
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [selectedType, setSelectedType] = useState<PensionFund['type'] | 'all'>('all');
  const [capitalGuaranteeFilter, setCapitalGuaranteeFilter] = useState<CapitalGuaranteeFilter>('all');
  const [collectiveAgreementFilter, setCollectiveAgreementFilter] = useState<CollectiveAgreementFilter>('all');
  const [mostrati, setMostrati] = useState(PAGINA);

  const { companies, categories } = useMemo(() => {
    const societa = new Set<string>();
    const categorie = new Set<FundCategory>();
    funds.forEach((f) => {
      if (f.societa) societa.add(f.societa);
      categorie.add(f.categoria);
    });
    return {
      companies: Array.from(societa).sort((a, b) => a.localeCompare(b, 'it')),
      categories: Array.from(categorie).sort((a, b) => CATEGORY_MAP[a].localeCompare(CATEGORY_MAP[b])),
    };
  }, [funds]);

  const reset = () => {
    setSearchTerm(''); setSelectedCategory('all'); setSelectedCompany('all'); setSelectedType('all');
    setCapitalGuaranteeFilter('all'); setCollectiveAgreementFilter('all'); setMostrati(PAGINA);
  };

  const filtrati = useMemo(() => funds.filter((f) => {
    if (selectedType !== 'all' && f.type !== selectedType) return false;
    if (selectedCategory !== 'all' && f.categoria !== selectedCategory) return false;
    if (selectedCompany !== 'all' && f.societa !== selectedCompany) return false;
    if (capitalGuaranteeFilter === 'with-guarantee' && getCapitalGuaranteeStatus(f) !== 'yes') return false;
    if (capitalGuaranteeFilter === 'without-guarantee' && getCapitalGuaranteeStatus(f) !== 'no') return false;
    if (collectiveAgreementFilter === 'with-agreements' && !f.collectiveAgreementInfo?.hasCollectiveAgreements) return false;
    if (collectiveAgreementFilter === 'without-agreements' && f.collectiveAgreementInfo?.hasCollectiveAgreements) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!`${f.pip} ${f.linea} ${f.societa ?? ''} ${f.nAlbo}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [funds, searchTerm, selectedCategory, selectedCompany, selectedType, capitalGuaranteeFilter, collectiveAgreementFilter]);

  // piano Free: come in "Confronta fondi", si aprono solo i primi comparti dell'elenco
  const apribili = useMemo(() => {
    if (limiteFree == null) return null;
    const ordinati = [...filtrati].sort((a, b) => a.pip.localeCompare(b.pip, 'it') || a.linea.localeCompare(b.linea, 'it'));
    return new Set(ordinati.slice(0, limiteFree).map((f) => f.id));
  }, [filtrati, limiteFree]);

  const gruppi = useMemo(() => {
    const m = new Map<string, GruppoFondo>();
    filtrati.forEach((f) => {
      const k = `${f.type}|${f.nAlbo}`;
      if (!m.has(k)) m.set(k, { chiave: k, nome: f.pip, tipo: f.type, nAlbo: f.nAlbo, societa: f.societa, comparti: [] });
      m.get(k)!.comparti.push(f);
    });
    const out = Array.from(m.values());
    out.forEach((g) => g.comparti.sort((a, b) => a.linea.localeCompare(b.linea, 'it')));
    return out.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  }, [filtrati]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <FilterControls
        searchTerm={searchTerm}
        setSearchTerm={(t) => { setSearchTerm(t); setMostrati(PAGINA); }}
        selectedCategory={selectedCategory}
        setSelectedCategory={(c) => { setSelectedCategory(c); setMostrati(PAGINA); }}
        categories={categories}
        selectedCompany={selectedCompany}
        setSelectedCompany={(c) => { setSelectedCompany(c); setMostrati(PAGINA); }}
        companies={companies}
        selectedType={selectedType}
        setSelectedType={(t) => { setSelectedType(t); setMostrati(PAGINA); }}
        capitalGuaranteeFilter={capitalGuaranteeFilter}
        setCapitalGuaranteeFilter={setCapitalGuaranteeFilter}
        collectiveAgreementFilter={collectiveAgreementFilter}
        setCollectiveAgreementFilter={setCollectiveAgreementFilter}
        onReset={reset}
        totalFunds={funds.length}
        sottotitolo="Filtra per tipo, classificazione COVIP o società e apri la scheda del comparto."
      />

      <p className="text-sm text-slate-600 dark:text-slate-400">
        <strong className="text-slate-900 dark:text-slate-100">{gruppi.length}</strong> {gruppi.length === 1 ? 'fondo' : 'fondi'} ·{' '}
        <strong className="text-slate-900 dark:text-slate-100">{filtrati.length}</strong> {filtrati.length === 1 ? 'comparto' : 'comparti'}.
        Scegli il comparto per aprire la sua scheda.
      </p>

      {apribili && filtrati.length > apribili.size && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
          Con il piano Free puoi aprire la scheda dei primi {apribili.size} comparti dell'elenco.{' '}
          <a href={SUBSCRIPTION_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">Passa a Full Access</a> per aprirli tutti.
        </div>
      )}

      {gruppi.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Nessun fondo corrisponde ai filtri. Prova a toglierne qualcuno.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-3 sm:gap-4">
          {gruppi.slice(0, mostrati).map((g) => (
            <article key={g.chiave} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <header className="mb-3">
                <h3 className="text-sm sm:text-base font-semibold leading-snug text-slate-900 dark:text-slate-100">{g.nome}</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {NOME_TIPO[g.tipo]} · Albo {g.nAlbo}{g.societa ? ` · ${g.societa}` : ''}
                </p>
              </header>
              <ul className="flex flex-col gap-1.5">
                {g.comparti.map((c) => {
                  const bloccato = apribili != null && !apribili.has(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onFundClick(c)}
                        disabled={bloccato}
                        className="group flex w-full items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-left transition hover:border-[rgb(var(--brand-primary-rgb)/0.5)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.linea}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            {CATEGORY_MAP[c.categoria]}
                            {c.rating.ratingScore != null && <FundRatingBadge fund={c} compact />}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-[rgb(var(--brand-primary-rgb)/1)]">
                          {bloccato ? '🔒' : 'Apri scheda →'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      )}

      {gruppi.length > mostrati && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setMostrati((n) => n + PAGINA)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Mostra altri fondi ({gruppi.length - mostrati})
          </button>
        </div>
      )}
    </div>
  );
};

export default SelezionaFondoPage;
