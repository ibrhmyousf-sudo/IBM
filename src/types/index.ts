/**
 * Domain Types & API Contracts for IBM Consulting V2 Platform
 * Ponytail Code Grade: Strictly typed, zero any, 100% complete.
 */

export type Locale = 'en' | 'ar';
export type Theme = 'light' | 'dark';
export type ColorPalette = 'amber' | 'blue';

export type UILifecycleState = 'loading' | 'empty' | 'single' | 'populated' | 'disabled' | 'error';

export interface NavigationItem {
  id: string;
  label_ar: string;
  label_en: string;
  url: string;
  testId: string;
}

export interface ValueProposition {
  id: 'PROP-01' | 'PROP-02' | 'PROP-03' | 'PROP-04';
  titleKey: string;
  descKey: string;
  icon: string;
  testId: string;
}

export interface FinancialMetric {
  metricId: string;
  labelKey: string;
  value: string;
  margin?: string;
  sourceTag: 'SEC-VERIFIED FACT' | 'IBM OFFICIAL FACT';
  category: 'fy2025' | 'interim2026';
}

export interface ScaleStat {
  id: string;
  value: string;
  labelKey: string;
  source: string;
  testId: string;
}

export interface WorkflowStep {
  stepNumber: 1 | 2 | 3 | 4 | 5 | 6;
  nameKey: string;
  descKey: string;
  inputsKey: string;
  outputsKey: string;
  isHumanGoverned: boolean;
  testId: string;
}

export interface PilotDeliverable {
  id: string;
  titleKey: string;
  descKey: string;
  deliveryWeek: number;
  provenance: 'STUDENT-PROPOSED DESIGN';
  testId: string;
}

export interface ReviewRequestPayload {
  title: string;
  scope: string;
  priority: 'standard' | 'expedited' | 'urgent';
}

export interface ReviewRequestResponse {
  id: number;
  code: string;
  status: string;
  title: string;
}

export interface ApiResponse<T> {
  data: T;
  status?: string;
  message?: string;
}

