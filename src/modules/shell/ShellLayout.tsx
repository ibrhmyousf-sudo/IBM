import React, { useState } from 'react';
import { BrandHeader } from './components/BrandHeader';
import { NavigationBar } from './components/NavigationBar';
import { MobileDrawer } from './components/MobileDrawer';
import { CorporateFooter } from './components/CorporateFooter';
import { ReviewSimulationModal } from '../workflow/components/ReviewSimulationModal';

export interface ShellLayoutProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  isPilotModalOpen: boolean;
  onOpenPilotModal: () => void;
  onClosePilotModal: () => void;
  children: React.ReactNode;
}

export const ShellLayout: React.FC<ShellLayoutProps> = ({
  currentRoute,
  onNavigate,
  isPilotModalOpen,
  onOpenPilotModal,
  onClosePilotModal,
  children
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary" data-testid="shell-layout">
      {/* Top Corporate Navigation Bar */}
      <header className="sticky top-0 z-40 glass-header shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-4">
            <BrandHeader onNavigateHome={() => onNavigate('/')} />
            <div className="flex-1 flex justify-end">
              <NavigationBar
                currentRoute={currentRoute}
                onNavigate={onNavigate}
                onOpenPilotModal={onOpenPilotModal}
                onToggleMobileMenu={() => setIsMobileMenuOpen(prev => !prev)}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <MobileDrawer
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        currentRoute={currentRoute}
        onNavigate={onNavigate}
        onOpenPilotModal={onOpenPilotModal}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="main">
        {children}
      </main>

      {/* Global Pilot Simulation Modal */}
      <ReviewSimulationModal
        isOpen={isPilotModalOpen}
        onClose={onClosePilotModal}
      />

      {/* Corporate Academic Footer */}
      <CorporateFooter />
    </div>
  );
};
