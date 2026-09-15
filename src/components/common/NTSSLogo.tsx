import React from 'react';

interface NTSSLogoProps {
  variant?: 'full' | 'compact' | 'icon' | 'white' | 'vertical';
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const NTSSLogo: React.FC<NTSSLogoProps> = ({
  variant = 'full',
  className = '',
  size = 'md'
}) => {
  // NTSS Brand Color: #008e8b / #009688 (Deep Teal Cyan)
  const isWhite = variant === 'white';
  const primaryColor = isWhite ? '#ffffff' : '#008e8b';
  const textColor = isWhite ? 'text-white' : 'text-slate-900';
  const subTextColor = isWhite ? 'text-teal-100' : 'text-[#008e8b]';

  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-14 h-14'
  };

  const IconSvg = (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${iconSizes[size]} shrink-0 transition-transform`}
    >
      {/* Top Vertical Beam */}
      <rect x="44" y="8" width="12" height="26" rx="3" fill={primaryColor} />
      
      {/* Top Left Diagonal Beam */}
      <rect
        x="24"
        y="16"
        width="11"
        height="26"
        rx="3"
        transform="rotate(-40 24 16)"
        fill={primaryColor}
      />
      
      {/* Top Right Diagonal Beam */}
      <rect
        x="76"
        y="9"
        width="11"
        height="26"
        rx="3"
        transform="rotate(40 76 9)"
        fill={primaryColor}
      />

      {/* Center Horizontal Bar */}
      <rect x="8" y="44" width="84" height="12" rx="4" fill={primaryColor} />

      {/* Bottom Smile / Crescent Arch */}
      <path
        d="M 12 60 C 12 85, 88 85, 88 60 C 88 60, 76 60, 76 60 C 76 75, 24 75, 24 60 Z"
        fill={primaryColor}
      />
    </svg>
  );

  if (variant === 'icon') {
    return <div className={`inline-flex items-center justify-center ${className}`}>{IconSvg}</div>;
  }

  if (variant === 'vertical') {
    return (
      <div className={`flex flex-col items-center text-center select-none ${className}`}>
        {/* 1. Icon / Logo at the top in center */}
        <div className="mb-2 flex items-center justify-center transition-transform hover:scale-105 duration-200">
          {IconSvg}
        </div>
        {/* 2. NTSS word directly below */}
        <div className={`text-2xl font-black tracking-wider font-mono ${isWhite ? 'text-white' : 'text-[#008e8b]'} leading-tight`}>
          NTSS
        </div>
        {/* 3. NATIONAL TECHNICAL SCIENCE SCHOOLS */}
        <div className={`text-[9.5px] font-bold tracking-[0.14em] ${isWhite ? 'text-teal-200' : 'text-slate-500'} uppercase mt-0.5 leading-tight font-sans`}>
          NATIONAL TECHNICAL SCIENCE SCHOOLS
        </div>
        {/* 4. Arabic Name: المدارس الوطنية للعلوم التقنية */}
        <div className={`text-xs font-extrabold ${isWhite ? 'text-white' : 'text-slate-800'} mt-1.5 leading-snug`}>
          المدارس الوطنية للعلوم التقنية
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        {IconSvg}
        <div className="flex flex-col text-right">
          <span className={`font-black tracking-tight font-mono text-base ${isWhite ? 'text-white' : 'text-[#008e8b]'}`}>
            NTSS
          </span>
          <span className={`text-[10px] font-bold ${subTextColor} -mt-0.5 truncate`}>
            المدارس الوطنية للعلوم التقنية
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3.5 ${className}`}>
      {IconSvg}
      <div className="flex flex-col text-right">
        <div className="flex items-baseline gap-2">
          <span className={`text-xl font-black tracking-tight font-mono ${isWhite ? 'text-white' : 'text-[#008e8b]'}`}>
            NTSS
          </span>
          <span className={`text-[11px] font-bold tracking-wider uppercase hidden sm:inline ${isWhite ? 'text-teal-200' : 'text-slate-500'}`}>
            National Technical Science Schools
          </span>
        </div>
        <span className={`text-xs font-extrabold ${subTextColor} leading-tight`}>
          المدارس الوطنية للعلوم التقنية
        </span>
      </div>
    </div>
  );
};
