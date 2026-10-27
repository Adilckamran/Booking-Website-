'use client';

import React, { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DEMO_COURTS, getDemoSlotsForCourt } from '@/data/demoData';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { StatusBadge } from '@/components/common/StatusBadge';
import {
  calculateMultipleSlotsPrice,
} from '@/services/pricing/pricingService';
import { validateReceiptFile, RECEIPT_STORAGE_CONFIG } from '@/services/storage/receiptStorage';
import { validatePakistaniMobile } from '@/utils/phoneValidation';
import { copyToClipboard } from '@/utils/clipboard';
import { getKarachiDateString, getKarachiRollingDates } from '@/utils/timezone';
import { TimeSlot, PaymentMethod, Booking } from '@/types';
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
  RefreshCw,
  Clock,
  Upload,
  Copy,
  CheckCircle2,
  Building2,
  Smartphone,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';

function getOperatingScheduleMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  return h * 60 + m;
}

function BookingPageContent() {
  const searchParams = useSearchParams();
  const initialCourtId = searchParams.get('court') || DEMO_COURTS[0].id;

  // Selected court & duration
  const [selectedCourtId, setSelectedCourtId] = useState<string>(initialCourtId);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);

  // Track Karachi business date to auto-advance calendar if tab is left open across midnight
  const [karachiToday, setKarachiToday] = useState(() => getKarachiDateString());

  useEffect(() => {
    const handleDayCheck = () => {
      const current = getKarachiDateString();
      setKarachiToday((prev) => (prev !== current ? current : prev));
    };

    // Check every 30 seconds and on window focus/tab visibility change
    const interval = setInterval(handleDayCheck, 30000);
    window.addEventListener('focus', handleDayCheck);
    document.addEventListener('visibilitychange', handleDayCheck);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleDayCheck);
      document.removeEventListener('visibilitychange', handleDayCheck);
    };
  }, []);

  // Selectable rolling 7-day window based strictly on Asia/Karachi (Pakistan Standard Time, UTC+5)
  const availableDates = useMemo(() => {
    return getKarachiRollingDates(7, karachiToday);
  }, [karachiToday]);

  const [selectedDate, setSelectedDate] = useState<string>(availableDates[0].iso);
  const [selectedSlots, setSelectedSlots] = useState<TimeSlot[]>([]);
  const [prevFirstDate, setPrevFirstDate] = useState(availableDates[0].iso);

  // If the business day advances while the tab is open, roll selected date forward
  if (availableDates[0].iso !== prevFirstDate) {
    setPrevFirstDate(availableDates[0].iso);
    if (selectedDate < availableDates[0].iso) {
      setSelectedDate(availableDates[0].iso);
      setSelectedSlots([]);
    }
  }

  // Duration-based slot requirements (60m = 1 slot, 120m = 2 slots, 180m = 3 slots)
  const requiredSlotCount = useMemo(() => {
    return Math.max(1, Math.round(durationMinutes / 60));
  }, [durationMinutes]);

  // Customer form inputs
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('03');
  const [customerEmail, setCustomerEmail] = useState('');

  // Payment Method selection
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('easypaisa');
  const [transactionRef, setTransactionRef] = useState('');

  // Payment Screenshot Upload State
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileSizeDisplay, setFileSizeDisplay] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Validation & Server feedback
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverErrorType, setServerErrorType] = useState<'conflict' | 'permission' | 'other' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setIsDatabaseConnected] = useState<boolean>(false);

  // Copy feedback toast
  const [copyToast, setCopyToast] = useState<string | null>(null);

  // Completed booking result state (displays integrated success screen)
  const [completedBooking, setCompletedBooking] = useState<Booking | null>(null);

  // Live Slot Availability State
  const [slots, setSlots] = useState<TimeSlot[]>(() =>
    getDemoSlotsForCourt(initialCourtId, availableDates[0].iso)
  );
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);

  // Get active court object
  const activeCourt = useMemo(() => {
    return DEMO_COURTS.find((c) => c.id === selectedCourtId) || DEMO_COURTS[0];
  }, [selectedCourtId]);

  // Fetch slot availability from server API
  const fetchAvailability = useCallback(async (courtId: string, date: string) => {
    try {
      const res = await fetch(`/api/availability?courtId=${courtId}&date=${date}`);
      if (res.ok) {
        const data = await res.json();
        if (data.slots && Array.isArray(data.slots)) {
          setSlots(data.slots);
          setIsDatabaseConnected(!!data.isDatabaseConnected);
        }
      }
    } catch {
      // Keep existing slots on fetch failure
    } finally {
      setIsLoadingSlots(false);
    }
  }, []);

  const handleManualRefresh = () => {
    setIsLoadingSlots(true);
    fetchAvailability(selectedCourtId, selectedDate);
  };

  useEffect(() => {
    let isMounted = true;
    const loadAvailability = async () => {
      try {
        const res = await fetch(`/api/availability?courtId=${selectedCourtId}&date=${selectedDate}`);
        if (!isMounted) return;
        if (res.ok) {
          const data = await res.json();
          if (data.slots && Array.isArray(data.slots)) {
            setSlots(data.slots);
            setIsDatabaseConnected(!!data.isDatabaseConnected);
          }
        }
      } catch {
        // Keep existing
      }
    };

    loadAvailability();
    return () => {
      isMounted = false;
    };
  }, [selectedCourtId, selectedDate]);

  // Handle slot selection toggle (supports any independent, non-consecutive 1-hour slots)
  const handleSlotToggle = useCallback(
    (slot: TimeSlot) => {
      if (slot.status !== 'available') return;

      if (formErrors.slot) {
        setFormErrors((prev) => ({ ...prev, slot: '' }));
      }

      const isAlreadySelected = selectedSlots.some((s) => s.startTime === slot.startTime);

      if (isAlreadySelected) {
        // Deselect clicked slot
        setSelectedSlots((prev) => prev.filter((s) => s.startTime !== slot.startTime));
        return;
      }

      // If exactly 1 slot is required (60 mins), clicking another slot replaces it
      if (requiredSlotCount === 1) {
        setSelectedSlots([slot]);
        return;
      }

      // If under limit, append the slot
      if (selectedSlots.length < requiredSlotCount) {
        setSelectedSlots((prev) =>
          [...prev, slot].sort((a, b) => getOperatingScheduleMinutes(a.startTime) - getOperatingScheduleMinutes(b.startTime))
        );
        return;
      }

      // If already at required slot count, replace the last chosen slot
      setSelectedSlots((prev) => {
        const next = [...prev.slice(0, requiredSlotCount - 1), slot];
        return next.sort((a, b) => getOperatingScheduleMinutes(a.startTime) - getOperatingScheduleMinutes(b.startTime));
      });
    },
    [formErrors.slot, requiredSlotCount, selectedSlots]
  );

  const handleRemoveSlot = useCallback((startTime: string) => {
    setSelectedSlots((prev) => prev.filter((s) => s.startTime !== startTime));
  }, []);

  // Duration change handler: preserves selected slots up to new required limit
  const handleDurationChange = useCallback((newDuration: number) => {
    setDurationMinutes(newDuration);
    const newReqCount = Math.max(1, Math.round(newDuration / 60));
    setSelectedSlots((prev) => prev.slice(0, newReqCount));
    if (formErrors.slot) {
      setFormErrors((prev) => ({ ...prev, slot: '' }));
    }
  }, [formErrors.slot]);

  // Pricing calculation across all independently chosen slots
  const pricingCalculation = useMemo(() => {
    if (selectedSlots.length > 0) {
      return calculateMultipleSlotsPrice(
        selectedCourtId,
        selectedSlots.map((s) => s.startTime)
      );
    }
    // Preview baseline pricing when no slots selected yet
    const placeholderSlots: string[] = [];
    const baseHour = 18;
    for (let i = 0; i < requiredSlotCount; i++) {
      const h = (baseHour + i) % 24;
      placeholderSlots.push(`${String(h).padStart(2, '0')}:00`);
    }
    return calculateMultipleSlotsPrice(selectedCourtId, placeholderSlots);
  }, [selectedCourtId, selectedSlots, requiredSlotCount]);

  // Copy helper with toast
  const handleCopyText = async (text: string, label: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopyToast(`${label} copied successfully!`);
      setTimeout(() => setCopyToast(null), 3000);
    }
  };

  // Screenshot picker handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateReceiptFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid file uploaded.');
      setReceiptFile(null);
      setReceiptPreview(null);
      setFileName('');
      setFileSizeDisplay('');
      return;
    }

    setUploadError(null);
    setReceiptFile(file);
    setFileName(file.name);
    const sizeFormatted =
      file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(0)} KB`
        : `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    setFileSizeDisplay(sizeFormatted);

    if (formErrors.receipt) {
      setFormErrors((prev) => ({ ...prev, receipt: '' }));
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Remove selected screenshot
  const handleRemoveImage = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    setFileName('');
    setFileSizeDisplay('');
    setUploadError(null);
  };

  // Unified Submission Handler
  const handleBookingSubmit = async (mode: 'with_receipt' | 'pay_later') => {
    const errors: Record<string, string> = {};
    setServerError(null);
    setServerErrorType(null);
    setUploadError(null);

    // 1. Validate slot selection: must match required count exactly
    if (selectedSlots.length !== requiredSlotCount) {
      errors.slot = `Please select exactly ${requiredSlotCount} one-hour time slot${
        requiredSlotCount > 1 ? 's' : ''
      } for your ${durationMinutes}-minute match. (${selectedSlots.length} selected).`;
    }

    // 2. Validate customer full name (min 3 characters)
    if (!customerName.trim() || customerName.trim().length < 3) {
      errors.name = 'Please enter your full name (at least 3 characters).';
    }

    // 3. Validate Pakistani local mobile number (exact 11 digits, e.g. 03162997913)
    const phoneVal = validatePakistaniMobile(customerPhone);
    if (!phoneVal.valid || !phoneVal.normalized) {
      errors.phone = phoneVal.error || 'A valid 11-digit Pakistani mobile number is required (e.g. 03162997913).';
    }

    // 4. Validate payment proof when submitting with receipt
    if (mode === 'with_receipt') {
      if (!receiptFile && !receiptPreview) {
        errors.receipt = 'Please upload a payment screenshot of your PKR 500 advance deposit.';
      }
    }

    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    if (mode === 'with_receipt') {
      setUploadProgress(20);
    }

    try {
      let res: Response;
      const normalizedPhone = phoneVal.normalized!;
      const sortedSelectedSlots = [...selectedSlots].sort((a, b) => getOperatingScheduleMinutes(a.startTime) - getOperatingScheduleMinutes(b.startTime));
      const slotStartTimes = sortedSelectedSlots.map((s) => s.startTime);
      const primaryStartTime = slotStartTimes[0];

      if (mode === 'with_receipt' && receiptFile) {
        const formData = new FormData();
        formData.append('courtId', selectedCourtId);
        formData.append('date', selectedDate);
        formData.append('startTime', primaryStartTime);
        formData.append('slots', JSON.stringify(slotStartTimes));
        formData.append('durationMinutes', String(durationMinutes));
        formData.append('customerName', customerName.trim());
        formData.append('customerPhone', normalizedPhone);
        if (customerEmail.trim()) formData.append('customerEmail', customerEmail.trim());
        formData.append('paymentMethod', paymentMethod);
        if (transactionRef.trim()) {
          formData.append('transactionRef', transactionRef.trim());
        }
        formData.append('receipt', receiptFile);

        setUploadProgress(60);

        res = await fetch('/api/bookings', {
          method: 'POST',
          body: formData,
        });
      } else {
        if (mode === 'with_receipt') setUploadProgress(60);

        res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courtId: selectedCourtId,
            date: selectedDate,
            startTime: primaryStartTime,
            slots: slotStartTimes,
            durationMinutes,
            customerName: customerName.trim(),
            customerPhone: normalizedPhone,
            customerEmail: customerEmail.trim() || undefined,
            paymentMethod: mode === 'with_receipt' ? paymentMethod : undefined,
            transactionRef: mode === 'with_receipt' && transactionRef.trim() ? transactionRef.trim() : undefined,
            receiptScreenshotUrl: mode === 'with_receipt' ? receiptPreview : undefined,
          }),
        });
      }

      if (mode === 'with_receipt') setUploadProgress(90);
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (mode === 'with_receipt') setUploadProgress(null);
        if (data.isConflict) {
          setServerErrorType('conflict');
          setServerError(data.error || 'One or more of the selected slots could not be reserved due to an existing reservation.');
          await fetchAvailability(selectedCourtId, selectedDate);
        } else if (data.isPermissionOrDb) {
          setServerErrorType('permission');
          setServerError(data.error);
        } else {
          setServerErrorType('other');
          setServerError(data.error || 'Failed to complete booking. Please try again.');
        }
        return;
      }

      if (mode === 'with_receipt') setUploadProgress(100);
      setCompletedBooking(data.booking);
    } catch {
      if (mode === 'with_receipt') setUploadProgress(null);
      setServerErrorType('other');
      setServerError('Network error while processing booking. Please check your connection.');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setUploadProgress(null), 1000);
    }
  };

  // Reset page to place a new booking
  const handleResetForNewBooking = () => {
    setCompletedBooking(null);
    setSelectedSlots([]);
    setReceiptFile(null);
    setReceiptPreview(null);
    setFileName('');
    setFileSizeDisplay('');
    setTransactionRef('');
    setServerError(null);
    setFormErrors({});
    fetchAvailability(selectedCourtId, selectedDate);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Floating Copy Feedback Toast */}
      {copyToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold py-3 px-4 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{copyToast}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="bg-[#0A2540] text-white py-10 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">
                Power Padel Arena • PECHS Karachi
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
                Book a Padel Court
              </h1>
              <p className="text-xs sm:text-sm text-slate-200 mt-1">
                Choose your court, select your slot, and confirm with advance payment in one simple flow.
              </p>
            </div>

            {/* Quick Policy Notice */}
            <div className="bg-slate-800/90 px-4 py-2.5 rounded-xl border border-slate-700 text-xs text-slate-200 flex items-center gap-2.5 max-w-md">
              <Info className="w-4 h-4 text-orange-400 shrink-0" />
              <span>
                Fixed PKR 500 advance deposit required to confirm reservation. Remaining balance paid at venue counter.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* SUCCESS CONFIRMATION MODAL / VIEW */}
        {completedBooking ? (
          <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-7 h-7 stroke-[2.5]" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Booking Successfully Submitted
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 font-mono">
                    {completedBooking.referenceNumber}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge status={completedBooking.status} size="lg" />
                <button
                  type="button"
                  onClick={() => handleCopyText(completedBooking.referenceNumber, 'Booking Reference')}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  title="Copy Reference"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Ref</span>
                </button>
              </div>
            </div>

            {/* Explanation Notice */}
            {completedBooking.status === 'payment_under_review' ? (
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs space-y-1.5">
                <p className="font-bold text-sm flex items-center gap-1.5 text-blue-950">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Payment Evidence Under Manual Verification</span>
                </p>
                <p className="leading-relaxed text-blue-800">
                  Your court slot is held exclusively for you. Power Padel Arena management is manually verifying your PKR 500 advance transfer against our bank and Easypaisa statement.
                </p>
                <p className="text-[11px] text-blue-950/80 font-medium italic">
                  Claimed TRX ID: <strong className="font-mono">{completedBooking.transactionRef || 'Not provided'}</strong> • Payment Channel: <strong className="capitalize">{completedBooking.paymentMethod ? completedBooking.paymentMethod.replace('_', ' ') : 'N/A'}</strong>
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1.5">
                <p className="font-bold text-sm flex items-center gap-1.5 text-amber-950">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Court Slot Held for 60 Minutes</span>
                </p>
                <p className="leading-relaxed text-amber-800">
                  Your reservation is held in <strong>Awaiting Payment</strong> status. Please transfer the PKR 500 advance deposit via Easypaisa or Faysal Bank within {CLUB_CONFIG.paymentDeadlineMinutes} minutes and upload your screenshot on the status tracking page.
                </p>
              </div>
            )}

            {/* Schedule & Financial Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 font-medium block">Court</span>
                <span className="font-bold text-slate-900 block mt-0.5">{completedBooking.courtName}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Match Time</span>
                <span className="font-bold text-slate-900 block mt-0.5">
                  {completedBooking.date}
                </span>
                {completedBooking.slots && completedBooking.slots.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {completedBooking.slots.map((s, idx) => (
                      <span
                        key={idx}
                        className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold"
                      >
                        {s.startTime} - {s.endTime}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-700 font-medium block text-xs mt-0.5">
                    {completedBooking.startTime} - {completedBooking.endTime}
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Advance Deposit</span>
                <span className="font-black text-emerald-700 block mt-0.5">
                  PKR {completedBooking.advanceRequiredAmount.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Payable at Venue</span>
                <span className="font-bold text-slate-900 block mt-0.5">
                  PKR {completedBooking.remainingAmount.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Customer Details */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3 text-slate-600">
              <div>
                <span className="text-slate-500">Player: </span>
                <strong className="text-slate-900">{completedBooking.customerName}</strong>
              </div>
              <div>
                <span className="text-slate-500">WhatsApp: </span>
                <strong className="text-slate-900">{completedBooking.customerPhone}</strong>
              </div>
              {completedBooking.customerEmail && (
                <div>
                  <span className="text-slate-500">Email: </span>
                  <strong className="text-slate-900">{completedBooking.customerEmail}</strong>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleResetForNewBooking}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors"
              >
                Book Another Court
              </button>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <a
                  href={`https://wa.me/${CLUB_CONFIG.whatsappNumberPlaceholder}?text=Assalam-o-Alaikum%20Power%20Padel%20Arena%2C%20regarding%20my%20booking%20reference%20${completedBooking.referenceNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs hover:bg-emerald-100 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp Desk</span>
                </a>

                <Link
                  href={`/status?ref=${encodeURIComponent(completedBooking.referenceNumber)}`}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow transition-all"
                >
                  <span>View Status Page</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* UNIFIED ONE-PAGE BOOKING FLOW */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* LEFT COLUMN: Court, Duration, Date, Time Slot (7 Cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* 1. COURT SELECTOR */}
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0A2540] text-orange-400 text-xs flex items-center justify-center font-bold">
                      1
                    </span>
                    <span>Select Court</span>
                  </h2>
                  <span className="text-xs text-slate-500 font-medium">
                    3 Professional Panoramic Courts
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {DEMO_COURTS.map((court) => {
                    const isSelected = court.id === selectedCourtId;
                    const isSingle = court.type === 'single';

                    return (
                      <button
                        key={court.id}
                        type="button"
                        onClick={() => {
                          setSelectedCourtId(court.id);
                          setSelectedSlots([]);
                        }}
                        className={`text-left p-4 rounded-xl border transition-all relative cursor-pointer ${
                          isSelected
                            ? 'border-orange-500 bg-orange-50/40 ring-2 ring-orange-500/20'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded inline-block ${
                          isSingle ? 'text-indigo-800 bg-indigo-100' : 'text-orange-800 bg-orange-100/70'
                        }`}>
                          {isSingle ? 'Single Court (1v1)' : 'Double Court (4P)'}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900 mt-2">{court.name}</h3>
                        <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{court.surface}</p>

                        <div className="mt-3 pt-2 border-t border-slate-100 space-y-1 text-xs">
                          {isSingle ? (
                            <div className="flex items-baseline justify-between">
                              <span className="text-[11px] text-slate-500">Fixed Rate:</span>
                              <span className="text-xs font-bold text-indigo-700">PKR 2,000/hr (All Day)</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-baseline justify-between text-[11px]">
                                <span className="text-slate-500">Off-Peak (6AM-6PM):</span>
                                <span className="font-bold text-emerald-700">PKR 3,500/hr</span>
                              </div>
                              <div className="flex items-baseline justify-between text-[11px]">
                                <span className="text-slate-500">Peak (6PM-6AM):</span>
                                <span className="font-bold text-orange-700">PKR 4,000/hr</span>
                              </div>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. DURATION SELECTOR */}
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0A2540] text-orange-400 text-xs flex items-center justify-center font-bold">
                      2
                    </span>
                    <span>Select Match Duration</span>
                  </h2>
                  <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Independent & Non-consecutive Slots Supported</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                  {[
                    { minutes: 60, label: '60 Minutes (1 Hour)', desc: '1 slot required' },
                    { minutes: 120, label: '120 Minutes (2 Hours)', desc: '2 independent slots' },
                    { minutes: 180, label: '180 Minutes (3 Hours)', desc: '3 independent slots' },
                  ].map((dur) => {
                    const isSelected = durationMinutes === dur.minutes;
                    return (
                      <button
                        key={dur.minutes}
                        type="button"
                        onClick={() => handleDurationChange(dur.minutes)}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#0A2540] text-white border-[#0A2540] shadow-sm ring-2 ring-orange-500/30'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className="block font-bold text-xs sm:text-sm">{dur.label}</span>
                        <span className={`text-[10px] block mt-0.5 ${isSelected ? 'text-orange-400' : 'text-slate-500'}`}>
                          {dur.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. DATE SELECTOR */}
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0A2540] text-orange-400 text-xs flex items-center justify-center font-bold">
                      3
                    </span>
                    <span>Select Date</span>
                  </h2>
                  <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                    <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>Next 7 Days</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {availableDates.map((item) => {
                    const isSelected = selectedDate === item.iso;
                    return (
                      <button
                        key={item.iso}
                        type="button"
                        onClick={() => {
                          setSelectedDate(item.iso);
                          setSelectedSlots([]);
                        }}
                        className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                          isSelected
                            ? 'bg-[#0A2540] text-white border-[#0A2540] shadow ring-2 ring-orange-500/30'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={`text-[11px] font-medium ${isSelected ? 'text-orange-400' : 'text-slate-500'}`}>
                          {item.dayName}
                        </span>
                        <span className="text-sm font-bold mt-0.5">{item.formatted}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. TIME SLOT SELECTION & LEGEND */}
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#0A2540] text-orange-400 text-xs flex items-center justify-center font-bold">
                        4
                      </span>
                      <span>Select Time Slots</span>
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                          selectedSlots.length === requiredSlotCount
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {selectedSlots.length} of {requiredSlotCount} selected
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Choose any {requiredSlotCount} available 1-hour slot{requiredSlotCount > 1 ? 's' : ''}. Slots can be non-consecutive (e.g. morning and evening). Click a selected slot to deselect.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleManualRefresh}
                      disabled={isLoadingSlots}
                      title="Refresh live availability"
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSlots ? 'animate-spin text-orange-500' : ''}`} />
                      <span className="hidden sm:inline">Refresh</span>
                    </button>

                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-white border border-slate-300" />
                        <span className="text-slate-600">Available</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
                        <span className="text-slate-600">Reserved</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300" />
                        <span className="text-slate-600">Booked</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Selected Slots Chips (Quick Dismiss) */}
                {selectedSlots.length > 0 && (
                  <div className="mb-4 p-3 rounded-xl bg-orange-50/60 border border-orange-200 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-orange-950 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-orange-600" />
                      <span>Selected ({selectedSlots.length}/{requiredSlotCount}):</span>
                    </span>
                    {selectedSlots.map((slot) => (
                      <span
                        key={slot.startTime}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-orange-300 text-slate-800 text-xs font-semibold shadow-sm"
                      >
                        <span>{slot.label}</span>
                        <span className="text-emerald-700 font-bold">
                          PKR {slot.price.toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSlot(slot.startTime)}
                          className="w-4 h-4 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 flex items-center justify-center text-[10px] transition-colors cursor-pointer"
                          title="Deselect slot"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    {selectedSlots.length < requiredSlotCount && (
                      <span className="text-xs text-orange-800 italic">
                        Select {requiredSlotCount - selectedSlots.length} more slot{requiredSlotCount - selectedSlots.length > 1 ? 's' : ''} to complete booking
                      </span>
                    )}
                  </div>
                )}

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
                    const isSelected = selectedSlots.some((s) => s.startTime === slot.startTime);

                    let buttonStyles = '';
                    if (isSelected) {
                      buttonStyles = 'bg-orange-500 text-white border-orange-600 ring-2 ring-orange-500/30 cursor-pointer shadow-sm';
                    } else if (isAvailable) {
                      buttonStyles = 'bg-white hover:border-orange-500 hover:bg-orange-50/20 text-slate-900 border-slate-200 cursor-pointer';
                    } else if (isHeld) {
                      buttonStyles = 'bg-amber-50/70 border-amber-200 text-amber-800 cursor-not-allowed opacity-80';
                    } else {
                      buttonStyles = 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed';
                    }

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={!isAvailable && !isSelected}
                        onClick={() => handleSlotToggle(slot)}
                        className={`p-3 rounded-xl border text-center transition-all flex flex-col justify-center items-center ${buttonStyles}`}
                      >
                        <span className="text-xs font-bold leading-tight">{slot.label}</span>
                        <div className="mt-1 flex items-center gap-1">
                          {isSelected ? (
                            <span className="text-[11px] font-bold text-white flex items-center gap-1">
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>PKR {slot.price.toLocaleString()}</span>
                            </span>
                          ) : isAvailable ? (
                            <span className="text-[11px] text-emerald-600 font-semibold">
                              PKR {slot.price.toLocaleString()}/hr
                            </span>
                          ) : null}

                          {isHeld && (
                            <span className="text-[10px] text-amber-700 font-medium">
                              Reserved
                            </span>
                          )}
                          {isBooked && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              Booked
                            </span>
                          )}
                          {slot.isPeak && isAvailable && !isSelected && (
                            <span className="text-[9px] uppercase px-1 rounded bg-slate-100 text-slate-600">
                              Peak
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <span className="text-[9px] text-orange-100 mt-0.5">
                            Click to deselect
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Customer Details, Payment Method, Upload Screenshot, Final Button (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                
                {/* 5. PLAYER DETAILS */}
                <div>
                  <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0A2540] text-orange-400 text-xs flex items-center justify-center font-bold">
                      5
                    </span>
                    <span>Customer Details</span>
                  </h2>

                  <div className="space-y-3.5">
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
                          onChange={(e) => {
                            setCustomerName(e.target.value);
                            if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: '' }));
                          }}
                          className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                            formErrors.name ? 'border-rose-300 bg-rose-50/20' : 'border-slate-300'
                          }`}
                          required
                        />
                      </div>
                      {formErrors.name && (
                        <p className="text-rose-600 text-xs mt-1">{formErrors.name}</p>
                      )}
                    </div>

                    {/* WhatsApp Mobile Number */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Pakistani Mobile Number <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                        <input
                          type="tel"
                          placeholder="03162997913"
                          value={customerPhone}
                          onChange={(e) => {
                            setCustomerPhone(e.target.value);
                            if (formErrors.phone) setFormErrors((prev) => ({ ...prev, phone: '' }));
                          }}
                          className={`w-full pl-9 pr-3 py-2 text-sm font-mono rounded-lg border focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                            formErrors.phone ? 'border-rose-300 bg-rose-50/20' : 'border-slate-300'
                          }`}
                          required
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Must be exactly 11 digits (e.g. 03162997913). Spaces or hyphens are normalized automatically.
                      </p>
                      {formErrors.phone && (
                        <p className="text-rose-600 text-xs mt-1 font-semibold">{formErrors.phone}</p>
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
                          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 6. CHOOSE PAYMENT METHOD (Directly below customer details) */}
                <div className="pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#0A2540] text-orange-400 text-xs flex items-center justify-center font-bold">
                        6
                      </span>
                      <span>Choose Payment Method</span>
                    </h2>
                    <span className="text-[11px] font-bold text-amber-900 bg-amber-100/70 px-2 py-0.5 rounded">
                      Advance: PKR 500
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3">
                    Transfer PKR 500 advance to hold your slot. Select your channel to view and copy details:
                  </p>

                  <div className="space-y-3">
                    {/* OPTION A: EASYPAISA */}
                    <div
                      onClick={() => setPaymentMethod('easypaisa')}
                      className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                        paymentMethod === 'easypaisa'
                          ? 'border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                            paymentMethod === 'easypaisa' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <Smartphone className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                              Option A
                            </span>
                            <h4 className="text-sm font-bold text-slate-900">Easypaisa</h4>
                          </div>
                        </div>
                        {paymentMethod === 'easypaisa' && (
                          <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 stroke-[3]" /> Selected
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 text-xs pt-1">
                        <div className="flex justify-between items-baseline text-slate-600">
                          <span className="text-slate-500">Account Holder:</span>
                          <span className="font-bold text-slate-900">{CLUB_CONFIG.easypaisaAccount.accountTitle}</span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-2.5 rounded-lg border border-slate-200">
                          <div>
                            <span className="text-[10px] text-slate-500 block">Payment Number:</span>
                            <span className="font-mono font-bold text-slate-900 text-sm">
                              {CLUB_CONFIG.easypaisaAccount.accountNumber}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyText(CLUB_CONFIG.easypaisaAccount.accountNumber, 'Easypaisa Number');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer w-full sm:w-auto"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Easypaisa Number</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* OPTION B: FAYSAL BANK */}
                    <div
                      onClick={() => setPaymentMethod('bank_transfer')}
                      className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                        paymentMethod === 'bank_transfer'
                          ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                            paymentMethod === 'bank_transfer' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded">
                              Option B
                            </span>
                            <h4 className="text-sm font-bold text-slate-900">Faysal Bank</h4>
                          </div>
                        </div>
                        {paymentMethod === 'bank_transfer' && (
                          <span className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 stroke-[3]" /> Selected
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 text-xs pt-1">
                        <div className="flex justify-between items-baseline text-slate-600">
                          <span className="text-slate-500">Account Holder:</span>
                          <span className="font-bold text-slate-900">{CLUB_CONFIG.bankAccount.accountTitle}</span>
                        </div>

                        <div className="flex flex-col gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span className="text-[10px] text-slate-500">Complete IBAN (Unmasked):</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyText(CLUB_CONFIG.bankAccount.iban, 'Faysal Bank IBAN');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 w-full sm:w-auto"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy IBAN</span>
                            </button>
                          </div>
                          <span className="font-mono font-bold text-slate-900 text-xs break-all">
                            {CLUB_CONFIG.bankAccount.iban}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 7. UPLOAD PAYMENT SCREENSHOT (Directly below payment method) */}
                <div className="pt-4 border-t border-slate-200 space-y-3.5">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#0A2540] text-orange-400 text-xs flex items-center justify-center font-bold">
                        7
                      </span>
                      <span>Upload Payment Screenshot</span>
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Attach your transfer screenshot. Entering your transaction reference number is optional:
                    </p>
                  </div>

                  {/* Transaction Reference / TRX Field */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Transaction Reference / TRX ID <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 11-digit Easypaisa TRX or Faysal Bank Ref (optional)"
                      value={transactionRef}
                      onChange={(e) => {
                        setTransactionRef(e.target.value);
                      }}
                      className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Found in your payment SMS confirmation or mobile banking receipt (optional if visible on screenshot).
                    </p>
                  </div>

                  {/* Prominent Visible File Selection Button & Preview */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Screenshot Image File <span className="text-rose-500">*</span>
                    </label>

                    <div className="space-y-2.5">
                      {/* Visible "Choose Screenshot Image" Button */}
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow transition-all shrink-0">
                          <Upload className="w-4 h-4" />
                          <span>Choose Screenshot Image</span>
                          <input
                            type="file"
                            accept={RECEIPT_STORAGE_CONFIG.allowedExtensions.join(',')}
                            onChange={handleFileChange}
                            className="hidden"
                          />
                        </label>
                        <span className="text-xs text-slate-500 truncate">
                          {fileName ? (
                            <span className="font-semibold text-slate-800">{fileName}</span>
                          ) : (
                            'JPG, JPEG, PNG, WebP (Max 5 MB)'
                          )}
                        </span>
                      </div>

                      {/* Client validation error */}
                      {uploadError && (
                        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <span>{uploadError}</span>
                        </div>
                      )}

                      {formErrors.receipt && (
                        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <span>{formErrors.receipt}</span>
                        </div>
                      )}

                      {/* Selected Screenshot Preview Thumbnail */}
                      {receiptPreview && !uploadError && (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={receiptPreview}
                              alt="Receipt Preview"
                              className="w-14 h-14 object-cover rounded-lg border border-emerald-300 shadow-sm shrink-0"
                            />
                            <div className="text-xs">
                              <p className="font-bold text-slate-900 truncate max-w-[180px] sm:max-w-[220px]">
                                {fileName}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5">Size: {fileSizeDisplay}</p>
                              <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                                <Check className="w-3 h-3 stroke-[3]" />
                                Valid screenshot format
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="px-2.5 py-1 text-xs text-rose-600 hover:text-rose-800 font-semibold rounded-lg bg-white border border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                          >
                            Remove Image
                          </button>
                        </div>
                      )}

                      {/* Upload Progress Indicator */}
                      {uploadProgress !== null && (
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                            <span>Uploading Screenshot to Secure Storage...</span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manual Review Notice */}
                  <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-0.5">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Manual Verification Notice</span>
                    </p>
                    <p className="text-[11px] leading-relaxed text-amber-800">
                      Uploading your screenshot places your booking into <strong>Payment Under Review</strong>. Management cross-checks each payment against bank records before confirming.
                    </p>
                  </div>
                </div>

                {/* 8. PRICING BREAKDOWN & FINAL SUBMISSION */}
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Reserved Court:</span>
                      <span className="font-semibold text-slate-900">{activeCourt.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Selected Slots:</span>
                      <span className="font-semibold text-slate-900 text-right">
                        {selectedSlots.length > 0
                          ? `${selectedDate} • ${selectedSlots.map((s) => s.startTime).join(', ')} (${durationMinutes} mins)`
                          : `${selectedDate} (Select ${requiredSlotCount} slot${requiredSlotCount > 1 ? 's' : ''})`}
                      </span>
                    </div>

                    {/* Hourly Breakdown for Selected Slots */}
                    {selectedSlots.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                        <div className="flex justify-between items-center text-[11px] font-bold text-slate-700">
                          <span>Slot Pricing Breakdown:</span>
                          <span className="text-orange-600 font-mono">
                            {selectedSlots.length} of {requiredSlotCount} selected
                          </span>
                        </div>
                        {pricingCalculation.segments.map((seg, idx) => (
                          <div key={idx} className="flex justify-between items-center text-[11px] text-slate-600">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span className="font-mono font-medium">{seg.label}</span>
                              <span
                                className={`text-[9px] uppercase font-bold px-1 rounded ${
                                  seg.isPeak
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {seg.isPeak ? 'Peak' : 'Off-Peak'}
                              </span>
                            </span>
                            <span className="font-semibold text-slate-900 font-mono">
                              PKR {seg.rate.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-200 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="font-bold text-slate-900">Total Court Price:</span>
                        <span className="font-extrabold text-slate-900">
                          PKR {pricingCalculation.totalAmount.toLocaleString()}
                        </span>
                      </div>

                      <div className="flex justify-between text-xs bg-amber-50 text-amber-950 p-2.5 rounded-lg font-medium border border-amber-200">
                        <div>
                          <span className="font-bold block">Fixed Advance Deposit:</span>
                          <span className="text-[10px] text-amber-800">Required via Easypaisa or Faysal Bank</span>
                        </div>
                        <span className="font-black text-amber-900 text-sm">PKR 500</span>
                      </div>

                      <div className="flex justify-between text-xs bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-700">
                        <span>Remaining Balance at Venue:</span>
                        <span className="font-bold text-slate-900">
                          PKR {pricingCalculation.remainingAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Server Error / Conflict Banner */}
                  {serverError && (
                    <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 text-xs text-rose-900 flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold text-rose-950">
                          {serverErrorType === 'conflict'
                            ? 'Slot Already Reserved'
                            : serverErrorType === 'permission'
                            ? 'Database Permissions Action Required'
                            : 'Reservation Error'}
                        </p>
                        <p className="text-[11px] text-rose-800 leading-relaxed font-mono whitespace-pre-wrap">{serverError}</p>
                      </div>
                    </div>
                  )}

                  {/* PRIMARY ACTION BUTTON */}
                  <button
                    type="button"
                    onClick={() => handleBookingSubmit('with_receipt')}
                    disabled={isSubmitting || selectedSlots.length !== requiredSlotCount}
                    className="w-full py-4 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <span>Submitting Booking & Receipt...</span>
                    ) : selectedSlots.length < requiredSlotCount ? (
                      <span>
                        Select {requiredSlotCount - selectedSlots.length} More Slot
                        {requiredSlotCount - selectedSlots.length > 1 ? 's' : ''} to Proceed
                      </span>
                    ) : (
                      <>
                        <span>Confirm Booking & Submit Receipt</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {/* SECONDARY OPTION: RESERVE & PAY WITHIN 60 MINS */}
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => handleBookingSubmit('pay_later')}
                      disabled={isSubmitting || selectedSlots.length !== requiredSlotCount}
                      className="text-xs text-slate-600 hover:text-slate-900 underline font-medium transition-colors cursor-pointer disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
                    >
                      {selectedSlots.length < requiredSlotCount
                        ? `Select ${requiredSlotCount - selectedSlots.length} more slot${
                            requiredSlotCount - selectedSlots.length > 1 ? 's' : ''
                          } to reserve & pay later`
                        : 'Or reserve slots first & pay within 60 mins'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Security Guarantee Notice */}
              <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800">Double-Booking Guarantee:</span>
                  <p className="mt-0.5 text-slate-600">
                    Slot reservations are verified atomically in real-time. Once submitted, your slot is locked against double bookings.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
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
