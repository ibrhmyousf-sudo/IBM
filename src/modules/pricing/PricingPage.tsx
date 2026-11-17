import React from 'react';
import { useI18n } from '../../context/I18nContext';
import { AppCard } from '../../components/AppCard';
import { AppButton } from '../../components/AppButton';

export interface PricingPageProps {
  onOpenPilotModal: () => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onOpenPilotModal }) => {
  const { t } = useI18n();

  return (
    <div className="py-12 space-y-12" data-testid="pricing-page">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold mb-2 border border-[var(--color-primary)]/30">
          <span className="pulse-active-dot" />
          <span>Structured Pilot Deployment</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight">
          {t('pricing.pageTitle')}
        </h1>
        <p className="text-base text-text-secondary">
          {t('pricing.pageSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {/* Phase 1 */}
        <AppCard
          variant="default"
          padding="lg"
          data-testid="pricing-card-diagnostic"
          className="glass-card border border-[var(--glass-border)] shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
              {t('pricing.phase1Tag')}
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">
              {t('pricing.phase1Title')}
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              {t('pricing.phase1Desc')}
            </p>
            <div className="text-2xl font-black data-highlight-num mb-4">
              {t('pricing.phase1Period')}
            </div>
            <ul className="text-xs text-text-secondary space-y-2.5 mb-6">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                <span>{t('pricing.phase1Item1')}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                <span>{t('pricing.phase1Item2')}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                <span>{t('pricing.phase1Item3')}</span>
              </li>
            </ul>
          </div>
          <AppButton
            variant="outline"
            size="md"
            data-testid="pricing-btn-diagnostic"
            onClick={onOpenPilotModal}
            className="w-full glass-panel hover:border-[var(--color-primary)]"
          >
            {t('nav.cta')}
          </AppButton>
        </AppCard>

        {/* Phase 2 (Recommended Highlight) */}
        <AppCard
          variant="highlight"
          padding="lg"
          data-testid="pricing-card-pilot"
          className="glass-card border-2 border-[var(--color-primary)] shadow-2xl flex flex-col justify-between relative transform md:-translate-y-2"
        >
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-hover)] text-white text-xs font-black py-1 px-4 rounded-full shadow-md shadow-[var(--color-primary-glow)] border border-white/20 uppercase tracking-wider">
            {t('pricing.phase2Badge')}
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary)] mb-2 mt-1">
              {t('pricing.phase2Tag')}
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">
              {t('pricing.phase2Title')}
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              {t('pricing.phase2Desc')}
            </p>
            <div className="text-3xl font-black data-highlight-num mb-4">
              {t('pricing.phase2Period')}
            </div>
            <ul className="text-xs text-text-secondary space-y-2.5 mb-6">
              <li className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span>{t('pricing.phase2Item1')}</span>
              </li>
              <li className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span>{t('pricing.phase2Item2')}</span>
              </li>
              <li className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span>{t('pricing.phase2Item3')}</span>
              </li>
            </ul>
          </div>
          <AppButton
            variant="primary"
            size="md"
            data-testid="pricing-btn-pilot"
            onClick={onOpenPilotModal}
            className="w-full shadow-lg shadow-[var(--color-primary-glow)]"
          >
            {t('nav.cta')}
          </AppButton>
        </AppCard>

        {/* Phase 3 */}
        <AppCard
          variant="default"
          padding="lg"
          data-testid="pricing-card-scale"
          className="glass-card border border-[var(--glass-border)] shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
              {t('pricing.phase3Tag')}
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">
              {t('pricing.phase3Title')}
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              {t('pricing.phase3Desc')}
            </p>
            <div className="text-2xl font-black data-highlight-num mb-4">
              {t('pricing.phase3Period')}
            </div>
            <ul className="text-xs text-text-secondary space-y-2.5 mb-6">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                <span>{t('pricing.phase3Item1')}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                <span>{t('pricing.phase3Item2')}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                <span>{t('pricing.phase3Item3')}</span>
              </li>
            </ul>
          </div>
          <AppButton
            variant="outline"
            size="md"
            data-testid="pricing-btn-scale"
            onClick={onOpenPilotModal}
            className="w-full glass-panel hover:border-[var(--color-primary)]"
          >
            {t('nav.cta')}
          </AppButton>
        </AppCard>
      </div>
    </div>
  );
};
