'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { BrandLogo } from './BrandLogo';
import { Menu, X, Calendar, MessageCircle } from 'lucide-react';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close mobile menu on route change during render without effect cascade
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
  }

  // Handle escape key to close mobile menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  // Core navigation links
  const navLinks = [
    { label: 'Home', href: '/' },
    { label: 'Book a Court', href: '/book' },
    { label: 'Check Status', href: '/status' },
    { label: 'Location & Contact', href: '/#location' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#0A2540]/90 backdrop-blur-md border-b border-white/10 text-white shadow-sm transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo Brand Lockup */}
          <Link
            href="/"
            className="flex items-center focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-lg p-0.5"
            aria-label="Power Padel Arena Home"
          >
            <BrandLogo size="md" variant="dark" />
          </Link>

          {/* Minimal Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-1.5" aria-label="Main Navigation">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-white/15 text-orange-400 font-bold shadow-inner border border-white/10'
                      : 'text-slate-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Action CTAs: WhatsApp & Book Court */}
          <div className="hidden sm:flex items-center gap-2.5">
            {/* WhatsApp Quick Chat */}
            <a
              href={`https://wa.me/${CLUB_CONFIG.whatsappNumberPlaceholder}?text=Assalam-o-Alaikum%20Power%20Padel%20Arena%2C%20I%20would%20like%20to%20inquire%20about%20court%20timings.`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 backdrop-blur-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
              title="Message on WhatsApp"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>WhatsApp</span>
            </a>

            {/* Book a Court Primary CTA (Orange Accent) */}
            <Link
              href="/book"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Book a Court</span>
            </Link>
          </div>

          {/* Mobile hamburger button */}
          <div className="flex md:hidden items-center gap-2">
            <Link
              href="/book"
              className="sm:hidden px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-extrabold shadow-sm"
            >
              Book
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-slate-200 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div
          id="mobile-nav-menu"
          className="md:hidden border-t border-white/10 bg-[#0A2540]/95 backdrop-blur-xl px-4 pt-3 pb-6 space-y-2 animate-in slide-in-from-top-2 duration-150 shadow-2xl"
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3.5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-white/15 text-orange-400 font-bold border border-white/10'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          <div className="pt-4 border-t border-white/10 space-y-2.5">
            <a
              href={`https://wa.me/${CLUB_CONFIG.whatsappNumberPlaceholder}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-500/10 text-emerald-300 text-xs font-bold border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Chat on WhatsApp</span>
            </a>
            <Link
              href="/book"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm shadow-md transition-all active:scale-[0.98]"
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
