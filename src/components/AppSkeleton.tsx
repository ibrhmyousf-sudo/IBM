import React from 'react';

export interface AppSkeletonProps {
  className?: string;
  lines?: number;
  height?: string;
  'data-testid': string;
}

export const AppSkeleton: React.FC<AppSkeletonProps> = ({
  className = '',
  lines = 1,
  height = 'h-4',
  'data-testid': testId
}) => {
  if (lines > 1) {
    return (
      <div className={`space-y-3 ${className}`} data-testid={testId}>
        {Array.from({ length: lines }).map((_, idx) => (
          <div
            key={idx}
            className={`skeleton-bar animate-pulse rounded bg-surface-muted ${height} ${
              idx === lines - 1 ? 'w-3/4' : 'w-full'
            }`}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`skeleton-bar animate-pulse rounded bg-surface-muted ${height} ${className}`}
      data-testid={testId}
    />
  );
};

