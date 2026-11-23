import React from 'react';

export const LIGHT_LOGO_SRC = '/assets/aistudio/logo_Afrika_ent_529f4246.png';
export const DARK_LOGO_SRC = '/assets/aistudio/image_6fdf2c9e.png';

interface BrandMarkProps {
  size?: number;
  className?: string;
  variant?: 'compact' | 'full';
  forceDarkSurface?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 56,
  className = '',
  variant = 'full',
  forceDarkSurface = false,
}) => {
  const height = variant === 'compact' ? Math.max(40, size) : Math.max(52, size);
  const sharedClass =
    'w-auto max-w-full bg-transparent object-contain select-none transition-transform duration-200';

  if (forceDarkSurface) {
    return (
      <span className={`inline-flex items-center justify-center bg-transparent ${className}`}>
        <img
          src={DARK_LOGO_SRC}
          alt="Afrika Entrepreneur"
          style={{ height: `${height}px` }}
          className={`${sharedClass} drop-shadow-[0_4px_14px_rgba(232,80,2,0.28)]`}
        />
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center justify-center bg-transparent ${className}`}>
      <img
        src={LIGHT_LOGO_SRC}
        alt="Afrika Entrepreneur"
        style={{ height: `${height}px` }}
        className={`block dark:hidden ${sharedClass}`}
      />
      <img
        src={DARK_LOGO_SRC}
        alt="Afrika Entrepreneur"
        style={{ height: `${height}px` }}
        className={`hidden dark:block ${sharedClass} drop-shadow-[0_4px_14px_rgba(232,80,2,0.28)]`}
      />
    </span>
  );
};

