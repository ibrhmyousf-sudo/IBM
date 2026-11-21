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
  const summaryCards = activeCategory === 'fy2025'
    ? [
        { label: 'IBM Consulting Revenue', value: '$21.055B', sub: 'FY2025 — IBM FY2025 Form 10-K', badge: 'S1' },
        { label: 'IBM Consulting Gross Profit', value: '$5.921B', sub: '28.1% Gross Margin (FY2025)', badge: 'S1' },
        { label: 'IBM Consulting Segment Profit', value: '$2.464B', sub: '11.7% Segment Margin (FY2025)', badge: 'S1' },
        { label: 'Pilot Scope & Model Fee', value: '$15,000', sub: '6 wks · 8 docs · 5 outputs (modeled)', badge: 'D3' }
      ]
    : [
        { label: 'Consulting Revenue (9M 2026)', value: '$15.934B', sub: '+1.5% vs. $15.706B (9M 2025)', badge: 'S2' },
        { label: 'Consulting Revenue (Q3 2025 -> Q3 2026)', value: '$5,335M', sub: '$5,324M -> $5,335M (+0.2%)', badge: 'S2' },
        { label: 'Consulting Segment Margin (Q3 2025 -> Q3 2026)', value: '12.2%', sub: '12.9% -> 12.2% (-0.6 pts IBM)', badge: 'S2' },
        { label: 'Historical Platform Proxy', value: '$567/mo', sub: '9-Nov-2026 capture · $6,804/yr · $20,412 3-yr', badge: 'S5' }
      ];

  return (
    <section className="financials-section py-12 md:py-16 border-t border-[var(--color-border)]" aria-labelledby="fin-heading">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="pulse-active-dot" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
              IBM Consulting Filings (S1–S2)
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
                    {activeCategory === 'fy2025' ? t('financials.secTag') : t('financials.ibmTag')}
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
