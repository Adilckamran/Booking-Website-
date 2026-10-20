import React from 'react';
import Link from 'next/link';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { MapPin, Phone, MessageCircle, Clock, ShieldCheck } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400 border-t border-slate-800 text-sm mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          
          {/* Col 1: Club Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white">
              <span className="text-2xl">🎾</span>
              <span className="font-bold text-lg">{CLUB_CONFIG.clubNamePlaceholder}</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              {CLUB_CONFIG.tagline}. High-grade panoramic and indoor courts with professional tournament turf, LED floodlights, and private lounge facilities.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-xs text-emerald-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Official Verification System</span>
            </div>
          </div>

          {/* Col 2: Timings & Location */}
          <div className="space-y-3">
            <h4 className="text-white font-semibold text-sm uppercase tracking-wider">
              Hours & Location
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-medium">Daily Operating Hours:</p>
                  <p>{CLUB_CONFIG.openingHour} AM – {CLUB_CONFIG.closingHour} AM (Midnight)</p>
                </div>
              </div>
              <div className="flex items-start gap-2 pt-1">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-medium">Club Address:</p>
                  <p>{CLUB_CONFIG.addressPlaceholder}</p>
                  <p className="text-slate-400">{CLUB_CONFIG.cityPlaceholder}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Col 3: Quick Navigation */}
          <div className="space-y-3">
            <h4 className="text-white font-semibold text-sm uppercase tracking-wider">
              Court Services
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/book" className="hover:text-emerald-400 transition-colors">
                  Reserve Court Online
                </Link>
              </li>
              <li>
                <Link href="/status" className="hover:text-emerald-400 transition-colors">
                  Check Booking & Payment Status
                </Link>
              </li>
              <li>
                <Link href="/admin" className="hover:text-emerald-400 transition-colors">
                  Management Dashboard (Demo Mode)
                </Link>
              </li>
              <li>
                <span className="text-slate-400">Advance Policy: {CLUB_CONFIG.advancePercentage}% to reserve slot</span>
              </li>
            </ul>
          </div>

          {/* Col 4: Payments & Contact */}
          <div className="space-y-3">
            <h4 className="text-white font-semibold text-sm uppercase tracking-wider">
              Accepted Payments
            </h4>
            <p className="text-xs text-slate-400">
              Direct Bank Transfer (Meezan/IBAN), Easypaisa, JazzCash, or venue counter.
            </p>
            <div className="pt-1 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>{CLUB_CONFIG.contactPhonePlaceholder}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>WhatsApp: {CLUB_CONFIG.whatsappDisplayPlaceholder}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© 2026 {CLUB_CONFIG.clubNamePlaceholder}. All rights reserved.</p>
          <p className="text-slate-400 text-center sm:text-right">
            🔒 Payment screenshots are verified manually by club staff before slot confirmation.
          </p>
        </div>
      </div>
    </footer>
  );
}
