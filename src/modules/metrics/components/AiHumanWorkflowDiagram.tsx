import React from 'react';
import { useI18n } from '../../../context/I18nContext';
import { AppCard } from '../../../components/AppCard';

export const AiHumanWorkflowDiagram: React.FC = () => {
  const { t, direction } = useI18n();

  return (
    <section className="diagram-section py-12 md:py-16 border-t border-border" aria-labelledby="flow-heading">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <h2 id="flow-heading" className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
          {t('workflow.sectionTitle')}
        </h2>
        <p className="text-base text-text-secondary mt-2">
          {t('workflow.sectionSubtitle')}
        </p>
      </div>

      <div
        className="diagram-container bg-surface-muted/50 rounded-2xl p-6 sm:p-10 border border-border"
        data-testid="metrics-diagram-flow"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Stage 1 */}
          <AppCard
            variant="default"
            padding="lg"
            data-testid="metrics-diagram-stage-1"
            className="border-2 border-blue-200 dark:border-blue-900 bg-surface flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2.5 py-1 rounded">
                  {t('diagram.gate1Badge')}
                </span>
                <span className="text-xs text-text-secondary font-medium">
                  {t('diagram.gate1Type')}
                </span>
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                {t('diagram.gate1Title')}
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                {t('diagram.gate1Desc')}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>{t('diagram.gate1Outcome')}</span>
            </div>
          </AppCard>

          {/* Connector Arrow (Desktop) */}
          <div className="hidden md:flex absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className={`p-2 rounded-full bg-surface shadow border border-border text-blue-600 ${direction === 'rtl' ? 'rotate-180' : ''}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </div>

          {/* Stage 2 */}
          <AppCard
            variant="default"
            padding="lg"
            data-testid="metrics-diagram-stage-2"
            className="border-2 border-amber-200 dark:border-amber-900 bg-surface flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2.5 py-1 rounded">
                  {t('diagram.gate2Badge')}
                </span>
                <span className="text-xs text-text-secondary font-medium">
                  {t('diagram.gate2Type')}
                </span>
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                {t('diagram.gate2Title')}
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                {t('diagram.gate2Desc')}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{t('diagram.gate2Outcome')}</span>
            </div>
          </AppCard>

          {/* Connector Arrow 2 (Desktop) */}
          <div className="hidden md:flex absolute top-1/2 left-2/3 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className={`p-2 rounded-full bg-surface shadow border border-border text-blue-600 ${direction === 'rtl' ? 'rotate-180' : ''}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </div>

          {/* Stage 3 */}
          <AppCard
            variant="default"
            padding="lg"
            data-testid="metrics-diagram-stage-3"
            className="border-2 border-purple-200 dark:border-purple-900 bg-surface flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-2.5 py-1 rounded">
                  {t('diagram.gate3Badge')}
                </span>
                <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                  {t('diagram.gate3Type')}
                </span>
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                {t('diagram.gate3Title')}
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                {t('diagram.gate3Desc')}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{t('diagram.gate3Outcome')}</span>
            </div>
          </AppCard>
        </div>
      </div>
    </section>
  );
};
