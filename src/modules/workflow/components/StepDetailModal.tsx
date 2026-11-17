import React from 'react';
import { useI18n } from '../../../context/I18nContext';
import { AppModal } from '../../../components/AppModal';
import { AppBadge } from '../../../components/AppBadge';
import { AppButton } from '../../../components/AppButton';
import type { WorkflowStep } from '../../../types';

export interface StepDetailModalProps {
  step: WorkflowStep | null;
  onClose: () => void;
}

export const StepDetailModal: React.FC<StepDetailModalProps> = ({ step, onClose }) => {
  const { t } = useI18n();

  if (!step) return null;

  return (
    <AppModal
      isOpen={Boolean(step)}
      onClose={onClose}
      title={t(step.nameKey)}
      subtitle={`${t('stepDetail.stagePrefix')} ${step.stepNumber} ${t('stepDetail.stageOf')}`}
      data-testid="workflow-step-modal"
    >
      <div className="space-y-6">
        {/* Governance Level Badge */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <span className="text-sm text-text-secondary font-medium">
            {t('stepDetail.govAuthority')}
          </span>
          {step.isHumanGoverned ? (
            <AppBadge variant="purple" size="md" data-testid="badge-human-governed">
              {t('stepDetail.humanSpecialist')}
            </AppBadge>
          ) : (
            <AppBadge variant="blue" size="md" data-testid="badge-automated-gate">
              {t('stepDetail.automatedAlgorithmic')}
            </AppBadge>
          )}
        </div>

        {/* Narrative Description */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
            {t('stepDetail.scopeHeading')}
          </h4>
          <p className="text-sm text-text-primary leading-relaxed bg-surface-muted p-4 rounded-lg border border-border">
            {t(step.descKey)}
          </p>
        </div>

        {/* Input Artifacts */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
            {t('stepDetail.inputsHeading')}
          </h4>
          <p className="text-sm text-text-secondary bg-surface-muted/60 p-3 rounded-lg border border-border">
            {t(step.inputsKey)}
          </p>
        </div>

        {/* Output Artifacts */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
            {t('stepDetail.outputsHeading')}
          </h4>
          <p className="text-sm text-text-secondary bg-surface-muted/60 p-3 rounded-lg border border-border">
            {t(step.outputsKey)}
          </p>
        </div>

        {/* Modal Action Buttons */}
        <div className="pt-4 border-t border-border flex justify-end">
          <AppButton
            variant="secondary"
            size="md"
            data-testid="workflow-step-modal-close"
            onClick={onClose}
          >
            {t('modal.btnClose')}
          </AppButton>
        </div>
      </div>
    </AppModal>
  );
};
