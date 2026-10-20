'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { BrandLogo } from './BrandLogo';
import { Menu, X, Calendar, MessageCircle } from 'lucide-react';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Minimal public navigation as strictly requested:
  // 1. Home
  // 2. Book a Court
  // 3. Location / Contact
  const navLinks = [
    { label: 'Home', href: '/' },
    { label: 'Book a Court', href: '/book' },
    { label: 'Location & Contact', href: '/#location' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#0A2540] border-b border-slate-800 text-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo Brand Lockup */}
          <Link href="/" className="flex items-center">
            <BrandLogo size="md" variant="dark" />
          </Link>

          {/* Minimal Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-slate-800/80 text-orange-400'
                      : 'text-slate-200 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Action CTAs: WhatsApp & Book Court */}
          <div className="hidden sm:flex items-center gap-3">
            {/* WhatsApp Quick Chat */}
            <a
              href={`https://wa.me/${CLUB_CONFIG.whatsappNumberPlaceholder}?text=Assalam-o-Alaikum%20Power%20Padel%20Arena%2C%20I%20would%20like%20to%20inquire%20about%20court%20timings.`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
              title="Message on WhatsApp"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </a>

            {/* Book a Court Primary CTA (Orange Accent) */}
            <Link
              href="/book"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm shadow-md shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Calendar className="w-4 h-4" />
              <span>Book a Court</span>
            </Link>
          </div>

          {/* Mobile hamburger button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-[#0A2540] px-4 pt-3 pb-6 space-y-2">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-base font-semibold text-slate-200 hover:bg-slate-800 hover:text-orange-400"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <a
              href={`https://wa.me/${CLUB_CONFIG.whatsappNumberPlaceholder}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-slate-800 text-emerald-400 text-sm font-bold border border-slate-700"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp Contact</span>
            </a>
            <Link
              href="/book"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-orange-500 text-white font-bold text-sm"
            >
              <Calendar className="w-4 h-4" />
              <span>Book a Court Now</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
