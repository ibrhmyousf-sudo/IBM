import React from 'react';
import { useI18n } from '../../../context/I18nContext';
import { AppCard } from '../../../components/AppCard';
import { AppBadge } from '../../../components/AppBadge';
import type { ScaleStat } from '../../../types';

export interface CorporateScaleCardsProps {
  stats: ScaleStat[];
}

export const CorporateScaleCards: React.FC<CorporateScaleCardsProps> = ({ stats }) => {
  const { t } = useI18n();

  return (
    <section className="scale-section py-12 border-t border-border" aria-labelledby="scale-heading">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <h2 id="scale-heading" className="text-xl sm:text-2xl font-bold text-text-primary">
          {t('scale.sectionTitle')}
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          {t('scale.sectionSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map(stat => (
          <AppCard
            key={stat.id}
            data-testid={stat.testId}
            variant="default"
            padding="lg"
            className="flex flex-col justify-between border border-border bg-surface text-center hover:border-blue-500 transition-colors"
          >
            <div>
              <div className="text-3xl sm:text-4xl font-black text-blue-600 dark:text-blue-400 mb-2">
                {stat.value}
              </div>
              <h3 className="text-base font-bold text-text-primary mb-2">
                {t(stat.labelKey)}
              </h3>
            </div>
            <div className="mt-4 pt-4 border-t border-border flex justify-center">
              <AppBadge variant="blue" size="sm" data-testid={`badge-${stat.id}`}>
                {stat.source}
              </AppBadge>
            </div>
          </AppCard>
        ))}
      </div>
    </section>
  );
};
