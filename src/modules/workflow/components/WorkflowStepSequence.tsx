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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold mb-3 border border-[var(--color-primary)]/30">
          <span className="pulse-active-dot" />
          <span>6-Step End-to-End Governance</span>
        </div>
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
            className={`glass-card cursor-pointer transition-all hover:scale-[1.02] border ${
              step.isHumanGoverned
                ? 'border-[var(--color-primary)]/50 bg-[var(--glass-bg)] shadow-md shadow-[var(--color-primary-glow)]'
                : 'border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-md'
            }`}
            onClick={() => setSelectedStep(step)}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-hover)] text-white flex items-center justify-center font-black text-sm shadow-md shadow-[var(--color-primary-glow)]">
                {step.stepNumber}
              </span>
              {step.isHumanGoverned ? (
                <AppBadge variant="amber" size="sm" data-testid={`badge-step-${step.stepNumber}`}>
                  {t('workflowCommon.humanReviewGate')}
                </AppBadge>
              ) : (
                <AppBadge variant="gray" size="sm" data-testid={`badge-step-${step.stepNumber}`}>
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

            <div className="pt-3 border-t border-[var(--color-border)]/60 flex items-center justify-between text-xs text-[var(--color-primary)] font-bold">
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
