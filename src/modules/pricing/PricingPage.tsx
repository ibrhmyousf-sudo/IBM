import React from 'react';
import { useI18n } from '../../context/I18nContext';
import { AppCard } from '../../components/AppCard';
import { AppButton } from '../../components/AppButton';

export interface PricingPageProps {
  onOpenPilotModal?: () => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onOpenPilotModal }) => {
  const { t } = useI18n();
  const isAr =
    typeof document !== 'undefined' &&
    (document.documentElement.dir === 'rtl' || document.documentElement.lang === 'ar');

  const includedItems = isAr
    ? [
        'مدة التجربة: 6 أسابيع',
        'نطاق المستندات: 8 مستندات معتمدة',
        'نوع مستند واحد متفق عليه',
        'قائمة تحقق واحدة معتمدة من العميل',
        'فحص أولي بمساعدة الذكاء الاصطناعي',
        'مراجعة بشرية واعتماد نهائي إلزامي',
        'تقييم التجربة وملخص النتائج'
      ]
    : [
        '6-week duration',
        '8 approved documents',
        'One agreed document type',
        'One customer-approved checklist',
        'AI-assisted first-pass screening',
        'Human review and mandatory final sign-off',
        'Pilot evaluation summary'
      ];

  return (
    <div className="py-12 space-y-10" data-testid="pricing-page">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold mb-2 border border-[var(--color-primary)]/30">
          <span>
            {isAr
              ? 'مقترح أكاديمي — ليس عرضاً تجارياً رسمياً من IBM'
              : 'Academic proposal – not an IBM commercial offer'}
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight">
          {isAr ? 'عرض تجربة مراجعة الجودة' : 'Quality Review Pilot'}
        </h1>
        <p className="text-base text-text-secondary">
          {isAr
            ? 'تقدير أكاديمي مقترح لكل تعاقد تجريبي — غير متحقق من استعداد المشترين للدفع أو من القيمة التجارية النهائية'
            : 'Proposed academic estimate per engagement — not an official IBM commercial offer, and willingness to pay remains unvalidated'}
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <AppCard
          variant="default"
          padding="lg"
          data-testid="pricing-card-pilot"
          className="glass-card border border-[var(--glass-border)] shadow-md space-y-6"
        >
          <div className="border-b border-[var(--color-border)] pb-5 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-1">
                {isAr ? 'رسوم الخدمة الأكاديمية المقترحة' : 'Proposed Academic Service Fee'}
              </div>
              <h2 className="text-2xl font-bold text-text-primary">
                {isAr ? 'عرض تجربة مراجعة الجودة' : 'Quality Review Pilot'}
              </h2>
            </div>
            <div className="text-3xl font-black data-highlight-num text-[var(--color-primary)]">
              $15,000
              <span className="block text-xs font-medium text-text-muted mt-0.5">
                {isAr ? 'لكل تعاقد تجريبي (تقدير أكاديمي)' : 'per engagement (academic estimate)'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-primary">
              {isAr ? 'ما يشمله العرض المقترح' : 'What is included'}
            </h3>
            <ul className="text-sm text-text-secondary space-y-2">
              {includedItems.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-[var(--color-primary)] font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-surface-muted border border-[var(--color-border)] text-xs text-text-secondary leading-relaxed">
            <span className="font-bold text-text-primary">
              {isAr ? 'ملاحظة حدود التقدير: ' : 'Scope & Validation Note: '}
            </span>
            {isAr
              ? 'هذا الرقم تقدير أكاديمي ضمن بحث التخرج وليس سعراً تجارياً مُثبتاً في السوق أو التزاماً من IBM. تظل الأسعار والنطاق والقيمة ومتطلبات الأمان واستعداد الدفع خاضعة للتحقق.'
              : 'This is an unvalidated academic estimate, not validated market pricing or an IBM commercial commitment. Price, scope, customer value, security requirements, and willingness to pay remain subject to validation.'}
          </div>

          {onOpenPilotModal && (
            <div className="pt-1">
              <AppButton
                variant="primary"
                size="md"
                data-testid="pricing-btn-simulate"
                onClick={onOpenPilotModal}
                className="w-full"
              >
                {t('nav.cta')}
              </AppButton>
            </div>
          )}
        </AppCard>
      </div>
    </div>
  );
};
