import React from 'react';
import { useI18n } from '../../../context/I18nContext';

export const AiBoundaryCallout: React.FC = () => {
  const { t } = useI18n();

  return (
    <section className="ai-boundary-section py-8" aria-label="Governance Boundary">
      <div
        className="ai-boundary-box rounded-xl p-6 sm:p-8 bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-800 shadow-sm"
        data-testid="workflow-callout-ai-boundary"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-100 dark:bg-amber-900/60 rounded-xl text-amber-700 dark:text-amber-300 shrink-0">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-extrabold tracking-wider bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-2 py-0.5 rounded">
                {t('governance.strictMandate')}
              </span>
              <h3 className="text-lg font-bold text-amber-900 dark:text-amber-100">
                {t('governance.boundaryTitle')}
              </h3>
            </div>
            <p className="text-sm text-amber-800 dark:text-amber-200/90 leading-relaxed font-medium">
              {t('governance.boundaryText')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
