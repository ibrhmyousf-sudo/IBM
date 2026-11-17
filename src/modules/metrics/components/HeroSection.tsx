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
    <section className="hero-section py-12 md:py-20 border-b border-[var(--color-border)] relative overflow-hidden" aria-labelledby="hero-title">
      {/* Decorative ambient background blur orbs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[var(--color-primary)]/10 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-4xl mx-auto text-center space-y-6">
        {/* Architecture Badge */}
        <div className="flex justify-center">
          <AppBadge variant="amber" size="md" data-testid="metrics-badge-architecture" className="shadow-xs">
            <span className="pulse-active-dot mr-2" />
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
            className="w-full sm:w-auto shadow-lg hover:shadow-xl transition-all"
          >
            {t('hero.ctaPrimary')}
          </AppButton>

          <AppButton
            variant="secondary"
            size="lg"
            data-testid="metrics-hero-secondary-cta"
            onClick={onExploreWorkflow}
            className="w-full sm:w-auto glass-panel hover:border-[var(--color-primary)]"
          >
            {t('hero.ctaSecondary')}
          </AppButton>
        </div>

        {/* Quick Highlights Ribbon (Glassy Cards) */}
        <div className="pt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center border-t border-[var(--color-border)]/60">
          <div className="p-5 rounded-2xl glass-card border border-[var(--glass-border)] shadow-md">
            <div className="text-3xl sm:text-4xl font-black data-highlight-num">
              {t('hero.statCountries')}
            </div>
            <div className="text-xs font-semibold text-text-secondary mt-1.5">
              {t('hero.stat1Sub')}
            </div>
          </div>
          <div className="p-5 rounded-2xl glass-card border border-[var(--glass-border)] shadow-md">
            <div className="text-3xl sm:text-4xl font-black data-highlight-num">
              {t('hero.statConsultants')}
            </div>
            <div className="text-xs font-semibold text-text-secondary mt-1.5">
              {t('hero.stat2Sub')}
            </div>
          </div>
          <div className="p-5 rounded-2xl glass-card border border-[var(--glass-border)] shadow-md">
            <div className="text-3xl sm:text-4xl font-black data-highlight-num">
              {t('hero.statPlatform')}
            </div>
            <div className="text-xs font-semibold text-text-secondary mt-1.5">
              {t('hero.stat3Sub')}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
