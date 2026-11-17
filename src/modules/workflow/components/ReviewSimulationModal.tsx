import React, { useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { AppModal } from '../../../components/AppModal';
import { AppButton } from '../../../components/AppButton';
import { workflowApi } from '../../../services/api/workflowApi';
import type { ReviewRequestResponse } from '../../../types';

export interface ReviewSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReviewSimulationModal: React.FC<ReviewSimulationModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('');
  const [priority, setPriority] = useState<'standard' | 'expedited' | 'urgent'>('standard');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ReviewRequestResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleReset = () => {
    setTitle('');
    setScope('');
    setPriority('standard');
    setResult(null);
    setErrorMsg('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !scope.trim()) {
      setErrorMsg(t('modal.errorRequired'));
      return;
    }

    setErrorMsg('');
    setIsLoading(true);

    try {
      const response = await workflowApi.createReviewRequest({
        title: title.trim(),
        scope: scope.trim(),
        priority
      });
      setResult(response);
    } catch {
      setErrorMsg(t('modal.errorFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={handleClose}
      title={result ? t('modal.successTitle') : t('modal.title')}
      subtitle={result ? undefined : t('modal.subtitle')}
      data-testid="workflow-review-modal"
    >
      {result ? (
        <div className="space-y-6 text-center py-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="space-y-2">
            <h4 className="text-xl font-bold text-text-primary">{result.title}</h4>
            <div className="p-4 bg-surface-muted rounded-xl border border-border inline-block space-y-1 text-sm">
              <div className="flex justify-between gap-6">
                <span className="text-text-secondary">{t('modal.successCode')}</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  {result.code}
                </span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-text-secondary">{t('modal.successStatus')}</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {result.status}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border flex justify-center">
            <AppButton
              variant="primary"
              size="md"
              data-testid="workflow-review-modal-close-success"
              onClick={handleClose}
            >
              {t('modal.btnClose')}
            </AppButton>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-600 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1">
              {t('modal.fieldTitle')} *
            </label>
            <input
              type="text"
              required
              data-testid="workflow-review-input-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('modal.fieldTitlePlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-surface text-text-primary focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1">
              {t('modal.fieldScope')} *
            </label>
            <input
              type="text"
              required
              data-testid="workflow-review-input-scope"
              value={scope}
              onChange={e => setScope(e.target.value)}
              placeholder={t('modal.fieldScopePlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-surface text-text-primary focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1">
              {t('modal.fieldPriority')}
            </label>
            <select
              data-testid="workflow-review-select-priority"
              value={priority}
              onChange={e => setPriority(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-surface text-text-primary focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
            >
              <option value="standard">{t('modal.priorityStandard')}</option>
              <option value="expedited">{t('modal.priorityExpedited')}</option>
              <option value="urgent">{t('modal.priorityUrgent')}</option>
            </select>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <AppButton
              type="button"
              variant="ghost"
              size="md"
              data-testid="workflow-review-modal-cancel"
              onClick={handleClose}
              disabled={isLoading}
            >
              {t('modal.btnCancel')}
            </AppButton>

            <AppButton
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              data-testid="workflow-review-modal-submit"
            >
              {t('modal.btnSubmit')}
            </AppButton>
          </div>
        </form>
      )}
    </AppModal>
  );
};
