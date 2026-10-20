import React from 'react';
import Link from 'next/link';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { BrandLogo } from './BrandLogo';
import { InstagramIcon, FacebookIcon } from './SocialIcons';
import { MapPin, Mail, ExternalLink } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-[#0A2540] text-slate-300 border-t border-slate-800 text-xs mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          {/* Brand & Introduction */}
          <div className="space-y-3">
            <BrandLogo size="sm" variant="dark" />
            <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
              {CLUB_CONFIG.businessName} is Karachi’s premier padel club located in PECHS. Professional panoramic glass courts, LED lighting, and effortless court reservations.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <a
                href={CLUB_CONFIG.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 hover:text-orange-400 hover:bg-slate-700 transition-colors"
                title="Follow on Instagram"
              >
                <InstagramIcon className="w-4 h-4" />
              </a>
              <a
                href={CLUB_CONFIG.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 hover:text-orange-400 hover:bg-slate-700 transition-colors"
                title="Follow on Facebook"
              >
                <FacebookIcon className="w-4 h-4" />
              </a>
              <a
                href={CLUB_CONFIG.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-400 text-xs font-semibold transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-orange-400" />
                <span>Open in Google Maps</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            </div>
          </div>

          {/* Quick Links & Booking Info */}
          <div className="space-y-2.5">
            <h4 className="text-white font-bold text-xs uppercase tracking-wider">
              Quick Links
            </h4>
            <ul className="space-y-2 text-slate-400">
              <li>
                <Link href="/book" className="hover:text-orange-400 transition-colors">
                  Reserve a Court Online
                </Link>
              </li>
              <li>
                <Link href="/status" className="hover:text-orange-400 transition-colors">
                  Check Booking & Payment Status
                </Link>
              </li>
              <li>
                <a href="#location" className="hover:text-orange-400 transition-colors">
                  Location & Arena Timings
                </a>
              </li>
              <li>
                <span className="text-slate-500">
                  Advance policy: {CLUB_CONFIG.advancePercentage}% deposit required to hold slot
                </span>
              </li>
            </ul>
          </div>

          {/* Contact Details */}
          <div className="space-y-2.5">
            <h4 className="text-white font-bold text-xs uppercase tracking-wider">
              Contact & Hours
            </h4>
            <div className="space-y-2 text-slate-400 text-xs">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-medium">{CLUB_CONFIG.locationArea}</p>
                  <p className="text-slate-400 text-[11px]">PECHS, Karachi, Sindh, Pakistan</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                <a
                  href={`mailto:${CLUB_CONFIG.businessEmail}`}
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  {CLUB_CONFIG.businessEmail}
                </a>
              </div>

              <div className="text-[11px] text-slate-400 pt-1">
                <p>Daily Hours: {CLUB_CONFIG.openingHour} AM – {CLUB_CONFIG.closingHour} AM</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400">
          <p>© 2026 {CLUB_CONFIG.businessName}. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-slate-400 hover:text-slate-200 transition-colors"
              title="Management Access Gate"
            >
              Management Portal
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
