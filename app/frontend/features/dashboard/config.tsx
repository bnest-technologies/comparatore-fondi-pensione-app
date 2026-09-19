import React from 'react';
import { DashboardSection, NavItem, SectionCopy } from './types';

const HomeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
);

const ToolsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
  </svg>
);

const ResourcesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

const AdminIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

export const SECTION_COPY: SectionCopy = {
  home: {
    title: 'Benvenuto',
    description: 'Workspace operativo per analisi previdenziali, confronto fondi e simulazioni cliente.',
    eyebrow: 'Home',
  },
  simulator: {
    title: 'Simulatore Previdenziale',
    description: 'Simula scenari previdenziali per il cliente usando contributi, TFR, fiscalità e rendimenti storici.',
    eyebrow: 'Simula',
  },
  'choose-fund': {
    title: 'Confronta Fondi Pensione',
    description: 'Filtra il mercato, costruisci shortlist e confronta fondi con evidenze utili alla consulenza.',
    eyebrow: 'Confronta',
  },
  ranking: {
    title: 'Ranking Fondi',
    description: 'Consulta le classifiche per rendimento, ISC e costi sui dati comparabili disponibili.',
    eyebrow: 'Ranking',
  },
  playbook: {
    title: 'Guida Previdenziale',
    description: 'Approfondisci tutto sulla previdenza complementare, TFR e fondi pensione con guide complete e sempre aggiornate.',
    eyebrow: 'Guida',
  },
  'tfr-faq': {
    title: 'Domande frequenti su TFR e rendite',
    description: 'Risposte rapide su TFR e rendita: basi, scelte, tipi di rendita, tassazione e come leggere i documenti dei fondi.',
    eyebrow: 'FAQ',
  },
  admin: {
    title: 'Pannello Amministrazione',
    description: 'Gestisci utenti, richieste di accesso e feedback degli utenti.',
    eyebrow: 'Admin',
  },
};

export const buildNavItems = (isAdmin: boolean): NavItem[] => {
  const baseItems: NavItem[] = [
    {
      id: 'home',
      label: 'Home',
      icon: <HomeIcon />,
    },
    {
      id: 'tools',
      label: 'Strumenti',
      icon: <ToolsIcon />,
      subItems: [
        { id: 'simulator', label: 'Simulatore', description: 'Proietta scenari cliente' },
        { id: 'choose-fund', label: 'Confronta Fondi', description: 'Analizza fondi e alternative' },
        { id: 'ranking', label: 'Ranking', description: 'Classifiche per rendimento e costi' },
      ],
    },
    {
      id: 'resources',
      label: 'Risorse',
      icon: <ResourcesIcon />,
      subItems: [
        { id: 'playbook', label: 'Guida Completa', description: 'Tutto sulla previdenza' },
        { id: 'tfr-faq', label: 'FAQ TFR e rendite', description: 'Domande frequenti' },
      ],
    },
  ];

  if (!isAdmin) {
    return baseItems;
  }

  return [
    ...baseItems,
    {
      id: 'admin' as DashboardSection,
      label: '👑 Admin',
      icon: <AdminIcon />,
    },
  ];
};
