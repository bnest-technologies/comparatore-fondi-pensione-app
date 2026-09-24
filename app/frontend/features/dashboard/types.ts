import React from 'react';

export type View = 'playbook' | 'dashboard';

export type DashboardSection =
  | 'home'
  | 'simulator'
  | 'choose-fund'
  | 'ranking'
  | 'rendite'
  | 'playbook'
  | 'tfr-faq'
  | 'admin';

export interface NavItem {
  id: DashboardSection | 'tools' | 'resources';
  label: string;
  icon: React.ReactNode;
  subItems?: { id: DashboardSection; label: string; description?: string }[];
}

export type SectionCopy = Record<
  DashboardSection,
  {
    title: string;
    description: string;
    eyebrow: string;
  }
>;
