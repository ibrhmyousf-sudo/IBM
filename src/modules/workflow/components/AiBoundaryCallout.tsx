import React from 'react';
import { useI18n } from '../../../context/I18nContext';

export const AiBoundaryCallout: React.FC = () => {
  const { t } = useI18n();

  return (
    <section className="ai-boundary-section py-8" aria-label="Governance Boundary">
      <div
        className="ai-boundary-box rounded-2xl p-6 sm:p-8 glass-panel border-2 border-amber-500/40 shadow-xl relative overflow-hidden"
        data-testid="workflow-callout-ai-boundary"
      >
        <div className="flex items-start gap-4">
          <div className="p-3.5 bg-gradient-to-br from-amber-500/20 to-amber-600/30 rounded-2xl text-amber-600 dark:text-amber-400 shrink-0 border border-amber-500/30 shadow-md">
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
              <span className="text-xs uppercase font-black tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2.5 py-1 rounded-full border border-amber-500/30">
                {t('governance.strictMandate')}
              </span>
              <h3 className="text-lg font-bold text-amber-900 dark:text-amber-200">
                {t('governance.boundaryTitle')}
              </h3>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed font-medium">
              {t('governance.boundaryText')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
