import React from 'react';
import Link from 'next/link';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { InstagramIcon, FacebookIcon } from '@/components/common/SocialIcons';
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  ArrowRight,
  MessageCircle,
  CreditCard,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      
      {/* 1. STRONG HERO SECTION */}
      <section className="relative bg-[#0A2540] text-white overflow-hidden py-16 sm:py-24 lg:py-28 border-b border-slate-800">
        {/* Subtle geometric sports court line background */}
        <div className="absolute inset-0 opacity-5 bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl space-y-6">
            
            {/* Pill Location Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs sm:text-sm font-bold tracking-wide">
              <Sparkles className="w-4 h-4 text-orange-400" />
              <span>PECHS • Karachi • Pakistan</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.1]">
              Welcome to <br />
              <span className="text-white">Power Padel </span>
              <span className="text-orange-500">Arena</span>
            </h1>

            {/* Subtitle */}
            <p className="text-slate-200 text-base sm:text-lg sm:leading-relaxed max-w-2xl font-normal">
              Karachi’s premier destination for high-intensity padel. Book professional panoramic courts, tournament-grade turf, and match floodlights in seconds — no account required.
            </p>

            {/* Action CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-4">
              <Link
                href="/book"
                className="inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-base shadow-lg shadow-orange-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Calendar className="w-5 h-5" />
                <span>Book a Court</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>

              <Link
                href="/status"
                className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-slate-800/90 hover:bg-slate-800 text-white font-bold text-sm border border-slate-700 hover:border-slate-600 transition-colors"
              >
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>Upload Receipt / Check Status</span>
              </Link>
            </div>

            {/* Highlights Bar */}
            <div className="pt-6 flex flex-wrap items-center gap-4 sm:gap-6 text-xs text-slate-300">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Instant Slot Reservation</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-orange-400 shrink-0" />
                <span>Bank Transfer / Easypaisa / JazzCash</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Open Daily 08:00 AM – 01:00 AM</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 2. SHORT INTRODUCTION TO POWER PADEL ARENA */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            
            {/* Left Column: Story */}
            <div className="lg:col-span-7 space-y-5">
              <span className="text-xs font-black tracking-widest text-orange-500 uppercase">
                About the Arena
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A2540] tracking-tight">
                Designed for Competitive & Social Padel in the Heart of Karachi
              </h2>
              <p className="text-slate-600 text-base leading-relaxed">
                Located in PECHS, <strong>Power Padel Arena</strong> brings an elite sports experience to players of all skill levels. With world-standard panoramic glass enclosures, shock-absorbing turf, and optimal nighttime visibility, we deliver the definitive padel environment in Karachi.
              </p>
              <p className="text-slate-600 text-sm leading-relaxed">
                Whether you are organizing a friendly four-player match, participating in evening tournaments, or booking corporate sessions, our venue provides seamless online scheduling and dedicated customer assistance.
              </p>

              <div className="pt-2 flex items-center gap-4">
                <Link
                  href="/book"
                  className="inline-flex items-center gap-2 text-sm font-bold text-orange-600 hover:text-orange-700"
                >
                  <span>View Court Timings & Rates</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Right Column: Key Features Card */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm">
              <h3 className="font-extrabold text-base text-[#0A2540] flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>Arena Facilities</span>
              </h3>

              <div className="space-y-3 text-xs text-slate-700">
                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <span className="font-bold text-[#0A2540] block text-sm">Panoramic Tournament Glass</span>
                  <p className="text-slate-500 mt-0.5">Unobstructed visual clarity for spectators and competitive camera angles.</p>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <span className="font-bold text-[#0A2540] block text-sm">Pro Cushioning Turf</span>
                  <p className="text-slate-500 mt-0.5">Low joint impact and true-bounce response engineered for quick rallies.</p>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <span className="font-bold text-[#0A2540] block text-sm">Racket Rentals & Refreshments</span>
                  <p className="text-slate-500 mt-0.5">High-grade rackets, balls, and cold beverages available on-site.</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 3. SIMPLE EXPLANATION OF THE BOOKING PROCESS */}
      <section className="py-16 sm:py-20 bg-slate-50 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
            <span className="text-xs font-black tracking-widest text-orange-500 uppercase">
              Fast & Transparent
            </span>
            <h2 className="text-3xl font-extrabold text-[#0A2540] tracking-tight">
              How to Book Your Court
            </h2>
            <p className="text-slate-600 text-sm">
              Reserve your slot in 4 simple steps without having to register or remember passwords.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Step 1 */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-orange-300 transition-all">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#0A2540] text-orange-400 flex items-center justify-center font-extrabold text-sm mb-4">
                  01
                </div>
                <h3 className="font-bold text-base text-[#0A2540] mb-1">Pick Date & Time</h3>
                <p className="text-slate-600 text-xs leading-relaxed">
                  Choose your preferred match day, court, and 60-minute playing slot from the live calendar.
                </p>
              </div>
              <span className="mt-4 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md w-fit">
                Instant Availability
              </span>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-orange-300 transition-all">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#0A2540] text-orange-400 flex items-center justify-center font-extrabold text-sm mb-4">
                  02
                </div>
                <h3 className="font-bold text-base text-[#0A2540] mb-1">Enter Details</h3>
                <p className="text-slate-600 text-xs leading-relaxed">
                  Enter player name and WhatsApp number. Your selected slot is held temporarily for 30 minutes.
                </p>
              </div>
              <span className="mt-4 text-[11px] font-bold text-orange-700 bg-orange-50 px-2.5 py-1 rounded-md w-fit">
                Held for 30 mins
              </span>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-orange-300 transition-all">
              <div>
                <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center font-extrabold text-sm mb-4">
                  03
                </div>
                <h3 className="font-bold text-base text-[#0A2540] mb-1">Pay 50% Advance</h3>
                <p className="text-slate-600 text-xs leading-relaxed">
                  Transfer advance via Bank Transfer, Easypaisa, or JazzCash and upload your receipt screenshot with TRX ID.
                </p>
              </div>
              <span className="mt-4 text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md w-fit">
                Evidence for Review
              </span>
            </div>

            {/* Step 4 */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-orange-300 transition-all">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#0A2540] text-emerald-400 flex items-center justify-center font-extrabold text-sm mb-4">
                  04
                </div>
                <h3 className="font-bold text-base text-[#0A2540] mb-1">Admin Verification</h3>
                <p className="text-slate-600 text-xs leading-relaxed">
                  Arena staff confirms the transaction against bank records. Your slot is officially locked.
                </p>
              </div>
              <span className="mt-4 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md w-fit">
                Official Lock
              </span>
            </div>

          </div>

          <div className="mt-10 text-center">
            <Link
              href="/book"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0A2540] hover:bg-slate-800 text-white font-bold text-sm transition-all"
            >
              <Calendar className="w-4 h-4 text-orange-400" />
              <span>Start Court Booking</span>
            </Link>
          </div>

        </div>
      </section>

      {/* 4. LOCATION & SOCIAL LINKS SECTION */}
      <section id="location" className="py-16 sm:py-20 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            
            {/* Left: Location & Details */}
            <div className="space-y-6">
              <span className="text-xs font-black tracking-widest text-orange-500 uppercase">
                Find Us in Karachi
              </span>
              <h2 className="text-3xl font-extrabold text-[#0A2540] tracking-tight">
                Location & Social Channels
              </h2>
              <p className="text-slate-600 text-sm leading-relaxed">
                Power Padel Arena is centrally located in <strong>PECHS, Karachi</strong>, offering easy road access, secure player parking, and full floodlight illumination for late evening games.
              </p>

              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <MapPin className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#0A2540] text-sm block">Address</span>
                    <p className="text-slate-600">{CLUB_CONFIG.locationArea}</p>
                    <a
                      href={CLUB_CONFIG.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-orange-600 font-bold mt-1.5 hover:underline"
                    >
                      <span>Open in Google Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <Clock className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#0A2540] text-sm block">Arena Timings</span>
                    <p className="text-slate-600">
                      Monday to Sunday: {CLUB_CONFIG.openingHour} AM – {CLUB_CONFIG.closingHour} AM (Midnight)
                    </p>
                  </div>
                </div>
              </div>

              {/* Social Channels */}
              <div className="pt-2">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Connect on Social Media:
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={CLUB_CONFIG.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition-colors"
                  >
                    <InstagramIcon className="w-4 h-4 text-pink-600" />
                    <span>Instagram (@powerpadelarena_pechs)</span>
                  </a>

                  <a
                    href={CLUB_CONFIG.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition-colors"
                  >
                    <FacebookIcon className="w-4 h-4 text-blue-600" />
                    <span>Facebook (Power Padel Arena)</span>
                  </a>
                </div>
              </div>

              {/* Direct WhatsApp Contact */}
              <div className="pt-2">
                <a
                  href={`https://wa.me/${CLUB_CONFIG.whatsappNumberPlaceholder}?text=Assalam-o-Alaikum%20Power%20Padel%20Arena%2C%20I%20have%20an%20inquiry%20regarding%20court%20timings.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-md transition-all"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Chat with Us on WhatsApp</span>
                </a>
              </div>
            </div>

            {/* Right: Google Maps Visual Card */}
            <div className="bg-[#0A2540] text-white rounded-2xl p-6 sm:p-8 border border-slate-800 space-y-6">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-orange-400">
                  PECHS Venue Navigation
                </span>
                <h3 className="text-2xl font-black">Visit Power Padel Arena</h3>
                <p className="text-xs text-slate-300">
                  Conveniently situated in PECHS with direct road connectivity from Shahrah-e-Faisal and Tariq Road.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-3">
                <div className="flex items-center gap-2 text-orange-400 text-xs font-bold">
                  <MapPin className="w-4 h-4" />
                  <span>Verified Google Maps Location</span>
                </div>
                <p className="text-xs text-slate-300">
                  Get turn-by-turn driving directions directly on your smartphone navigation app.
                </p>
                <a
                  href={CLUB_CONFIG.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow transition-colors"
                >
                  <span>Open Directions on Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>Rackets & balls available on arrival</span>
                <span className="text-emerald-400 font-semibold">Ample Court Parking</span>
              </div>
            </div>

          </div>

        </div>
      </section>

    </div>
  );
}
