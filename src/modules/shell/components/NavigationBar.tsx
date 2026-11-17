import React from 'react';
import { useI18n } from '../../../context/I18nContext';
import { useTheme } from '../../../context/ThemeContext';
import { AppButton } from '../../../components/AppButton';

export interface NavigationBarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  onOpenPilotModal: () => void;
  onToggleMobileMenu: () => void;
}

export const NavigationBar: React.FC<NavigationBarProps> = ({
  currentRoute,
  onNavigate,
  onOpenPilotModal,
  onToggleMobileMenu
}) => {
  const { t, toggleLocale, locale } = useI18n();
  const { theme, palette, toggleTheme, togglePalette } = useTheme();

  const navLinks = [
    { key: 'nav.home', route: '/', testId: 'shell-nav-link-home' },
    { key: 'nav.offering', route: '/offering', testId: 'shell-nav-link-offering' },
    { key: 'nav.pricing', route: '/pricing', testId: 'shell-nav-link-pricing' },
    { key: 'nav.trust', route: '/trust', testId: 'shell-nav-link-trust' }
  ];

  return (
    <nav className="navigation-bar flex items-center justify-between gap-4 w-full" aria-label="Main Navigation">
      {/* Desktop Links */}
      <div className="hidden lg:flex items-center gap-1 xl:gap-2">
        {navLinks.map(link => {
          const isActive = currentRoute === link.route;
          return (
            <button
              key={link.route}
              data-testid={link.testId}
              onClick={() => onNavigate(link.route)}
              className={`nav-link px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-bold shadow-xs border border-[var(--color-primary)]/30 backdrop-blur-md'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted/60'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              {t(link.key)}
            </button>
          );
        })}
      </div>

      {/* Action Controls & Utilities */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Primary CTA (Desktop) */}
        <div className="hidden sm:block">
          <AppButton
            variant="primary"
            size="sm"
            data-testid="shell-btn-cta-pilot"
            onClick={onOpenPilotModal}
            className="shadow-sm hover:shadow"
          >
            {t('nav.cta')}
          </AppButton>
        </div>

        <div className="hidden sm:block w-px h-5 bg-border mx-1"></div>

        {/* Color Palette Toggle (Amber Gold <-> Corporate Blue) */}
        <button
          type="button"
          data-testid="shell-btn-palette-toggle"
          onClick={togglePalette}
          className="px-2.5 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--glass-bg)] backdrop-blur-md text-text-secondary hover:text-text-primary hover:border-[var(--color-primary)] transition-all text-xs font-bold flex items-center gap-1.5 shadow-2xs"
          title={palette === 'amber' ? 'Active: Amber-Gold Theme (Click for Blue)' : 'Active: Blue Theme (Click for Amber-Gold)'}
          aria-label="Toggle Color Palette"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] shadow-xs animate-pulse" />
          <span className="hidden md:inline">{palette === 'amber' ? 'Gold' : 'Blue'}</span>
        </button>

        {/* Locale Toggle */}
        <button
          type="button"
          data-testid="shell-btn-locale-toggle"
          onClick={toggleLocale}
          className="px-2.5 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--glass-bg)] backdrop-blur-md text-text-secondary hover:text-text-primary hover:border-[var(--color-primary)] transition-all text-xs font-bold uppercase tracking-wider shadow-2xs"
          aria-label={t('nav.toggleLocale')}
        >
          {locale === 'en' ? 'العربية' : 'English'}
        </button>

        {/* Theme Toggle (Light / Dark) */}
        <button
          type="button"
          data-testid="shell-btn-theme-toggle"
          onClick={toggleTheme}
          className="p-2 rounded-xl border border-[var(--color-border)] bg-[var(--glass-bg)] backdrop-blur-md text-text-secondary hover:text-text-primary hover:border-[var(--color-primary)] transition-all shadow-2xs"
          aria-label={t('nav.toggleTheme')}
        >
          {theme === 'dark' ? (
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          )}
        </button>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          data-testid="shell-btn-hamburger"
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 rounded-xl border border-border text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors"
          aria-label={t('nav.menu')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </nav>
  );
};
