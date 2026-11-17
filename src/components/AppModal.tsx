import React, { useEffect, useCallback } from 'react';

export interface AppModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  'data-testid': string;
}

export const AppModal: React.FC<AppModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  'data-testid': testId
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      data-testid={`${testId}-overlay`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="modal-content relative w-full max-w-xl glass-panel rounded-2xl shadow-2xl overflow-hidden border border-[var(--glass-border)]"
        data-testid={testId}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header p-6 border-b border-[var(--color-border)]/60 flex items-start justify-between">
          <div>
            <h3 id="modal-title" className="text-xl font-bold text-text-primary">
              {title}
            </h3>
            {subtitle && <p className="text-sm text-text-secondary mt-1">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="modal-close-btn p-2 text-text-secondary hover:text-text-primary rounded-xl hover:bg-surface-muted transition-colors"
            data-testid={`${testId}-close`}
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body p-6">{children}</div>
      </div>
    </div>
  );
};
