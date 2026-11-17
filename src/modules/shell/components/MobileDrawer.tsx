import React, { useEffect } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { AppButton } from '../../../components/AppButton';

export interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoute: string;
  onNavigate: (route: string) => void;
  onOpenPilotModal: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  currentRoute,
  onNavigate,
  onOpenPilotModal
}) => {
  const { t, direction } = useI18n();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const navLinks = [
    { key: 'nav.home', route: '/', testId: 'shell-mobile-link-home' },
    { key: 'nav.offering', route: '/offering', testId: 'shell-mobile-link-offering' },
    { key: 'nav.pricing', route: '/pricing', testId: 'shell-mobile-link-pricing' },
    { key: 'nav.trust', route: '/trust', testId: 'shell-mobile-link-trust' }
  ];

  return (
    <div
      className="mobile-drawer-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
      onClick={onClose}
      data-testid="shell-mobile-drawer"
    >
      <div
        className={`mobile-drawer-panel fixed top-0 bottom-0 ${
          direction === 'rtl' ? 'left-0' : 'right-0'
        } w-4/5 max-w-sm bg-surface shadow-2xl p-6 flex flex-col justify-between border-l border-border`}
        onClick={e => e.stopPropagation()}
      >
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-6 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                IBM
              </div>
              <span className="font-bold text-sm text-text-primary">{t('brand.title')}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-text-secondary hover:text-text-primary rounded-lg"
              aria-label={t('nav.close')}
              data-testid="shell-mobile-drawer-close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-2 mt-6">
            {navLinks.map(link => {
              const isActive = currentRoute === link.route;
              return (
                <button
                  key={link.route}
                  data-testid={link.testId}
                  onClick={() => {
                    onNavigate(link.route);
                    onClose();
                  }}
                  className={`w-full text-start px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-bold'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted'
                  }`}
                >
                  {t(link.key)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="pt-6 border-t border-border">
          <AppButton
            variant="primary"
            size="md"
            className="w-full"
            data-testid="shell-mobile-btn-cta"
            onClick={() => {
              onClose();
              onOpenPilotModal();
            }}
          >
            {t('nav.cta')}
          </AppButton>
        </div>
      </div>
    </div>
  );
};

