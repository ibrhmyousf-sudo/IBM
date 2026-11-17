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
        <h1 className="text-3xl sm:text-4xl font-extrabold text-text-primary">
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
          className="border border-border bg-surface flex flex-col justify-between"
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
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mb-4">
              {t('pricing.phase1Period')}
            </div>
            <ul className="text-xs text-text-secondary space-y-2 mb-6">
              <li>{t('pricing.phase1Item1')}</li>
              <li>{t('pricing.phase1Item2')}</li>
              <li>{t('pricing.phase1Item3')}</li>
            </ul>
          </div>
          <AppButton
            variant="outline"
            size="md"
            data-testid="pricing-btn-diagnostic"
            onClick={onOpenPilotModal}
            className="w-full"
          >
            {t('nav.cta')}
          </AppButton>
        </AppCard>

        {/* Phase 2 */}
        <AppCard
          variant="highlight"
          padding="lg"
          data-testid="pricing-card-pilot"
          className="border-2 border-blue-500 bg-surface shadow-lg flex flex-col justify-between relative"
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold py-1 px-3 rounded-full">
            {t('pricing.phase2Badge')}
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">
              {t('pricing.phase2Tag')}
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">
              {t('pricing.phase2Title')}
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              {t('pricing.phase2Desc')}
            </p>
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mb-4">
              {t('pricing.phase2Period')}
            </div>
            <ul className="text-xs text-text-secondary space-y-2 mb-6">
              <li>{t('pricing.phase2Item1')}</li>
              <li>{t('pricing.phase2Item2')}</li>
              <li>{t('pricing.phase2Item3')}</li>
            </ul>
          </div>
          <AppButton
            variant="primary"
            size="md"
            data-testid="pricing-btn-pilot"
            onClick={onOpenPilotModal}
            className="w-full"
          >
            {t('nav.cta')}
          </AppButton>
        </AppCard>

        {/* Phase 3 */}
        <AppCard
          variant="default"
          padding="lg"
          data-testid="pricing-card-scale"
          className="border border-border bg-surface flex flex-col justify-between"
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
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mb-4">
              {t('pricing.phase3Period')}
            </div>
            <ul className="text-xs text-text-secondary space-y-2 mb-6">
              <li>{t('pricing.phase3Item1')}</li>
              <li>{t('pricing.phase3Item2')}</li>
              <li>{t('pricing.phase3Item3')}</li>
            </ul>
          </div>
          <AppButton
            variant="outline"
            size="md"
            data-testid="pricing-btn-scale"
            onClick={onOpenPilotModal}
            className="w-full"
          >
            {t('nav.cta')}
          </AppButton>
        </AppCard>
      </div>
    </div>
  );
};
