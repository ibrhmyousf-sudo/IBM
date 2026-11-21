import React from 'react';
import { useI18n } from '../../../context/I18nContext';

export const CorporateFooter: React.FC = () => {
  const { t } = useI18n();

  return (
    <footer className="corporate-footer bg-surface border-t border-border mt-20 pt-12 pb-16" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="pb-10 border-b border-border">
          <div data-testid="shell-footer-disclaimer" className="space-y-3 max-w-4xl">
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
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-text-muted gap-4">
          <p>{t('footer.copyright')}</p>
          <p>{t('footer.allRights')}</p>
        </div>
      </div>
    </footer>
  );
};
