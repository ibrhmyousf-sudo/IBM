import React, { useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { AppBadge } from '../../../components/AppBadge';
import { AppCard } from '../../../components/AppCard';
import type { FinancialMetric } from '../../../types';

export interface FinancialsTableProps {
  metrics: FinancialMetric[];
}

export const FinancialsTable: React.FC<FinancialsTableProps> = ({ metrics }) => {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<'fy2025' | 'interim2026'>('fy2025');

  const filteredMetrics = metrics.filter(m => m.category === activeCategory);

  // Active Key Performance Indicators for highlighted summary
  const summaryCards = [
    {
      label: 'IBM Total Revenue',
      value: activeCategory === 'fy2025' ? '$67,535M' : '$50,182M',
      sub: activeCategory === 'fy2025' ? 'FY2025 Audited' : '9M 2026 Interim',
      badge: 'SEC 10-K'
    },
    {
      label: 'Consulting Revenue',
      value: activeCategory === 'fy2025' ? '$21,055M' : '$15,934M',
      sub: activeCategory === 'fy2025' ? '31.2% Total Share' : '31.8% Total Share',
      badge: 'Core Focus'
    },
    {
      label: 'Consulting Gross Margin',
      value: activeCategory === 'fy2025' ? '28.1%' : '27.9%',
      sub: activeCategory === 'fy2025' ? 'Segment Gross Profit $5,921M' : 'Segment Gross Profit $4,450M',
      badge: 'Profitability'
    },
    {
      label: 'Segment Profit Margin',
      value: '11.7%',
      sub: activeCategory === 'fy2025' ? 'Profit $2,464M' : 'Profit $1,858M',
      badge: 'Stable'
    }
  ];

  return (
    <section className="financials-section py-12 md:py-16 border-t border-[var(--color-border)]" aria-labelledby="fin-heading">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="pulse-active-dot" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
              Official SEC Form 10-K Evidence Set
            </span>
          </div>
          <h2 id="fin-heading" className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            {t('financials.sectionTitle')}
          </h2>
          <p className="text-base text-text-secondary mt-1">
            {t('financials.sectionSubtitle')}
          </p>
        </div>

        {/* Category Toggle Buttons */}
        <div className="inline-flex p-1.5 bg-[var(--glass-bg)] backdrop-blur-xl rounded-2xl border border-[var(--glass-border)] shadow-xs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'fy2025'}
            data-testid="metrics-toggle-fy2025"
            onClick={() => setActiveCategory('fy2025')}
            className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${
              activeCategory === 'fy2025'
                ? 'bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-hover)] text-white shadow-md shadow-[var(--color-primary-glow)]'
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
            className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${
              activeCategory === 'interim2026'
                ? 'bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-hover)] text-white shadow-md shadow-[var(--color-primary-glow)]'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t('financials.toggleInterim')}
          </button>
        </div>
      </div>

      {/* Active Data KPI Summary Cards (Glassy) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {summaryCards.map((card, idx) => (
          <AppCard
            key={idx}
            variant="default"
            padding="md"
            data-testid={`kpi-summary-card-${idx}`}
            className="glass-card flex flex-col justify-between border border-[var(--glass-border)] relative overflow-hidden"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-text-secondary">{card.label}</span>
              <AppBadge variant="amber" size="sm" data-testid={`kpi-badge-${idx}`}>
                {card.badge}
              </AppBadge>
            </div>
            <div className="text-2xl sm:text-3xl font-black data-highlight-num tracking-tight">
              {card.value}
            </div>
            <div className="text-xs text-text-muted mt-1.5 flex items-center gap-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              <span>{card.sub}</span>
            </div>
          </AppCard>
        ))}
      </div>

      {/* Financials Table (Glassy) */}
      <div className="overflow-x-auto rounded-2xl border border-[var(--glass-border)] shadow-md bg-[var(--glass-bg)] backdrop-blur-xl">
        <table className="w-full text-start text-sm" data-testid="metrics-table-financials">
          <thead className="bg-[var(--color-surface-muted)]/60 text-text-secondary font-semibold border-b border-[var(--color-border)]">
            <tr>
              <th scope="col" className="py-4 px-5 text-start font-bold">
                {t('financials.metricCol')}
              </th>
              <th scope="col" className="py-4 px-5 text-start font-bold">
                {t('financials.valueCol')}
              </th>
              <th scope="col" className="py-4 px-5 text-start font-bold">
                {t('financials.marginCol')}
              </th>
              <th scope="col" className="py-4 px-5 text-start font-bold">
                {t('financials.provenanceCol')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {filteredMetrics.map(item => (
              <tr
                key={item.metricId}
                data-testid={`metrics-row-${item.metricId}`}
                className="hover:bg-[var(--color-primary-light)]/40 transition-colors group"
              >
                <td className="py-4 px-5 font-medium text-text-primary group-hover:text-[var(--color-primary)] transition-colors">
                  {t(item.labelKey)}
                </td>
                <td className="py-4 px-5 font-mono font-black text-base text-text-primary group-hover:text-[var(--color-primary)]">
                  {item.value}
                </td>
                <td className="py-4 px-5 font-mono font-semibold text-text-secondary">
                  {item.margin || '-'}
                </td>
                <td className="py-4 px-5">
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
