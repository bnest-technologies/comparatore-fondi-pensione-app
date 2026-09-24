import React, { useEffect } from 'react';
import { PensionFund } from '../types';
import { CATEGORY_MAP } from '../constants';
import PerformanceChart from './PerformanceChart';
import CostChart from './CostChart';
import { getFundInformativeNote } from '../data/fundInformativeNotes';
import { DATASET_METADATA } from '../config/datasetMetadata';
import FundRatingBadge from './common/FundRatingBadge';
import RenditeFondoBox from './rendite/RenditeFondoBox';

interface FundDetailModalProps {
  fund: PensionFund | null;
  isOpen?: boolean;
  onClose: () => void;
  theme: string;
  onFundSelect?: (fund: PensionFund) => void;
  isSelected?: boolean;
  /** apre la sezione Rendite con questo fondo in evidenza */
  onApriRendite?: (nAlbo: number) => void;
}

const ValueRow: React.FC<{ label: string; value: number | null; isPercentage?: boolean }> = ({ label, value, isPercentage = true }) => {
  const color = value === null ? 'text-gray-500 dark:text-gray-400' : value >= 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-rose-600 dark:text-rose-500';
  const displayValue = value !== null ? `${value.toFixed(2)}${isPercentage ? '%' : ''}` : 'N/A';
  return (
    <div className="flex justify-between items-center py-2 sm:py-3 gap-2">
      <p className="text-gray-600 dark:text-gray-300 text-left flex-1 min-w-0 truncate" title={label}>{label}</p>
      <p className={`font-semibold ${color} tabular-nums shrink-0`}>{displayValue}</p>
    </div>
  );
};

const RatingValueRow: React.FC<{ label: string; value: number | string | null }> = ({ label, value }) => (
  <div className="flex justify-between items-center py-2 sm:py-3 gap-2">
    <p className="text-gray-600 dark:text-gray-300 text-left flex-1 min-w-0 truncate" title={label}>{label}</p>
    <p className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums shrink-0">
      {value ?? 'N/A'}
    </p>
  </div>
);

const TextValueRow: React.FC<{ label: string; value: string | null }> = ({ label, value }) => (
  <div className="py-2 sm:py-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-100">
      {value || 'N/A'}
    </p>
  </div>
);

const normalizeExternalUrl = (url: string | null): string | null => {
  if (!url) return null;
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
};

const FundDetailModal: React.FC<FundDetailModalProps> = ({ fund, isOpen, onClose, theme, onFundSelect, isSelected, onApriRendite }) => {
  const [isMobile, setIsMobile] = React.useState(false);
  
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);

    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  if (!fund) {
    return null;
  }

  const normalizedSite = normalizeExternalUrl(fund.sitoWeb);
  const informativeNote = fund.notaInformativa ?? getFundInformativeNote(fund.type, fund.nAlbo);
  const normalizedInformativeNote = normalizeExternalUrl(informativeNote?.url ?? null);
  const informativeNoteTitle = informativeNote?.fileName ?? 'Nota informativa';
  const collectiveInfo = fund.collectiveAgreementInfo;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 bg-black bg-opacity-60 dark:bg-opacity-80 z-50 flex justify-center items-end sm:items-center p-0 sm:p-4 transition-opacity duration-300 ease-in-out"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-5xl transform transition-all duration-300 ease-in-out max-h-[90vh] sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed */}
        <div className="p-2.5 sm:p-4 md:p-5 lg:p-6 border-b border-gray-200 dark:border-slate-700 relative shrink-0">
          {/* Mobile drag handle */}
          {isMobile && (
            <div className="flex justify-center mb-2">
              <div className="w-12 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
            </div>
          )}
          
          <div className="pr-10 sm:pr-12">
            <h2 id="modal-title" className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-900 dark:text-slate-100 leading-tight">
              {fund.linea}
              {fund.chiusoNuoviAderenti && (
                <span className="ml-1 font-black text-rose-600 dark:text-rose-400" aria-label="Chiuso ai nuovi aderenti">
                  *
                </span>
              )}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1">{fund.pip}</p>
            {fund.chiusoNuoviAderenti && (
              <p className="mt-1 inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                * Chiuso ai nuovi aderenti
              </p>
            )}
            
            {/* Fund info in header - categories for FPN, website/document links for all */}
            {(fund.categoriaContratto || normalizedSite || normalizedInformativeNote) && (
              <div className="mt-2 sm:mt-3">
                {fund.categoriaContratto && (
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Categorie Contrattuali:</p>
                )}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {fund.categoriaContratto && (
                    <>
                      {fund.categoriaContratto.split(',').map((categoria, index) => (
                        <div key={index} className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-full">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{categoria.trim()}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {normalizedSite && (
                    <a
                      href={normalizedSite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-600 text-white rounded-full hover:bg-sky-700 transition text-xs font-medium"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      Visita sito
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                  {normalizedInformativeNote && (
                    <a
                      href={normalizedInformativeNote}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Apri nota informativa ${informativeNoteTitle}`}
                      title={informativeNoteTitle}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition text-xs font-medium"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
                      </svg>
                      Nota informativa
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="absolute top-2 sm:top-3 md:top-4 right-2 sm:right-3 md:right-4 p-1.5 sm:p-2 rounded-full text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 transition active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="p-2.5 sm:p-4 md:p-5 lg:p-6 overflow-y-auto flex-1">
            {/* Principal Info */}
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2.5 sm:p-3 md:p-4 mb-3 sm:mb-4 md:mb-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4 text-center">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Società</p>
                    <p
                      className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 truncate px-1"
                      title={fund.societa || (fund.type === 'FPN' ? 'Fondo pensione di categoria' : '')}
                    >
            {fund.societa || (fund.type === 'FPN' ? 'Fondo pensione di categoria' : 'N/A')}
                    </p>
                  </div>
                  <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Categoria</p>
                      <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 truncate px-1">{CATEGORY_MAP[fund.categoria]}</p>
                  </div>
                  <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Tipo</p>
                      <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">{fund.type}</p>
                  </div>
                  <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">N° Albo</p>
                      <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">{fund.nAlbo}</p>
                  </div>
                  <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Garanzia</p>
                      <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">{fund.garanzia === true ? 'Presente' : fund.garanzia === false ? 'Non presente' : 'Non disponibile'}</p>
                  </div>
                  <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Decorrenza</p>
                      <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">{fund.dataInizioQuotazione ?? 'N/A'}</p>
                  </div>
                  <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Sostenibilità</p>
                      <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 truncate px-1" title={fund.sostenibilita ?? ''}>{fund.sostenibilita ?? 'N/A'}</p>
                  </div>
                </div>
            </div>

            {/* Rating Section */}
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2.5 sm:p-3 md:p-4 mb-3 sm:mb-4 md:mb-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5 sm:gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-lime-700 dark:text-lime-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.52 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.52 4.674c.3.921-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.52-4.674a1 1 0 00-.363-1.118L3.082 10.1c-.783-.57-.38-1.81.588-1.81h4.915a1 1 0 00.95-.69l1.514-4.674z" />
                      </svg>
                      Rating del comparto
                    </h3>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                      {fund.rating.ammissibile
                        ? `Score netto ponderato sui periodi disponibili. ISC ${fund.rating.iscOrizzonte ?? 'N/D'} utilizzato.`
                        : fund.rating.motivoEsclusione}
                    </p>
                  </div>
                  <FundRatingBadge fund={fund} />
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="divide-y divide-gray-200 dark:divide-slate-700 bg-white/70 dark:bg-slate-800/50 rounded-lg px-2.5 sm:px-3 md:px-4 text-xs sm:text-sm">
                        <RatingValueRow label="Valutazione rating" value={fund.rating.descrizioneRating} />
                    <RatingValueRow label="Tipo adesione" value={fund.rating.tipoAdesione} />
                    <RatingValueRow label="ISC usato" value={fund.rating.iscUtilizzato != null ? `${fund.rating.iscUtilizzato.toFixed(2)}%` : null} />
                    <RatingValueRow label="Orizzonte ISC" value={fund.rating.iscOrizzonte} />
                  </div>
                  <div className="divide-y divide-gray-200 dark:divide-slate-700 bg-white/70 dark:bg-slate-800/50 rounded-lg px-2.5 sm:px-3 md:px-4 text-xs sm:text-sm">
                    <RatingValueRow label="Score 3 anni" value={fund.rating.scores.score3y != null ? fund.rating.scores.score3y.toFixed(2) : null} />
                    <RatingValueRow label="Score 5 anni" value={fund.rating.scores.score5y != null ? fund.rating.scores.score5y.toFixed(2) : null} />
                    <RatingValueRow label="Score 10 anni" value={fund.rating.scores.score10y != null ? fund.rating.scores.score10y.toFixed(2) : null} />
                    <RatingValueRow label="Score 20 anni" value={fund.rating.scores.score20y != null ? fund.rating.scores.score20y.toFixed(2) : null} />
                  </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="mb-3 sm:mb-4 md:mb-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                    <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-2 sm:p-3 md:p-4">
                      <PerformanceChart selectedFunds={[fund]} theme={theme} isCompact />
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-2 sm:p-3 md:p-4">
                      <CostChart selectedFunds={[]} detailFund={fund} theme={theme} />
                    </div>
                </div>
            </div>

            {/* Tables Section - Optimized for Mobile */}
            <div className="space-y-4 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-x-4 md:gap-x-6 sm:gap-y-4 pt-3 sm:pt-4 md:pt-5 border-t border-gray-200 dark:border-slate-700">
                <div>
                    <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 dark:text-slate-200 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      Performance Storica
                    </h3>
                    <div className="divide-y divide-gray-200 dark:divide-slate-700 bg-gray-50 dark:bg-slate-700/50 rounded-lg px-2.5 sm:px-3 md:px-4 text-xs sm:text-sm">
                        <ValueRow label={`Rendimento ultimo anno (${DATASET_METADATA.performanceReferenceYear})`} value={fund.rendimenti.ultimoAnno} />
                        <ValueRow label="Rendimento medio 3 anni" value={fund.rendimenti.ultimi3Anni} />
                        <ValueRow label="Rendimento medio 5 anni" value={fund.rendimenti.ultimi5Anni} />
                        <ValueRow label="Rendimento medio 10 anni" value={fund.rendimenti.ultimi10Anni} />
                        <ValueRow label="Rendimento medio 20 anni" value={fund.rendimenti.ultimi20Anni} />
                    </div>
                </div>
                <div>
                    <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 dark:text-slate-200 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Dettaglio Costi (ISC)
                    </h3>
                    <div className="divide-y divide-gray-200 dark:divide-slate-700 bg-gray-50 dark:bg-slate-700/50 rounded-lg px-2.5 sm:px-3 md:px-4 text-xs sm:text-sm">
                        <ValueRow label="Costo a 2 anni" value={fund.isc.isc2a} />
                        <ValueRow label="Costo a 5 anni" value={fund.isc.isc5a} />
                        <ValueRow label="Costo a 10 anni" value={fund.isc.isc10a} />
                        <ValueRow label="Costo a 35 anni" value={fund.isc.isc35a} />
                    </div>
                </div>
                <div>
                    <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 dark:text-slate-200 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-sky-600 dark:text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                      </svg>
                      Portafoglio
                    </h3>
                    <div className="divide-y divide-gray-200 dark:divide-slate-700 bg-gray-50 dark:bg-slate-700/50 rounded-lg px-2.5 sm:px-3 md:px-4 text-xs sm:text-sm">
                        <TextValueRow label="Azionario" value={fund.assetAllocation.azionario} />
                        <TextValueRow label="Obbligazionario" value={fund.assetAllocation.obbligazionario} />
                        <TextValueRow label="Benchmark" value={fund.benchmark} />
                    </div>
                </div>
                <RenditeFondoBox fund={fund} onApriRendite={onApriRendite} />
                <div className="sm:col-span-2">
                    <div className={`grid grid-cols-1 gap-4 ${collectiveInfo ? 'lg:grid-cols-2' : ''}`}>
                      <div>
                        <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 dark:text-slate-200 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14h6m-6 4h6M5 5h14M5 9h14M5 13h.01M5 17h.01" />
                          </svg>
                          Costi operativi
                        </h3>
                        <div className="grid grid-cols-1 gap-x-4 divide-y divide-gray-200 rounded-lg bg-gray-50 px-2.5 text-xs sm:text-sm dark:divide-slate-700 dark:bg-slate-700/50 sm:px-3 md:px-4">
                            <TextValueRow label="Adesione" value={fund.costiDettaglio.adesione} />
                            <TextValueRow label="Gestione annua" value={fund.costiDettaglio.annuiGestione} />
                            <TextValueRow label="Gestione finanziaria" value={fund.costiDettaglio.gestioneFinanziaria} />
                            <TextValueRow label="Anticipazione" value={fund.costiDettaglio.anticipazione} />
                            <TextValueRow label="Trasferimento" value={fund.costiDettaglio.trasferimento} />
                            <TextValueRow label="Riscatto" value={fund.costiDettaglio.riscatto} />
                            <TextValueRow label="Riallocazione posizione" value={fund.costiDettaglio.riallocazionePosizione} />
                            <TextValueRow label="Riallocazione flusso" value={fund.costiDettaglio.riallocazioneFlussoContributivo} />
                            <TextValueRow label="Erogazione" value={fund.costiDettaglio.erogazione} />
                        </div>
                      </div>
                      {collectiveInfo && (
                        <div>
                          <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 dark:text-slate-200 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-sky-600 dark:text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m0-4a4 4 0 118 0 4 4 0 01-8 0z" />
                            </svg>
                            Adesione e accordi collettivi
                          </h3>
                          <div className="divide-y divide-gray-200 rounded-lg bg-sky-50/70 px-2.5 text-xs sm:text-sm dark:divide-slate-700 dark:bg-slate-900/40 sm:px-3 md:px-4">
                            <TextValueRow label="Accordi collettivi" value={collectiveInfo.hasCollectiveAgreements ? 'Presenti' : 'Non dichiarati'} />
                            <TextValueRow label="Dettaglio accordo" value={collectiveInfo.collectiveAgreementLabel} />
                            <TextValueRow label="Costo sottoscrizione individuale" value={collectiveInfo.subscriptionCostIndividual} />
                            <TextValueRow label="Costo sottoscrizione collettiva" value={collectiveInfo.subscriptionCostCollective} />
                            <TextValueRow label="Commissione gestione collettiva" value={collectiveInfo.collectiveManagementFee} />
                            <TextValueRow label="Provvigione incentivo" value={collectiveInfo.incentiveFee} />
                            <TextValueRow label="Note" value={collectiveInfo.notes} />
                          </div>
                        </div>
                      )}
                    </div>
                </div>
                <div className="sm:col-span-2">
                    <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 dark:text-slate-200 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Sostenibilità
                    </h3>
                    <div className="divide-y divide-gray-200 dark:divide-slate-700 bg-gray-50 dark:bg-slate-700/50 rounded-lg px-2.5 sm:px-3 md:px-4 text-xs sm:text-sm">
                        <TextValueRow label="Informazione dichiarata" value={fund.sostenibilita} />
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default FundDetailModal;
