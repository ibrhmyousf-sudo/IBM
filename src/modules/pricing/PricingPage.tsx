import React from 'react';
import { useI18n } from '../../context/I18nContext';
import { AppCard } from '../../components/AppCard';
import { AppButton } from '../../components/AppButton';

export interface PricingPageProps {
  onOpenPilotModal: () => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onOpenPilotModal }) => {
  const { t, locale } = useI18n();
  const isAr = locale === 'ar';

  return (
    <div className="py-12 space-y-12" data-testid="pricing-page">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold mb-2 border border-[var(--color-primary)]/30">
          <span className="pulse-active-dot" />
          <span>{isAr ? 'نطاق تجريبي 6 أسابيع · 8 مستندات · 5 مخرجات' : '6-Week Pilot · 8 Documents · 5 Outputs'}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight">
          {t('pricing.pageTitle')}
        </h1>
        <p className="text-base text-text-secondary">
          {t('pricing.pageSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        <AppCard variant="default" padding="lg" data-testid="pricing-card-diagnostic" className="glass-card border border-[var(--glass-border)] shadow-md flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">{t('pricing.phase1Tag')}</div>
            <h3 className="text-xl font-bold text-text-primary mb-2">{t('pricing.phase1Title')}</h3>
            <p className="text-sm text-text-secondary mb-4">{t('pricing.phase1Desc')}</p>
            <div className="text-2xl font-black data-highlight-num mb-4">{t('pricing.phase1Period')}</div>
            <ul className="text-xs text-text-secondary space-y-2.5 mb-6">
              <li>{t('pricing.phase1Item1')}</li>
              <li>{t('pricing.phase1Item2')}</li>
              <li>{t('pricing.phase1Item3')}</li>
            </ul>
          </div>
          <AppButton variant="outline" size="md" data-testid="pricing-btn-diagnostic" onClick={onOpenPilotModal} className="w-full">
            {t('nav.cta')}
          </AppButton>
        </AppCard>

        <AppCard variant="highlight" padding="lg" data-testid="pricing-card-pilot" className="glass-card border-2 border-[var(--color-primary)] shadow-2xl flex flex-col justify-between relative">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary)] mb-2">{t('pricing.phase2Tag')}</div>
          <h3 className="text-xl font-bold text-text-primary mb-2">{t('pricing.phase2Title')}</h3>
          <p className="text-sm text-text-secondary mb-4">{t('pricing.phase2Desc')}</p>
          <div className="text-xl font-black data-highlight-num mb-4">{t('pricing.phase2Period')}</div>
          <ul className="text-xs text-text-secondary space-y-2.5 mb-6">
            <li>{t('pricing.phase2Item1')}</li>
            <li>{t('pricing.phase2Item2')}</li>
            <li>{t('pricing.phase2Item3')}</li>
          </ul>
          <AppButton variant="primary" size="md" data-testid="pricing-btn-pilot" onClick={onOpenPilotModal} className="w-full">
            {t('nav.cta')}
          </AppButton>
        </AppCard>

        <AppCard variant="default" padding="lg" data-testid="pricing-card-scale" className="glass-card border border-[var(--glass-border)] shadow-md flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">{t('pricing.phase3Tag')}</div>
            <h3 className="text-xl font-bold text-text-primary mb-2">{t('pricing.phase3Title')}</h3>
            <p className="text-sm text-text-secondary mb-4">{t('pricing.phase3Desc')}</p>
            <div className="text-xl font-black data-highlight-num mb-4">{t('pricing.phase3Period')}</div>
            <ul className="text-xs text-text-secondary space-y-2.5 mb-6">
              <li>{t('pricing.phase3Item1')}</li>
              <li>{t('pricing.phase3Item2')}</li>
              <li>{t('pricing.phase3Item3')}</li>
            </ul>
          </div>
          <AppButton variant="outline" size="md" data-testid="pricing-btn-scale" onClick={onOpenPilotModal} className="w-full">
            {t('nav.cta')}
          </AppButton>
        </AppCard>
      </div>

      <div className="max-w-6xl mx-auto overflow-x-auto rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-6 space-y-4">
        <h2 className="text-lg font-bold text-text-primary">
          {isAr ? 'ملخص التدفقات النقدية والافتراضات (Base وDownside — السنوات Y1–Y3)' : '3-Year Base & Downside Cash-Flow Summary (Y1–Y3)'}
        </h2>
        <table className="w-full text-start text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-text-secondary">
              <th className="py-2 px-3 text-start">{isAr ? 'البند' : 'Line Item'}</th>
              <th className="py-2 px-3 text-start">Y1</th>
              <th className="py-2 px-3 text-start">Y2</th>
              <th className="py-2 px-3 text-start">Y3</th>
              <th className="py-2 px-3 text-start">{isAr ? 'إجمالي 3 سنوات' : '3-Year Total'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] font-mono">
            <tr>
              <td className="py-2 px-3 font-sans font-medium">{isAr ? 'التدفق النقدي السنوي الصافي — Base' : 'Base Net Annual Cash Flow'}</td>
              <td className="py-2 px-3">$5,196</td>
              <td className="py-2 px-3">$278,996</td>
              <td className="py-2 px-3">$643,996</td>
              <td className="py-2 px-3 font-bold">$928,188</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-sans font-medium">{isAr ? 'التدفق النقدي التراكمي — Base' : 'Base Cumulative Cash Flow'}</td>
              <td className="py-2 px-3">$5,196</td>
              <td className="py-2 px-3">$284,192</td>
              <td className="py-2 px-3">$928,188</td>
              <td className="py-2 px-3 font-bold">$928,188</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-sans font-medium">{isAr ? 'التدفق النقدي السنوي الصافي — Downside' : 'Downside Net Annual Cash Flow'}</td>
              <td className="py-2 px-3 text-red-600 dark:text-red-400 font-bold">-$67,804</td>
              <td className="py-2 px-3">$16,196</td>
              <td className="py-2 px-3">$103,796</td>
              <td className="py-2 px-3 font-bold">$52,188</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-sans font-medium">{isAr ? 'التدفق النقدي التراكمي — Downside' : 'Downside Cumulative Cash Flow'}</td>
              <td className="py-2 px-3 text-red-600 dark:text-red-400 font-bold">-$67,804</td>
              <td className="py-2 px-3">-$51,608</td>
              <td className="py-2 px-3">$52,188</td>
              <td className="py-2 px-3 font-bold">$52,188</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
