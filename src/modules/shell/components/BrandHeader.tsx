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
      <div className="brand-logo-mark min-w-[2.5rem] w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-md shrink-0 group-hover:bg-blue-700 transition-colors">
        IBM
      </div>
      <div className="flex flex-col">
        <span className="font-extrabold text-base sm:text-lg leading-tight tracking-tight text-text-primary group-hover:text-blue-600 transition-colors">
          {t('brand.title')}
        </span>
        <span className="text-xs text-text-secondary leading-tight mt-0.5">
          {t('brand.subtitle')}
        </span>
      </div>
    </div>
  );
};
