import React from 'react';
import { useI18n } from '../../../context/I18nContext';
import { AppButton } from '../../../components/AppButton';
import { AppBadge } from '../../../components/AppBadge';

export interface HeroSectionProps {
  onOpenPilotModal: () => void;
  onExploreWorkflow: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onOpenPilotModal,
  onExploreWorkflow
}) => {
  const { t } = useI18n();

  return (
    <section className="hero-section py-12 md:py-20 border-b border-border" aria-labelledby="hero-title">
      <div className="max-w-4xl mx-auto text-center space-y-6">
        {/* Architecture Badge */}
        <div className="flex justify-center">
          <AppBadge variant="purple" size="md" data-testid="metrics-badge-architecture">
            {t('hero.badge')}
          </AppBadge>
        </div>

        {/* Main Headline */}
        <h1
          id="hero-title"
          data-testid="metrics-hero-headline"
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-text-primary tracking-tight leading-tight"
        >
          {t('hero.headline')}
        </h1>

        {/* Supporting Copy */}
        <p
          data-testid="metrics-hero-subheadline"
          className="text-lg sm:text-xl text-text-secondary max-w-3xl mx-auto leading-relaxed"
        >
          {t('hero.subheadline')}
        </p>

        {/* Action Buttons */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
          <AppButton
            variant="primary"
            size="lg"
            data-testid="metrics-hero-cta"
            onClick={onOpenPilotModal}
            className="w-full sm:w-auto shadow-md hover:shadow-lg transition-transform hover:-translate-y-0.5"
          >
            {t('hero.ctaPrimary')}
          </AppButton>

          <AppButton
            variant="outline"
            size="lg"
            data-testid="metrics-hero-secondary-cta"
            onClick={onExploreWorkflow}
            className="w-full sm:w-auto"
          >
            {t('hero.ctaSecondary')}
          </AppButton>
        </div>

        {/* Quick Highlights Ribbon */}
        <div className="pt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center border-t border-border/60">
          <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
            <div className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400">
              {t('hero.statCountries')}
            </div>
            <div className="text-xs font-medium text-text-secondary mt-1">
              {t('hero.stat1Sub')}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
            <div className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400">
              {t('hero.statConsultants')}
            </div>
            <div className="text-xs font-medium text-text-secondary mt-1">
              {t('hero.stat2Sub')}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface border border-border shadow-xs">
            <div className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400">
              {t('hero.statPlatform')}
            </div>
            <div className="text-xs font-medium text-text-secondary mt-1">
              {t('hero.stat3Sub')}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
