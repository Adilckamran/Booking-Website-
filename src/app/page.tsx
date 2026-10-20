import React from 'react';
import Link from 'next/link';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { DEMO_COURTS } from '@/data/demoData';
import {
  Calendar,
  Clock,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  MessageCircle,
  CreditCard,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      
      {/* HERO SECTION */}
      <section className="relative bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 text-white overflow-hidden py-16 sm:py-24 lg:py-32 border-b border-slate-800">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl space-y-6">
            
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs sm:text-sm font-semibold tracking-wide">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Official Court Reservation Platform</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Experience World-Class Padel at{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-green-400">
                {CLUB_CONFIG.clubNamePlaceholder}
              </span>
            </h1>

            {/* Sub-headline */}
            <p className="text-slate-300 text-base sm:text-lg sm:leading-relaxed max-w-2xl">
              Book professional panoramic and indoor courts with high-intensity LED floodlights,
              WPT-grade turf, and instant slot reservation. Simple advance payment through Bank Transfer,
              Easypaisa, or JazzCash.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-4">
              <Link
                href="/book"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base shadow-lg shadow-emerald-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Calendar className="w-5 h-5" />
                <span>Book a Court Now</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>

              <Link
                href="/status"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-semibold text-base border border-slate-700 hover:border-slate-600 transition-all"
              >
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>Upload Receipt / Check Status</span>
              </Link>
            </div>

            {/* Micro assurances */}
            <div className="pt-4 flex flex-wrap items-center gap-4 sm:gap-6 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Instant Slot Hold</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Meezan / Easypaisa / JazzCash</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Verified Match Play</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* QUICK STATS / HIGHLIGHTS BAR */}
      <section className="bg-slate-900 border-b border-slate-800 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400">3</p>
              <p className="text-xs sm:text-sm text-slate-400 font-medium">Tournament Courts</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-extrabold text-white">60 Min</p>
              <p className="text-xs sm:text-sm text-slate-400 font-medium">Standard Slot Duration</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-extrabold text-white">08:00 - 01:00</p>
              <p className="text-xs sm:text-sm text-slate-400 font-medium">Daily Operating Hours</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400">50%</p>
              <p className="text-xs sm:text-sm text-slate-400 font-medium">Advance Slot Deposit</p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW TO BOOK (3 SIMPLE STEPS) */}
      <section className="py-16 sm:py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs uppercase font-bold tracking-wider text-emerald-600 mb-2">
              Fast & Hassle-Free
            </h2>
            <p className="text-3xl font-extrabold text-slate-900 tracking-tight">
              How Court Booking Works
            </p>
            <p className="text-slate-600 text-sm mt-2">
              Book online in 3 simple steps. Advance payments are manually reviewed and verified by management.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 relative group hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-bold text-lg mb-5">
                01
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Select Court & Time</h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                Pick your preferred date, choose between Panoramic, Center, or Climate Indoor courts, and reserve your 60-minute match slot.
              </p>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                Held for 30 minutes
              </span>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 relative group hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-lg mb-5">
                02
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Transfer 50% Advance</h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                Transfer the required advance via Meezan Bank, Bank Transfer, Easypaisa, or JazzCash and upload your receipt screenshot.
              </p>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                Evidence for Review
              </span>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 relative group hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-bold text-lg mb-5">
                03
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Admin Confirms Slot</h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                Club management verifies the transaction on bank records. Once approved, you receive official confirmation and slot lock.
              </p>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                Confirmed & Ready
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* OUR COURTS & FACILITIES */}
      <section className="py-16 sm:py-24 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
            <div>
              <h2 className="text-xs uppercase font-bold tracking-wider text-emerald-600 mb-2">
                Facility & Infrastructure
              </h2>
              <p className="text-3xl font-extrabold text-slate-900 tracking-tight">
                Configured Court Specifications
              </p>
              <p className="text-slate-600 text-sm mt-1">
                All courts adhere to international International Padel Federation (FIP) standards.
              </p>
            </div>
            <Link
              href="/book"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600 hover:text-emerald-700 mt-4 md:mt-0"
            >
              <span>Check Live Schedule</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Court Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {DEMO_COURTS.map((court) => (
              <div
                key={court.id}
                className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm flex flex-col hover:border-emerald-300 transition-all"
              >
                {/* Court Header Banner Placeholder */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                      Court #{court.courtNumber} • {court.type.toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-300">60 Min Slot</span>
                  </div>
                  <h3 className="text-xl font-bold">{court.name}</h3>
                  <p className="text-xs text-slate-300 mt-1 line-clamp-1">{court.surface}</p>
                </div>

                {/* Body details */}
                <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
                  <div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                      {court.description}
                    </p>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-900 uppercase tracking-wide">
                        Key Features:
                      </p>
                      <ul className="space-y-1.5 text-xs text-slate-600">
                        {court.features.map((feature, fIdx) => (
                          <li key={fIdx} className="flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Pricing and Book Button */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Standard / Peak</p>
                      <p className="text-base font-extrabold text-slate-900">
                        PKR {court.hourlyRate.toLocaleString()}
                        <span className="text-xs text-slate-500 font-normal"> / hr</span>
                      </p>
                    </div>

                    <Link
                      href={`/book?court=${court.id}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-emerald-600 text-white font-semibold text-xs transition-colors"
                    >
                      <span>Select Slots</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LOCATION, OPENING HOURS & DIRECT WHATSAPP */}
      <section className="py-16 sm:py-20 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <div className="space-y-6">
              <span className="text-xs uppercase tracking-wider font-bold text-emerald-400">
                Visit or Contact Us
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Ready to play? Find us or message on WhatsApp.
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                Whether you need a regular weekly standing slot, racket rentals, or private coaching,
                reach out directly to our management desk.
              </p>

              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 text-emerald-400">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Opening Hours</p>
                    <p className="text-xs text-slate-300">
                      Monday to Sunday: {CLUB_CONFIG.openingHour} AM – {CLUB_CONFIG.closingHour} AM
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 text-emerald-400">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Facility Address</p>
                    <p className="text-xs text-slate-300">{CLUB_CONFIG.addressPlaceholder}</p>
                    <p className="text-xs text-slate-400">{CLUB_CONFIG.cityPlaceholder}</p>
                  </div>
                </div>
              </div>

              {/* Direct WhatsApp Action */}
              <div className="pt-2">
                <a
                  href={`https://wa.me/${CLUB_CONFIG.whatsappNumberPlaceholder}?text=Assalam-o-Alaikum%2C%20I%20have%20an%20inquiry%20regarding%20court%20timings%20at%20${encodeURIComponent(CLUB_CONFIG.clubNamePlaceholder)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02]"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Chat on WhatsApp: {CLUB_CONFIG.whatsappDisplayPlaceholder}</span>
                </a>
              </div>
            </div>

            {/* Quick Policy & Booking Rules Card */}
            <div className="bg-slate-800/80 rounded-2xl p-6 sm:p-8 border border-slate-700 space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>Court Guidelines & Booking Policy</span>
              </h3>
              <ul className="space-y-3 text-xs sm:text-sm text-slate-300">
                {CLUB_CONFIG.termsSummary.map((term, tIdx) => (
                  <li key={tIdx} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-2" />
                    <span>{term}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-4 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400">
                <span>Rackets & balls available at counter</span>
                <Link href="/book" className="text-emerald-400 font-semibold hover:underline">
                  Go to Booking Calendar →
                </Link>
              </div>
            </div>

          </div>
        </div>
      </section>

    </div>
  );
}
