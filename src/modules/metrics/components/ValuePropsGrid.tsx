import React from 'react';
import { useI18n } from '../../../context/I18nContext';
import { AppCard } from '../../../components/AppCard';
import type { ValueProposition } from '../../../types';

export interface ValuePropsGridProps {
  propsList: ValueProposition[];
}

export const ValuePropsGrid: React.FC<ValuePropsGridProps> = ({ propsList }) => {
  const { t } = useI18n();

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'shield-check':
        return (
          <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        );
      case 'filter-funnel':
        return (
          <svg className="w-8 h-8 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        );
      case 'user-check':
        return (
          <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      case 'trending-up':
      default:
        return (
          <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        );
    }
  };

  return (
    <section className="value-props-section py-12 md:py-16" aria-labelledby="props-heading">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <h2 id="props-heading" className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
          {t('props.sectionTitle')}
        </h2>
        <p className="text-base text-text-secondary mt-3">
          {t('props.sectionSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {propsList.map(prop => (
          <AppCard
            key={prop.id}
            data-testid={prop.testId}
            variant="default"
            padding="lg"
            className="flex flex-col justify-between hover:shadow-md transition-shadow group border border-border bg-surface"
          >
            <div>
              <div className="p-3 bg-surface-muted rounded-xl w-fit mb-4 group-hover:scale-105 transition-transform">
                {getIcon(prop.icon)}
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                {t(prop.titleKey)}
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                {t(prop.descKey)}
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-border/50 text-xs font-semibold text-blue-600 dark:text-blue-400">
              {prop.id} • {t('props.pillarLabel')}
            </div>
          </AppCard>
        ))}
      </div>
    </section>
  );
};
