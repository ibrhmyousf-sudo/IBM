import React, { useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { AppCard } from '../../../components/AppCard';
import { AppBadge } from '../../../components/AppBadge';
import { StepDetailModal } from './StepDetailModal';
import type { WorkflowStep } from '../../../types';

export interface WorkflowStepSequenceProps {
  steps: WorkflowStep[];
}

export const WorkflowStepSequence: React.FC<WorkflowStepSequenceProps> = ({ steps }) => {
  const { t } = useI18n();
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);

  return (
    <section className="workflow-sequence py-10" aria-labelledby="steps-title">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <h2 id="steps-title" className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
          {t('workflow.pageTitle')}
        </h2>
        <p className="text-base text-text-secondary mt-2">
          {t('workflow.pageSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {steps.map(step => (
          <AppCard
            key={step.stepNumber}
            data-testid={step.testId}
            variant="default"
            padding="lg"
            className={`cursor-pointer transition-all hover:shadow-lg border ${
              step.isHumanGoverned
                ? 'border-purple-300 dark:border-purple-800 bg-purple-50/20 dark:bg-purple-950/20'
                : 'border-border bg-surface'
            }`}
            onClick={() => setSelectedStep(step)}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow">
                {step.stepNumber}
              </span>
              {step.isHumanGoverned ? (
                <AppBadge variant="purple" size="sm" data-testid={`badge-step-${step.stepNumber}`}>
                  {t('workflowCommon.humanReviewGate')}
                </AppBadge>
              ) : (
                <AppBadge variant="blue" size="sm" data-testid={`badge-step-${step.stepNumber}`}>
                  {t('workflowCommon.automatedGate')}
                </AppBadge>
              )}
            </div>

            <h3 className="text-lg font-bold text-text-primary mb-2">
              {t(step.nameKey)}
            </h3>

            <p className="text-sm text-text-secondary leading-relaxed mb-4">
              {t(step.descKey)}
            </p>

            <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 font-semibold">
              <span>{t('workflowCommon.viewSpecs')}</span>
              <svg className="w-4 h-4 rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </AppCard>
        ))}
      </div>

      {/* Step Detail Modal */}
      <StepDetailModal
        step={selectedStep}
        onClose={() => setSelectedStep(null)}
      />
    </section>
  );
};
