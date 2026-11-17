import React, { useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { AppBadge } from '../../../components/AppBadge';
import type { FinancialMetric } from '../../../types';

export interface FinancialsTableProps {
  metrics: FinancialMetric[];
}

export const FinancialsTable: React.FC<FinancialsTableProps> = ({ metrics }) => {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<'fy2025' | 'interim2026'>('fy2025');

  const filteredMetrics = metrics.filter(m => m.category === activeCategory);

  return (
    <section className="financials-section py-12 md:py-16 border-t border-border" aria-labelledby="fin-heading">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h2 id="fin-heading" className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            {t('financials.sectionTitle')}
          </h2>
          <p className="text-base text-text-secondary mt-2">
            {t('financials.sectionSubtitle')}
          </p>
        </div>

        {/* Category Toggle Buttons */}
        <div className="inline-flex p-1 bg-surface-muted rounded-xl border border-border" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'fy2025'}
            data-testid="metrics-toggle-fy2025"
            onClick={() => setActiveCategory('fy2025')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeCategory === 'fy2025'
                ? 'bg-surface text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t('financials.toggleFY2025')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'interim2026'}
            data-testid="metrics-toggle-interim2026"
            onClick={() => setActiveCategory('interim2026')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeCategory === 'interim2026'
                ? 'bg-surface text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t('financials.toggleInterim')}
          </button>
        </div>
      </div>

      {/* Financials Table */}
      <div className="overflow-x-auto rounded-xl border border-border shadow-xs bg-surface">
        <table className="w-full text-start text-sm" data-testid="metrics-table-financials">
          <thead className="bg-surface-muted text-text-secondary font-semibold border-b border-border">
            <tr>
              <th scope="col" className="py-3.5 px-4 text-start font-semibold">
                {t('financials.metricCol')}
              </th>
              <th scope="col" className="py-3.5 px-4 text-start font-semibold">
                {t('financials.valueCol')}
              </th>
              <th scope="col" className="py-3.5 px-4 text-start font-semibold">
                {t('financials.marginCol')}
              </th>
              <th scope="col" className="py-3.5 px-4 text-start font-semibold">
                {t('financials.provenanceCol')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredMetrics.map(item => (
              <tr
                key={item.metricId}
                data-testid={`metrics-row-${item.metricId}`}
                className="hover:bg-surface-muted/50 transition-colors"
              >
                <td className="py-4 px-4 font-medium text-text-primary">
                  {t(item.labelKey)}
                </td>
                <td className="py-4 px-4 font-mono font-bold text-text-primary text-base">
                  {item.value}
                </td>
                <td className="py-4 px-4 font-mono text-text-secondary">
                  {item.margin || '-'}
                </td>
                <td className="py-4 px-4">
                  <AppBadge
                    variant="green"
                    size="sm"
                    data-testid={`metrics-badge-${item.metricId}`}
                  >
                    {t('financials.secTag')}
                  </AppBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

