'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { Menu, X, Calendar, MessageCircle } from 'lucide-react';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const navLinks = [
    { label: 'Home', href: '/' },
    { label: 'Book a Court', href: '/book' },
    { label: 'Booking Status', href: '/status' },
    { label: 'Admin Dashboard (Demo)', href: '/admin' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          
          {/* Logo / Club Branding Placeholder */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <span className="font-extrabold text-slate-950 text-xl tracking-tight">🎾</span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base md:text-lg tracking-wide text-white flex items-center gap-1.5">
                {CLUB_CONFIG.clubNamePlaceholder}
              </span>
              <span className="text-[10px] md:text-xs text-emerald-400 font-medium uppercase tracking-wider">
                Padel Club & Courts
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-emerald-400 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-850'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Action Buttons */}
          <div className="hidden sm:flex items-center gap-3">
            {/* WhatsApp Contact Link */}
            <a
              href={`https://wa.me/${CLUB_CONFIG.whatsappNumberPlaceholder}?text=Assalam-o-Alaikum%2C%20I%20would%20like%20to%20inquire%20about%20padel%20court%20booking.`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
              title="Chat with Club on WhatsApp"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </a>

            {/* Book Now Primary Button */}
            <Link
              href="/book"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-md shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Calendar className="w-4 h-4" />
              <span>Book Slot</span>
            </Link>
          </div>

          {/* Mobile menu trigger */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-900 px-4 pt-3 pb-6 space-y-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-base font-medium text-slate-250 hover:bg-slate-800 hover:text-emerald-400"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <a
              href={`https://wa.me/${CLUB_CONFIG.whatsappNumberPlaceholder}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-slate-800 text-emerald-400 text-sm font-semibold border border-slate-700"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp Inquiries</span>
            </a>
            <Link
              href="/book"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-emerald-500 text-slate-950 font-bold text-sm"
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
