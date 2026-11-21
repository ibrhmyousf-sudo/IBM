import { apiClient } from './client';
import type { ValueProposition, FinancialMetric, ScaleStat } from '../../types';

const FALLBACK_VALUE_PROPS: ValueProposition[] = [
  {
    id: 'PROP-01',
    titleKey: 'props.prop1Title',
    descKey: 'props.prop1Desc',
    icon: 'shield-check',
    testId: 'metrics-card-prop-01'
  },
  {
    id: 'PROP-02',
    titleKey: 'props.prop2Title',
    descKey: 'props.prop2Desc',
    icon: 'filter-funnel',
    testId: 'metrics-card-prop-02'
  },
  {
    id: 'PROP-03',
    titleKey: 'props.prop3Title',
    descKey: 'props.prop3Desc',
    icon: 'user-check',
    testId: 'metrics-card-prop-03'
  },
  {
    id: 'PROP-04',
    titleKey: 'props.prop4Title',
    descKey: 'props.prop4Desc',
    icon: 'trending-up',
    testId: 'metrics-card-prop-04'
  }
];

const FALLBACK_FINANCIALS: FinancialMetric[] = [
  // FY2025 — S1, IBM FY2025 Form 10-K
  {
    metricId: 'M-01',
    labelKey: 'financials.consultingRevenue',
    value: '$21.055B',
    margin: '28.1% Gross Margin',
    sourceTag: 'IBM OFFICIAL FACT',
    category: 'fy2025'
  },
  {
    metricId: 'M-02',
    labelKey: 'financials.grossProfit',
    value: '$5.921B',
    margin: '28.1% Gross Margin',
    sourceTag: 'IBM OFFICIAL FACT',
    category: 'fy2025'
  },
  {
    metricId: 'M-03',
    labelKey: 'financials.consultingProfit',
    value: '$2.464B',
    margin: '11.7% Segment Margin',
    sourceTag: 'IBM OFFICIAL FACT',
    category: 'fy2025'
  },
  // 9M 2026 & Q3 2025 -> Q3 2026 — S2, IBM Q3 2026 Form 10-Q
  {
    metricId: 'M-05',
    labelKey: 'financials.interimRevenue',
    value: '$15.934B',
    margin: '+1.5% vs. $15.706B (9M 2025)',
    sourceTag: 'IBM OFFICIAL FACT',
    category: 'interim2026'
  },
  {
    metricId: 'M-07',
    labelKey: 'financials.q3Revenue',
    value: '$5,335M',
    margin: '$5,324M -> $5,335M (+0.2%)',
    sourceTag: 'IBM OFFICIAL FACT',
    category: 'interim2026'
  },
  {
    metricId: 'M-08',
    labelKey: 'financials.q3Consulting',
    value: '12.2% Segment Margin',
    margin: '12.9% -> 12.2% (-0.6 pts IBM; Gross 29.3% -> 27.4%, -1.9 pts)',
    sourceTag: 'IBM OFFICIAL FACT',
    category: 'interim2026'
  }
];

const FALLBACK_SCALE_STATS: ScaleStat[] = [
  {
    id: 'scale-01',
    value: 'S1 (FY2025 10-K)',
    labelKey: 'financials.scaleCard1Title',
    source: 'IBM FY2025 Form 10-K (S1)',
    testId: 'metrics-stat-scale-01'
  },
  {
    id: 'scale-02',
    value: 'S2 (Q3 2026 10-Q)',
    labelKey: 'financials.scaleCard2Title',
    source: 'IBM Q3 2026 Form 10-Q (S2)',
    testId: 'metrics-stat-scale-02'
  },
  {
    id: 'scale-03',
    value: 'S3–S5 Scope',
    labelKey: 'financials.scaleCard3Title',
    source: 'S3 / S4 / S5 (9-Nov-2026 Proxy)',
    testId: 'metrics-stat-scale-03'
  }
];

export const metricsApi = {
  async getValuePropositions(): Promise<ValueProposition[]> {
    try {
      const response = await apiClient.get<ValueProposition[]>('/api/v1/metrics/executive');
      return response.data || FALLBACK_VALUE_PROPS;
    } catch {
      return FALLBACK_VALUE_PROPS;
    }
  },

  async getFinancialMetrics(category?: 'fy2025' | 'interim2026'): Promise<FinancialMetric[]> {
    try {
      const response = await apiClient.get<FinancialMetric[]>('/api/v1/metrics/financials');
      const all = response.data || FALLBACK_FINANCIALS;
      return category ? all.filter(m => m.category === category) : all;
    } catch {
      return category ? FALLBACK_FINANCIALS.filter(m => m.category === category) : FALLBACK_FINANCIALS;
    }
  },

  async getScaleStats(): Promise<ScaleStat[]> {
    return FALLBACK_SCALE_STATS;
  }
};
