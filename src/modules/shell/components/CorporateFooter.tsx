import React from 'react';
import { useI18n } from '../../../context/I18nContext';
import { AppBadge } from '../../../components/AppBadge';

export const CorporateFooter: React.FC = () => {
  const { t } = useI18n();

  return (
    <footer className="corporate-footer bg-surface border-t border-border mt-20 pt-12 pb-16" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-10 border-b border-border">
          {/* Academic Disclaimer Notice */}
          <div data-testid="shell-footer-disclaimer" className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
              <h4 className="font-bold text-sm tracking-wide uppercase text-text-primary">
                {t('governance.disclaimerHeading')}
              </h4>
            </div>
            <p className="text-sm leading-relaxed text-text-secondary bg-surface-muted p-4 rounded-lg border border-border">
              {t('governance.disclaimerText')}
            </p>
          </div>

          {/* Academic Resources Area */}
          <div data-testid="shell-footer-resources" className="space-y-3">
            <h4 className="font-bold text-sm tracking-wide uppercase text-text-primary">
              {t('governance.resourcesHeading')}
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-muted border border-border">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm font-medium text-text-primary">
                    {t('governance.resourceAppendix')}
                  </span>
                </div>
                <AppBadge variant="amber" size="sm" data-testid="shell-badge-appendix">
                  {t('governance.statusPending')}
                </AppBadge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-muted border border-border">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm font-medium text-text-primary">
                    {t('governance.resourceExcel')}
                  </span>
                </div>
                <AppBadge variant="amber" size="sm" data-testid="shell-badge-excel">
                  {t('governance.statusPending')}
                </AppBadge>
              </div>
            </div>
          </div>
        </div>

        {/* Legal & Copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-text-muted gap-4">
          <p>{t('footer.copyright')}</p>
          <p>{t('footer.allRights')}</p>
        </div>
      </div>
    </footer>
  );
};

