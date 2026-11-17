import React from 'react';
import { useI18n } from '../../../context/I18nContext';
import { AppCard } from '../../../components/AppCard';
import { AppBadge } from '../../../components/AppBadge';
import type { PilotDeliverable } from '../../../types';

export interface DeliverablesGridProps {
  deliverables: PilotDeliverable[];
}

export const DeliverablesGrid: React.FC<DeliverablesGridProps> = ({ deliverables }) => {
  const { t } = useI18n();

  return (
    <section className="deliverables-section py-12 border-t border-[var(--color-border)]" aria-labelledby="deliv-heading">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <h2 id="deliv-heading" className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
          {t('deliverables.sectionTitle')}
        </h2>
        <p className="text-base text-text-secondary mt-2">
          {t('deliverables.sectionSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {deliverables.map(deliv => (
          <AppCard
            key={deliv.id}
            data-testid={deliv.testId}
            variant="default"
            padding="lg"
            className="glass-card flex flex-col justify-between border border-[var(--glass-border)] shadow-md"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <AppBadge variant="amber" size="sm" data-testid={`badge-week-${deliv.id}`}>
                  {t('deliverables.weekLabel')} {deliv.deliveryWeek}
                </AppBadge>
                <span className="text-xs font-mono font-bold text-text-muted">{deliv.id}</span>
              </div>

              <h3 className="text-lg font-bold text-text-primary mb-2">
                {t(deliv.titleKey)}
              </h3>

              <p className="text-sm text-text-secondary leading-relaxed">
                {t(deliv.descKey)}
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--color-border)]/60 flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                {t('workflowCommon.provenanceLabel')}
              </span>
              <AppBadge variant="gray" size="sm" data-testid={`badge-prov-${deliv.id}`}>
                {t('deliverables.provenanceBadge')}
              </AppBadge>
            </div>
          </AppCard>
        ))}
      </div>
    </section>
  );
};
