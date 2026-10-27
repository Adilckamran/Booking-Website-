'use client';

import React, { useState } from 'react';
import Image from 'next/image';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark'; // light background or dark background
}

export function BrandLogo({ className = '', size = 'md', variant = 'dark' }: BrandLogoProps) {
  const [imgError, setImgError] = useState(false);

  const dimensionMap = {
    sm: { width: 36, height: 36, text: 'text-xs sm:text-sm font-black', sub: 'text-[9px]' },
    md: { width: 44, height: 44, text: 'text-sm sm:text-base font-black', sub: 'text-[10px]' },
    lg: { width: 56, height: 56, text: 'text-lg sm:text-xl font-black', sub: 'text-xs' },
  };

  const dim = dimensionMap[size];

  return (
    <div className={`flex items-center gap-2.5 sm:gap-3 group ${className}`}>
      {!imgError ? (
        <div className="relative shrink-0 rounded-xl overflow-hidden flex items-center justify-center bg-[#071728] shadow-sm border border-white/10 p-0.5">
          <Image
            src="/logo.png"
            alt="Power Padel Arena"
            width={dim.width}
            height={dim.height}
            className="object-contain rounded-lg aspect-square"
            onError={() => setImgError(true)}
            priority
          />
        </div>
      ) : (
        /* Dynamic Brand Lockup when logo.png is pending in public/ folder */
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0A2540] via-[#0F355A] to-[#0A2540] border border-orange-500/30 flex items-center justify-center shadow-md relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-orange-500 rounded-bl" />
          <div className="absolute bottom-0 left-0 w-2.5 h-2.5 bg-emerald-500 rounded-tr" />
          <span className="font-black text-white text-xs tracking-tighter">PPA</span>
        </div>
      )}

      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 truncate">
          <span
            className={`tracking-tight uppercase leading-none font-black truncate ${
              variant === 'dark' ? 'text-white' : 'text-[#0A2540]'
            } ${dim.text}`}
          >
            Power Padel <span className="text-orange-500">Arena</span>
          </span>
        </div>
        <span className={`font-semibold tracking-wider uppercase text-emerald-400 ${dim.sub} mt-0.5 truncate`}>
          PECHS • Karachi
        </span>
      </div>
    </div>
  );
}
