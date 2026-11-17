import React, { useEffect, useState, useCallback } from 'react';
import { WorkflowStepSequence } from '../components/WorkflowStepSequence';
import { AiBoundaryCallout } from '../components/AiBoundaryCallout';
import { DeliverablesGrid } from '../components/DeliverablesGrid';
import { AppSkeleton } from '../../../components/AppSkeleton';
import { AppButton } from '../../../components/AppButton';
import { useI18n } from '../../../context/I18nContext';
import { workflowApi } from '../../../services/api/workflowApi';
import type { WorkflowStep, PilotDeliverable, UILifecycleState } from '../../../types';

export interface OfferingPageProps {
  onOpenPilotModal: () => void;
}

export const OfferingPage: React.FC<OfferingPageProps> = ({ onOpenPilotModal }) => {
  const { t } = useI18n();
  const [state, setState] = useState<UILifecycleState>('loading');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [deliverables, setDeliverables] = useState<PilotDeliverable[]>([]);

  const loadData = useCallback(async () => {
    setState('loading');
    try {
      const [stepsData, delivsData] = await Promise.all([
        workflowApi.getWorkflowSteps(),
        workflowApi.getDeliverables()
      ]);

      setSteps(stepsData);
      setDeliverables(delivsData);

      if (stepsData.length === 0 && delivsData.length === 0) {
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

  // Loading State
  if (state === 'loading') {
    return (
      <div className="py-12 space-y-10" data-testid="workflow-state-loading">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <AppSkeleton lines={1} height="h-10" data-testid="skeleton-offering-title" />
          <AppSkeleton lines={2} height="h-4" data-testid="skeleton-offering-subtitle" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-6 bg-surface rounded-xl border border-border space-y-3">
              <AppSkeleton lines={1} height="h-8 w-8 rounded-full" data-testid={`skeleton-step-circle-${i}`} />
              <AppSkeleton lines={1} height="h-6" data-testid={`skeleton-step-title-${i}`} />
              <AppSkeleton lines={3} height="h-3" data-testid={`skeleton-step-desc-${i}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error State
  if (state === 'error') {
    return (
      <div className="py-20 text-center space-y-4" data-testid="workflow-state-error">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 flex items-center justify-center">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-text-primary">{t('states.error')}</h2>
        <AppButton variant="primary" size="md" data-testid="workflow-btn-retry" onClick={loadData}>
          {t('states.retry')}
        </AppButton>
      </div>
    );
  }

  // Empty State
  if (state === 'empty') {
    return (
      <div className="py-20 text-center space-y-4" data-testid="workflow-state-empty">
        <p className="text-text-secondary">{t('states.empty')}</p>
        <AppButton variant="secondary" size="sm" data-testid="workflow-btn-empty-retry" onClick={loadData}>
          {t('states.retry')}
        </AppButton>
      </div>
    );
  }

  return (
    <div className="space-y-12" data-testid="workflow-offering-page">
      {/* 6-Step Workflow Sequence */}
      <WorkflowStepSequence steps={steps} />

      {/* AI Non-Approval Boundary Callout */}
      <AiBoundaryCallout />

      {/* 6 Proposed Pilot Deliverables */}
      <DeliverablesGrid deliverables={deliverables} />

      {/* Bottom Conversion Section */}
      <div className="pt-8 pb-4 text-center border-t border-border">
        <div className="max-w-2xl mx-auto space-y-4">
          <h3 className="text-xl sm:text-2xl font-bold text-text-primary">
            {t('offeringConversion.title')}
          </h3>
          <p className="text-sm text-text-secondary">
            {t('offeringConversion.desc')}
          </p>
          <div className="pt-2">
            <AppButton
              variant="primary"
              size="lg"
              data-testid="workflow-btn-pilot-cta"
              onClick={onOpenPilotModal}
            >
              {t('nav.cta')}
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
};
