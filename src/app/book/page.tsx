'use client';

import React, { useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DEMO_COURTS, getDemoSlotsForCourt } from '@/data/demoData';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { DemoBanner } from '@/components/common/DemoBadge';
import { TimeSlot } from '@/types';
import {
  Calendar as CalendarIcon,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  User,
  Phone,
  Mail,
  Check,
  Info,
} from 'lucide-react';

function BookingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCourtId = searchParams.get('court') || DEMO_COURTS[0].id;

  // Selected state
  const [selectedCourtId, setSelectedCourtId] = useState<string>(initialCourtId);

  // Generate selectable dates for next 7 days
  const availableDates = useMemo(() => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
      const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dates.push({ iso, dayName, formatted });
    }
    return dates;
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(availableDates[0].iso);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  // Customer form inputs
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('+92 ');
  const [customerEmail, setCustomerEmail] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get active court object
  const activeCourt = useMemo(() => {
    return DEMO_COURTS.find((c) => c.id === selectedCourtId) || DEMO_COURTS[0];
  }, [selectedCourtId]);

  // Get demo slots for current court and date
  const slots = useMemo(() => {
    return getDemoSlotsForCourt(selectedCourtId, selectedDate);
  }, [selectedCourtId, selectedDate]);

  // Validate form before opening review modal
  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!selectedSlot) {
      errors.slot = 'Please select an available time slot.';
    }
    if (!customerName.trim() || customerName.trim().length < 3) {
      errors.name = 'Please enter your full name (at least 3 characters).';
    }

    const cleanPhone = customerPhone.replace(/\s+/g, '');
    if (!cleanPhone || cleanPhone.length < 11) {
      errors.phone = 'Please enter a valid Pakistani WhatsApp number (e.g., +92 300 1234567).';
    }

    setFormErrors(errors);

    if (Object.keys(errors).length === 0) {
      setShowReviewModal(true);
    }
  };

  // Submit simulated demo booking
  const handleConfirmBooking = () => {
    setIsSubmitting(true);

    // Generate random 4-digit reference code for demo
    const randomRef = Math.floor(1000 + Math.random() * 9000);
    const demoBookingRef = `PADEL-PK-2026-${randomRef}`;

    setTimeout(() => {
      setIsSubmitting(false);
      setShowReviewModal(false);
      // Redirect to payment / status page with booking parameters
      const params = new URLSearchParams({
        ref: demoBookingRef,
        court: activeCourt.name,
        date: selectedDate,
        time: selectedSlot ? selectedSlot.label : '',
        total: selectedSlot ? String(selectedSlot.price) : '4000',
        name: customerName,
        phone: customerPhone,
        status: 'awaiting_payment',
      });
      router.push(`/status?${params.toString()}`);
    }, 800);
  };

  // Calculations
  const totalPrice = selectedSlot ? selectedSlot.price : activeCourt.hourlyRate;
  const advanceAmount = Math.round(totalPrice * (CLUB_CONFIG.advancePercentage / 100));
  const remainingAmount = totalPrice - advanceAmount;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      
      {/* Top Demo Banner */}
      <DemoBanner message="DEMO BOOKING ENGINE: Real-time conflict protection & Supabase database integration will be connected in Phases 2-4. Slots shown here are for demonstration." />

      {/* Page Header */}
      <div className="bg-slate-900 text-white py-10 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Court Reservation
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
                Book a Padel Court
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Select your preferred court, date, and 60-minute match slot.
              </p>
            </div>

            {/* Quick Policy Notice */}
            <div className="bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-700 text-xs text-slate-300 flex items-center gap-2.5 max-w-md">
              <Info className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {CLUB_CONFIG.advancePercentage}% advance required within 30 mins to confirm reservation.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT 2 COLUMNS: Court Selection, Date Picker, Slot Grid */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* 1. COURT SELECTOR */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-emerald-400 text-xs flex items-center justify-center font-bold">
                    1
                  </span>
                  <span>Select Court</span>
                </h2>
                <span className="text-xs text-slate-500 font-medium">
                  {DEMO_COURTS.length} Available Courts
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {DEMO_COURTS.map((court) => {
                  const isSelected = court.id === selectedCourtId;
                  return (
                    <button
                      key={court.id}
                      type="button"
                      onClick={() => {
                        setSelectedCourtId(court.id);
                        setSelectedSlot(null); // Reset slot on court switch
                      }}
                      className={`text-left p-4 rounded-xl border transition-all relative ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                      <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded">
                        {court.type}
                      </span>
                      <h3 className="font-bold text-sm text-slate-900 mt-2">{court.name}</h3>
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{court.surface}</p>
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-baseline justify-between">
                        <span className="text-[11px] text-slate-500">Rate:</span>
                        <span className="text-xs font-bold text-slate-900">
                          PKR {court.hourlyRate.toLocaleString()}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. DATE SELECTOR */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-emerald-400 text-xs flex items-center justify-center font-bold">
                    2
                  </span>
                  <span>Select Date</span>
                </h2>
                <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                  <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Next 7 Days</span>
                </div>
              </div>

              {/* Horizontal scrollable date pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {availableDates.map((item) => {
                  const isSelected = item.iso === selectedDate;
                  return (
                    <button
                      key={item.iso}
                      type="button"
                      onClick={() => {
                        setSelectedDate(item.iso);
                        setSelectedSlot(null);
                      }}
                      className={`shrink-0 flex flex-col items-center justify-center min-w-[85px] py-2.5 px-3 rounded-xl border text-center transition-all ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className={`text-[11px] font-medium ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {item.dayName}
                      </span>
                      <span className="text-sm font-bold mt-0.5">{item.formatted}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. TIME SLOT SELECTION & LEGEND */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-emerald-400 text-xs flex items-center justify-center font-bold">
                    3
                  </span>
                  <span>Available Time Slots (60 Mins)</span>
                </h2>

                {/* Status Legend */}
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-white border border-slate-300" />
                    <span className="text-slate-600">Available</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
                    <span className="text-slate-600">Held</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300" />
                    <span className="text-slate-600">Booked</span>
                  </div>
                </div>
              </div>

              {formErrors.slot && (
                <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formErrors.slot}</span>
                </div>
              )}

              {/* Slots Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {slots.map((slot) => {
                  const isAvailable = slot.status === 'available';
                  const isHeld = slot.status === 'held';
                  const isBooked = slot.status === 'booked';
                  const isSelected = selectedSlot?.id === slot.id;

                  let buttonStyles = '';
                  if (isSelected) {
                    buttonStyles = 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-500/30';
                  } else if (isAvailable) {
                    buttonStyles = 'bg-white hover:border-emerald-500 hover:bg-emerald-50/20 text-slate-900 border-slate-200';
                  } else if (isHeld) {
                    buttonStyles = 'bg-amber-50/70 border-amber-200 text-amber-800 cursor-not-allowed opacity-80';
                  } else {
                    buttonStyles = 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed';
                  }

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => {
                        setSelectedSlot(slot);
                        if (formErrors.slot) {
                          setFormErrors((prev) => ({ ...prev, slot: '' }));
                        }
                      }}
                      className={`p-3 rounded-xl border text-center transition-all flex flex-col justify-center items-center ${buttonStyles}`}
                    >
                      <span className="text-xs font-bold leading-tight">{slot.label}</span>
                      <div className="mt-1 flex items-center gap-1">
                        {isAvailable && (
                          <span className={`text-[11px] ${isSelected ? 'text-emerald-100' : 'text-emerald-600 font-semibold'}`}>
                            PKR {slot.price.toLocaleString()}
                          </span>
                        )}
                        {isHeld && (
                          <span className="text-[10px] text-amber-700 font-medium">
                            Held (Expiring)
                          </span>
                        )}
                        {isBooked && (
                          <span className="text-[10px] text-slate-500 font-medium">
                            Reserved
                          </span>
                        )}
                        {slot.isPeak && isAvailable && (
                          <span className={`text-[9px] uppercase px-1 rounded ${isSelected ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            Peak
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT 1 COLUMN: Customer Information & Booking Summary */}
          <div className="space-y-6">
            
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-slate-900 text-emerald-400 text-xs flex items-center justify-center font-bold">
                  4
                </span>
                <span>Player Details</span>
              </h2>

              <form onSubmit={handleProceedToReview} className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="e.g. Hamza Tariq"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                        formErrors.name ? 'border-rose-300 bg-rose-50/20' : 'border-slate-300'
                      }`}
                      required
                    />
                  </div>
                  {formErrors.name && (
                    <p className="text-rose-600 text-xs mt-1">{formErrors.name}</p>
                  )}
                </div>

                {/* WhatsApp Phone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp Mobile Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="tel"
                      placeholder="+92 300 1234567"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                        formErrors.phone ? 'border-rose-300 bg-rose-50/20' : 'border-slate-300'
                      }`}
                      required
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Booking confirmation and payment updates will be sent via WhatsApp.
                  </p>
                  {formErrors.phone && (
                    <p className="text-rose-600 text-xs mt-1">{formErrors.phone}</p>
                  )}
                </div>

                {/* Email (Optional) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="email"
                      placeholder="e.g. player@example.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* SUMMARY CARD */}
                <div className="pt-4 border-t border-slate-100 space-y-2.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Court:</span>
                    <span className="font-semibold text-slate-900">{activeCourt.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date:</span>
                    <span className="font-semibold text-slate-900">{selectedDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Slot Time:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedSlot ? selectedSlot.label : 'Select slot above'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Duration:</span>
                    <span className="font-semibold text-slate-900">60 Minutes</span>
                  </div>

                  <div className="pt-3 border-t border-slate-200 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-slate-900">Total Court Fee:</span>
                      <span className="font-extrabold text-slate-900">
                        PKR {totalPrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs bg-emerald-50 text-emerald-900 p-2 rounded-lg font-medium">
                      <span>{CLUB_CONFIG.advancePercentage}% Advance to Hold:</span>
                      <span className="font-bold">PKR {advanceAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 px-1">
                      <span>Payable at Venue Counter:</span>
                      <span>PKR {remainingAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* SUBMIT BUTTON */}
                <button
                  type="submit"
                  disabled={!selectedSlot}
                  className="w-full mt-4 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>Review Booking Request</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* Verification Guarantee */}
            <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-800">Advance Security Policy:</span>
                <p className="mt-0.5 text-slate-600">
                  After placing your request, your slot is temporarily held for 30 minutes while you complete your bank transfer or mobile wallet payment.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* REVIEW & CONFIRMATION MODAL */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                Final Review
              </span>
              <h3 className="text-xl font-bold text-slate-900 mt-1">
                Confirm Booking Request
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Please double-check your match schedule details before initiating payment.
              </p>
            </div>

            {/* Schedule Summary Box */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Court:</span>
                <span className="font-bold text-slate-900">{activeCourt.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Date:</span>
                <span className="font-bold text-slate-900">{selectedDate}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Slot Time:</span>
                <span className="font-bold text-slate-900">{selectedSlot?.label}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Player:</span>
                <span className="font-bold text-slate-900">{customerName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">WhatsApp:</span>
                <span className="font-bold text-slate-900">{customerPhone}</span>
              </div>
              <div className="flex justify-between py-1 text-emerald-800 font-bold bg-emerald-50/80 px-2 rounded">
                <span>Advance Required (50%):</span>
                <span>PKR {advanceAmount.toLocaleString()}</span>
              </div>
            </div>

            {/* Instruction Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Next Step: Payment Submission</p>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                  Clicking confirm will reserve this slot on temporary hold. You will then be redirected to transfer the advance via Bank Transfer, Easypaisa, or JazzCash and upload your receipt screenshot.
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors"
                disabled={isSubmitting}
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmBooking}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-2"
              >
                {isSubmitting ? (
                  <span>Generating Booking...</span>
                ) : (
                  <>
                    <span>Confirm & Pay Advance</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-xs">
          Loading booking calendar...
        </div>
      }
    >
      <BookingPageContent />
    </Suspense>
  );
}
