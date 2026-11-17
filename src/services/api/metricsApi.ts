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
  // FY 2025 Full-Year (SEC Form 10-K)
  {
    metricId: 'M-01',
    labelKey: 'financials.revenue',
    value: '$67,535M',
    margin: '-',
    sourceTag: 'SEC-VERIFIED FACT',
    category: 'fy2025'
  },
  {
    metricId: 'M-02',
    labelKey: 'financials.grossProfit',
    value: '$39,297M',
    margin: '58.2%',
    sourceTag: 'SEC-VERIFIED FACT',
    category: 'fy2025'
  },
  {
    metricId: 'M-03',
    labelKey: 'financials.consultingRevenue',
    value: '$21,055M',
    margin: '28.1%',
    sourceTag: 'SEC-VERIFIED FACT',
    category: 'fy2025'
  },
  {
    metricId: 'M-04',
    labelKey: 'financials.consultingProfit',
    value: '$2,464M',
    margin: '11.7%',
    sourceTag: 'SEC-VERIFIED FACT',
    category: 'fy2025'
  },
  // Interim 9M 2026 (SEC Form 10-Q)
  {
    metricId: 'M-05',
    labelKey: 'financials.interimRevenue',
    value: '$50,182M',
    margin: '-',
    sourceTag: 'SEC-VERIFIED FACT',
    category: 'interim2026'
  },
  {
    metricId: 'M-06',
    labelKey: 'financials.interimConsulting',
    value: '$15,934M',
    margin: '27.9%',
    sourceTag: 'SEC-VERIFIED FACT',
    category: 'interim2026'
  },
  {
    metricId: 'M-07',
    labelKey: 'financials.q3Revenue',
    value: '$17,103M',
    margin: '-',
    sourceTag: 'SEC-VERIFIED FACT',
    category: 'interim2026'
  },
  {
    metricId: 'M-08',
    labelKey: 'financials.q3Consulting',
    value: '$5,335M',
    margin: '27.4%',
    sourceTag: 'SEC-VERIFIED FACT',
    category: 'interim2026'
  }
];

const FALLBACK_SCALE_STATS: ScaleStat[] = [
  {
    id: 'scale-01',
    value: '175+',
    labelKey: 'financials.scaleCard1Title',
    source: 'IBM Corporate 10-K',
    testId: 'metrics-stat-scale-01'
  },
  {
    id: 'scale-02',
    value: '150,000+',
    labelKey: 'financials.scaleCard2Title',
    source: 'IBM Consulting Factsheet',
    testId: 'metrics-stat-scale-02'
  },
  {
    id: 'scale-03',
    value: 'Advantage AI',
    labelKey: 'financials.scaleCard3Title',
    source: 'IBM Official Fact',
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

