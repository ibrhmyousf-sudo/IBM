import React from 'react';
import { useI18n } from '../../../context/I18nContext';

export interface BrandHeaderProps {
  onNavigateHome: () => void;
}

export const BrandHeader: React.FC<BrandHeaderProps> = ({ onNavigateHome }) => {
  const { t } = useI18n();

  return (
    <div
      className="brand-header flex items-center gap-3 cursor-pointer select-none group"
      data-testid="shell-header-brand"
      onClick={onNavigateHome}
      role="banner"
    >
      <div className="brand-logo-mark min-w-[2.5rem] w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-hover)] text-white flex items-center justify-center font-black text-lg shadow-md shadow-[var(--color-primary-glow)] shrink-0 group-hover:scale-105 transition-all">
        IBM
      </div>
      <div className="flex flex-col">
        <span className="font-extrabold text-base sm:text-lg leading-tight tracking-tight text-text-primary group-hover:text-[var(--color-primary)] transition-colors">
          {t('brand.title')}
        </span>
        <span className="text-xs text-text-secondary leading-tight mt-0.5">
          {t('brand.subtitle')}
        </span>
      </div>
    </div>
  );
};
