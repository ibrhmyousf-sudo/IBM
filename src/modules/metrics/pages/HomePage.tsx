import React, { useEffect, useState, useCallback } from 'react';
import { HeroSection } from '../components/HeroSection';
import { ValuePropsGrid } from '../components/ValuePropsGrid';
import { FinancialsTable } from '../components/FinancialsTable';
import { CorporateScaleCards } from '../components/CorporateScaleCards';
import { AiHumanWorkflowDiagram } from '../components/AiHumanWorkflowDiagram';
import { AppSkeleton } from '../../../components/AppSkeleton';
import { AppButton } from '../../../components/AppButton';
import { useI18n } from '../../../context/I18nContext';
import { metricsApi } from '../../../services/api/metricsApi';
import type { ValueProposition, FinancialMetric, ScaleStat, UILifecycleState } from '../../../types';

export interface HomePageProps {
  onNavigate: (route: string) => void;
  onOpenPilotModal: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, onOpenPilotModal }) => {
  const { t } = useI18n();
  const [state, setState] = useState<UILifecycleState>('loading');
  const [valueProps, setValueProps] = useState<ValueProposition[]>([]);
  const [financials, setFinancials] = useState<FinancialMetric[]>([]);
  const [scaleStats, setScaleStats] = useState<ScaleStat[]>([]);

  const loadData = useCallback(async () => {
    setState('loading');
    try {
      const [propsData, finData, statsData] = await Promise.all([
        metricsApi.getValuePropositions(),
        metricsApi.getFinancialMetrics(),
        metricsApi.getScaleStats()
      ]);

      setValueProps(propsData);
      setFinancials(finData);
      setScaleStats(statsData);

      if (propsData.length === 0 && finData.length === 0) {
        setState('empty');
      } else {
        setState('populated');
      }
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // UI State: Loading Shimmer
  if (state === 'loading') {
    return (
      <div className="py-12 space-y-12" data-testid="metrics-state-loading">
        <div className="max-w-3xl mx-auto space-y-4 text-center">
          <AppSkeleton lines={1} height="h-8" className="w-1/3 mx-auto" data-testid="skeleton-badge" />
          <AppSkeleton lines={2} height="h-12" data-testid="skeleton-headline" />
          <AppSkeleton lines={3} height="h-4" data-testid="skeleton-subheadline" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-6 bg-surface rounded-xl border border-border space-y-3">
              <AppSkeleton lines={1} height="h-10 w-10" data-testid={`skeleton-card-icon-${i}`} />
              <AppSkeleton lines={1} height="h-6" data-testid={`skeleton-card-title-${i}`} />
              <AppSkeleton lines={3} height="h-3" data-testid={`skeleton-card-desc-${i}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // UI State: Error / Retry
  if (state === 'error') {
    return (
      <div className="py-20 text-center space-y-4" data-testid="metrics-state-error">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 flex items-center justify-center">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-text-primary">{t('states.error')}</h2>
        <AppButton
          variant="primary"
          size="md"
          data-testid="metrics-btn-retry"
          onClick={loadData}
        >
          {t('states.retry')}
        </AppButton>
      </div>
    );
  }

  // UI State: Empty
  if (state === 'empty') {
    return (
      <div className="py-20 text-center space-y-4" data-testid="metrics-state-empty">
        <p className="text-text-secondary">{t('states.empty')}</p>
        <AppButton variant="secondary" size="sm" data-testid="metrics-btn-empty-retry" onClick={loadData}>
          {t('states.retry')}
        </AppButton>
      </div>
    );
  }

  // UI State: Populated
  return (
    <div className="space-y-12" data-testid="metrics-home-page">
      <HeroSection
        onOpenPilotModal={onOpenPilotModal}
        onExploreWorkflow={() => onNavigate('/offering')}
      />

      <ValuePropsGrid propsList={valueProps} />

      <FinancialsTable metrics={financials} />

      <CorporateScaleCards stats={scaleStats} />

      <AiHumanWorkflowDiagram />
    </div>
  );
};

