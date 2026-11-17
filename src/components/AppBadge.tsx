import React from 'react';

export interface AppBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'blue' | 'green' | 'amber' | 'purple' | 'gray';
  size?: 'sm' | 'md';
  'data-testid': string;
}

export const AppBadge: React.FC<AppBadgeProps> = ({
  children,
  variant = 'blue',
  size = 'md',
  className = '',
  'data-testid': testId,
  ...props
}) => {
  return (
    <span
      {...props}
      data-testid={testId}
      className={`app-badge app-badge-${variant} app-badge-${size} ${className}`}
    >
      {children}
    </span>
  );
};

