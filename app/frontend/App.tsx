import React, { Suspense, lazy, useState, useMemo, useEffect } from 'react';
import { pensionFundsData } from './data/funds';
import { CapitalGuaranteeFilter, CollectiveAgreementFilter, PensionFund, FundCategory, SortConfig } from './types';
import Header from './components/Header';
import FilterControls from './components/FilterControls';
import FundAnalysisPanel from './components/FundAnalysisPanel';
import ActiveFiltersChips from './components/ActiveFiltersChips';
import { CATEGORY_MAP } from './constants';
import { useAuth } from './auth';
import Footer from './components/Footer';
import MobileBottomNav from './components/MobileBottomNav';
import { GuidedFundComparator } from './components/guided/GuidedFundComparator';
import { GuidedComparatorProvider, useGuidedComparator, MAX_SELECTED_FUNDS } from './components/guided/GuidedComparatorContext';
import { ToastProvider } from './components/animations/ToastNotifications';
import { PageTransition } from './components/animations/PageTransition';
import { ScrollReveal, ScrollProgress } from './components/animations/ScrollReveal';
import { AnimatedButton } from './components/animations/AnimatedButton';
import { FloatingCompareButton } from './components/animations/FloatingCompareButton';
import SectionHeader from './components/common/SectionHeader';
import GuidedTour, { useGuidedTour, FirstVisitBanner } from './components/common/GuidedTour';
import PwaUpdateBanner from './components/common/PwaUpdateBanner';
import AccessStatusBanner from './components/common/AccessStatusBanner';
import DiscountBanner from './components/common/DiscountBanner';
import { compareFundsTourSteps } from './config/tourSteps';
import { SECTION_COPY, buildNavItems } from './features/dashboard/config';
import { getSortValue } from './features/dashboard/sorting';
import { getCapitalGuaranteeStatus } from './utils/fundAttributes';
import { DashboardSection, View } from './features/dashboard/types';
import { resolveRouteFromPathname, sectionToPath } from './features/dashboard/routing';
import {
  BRAND_TOKENS,
  BRAND_STYLES,
  type BrandStyleId,
} from './config/brandTokens';

const Playbook = lazy(() => import('./components/Playbook'));
const LoginModal = lazy(() => import('./components/LoginModal'));
const FundDetailModal = lazy(() => import('./components/FundDetailModal'));
const UpgradeDialog = lazy(() => import('./components/UpgradeDialog'));
const FeedbackWidget = lazy(() => import('./components/feedback/FeedbackWidget'));
const PlaybookContent = lazy(() => import('./components/PlaybookContent'));
const TfrFaq = lazy(() => import('./components/TfrFaq'));
const SimulatorPage = lazy(() => import('./components/simulator/SimulatorPage'));
import HomePage from './components/HomePage';
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const GuidedFundTable = lazy(() => import('./components/guided/GuidedFundTable'));
const VisualComparison = lazy(() => import('./components/VisualComparison'));
const RankingPage = lazy(() => import('./features/ranking/RankingPage'));
const RenditePage = lazy(() => import('./features/rendite/RenditePage'));

const FREE_PLAN_LIMIT = 10;
const APP_ROUTE_PATHS = new Set([
  '/',
  '/playbook',
  '/home',
  '/simulator',
  '/analyze',
  '/compare',
  '/ranking',
  '/guide',
  '/tfr-faq',
  '/admin',
  '/dashboard',
]);

const scrollToHashTarget = (hash: string, attempt = 0): void => {
  const rawTargetId = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!rawTargetId) return;

  let targetId = rawTargetId;
  try {
    targetId = decodeURIComponent(rawTargetId);
  } catch {
    targetId = rawTargetId;
  }

  const target = document.getElementById(targetId);
  if (!target) {
    if (attempt < 10) {
      window.setTimeout(() => scrollToHashTarget(hash, attempt + 1), 100);
    }
    return;
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const LazyFallback: React.FC = () => (
  <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-6 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
    Caricamento sezione...
  </div>
);

const AppContent: React.FC = () => {
  const [view, setView] = useState<View>(() => resolveRouteFromPathname(window.location.pathname).view);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }

    return 'light';
  });
  const brandStyle = useMemo<BrandStyleId>(() => {
    return BRAND_TOKENS.styleId;
  }, []);
  const [activeSection, setActiveSection] = useState<DashboardSection>(
    () => resolveRouteFromPathname(window.location.pathname).section
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedNavItem, setExpandedNavItem] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FundCategory | 'all'>('all');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<'FPN' | 'FPA' | 'PIP' | 'all'>('all');
  const [capitalGuaranteeFilter, setCapitalGuaranteeFilter] = useState<CapitalGuaranteeFilter>('all');
  const [collectiveAgreementFilter, setCollectiveAgreementFilter] = useState<CollectiveAgreementFilter>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ultimoAnno', direction: 'descending' });
  const [modalFund, setModalFund] = useState<PensionFund | null>(null);
  // fondo da evidenziare aprendo la sezione Rendite dalla scheda di un fondo
  const [alboRendite, setAlboRendite] = useState<number | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const { user, loading: authLoading, authMode } = useAuth();
  const { selectedFundIds, toggleSelectedFund, clearSelectedFunds, setEntryMode, setSimulationFundIds } = useGuidedComparator();
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [showFreeBanner, setShowFreeBanner] = useState(true);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [analyzeFund, setAnalyzeFund] = useState<PensionFund | null>(null);
  const currentPlan = user?.plan ?? 'free';
  const userStatus = user?.status ?? 'active';
  // User has full access only if they have full-access plan AND active status (or are admin)
  const isFullAccess = (currentPlan === 'full-access' && userStatus === 'active') || user?.isAdmin === true;

  // Tour guidati per le varie sezioni
  const compareFundsTour = useGuidedTour('choose-fund');

  // Debug log for admin status
  useEffect(() => {
    if (user) {
      console.log('👤 User info:', {
        email: user.email,
        plan: user.plan,
        status: user.status,
        roles: user.roles,
        isAdmin: user.isAdmin,
        hasFullAccess: isFullAccess
      });
    }
  }, [user, isFullAccess]);

  // Re-show the free banner whenever the user changes (login/switch account)
  // so the payment question always appears on each new session/login
  useEffect(() => {
    if (user && !isFullAccess) {
      setShowFreeBanner(true);
    }
  }, [user?.id]);

  // Auto-expand parent nav items when activeSection changes
  useEffect(() => {
    const toolSections: DashboardSection[] = ['simulator', 'choose-fund', 'ranking', 'rendite'];
    const resourceSections: DashboardSection[] = ['playbook', 'tfr-faq'];
    
    if (toolSections.includes(activeSection)) {
      setExpandedNavItem('tools');
    } else if (resourceSections.includes(activeSection)) {
      setExpandedNavItem('resources');
    } else {
      setExpandedNavItem(null);
    }
  }, [activeSection]);

  // When the user logs out, redirect to the home page and close any auth
  // related UI that may be open. This ensures the app shows a clear home state
  // after logout instead of leaving the dashboard visible.
  useEffect(() => {
    if (authLoading || authMode === 'none') {
      return;
    }

    if (!user) {
      // Close login modal, upgrade dialogs and show the home
      setShowLoginModal(false);
      setShowUpgradeDialog(false);
      setView('playbook');
      setActiveSection('home');
    }
  }, [user, authLoading, authMode]);

  // Back/forward navigation support
  useEffect(() => {
    const onPopState = () => {
      const resolved = resolveRouteFromPathname(window.location.pathname);
      setView(resolved.view);
      setActiveSection(resolved.section);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const scrollToCurrentHash = () => {
      scrollToHashTarget(window.location.hash);
    };

    if (view === 'dashboard' && activeSection === 'playbook' && window.location.hash) {
      window.setTimeout(scrollToCurrentHash, 150);
    }

    window.addEventListener('hashchange', scrollToCurrentHash);
    return () => window.removeEventListener('hashchange', scrollToCurrentHash);
  }, [view, activeSection]);

  useEffect(() => {
    const handleInAppLinkClick = (event: MouseEvent): void => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }

      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) {
        return;
      }

      const url = new URL(anchor.href);
      const normalizedPath = url.pathname.toLowerCase();
      if (url.origin !== window.location.origin || !APP_ROUTE_PATHS.has(normalizedPath)) {
        return;
      }

      event.preventDefault();
      const resolved = resolveRouteFromPathname(url.pathname);
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.pushState(null, '', nextUrl);
      setView(resolved.view);
      setActiveSection(resolved.section);

      if (url.hash) {
        window.setTimeout(() => scrollToHashTarget(url.hash), 200);
      }
    };

    document.addEventListener('click', handleInAppLinkClick);
    return () => document.removeEventListener('click', handleInAppLinkClick);
  }, []);

  // Sync UI state to URL path
  useEffect(() => {
    const targetPath = view === 'playbook' ? '/' : sectionToPath(activeSection);
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  }, [view, activeSection]);

  // Route-level role guard for admin area
  useEffect(() => {
    if (view === 'dashboard' && activeSection === 'admin' && !user?.isAdmin) {
      setActiveSection('home');
    }
  }, [view, activeSection, user?.isAdmin]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.brandStyle = brandStyle;
    const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.content = BRAND_STYLES[brandStyle].colors.primary;
    }
  }, [brandStyle]);

  // Scroll to top when navigating between sections
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeSection]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };
  
  const handleGoToPlaybook = () => {
    setView('playbook');
  };

  // Login modal gating
  const [showLoginModal, setShowLoginModal] = useState(false);
  const openLoginModal = () => setShowLoginModal(true);
  const closeLoginModal = () => {
    setShowLoginModal(false);
  };

  const { companies, categories } = useMemo(() => {
    const companySet = new Set<string>();
    const categorySet = new Set<FundCategory>();
    pensionFundsData.forEach(fund => {
      if (fund.societa) {
        companySet.add(fund.societa);
      }
      categorySet.add(fund.categoria);
    });
    return {
      companies: Array.from(companySet).sort(),
      categories: Array.from(categorySet).sort((a, b) => CATEGORY_MAP[a].localeCompare(CATEGORY_MAP[b])),
    };
  }, []);
  
  const selectedFundIdsSet = useMemo(() => new Set(selectedFundIds), [selectedFundIds]);

  const sectionCopy = SECTION_COPY;
  const navItems = useMemo(() => buildNavItems(Boolean(user?.isAdmin)), [user?.isAdmin]);

  const navButtonClasses = (id: DashboardSection | string, isSubItem = false) => {
    const isActive = activeSection === id;
    const baseClasses = `group relative w-full text-left rounded-xl transition-all duration-200`;
    
    if (isSubItem) {
      return `${baseClasses} ${
        isActive
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
          : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'
      } flex items-start gap-3 px-4 py-2.5 ml-2`;
    }
    
    return `${baseClasses} ${
      isActive
        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-200/50 dark:shadow-blue-900/30 border-transparent'
        : 'bg-slate-50/50 text-slate-700 border border-slate-200/50 hover:bg-white hover:border-slate-300 hover:shadow-md dark:bg-slate-800/50 dark:text-slate-200 dark:border-slate-700/50 dark:hover:bg-slate-800 dark:hover:border-slate-600'
    } ${
      sidebarCollapsed 
        ? 'flex items-center justify-center p-3' 
        : 'flex items-center gap-3 px-4 py-3'
    }`;
  };

  const filteredFunds = useMemo(() => {
    return pensionFundsData.filter(fund => {
      if (selectedType !== 'all' && fund.type !== selectedType) {
        return false;
      }
      if (selectedCategory !== 'all' && fund.categoria !== selectedCategory) {
        return false;
      }
      if (selectedCompany !== 'all' && fund.societa !== selectedCompany) {
        return false;
      }
      if (capitalGuaranteeFilter === 'with-guarantee' && getCapitalGuaranteeStatus(fund) !== 'yes') {
        return false;
      }
      if (capitalGuaranteeFilter === 'without-guarantee' && getCapitalGuaranteeStatus(fund) !== 'no') {
        return false;
      }
      if (collectiveAgreementFilter === 'with-agreements' && !fund.collectiveAgreementInfo?.hasCollectiveAgreements) {
        return false;
      }
      if (collectiveAgreementFilter === 'without-agreements' && fund.collectiveAgreementInfo?.hasCollectiveAgreements) {
        return false;
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const fundText = `${fund.pip} ${fund.linea} ${fund.societa || ''}`.toLowerCase();
        if (!fundText.includes(term)) {
          return false;
        }
      }
      return true;
    });
  }, [searchTerm, selectedCategory, selectedCompany, selectedType, capitalGuaranteeFilter, collectiveAgreementFilter]);

  const filteredAndSortedFunds = useMemo(() => {
  const { key, direction } = sortConfig;

  const sorted = [...filteredFunds].sort((a, b) => {
    const dir = direction === 'ascending' ? 1 : -1;

    // Special-case: allow sorting by whether a fund is selected
    if (key === 'selected') {
      const aSel = selectedFundIdsSet.has(a.id) ? 1 : 0;
      const bSel = selectedFundIdsSet.has(b.id) ? 1 : 0;
      // put selected first when descending, last when ascending
      return (aSel - bSel) * dir * -1;
    }

    const aVal = getSortValue(a, key);
    const bVal = getSortValue(b, key);

    // Robust null handling: always push nulls to the bottom
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * dir;
    }
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return aVal.localeCompare(bVal) * dir;
    }
    return 0;
  });

  return sorted;
}, [filteredFunds, sortConfig, selectedFundIds]);

  const visibleFunds = useMemo(() => {
    // For pagination we will compute a paginated slice later. Here return the full
    // (or limited by free plan) array that pagination will slice from. If the
    // application is running with no authentication (authMode === 'none') we
    // consider it an open demo environment and show the full dataset.
    if (isFullAccess || authMode === 'none') {
      return filteredAndSortedFunds;
    }
    return filteredAndSortedFunds.slice(0, FREE_PLAN_LIMIT);
  }, [filteredAndSortedFunds, isFullAccess, authMode]);

  // Do not show upgrade prompt when the app is running with no authentication
  const showUpgradeNotice =
    !authLoading &&
    authMode !== 'none' &&
    currentPlan === 'free' &&
    !isFullAccess &&
    filteredAndSortedFunds.length > FREE_PLAN_LIMIT;

  const fundById = useMemo(() => {
    const map = new Map<string, PensionFund>();
    pensionFundsData.forEach(fund => map.set(fund.id, fund));
    return map;
  }, [pensionFundsData]);

  const selectedFunds = useMemo(() => {
    return selectedFundIds
      .map(fundId => fundById.get(fundId))
      .filter((fund): fund is PensionFund => Boolean(fund));
  }, [selectedFundIds, fundById]);

  const toggleFundSelection = (fundId: string) => {
    const fund = fundById.get(fundId);
    if (!fund) {
      return;
    }
    if (!selectedFundIdsSet.has(fundId) && selectedFundIds.length >= MAX_SELECTED_FUNDS) {
      setSelectionNotice(`Puoi confrontare al massimo ${MAX_SELECTED_FUNDS} fondi.`);
      return;
    }
    setSelectionNotice(null);
    toggleSelectedFund(fundId);
  };
  
  const resetSelection = () => {
    clearSelectedFunds();
  };

  const handleFundClick = (fund: PensionFund) => {
    setModalFund(fund);
  };

  const handleCloseModal = () => {
    setModalFund(null);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedCompany('all');
    setSelectedType('all');
    setCapitalGuaranteeFilter('all');
    setCollectiveAgreementFilter('all');
  };

  const handlePresetSelected = (presetId: string) => {
    setPage(1);
    setSearchTerm('');
    switch (presetId) {
      case 'cheapest-35y':
        setSelectedCategory('all');
        setSelectedCompany('all');
        setSelectedType('all');
        setCapitalGuaranteeFilter('all');
        setCollectiveAgreementFilter('all');
        setSortConfig({ key: 'costoAnnuo', direction: 'ascending' });
        break;
      case 'best-10y-returns':
        setCapitalGuaranteeFilter('all');
        setCollectiveAgreementFilter('all');
        setSortConfig({ key: 'ultimi10Anni', direction: 'descending' });
        break;
      case 'near-retirement':
        setSelectedCategory('GAR');
        setSelectedType('FPN');
        setCapitalGuaranteeFilter('all');
        setCollectiveAgreementFilter('all');
        setSortConfig({ key: 'costoAnnuo', direction: 'ascending' });
        break;
      case 'just-starting':
        setSelectedCategory('AZN');
        setSelectedType('PIP');
        setCapitalGuaranteeFilter('all');
        setCollectiveAgreementFilter('all');
        setSortConfig({ key: 'ultimi10Anni', direction: 'descending' });
        break;
      default:
        break;
    }
  };

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset page when filters or sort change
  useEffect(() => setPage(1), [searchTerm, selectedCategory, selectedCompany, selectedType, capitalGuaranteeFilter, collectiveAgreementFilter, sortConfig]);

  // Keep guided flows aligned with sidebar section
  useEffect(() => {
    if (activeSection === 'choose-fund') {
      setEntryMode('choose-fund');
    } else {
      setEntryMode(null);
    }
  }, [activeSection, setEntryMode]);

  if (view === 'playbook') {
    return (
      <>
        <PwaUpdateBanner />
        <Suspense fallback={<LazyFallback />}>
          <Playbook onStart={openLoginModal} theme={theme} toggleTheme={toggleTheme} />
          <LoginModal
            open={showLoginModal}
            onClose={closeLoginModal}
            onSuccess={() => {
              closeLoginModal();
              setActiveSection('home');
              setView('dashboard');
            }}
          />
        </Suspense>
        <DiscountBanner
          visible={!isFullAccess && Boolean(user) && !authLoading}
        />
      </>
    );
  }

  return (
    <>
      <ToastProvider />
      <ScrollProgress position="top" height={3} color="bg-gradient-to-r from-sky-600 to-cyan-600" />
      <PwaUpdateBanner />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-800 dark:text-slate-200 font-sans transition-colors duration-300">
        <Header
          theme={theme}
          toggleTheme={toggleTheme}
          onGoToPlaybook={handleGoToPlaybook}
          onLoginRequest={openLoginModal}
          onVisibilityChange={setIsHeaderVisible}
          navItems={navItems}
          activeNavId={activeSection}
          onSelectNav={setActiveSection}
          sidebarCollapsed={sidebarCollapsed}
        />
      
      {/* Layout with Sidebar */}
      <div className="flex pt-16 md:pt-[81px] min-h-[calc(100vh-4rem)] md:min-h-[calc(100vh-81px)]">
        {/* Fixed Sidebar Navigation */}
        <aside
          className={`hidden md:block fixed left-0 top-[81px] h-[calc(100vh-81px)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-r border-slate-200 dark:border-slate-800 shadow-lg transition-all duration-300 z-10 ${
            sidebarCollapsed ? 'w-20' : 'w-56 lg:w-60'
          }`}
        >
          <nav
            className="h-full flex flex-col"
            aria-label="Navigazione dashboard"
          >
            {/* Sidebar Header */}
            <div className={`flex h-16 items-center border-b border-slate-200/50 bg-gradient-to-r from-slate-50 to-white dark:border-slate-800/50 dark:from-slate-900/50 dark:to-slate-800/50 ${
              sidebarCollapsed ? 'justify-center px-3 py-2' : 'justify-between px-4 py-2'
            }`}>
              {!sidebarCollapsed && (
                <div className="flex h-12 items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Menu
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setSidebarCollapsed(prev => !prev)}
                className="flex h-12 w-12 min-h-12 items-center justify-center rounded-xl bg-slate-100 p-3 text-slate-600 transition-all duration-200 hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                aria-label={sidebarCollapsed ? 'Espandi menu' : 'Comprimi menu'}
                title={sidebarCollapsed ? 'Espandi menu' : 'Comprimi menu'}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 transition-transform duration-300 ${
                    sidebarCollapsed ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                  />
                </svg>
              </button>
            </div>

            {/* Navigation Items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {navItems.map((item) => {
                const hasSubItems = item.subItems && item.subItems.length > 0;
                const isExpanded = expandedNavItem === item.id;
                const isParentActive = hasSubItems && item.subItems?.some(sub => sub.id === activeSection);
                
                return (
                  <div key={item.id}>
                    {/* Main Nav Button */}
                    <button
                      onClick={() => {
                        if (hasSubItems) {
                          if (sidebarCollapsed) {
                            setSidebarCollapsed(false);
                            setExpandedNavItem(item.id as string);
                          } else {
                            setExpandedNavItem(isExpanded ? null : item.id as string);
                          }
                        } else {
                          setActiveSection(item.id as DashboardSection);
                        }
                      }}
                      className={navButtonClasses(item.id, false)}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      {/* Icon with active indicator dot */}
                      <span className={`relative flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${sidebarCollapsed ? 'mx-auto' : ''}`}>
                        {item.icon}
                        {/* Active indicator dot for collapsed sidebar */}
                        {(activeSection === item.id || isParentActive) && sidebarCollapsed && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full ring-2 ring-blue-600 animate-pulse"></span>
                        )}
                      </span>
                      
                      {/* Label */}
                      {!sidebarCollapsed && (
                        <span className="flex-1 text-left font-medium">{item.label}</span>
                      )}

                      {/* Dropdown indicator or active indicator */}
                      {!sidebarCollapsed && (
                        <>
                          {hasSubItems ? (
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" 
                              viewBox="0 0 24 24" 
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          ) : (
                            activeSection === item.id && (
                              <span className="flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </span>
                            )
                          )}
                        </>
                      )}
                    </button>

                    {/* Sub-items (expanded) */}
                    {hasSubItems && isExpanded && !sidebarCollapsed && (
                      <div className="mt-1 space-y-1 ml-2 border-l-2 border-slate-200 dark:border-slate-700 pl-2">
                        {item.subItems?.map((subItem) => (
                          <button
                            key={subItem.id}
                            onClick={() => {
                              setActiveSection(subItem.id);
                              // Optionally collapse after selection on mobile
                            }}
                            className={navButtonClasses(subItem.id, true)}
                          >
                            <div className="flex-1">
                              <div className="font-medium text-sm">{subItem.label}</div>
                              {subItem.description && (
                                <div className="text-xs opacity-70 mt-0.5">{subItem.description}</div>
                              )}
                            </div>
                            {activeSection === subItem.id && (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>
        </aside>

        {/* Main Content with margin for sidebar */}
        <main 
          className={`flex-1 min-w-0 transition-all duration-300 ${
            sidebarCollapsed ? 'md:ml-20' : 'md:ml-56 lg:ml-60'
          }`}
        >
          <div 
            className="px-3 sm:px-6 md:px-8 lg:px-12 xl:px-16 py-6 sm:py-10 md:py-12 pb-20 md:pb-12 space-y-6 sm:space-y-8 md:space-y-10 max-w-[1800px]"
            style={{ paddingTop: '1.5rem' }}
          >
            <PageTransition pageKey={activeSection} variant="slideUp">
              {activeSection === 'playbook' ? (
                <div className="space-y-6 sm:space-y-8">
                  <SectionHeader
                    eyebrow={sectionCopy.playbook.eyebrow}
                    title={sectionCopy.playbook.title}
                    description={sectionCopy.playbook.description}
                  />
                  <section className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white/90 px-3 py-4 sm:px-5 sm:py-6 md:px-7 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                    <Suspense fallback={<LazyFallback />}>
                      <PlaybookContent onNavigate={(section) => {
                        if (section === 'learn') {
                          setActiveSection('choose-fund');
                          setEntryMode('learn');
                          return;
                        }
                        setActiveSection(section);
                      }} />
                    </Suspense>
                  </section>
                </div>
              ) : activeSection === 'tfr-faq' ? (
                <div className="space-y-6 sm:space-y-8 md:space-y-10">
                  <SectionHeader
                    eyebrow={sectionCopy[activeSection].eyebrow}
                    title={sectionCopy[activeSection].title}
                    description={sectionCopy[activeSection].description}
                    badge={{ text: "Info", variant: "info" }}
                  />
                  <Suspense fallback={<LazyFallback />}>
                    <TfrFaq />
                  </Suspense>
                </div>
              ) : activeSection === 'simulator' ? (
                <Suspense fallback={<LazyFallback />}>
                  <SimulatorPage theme={theme} />
                </Suspense>
              ) : activeSection === 'admin' ? (
                user?.isAdmin ? (
                  <Suspense fallback={<LazyFallback />}>
                    <AdminPanel />
                  </Suspense>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white/90 px-6 py-8 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 text-center">
                    <p className="text-slate-600 dark:text-slate-400">
                      Non hai i permessi per accedere a questa sezione.
                    </p>
                  </div>
                )
              ) : activeSection === 'home' ? (
                <HomePage onNavigate={(section) => setActiveSection(section)} />
              ) : activeSection === 'rendite' ? (
                <div className="space-y-6 sm:space-y-8 md:space-y-10">
                  <SectionHeader
                    eyebrow={sectionCopy.rendite.eyebrow}
                    title={sectionCopy.rendite.title}
                    description={sectionCopy.rendite.description}
                  />
                  <Suspense fallback={<LazyFallback />}>
                    <RenditePage funds={pensionFundsData} onFundClick={handleFundClick} alboIniziale={alboRendite} />
                  </Suspense>
                </div>
              ) : activeSection === 'ranking' ? (
                <div className="space-y-6 sm:space-y-8 md:space-y-10">
                  <SectionHeader
                    eyebrow={sectionCopy.ranking.eyebrow}
                    title={sectionCopy.ranking.title}
                    description={sectionCopy.ranking.description}
                  />
                  <Suspense fallback={<LazyFallback />}>
                    <RankingPage funds={pensionFundsData} onFundClick={handleFundClick} />
                  </Suspense>
                </div>
              ) : (
              <div className="space-y-6 sm:space-y-8 md:space-y-10">
                {/* Banner primo accesso per Confronta/Analizza */}
                {activeSection === 'choose-fund' && compareFundsTour.shouldShowBanner && (
                  <FirstVisitBanner
                    onStartTour={compareFundsTour.startTour}
                    onDismiss={compareFundsTour.dismissBanner}
                  />
                )}

                {/* Header Unificato */}
                <SectionHeader
                  eyebrow={sectionCopy[activeSection].eyebrow}
                  title={sectionCopy[activeSection].title}
                  description={sectionCopy[activeSection].description}
                  tourAction={
                    activeSection === 'choose-fund'
                      ? { label: 'Tour Guidato', onClick: compareFundsTour.startTour }
                      : undefined
                  }
                />

                {/* Contenuto sezione Confronta Fondi */}
                {activeSection === 'choose-fund' && (
                  <>
                    <GuidedFundComparator funds={pensionFundsData} onPresetSelected={handlePresetSelected} onFundClick={handleFundClick} theme={theme}>
                      <div className="space-y-6 sm:space-y-8 md:space-y-10">
                        <ScrollReveal variant="slideUp" duration={0.6} threshold={0.2}>
                          <section data-tour="visual-comparison" id="visual-comparison" className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white/90 px-3 py-4 sm:px-4 sm:py-5 md:px-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 min-w-0 overflow-hidden scroll-mt-20">
                        <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-200 tracking-tight">Visual Comparison</h2>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Andamento e costi dei fondi selezionati, sempre aggiornati.</p>
                          </div>
                          <AnimatedButton
                            onClick={() => setActiveSection('simulator')}
                            variant="primary"
                            size="sm"
                          >
                            Vai al Simulatore
                          </AnimatedButton>
                        </div>

                        <div className="mt-5">
                          <Suspense fallback={<LazyFallback />}>
                            <VisualComparison
                              appSelectedFunds={selectedFunds}
                              fundById={fundById}
                              theme={theme}
                            />
                          </Suspense>
                        </div>
                      </section>
                    </ScrollReveal>

                    {/* ── CTA: Simula i fondi selezionati ──────────────── */}
                    {selectedFundIds.length >= 2 && (
                      <ScrollReveal variant="slideUp" duration={0.5} threshold={0.2}>
                        <div className="rounded-2xl sm:rounded-3xl border-2 border-violet-300 dark:border-violet-700 bg-gradient-to-r from-violet-50 via-blue-50 to-violet-50 dark:from-violet-950/30 dark:via-blue-950/20 dark:to-violet-950/30 p-5 sm:p-6 shadow-md">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-xl">⚡</span>
                                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                                  Simula questi {selectedFundIds.length} fondi a confronto
                                </h3>
                              </div>
                              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Confronta scenari cliente a parità di parametri: stessi input, fondi diversi, risultati leggibili.
                              </p>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {selectedFunds.slice(0, 3).map((f) => (
                                  <span
                                    key={f.id}
                                    className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 truncate max-w-[180px]"
                                  >
                                    {f.pip} — {f.linea}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setSimulationFundIds(selectedFundIds.slice(0, 3));
                                setActiveSection('simulator');
                              }}
                              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105 active:scale-100 flex-shrink-0"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                              </svg>
                              Vai alla Simulazione
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </ScrollReveal>
                    )}

                    <div className="space-y-6 min-w-0" data-section="funds">
                      <ScrollReveal variant="slideUp" duration={0.6} delay={0.1} threshold={0.2}>
                        <div data-tour="filters">
                          <FilterControls
                          searchTerm={searchTerm}
                          setSearchTerm={setSearchTerm}
                          selectedCategory={selectedCategory}
                          setSelectedCategory={setSelectedCategory}
                          categories={categories}
                          selectedCompany={selectedCompany}
                          setSelectedCompany={setSelectedCompany}
                          companies={companies}
                          selectedType={selectedType}
                          setSelectedType={setSelectedType}
                          capitalGuaranteeFilter={capitalGuaranteeFilter}
                          setCapitalGuaranteeFilter={setCapitalGuaranteeFilter}
                          collectiveAgreementFilter={collectiveAgreementFilter}
                          setCollectiveAgreementFilter={setCollectiveAgreementFilter}
                          onReset={resetFilters}
                          totalFunds={pensionFundsData.length}
                        />
                        </div>
                      </ScrollReveal>

                      <ScrollReveal variant="fadeIn" duration={0.5} delay={0.15} threshold={0.2}>
                        <ActiveFiltersChips
                          searchTerm={searchTerm}
                          setSearchTerm={setSearchTerm}
                          selectedCategory={selectedCategory}
                          setSelectedCategory={setSelectedCategory}
                          selectedCompany={selectedCompany}
                          setSelectedCompany={setSelectedCompany}
                          selectedType={selectedType}
                          setSelectedType={setSelectedType}
                          capitalGuaranteeFilter={capitalGuaranteeFilter}
                          setCapitalGuaranteeFilter={setCapitalGuaranteeFilter}
                          collectiveAgreementFilter={collectiveAgreementFilter}
                          setCollectiveAgreementFilter={setCollectiveAgreementFilter}
                          onResetAll={resetFilters}
                        />
                      </ScrollReveal>

                      <ScrollReveal variant="slideUp" duration={0.6} delay={0.2} threshold={0.1}>
                        <section data-tour="fund-table" className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white/90 px-3 py-4 sm:px-4 sm:py-5 md:px-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 min-w-0 overflow-hidden">
                        <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-end mb-3 sm:mb-4">
                          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                            {filteredAndSortedFunds.length} {filteredAndSortedFunds.length === 1 ? 'fondo trovato' : 'fondi trovati'} — {selectedFundIds.length} {selectedFundIds.length === 1 ? 'selezionato' : 'selezionati'}
                          </p>
                        </div>
                        {showUpgradeNotice && (
                          <div className="mb-4 sm:mb-5 rounded-lg sm:rounded-xl border border-sky-200 bg-sky-50 p-3 sm:p-4 text-slate-700 shadow-sm dark:border-sky-700/70 dark:bg-slate-800/60 dark:text-slate-200">
                            <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">Piano free attivo</p>
                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
                                  Visualizzi i primi {FREE_PLAN_LIMIT} risultati. Passa al piano full access per esplorare l&apos;elenco completo dei fondi.
                                </p>
                              </div>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center w-full sm:w-auto">
                                {!user && (
                                  <AnimatedButton
                                    onClick={openLoginModal}
                                    variant="outline"
                                    size="sm"
                                    className="w-full sm:w-auto"
                                  >
                                    Accedi
                                  </AnimatedButton>
                                )}
                                <AnimatedButton
                                  onClick={() => setShowUpgradeDialog(true)}
                                  variant="primary"
                                  size="sm"
                                  className="w-full sm:w-auto"
                                >
                                  Scopri full access
                                </AnimatedButton>
                              </div>
                            </div>
                          </div>
                        )}
                        {selectionNotice && (
                          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                            {selectionNotice}
                          </div>
                        )}
                        <Suspense fallback={<LazyFallback />}>
                          <GuidedFundTable
                            funds={visibleFunds.slice((page - 1) * pageSize, page * pageSize)}
                            sortConfig={sortConfig}
                            setSortConfig={setSortConfig}
                            selectedFundIds={selectedFundIdsSet}
                            toggleFundSelection={toggleFundSelection}
                            onFundClick={handleFundClick}
                            maxSelectableFunds={MAX_SELECTED_FUNDS}
                          />
                        </Suspense>

                        <div className="mt-4 flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="order-2 sm:order-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 text-center sm:text-left">
                            Mostrati {Math.min(visibleFunds.length, page * pageSize) - (page - 1) * pageSize} di {visibleFunds.length}
                          </div>
                          <div className="order-1 sm:order-2 flex flex-wrap items-center gap-2 justify-center sm:justify-end">
                            <label className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">Per pagina</label>
                            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="min-h-9 min-w-[4.25rem] rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:text-sm">
                              <option value={5}>5</option>
                              <option value={10}>10</option>
                              <option value={20}>20</option>
                            </select>
                            <AnimatedButton 
                              disabled={page === 1} 
                              onClick={() => setPage(p => Math.max(1, p - 1))} 
                              variant="ghost"
                              size="sm"
                            >
                              Prev
                            </AnimatedButton>
                            <span className="text-xs sm:text-sm font-medium">{page}</span>
                            <AnimatedButton 
                              disabled={page * pageSize >= visibleFunds.length} 
                              onClick={() => setPage(p => p + 1)}
                              variant="ghost"
                              size="sm"
                            >
                              Next
                            </AnimatedButton>
                          </div>
                        </div>
                      </section>
                      </ScrollReveal>
                    </div>

                    <FundAnalysisPanel
                      funds={pensionFundsData}
                      selectedFund={analyzeFund}
                      setSelectedFund={setAnalyzeFund}
                    />
                  </div>
                </GuidedFundComparator>

                {/* Tour Guidato Confronta Fondi */}
                <GuidedTour
                  steps={compareFundsTourSteps}
                  isOpen={compareFundsTour.isOpen}
                  onClose={compareFundsTour.closeTour}
                  onComplete={compareFundsTour.completeTour}
                  storageKey="choose-fund"
                />
              </>
            )}

          </div>
          )}
            </PageTransition>
          </div>
        </main>

        {/* Floating Compare Button */}
        <FloatingCompareButton
          selectedCount={selectedFundIds.length}
          maxCount={10}
          onClick={() => {
            console.log('FloatingCompareButton clicked! Selected:', selectedFundIds.length); // Debug log
            
            // If we're in playbook section, switch to comparison view first
            if (activeSection === 'playbook') {
              setActiveSection('choose-fund');
              // Wait for the view to render, then scroll to Visual Comparison
              setTimeout(() => {
                const visualSection = document.getElementById('visual-comparison');
                console.log('Visual section found:', !!visualSection); // Debug
                if (visualSection) {
                  visualSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }, 400); // Increased timeout to ensure render
            } else {
              // We're already in comparison view, scroll directly to Visual Comparison
              const visualSection = document.getElementById('visual-comparison');
              console.log('Visual section found:', !!visualSection); // Debug
              if (visualSection) {
                visualSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } else {
                console.error('Visual comparison section not found!');
              }
            }
          }}
          show={activeSection !== 'playbook' && activeSection !== 'tfr-faq'}
          position="bottom-right"
        />
      </div>
      
      <Suspense fallback={null}>
        <FundDetailModal
          fund={modalFund}
          onClose={handleCloseModal}
          theme={theme}
          onApriRendite={(nAlbo) => {
            setAlboRendite(nAlbo);
            handleCloseModal();
            setActiveSection('rendite');
            window.scrollTo({ top: 0 });
          }}
        />
        <UpgradeDialog
          open={showUpgradeDialog}
          onClose={() => setShowUpgradeDialog(false)}
        />
        <LoginModal
          open={showLoginModal}
          onClose={closeLoginModal}
          onSuccess={() => {
            closeLoginModal();
            setShowUpgradeDialog(false);
            setActiveSection('home');
            setView('dashboard');
          }}
        />
        <FeedbackWidget onRequireLogin={openLoginModal} />
      </Suspense>
      <Footer sidebarCollapsed={sidebarCollapsed} hasSidebar={true} />
      
      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav activeSection={activeSection} onNavigate={setActiveSection} />
      
      <AccessStatusBanner
        visible={!isFullAccess && Boolean(user) && showFreeBanner && !authLoading}
        onClose={() => setShowFreeBanner(false)}
        onOpenUpgrade={() => setShowUpgradeDialog(true)}
        freePlanLimit={FREE_PLAN_LIMIT}
      />

      <DiscountBanner
        visible={!isFullAccess && Boolean(user) && !authLoading}
      />
      
      </div>
    </>
  );
};

const App: React.FC = () => (
  <GuidedComparatorProvider>
    <AppContent />
  </GuidedComparatorProvider>
);

export default App;
