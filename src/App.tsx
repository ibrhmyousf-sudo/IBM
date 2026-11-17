import React, { useState, useEffect } from 'react';
import { I18nProvider } from './context/I18nContext';
import { ThemeProvider } from './context/ThemeContext';
import { ShellLayout } from './modules/shell/ShellLayout';
import { HomePage } from './modules/metrics/pages/HomePage';
import { OfferingPage } from './modules/workflow/pages/OfferingPage';
import { PricingPage } from './modules/pricing/PricingPage';
import { TrustPage } from './modules/trust/TrustPage';

const getRelativeRoute = (pathname: string): string => {
  const base = import.meta.env.BASE_URL || '/';
  if (base !== '/' && pathname.startsWith(base)) {
    const stripped = pathname.slice(base.length - 1);
    return stripped.startsWith('/') ? stripped : `/${stripped}`;
  }
  return pathname || '/';
};

const formatTargetUrl = (route: string): string => {
  const base = import.meta.env.BASE_URL || '/';
  if (base === '/') return route;
  return `${base.replace(/\/$/, '')}${route}`;
};

export const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    return getRelativeRoute(window.location.pathname);
  });

  const [isPilotModalOpen, setIsPilotModalOpen] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(getRelativeRoute(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (route: string) => {
    setCurrentRoute(route);
    window.history.pushState({}, '', formatTargetUrl(route));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderCurrentPage = () => {
    switch (currentRoute) {
      case '/offering':
        return <OfferingPage onOpenPilotModal={() => setIsPilotModalOpen(true)} />;
      case '/pricing':
        return <PricingPage onOpenPilotModal={() => setIsPilotModalOpen(true)} />;
      case '/trust':
        return <TrustPage />;
      case '/':
      default:
        return (
          <HomePage
            onNavigate={navigate}
            onOpenPilotModal={() => setIsPilotModalOpen(true)}
          />
        );
    }
  };

  return (
    <ThemeProvider>
      <I18nProvider>
        <ShellLayout
          currentRoute={currentRoute}
          onNavigate={navigate}
          isPilotModalOpen={isPilotModalOpen}
          onOpenPilotModal={() => setIsPilotModalOpen(true)}
          onClosePilotModal={() => setIsPilotModalOpen(false)}
        >
          {renderCurrentPage()}
        </ShellLayout>
      </I18nProvider>
    </ThemeProvider>
  );
};

export default App;
