import React from 'react';
import { useI18n } from '../../context/I18nContext';
import { AppCard } from '../../components/AppCard';
import { AiBoundaryCallout } from '../workflow/components/AiBoundaryCallout';

export const TrustPage: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="py-12 space-y-12" data-testid="trust-page">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold mb-2 border border-[var(--color-primary)]/30">
          <span className="pulse-active-dot" />
          <span>Governance & Human Oversight</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight">
          {t('trust.pageTitle')}
        </h1>
        <p className="text-base text-text-secondary">
          {t('trust.pageSubtitle')}
        </p>
      </div>

      <AiBoundaryCallout />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        <AppCard
          variant="default"
          padding="lg"
          data-testid="trust-card-audit"
          className="glass-card border border-[var(--glass-border)] shadow-md"
        >
          <div className="p-3.5 bg-[var(--color-primary-light)]/60 w-fit rounded-2xl text-[var(--color-primary)] mb-4 shadow-xs">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-text-primary mb-2">
            {t('trust.card1Title')}
          </h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            {t('trust.card1Desc')}
          </p>
        </AppCard>

        <AppCard
          variant="default"
          padding="lg"
          data-testid="trust-card-privacy"
          className="glass-card border border-[var(--glass-border)] shadow-md"
        >
          <div className="p-3.5 bg-emerald-500/15 w-fit rounded-2xl text-emerald-600 dark:text-emerald-400 mb-4 shadow-xs">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-text-primary mb-2">
            {t('trust.card2Title')}
          </h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            {t('trust.card2Desc')}
          </p>
        </AppCard>
      </div>

      <div className="max-w-5xl mx-auto p-6 rounded-2xl glass-panel border border-[var(--glass-border)] shadow-md">
        <h4 className="font-bold text-sm text-[var(--color-primary)] uppercase tracking-wider mb-2">
          {t('governance.disclaimerHeading')}
        </h4>
        <p className="text-sm text-text-secondary leading-relaxed font-medium">
          {t('governance.disclaimerText')}
        </p>
      </div>
    </div>
  );
};
