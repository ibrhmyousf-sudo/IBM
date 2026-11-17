import React from 'react';

export interface AppCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'highlight' | 'bordered';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  'data-testid': string;
}

export const AppCard: React.FC<AppCardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  'data-testid': testId,
  ...props
}) => {
  return (
    <div
      {...props}
      data-testid={testId}
      className={`app-card app-card-${variant} app-card-pad-${padding} ${className}`}
    >
      {children}
    </div>
  );
};

