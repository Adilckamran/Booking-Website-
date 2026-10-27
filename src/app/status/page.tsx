'use client';

import React, { useState, useEffect, Suspense, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { INITIAL_DEMO_BOOKINGS } from '@/data/demoData';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PaymentAccountsCard } from '@/components/common/PaymentAccountsCard';
import { validateReceiptFile, RECEIPT_STORAGE_CONFIG } from '@/services/storage/receiptStorage';
import { Booking, BookingStatus, PaymentMethod } from '@/types';
import {
  Search,
  CheckCircle2,
  Upload,
  AlertTriangle,
  ArrowRight,
  Clock,
  MessageCircle,
  Info,
  Check,
  XCircle,
} from 'lucide-react';

const emptySubscribe = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

function formatBookingCreatedAt(isoString: string, mounted: boolean): string {
  if (!isoString) return '';
  if (!mounted) {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const hours = String(d.getUTCHours()).padStart(2, '0');
      const mins = String(d.getUTCMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${mins} UTC`;
    } catch {
      return isoString;
    }
  }

  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

function getBookingFromParams(
  targetRef: string | null,
  searchParams: ReturnType<typeof useSearchParams>
): Booking {
  const ref = targetRef || 'PADEL-PK-2026-8921';
  const found = INITIAL_DEMO_BOOKINGS.find(
    (b) => b.referenceNumber.toLowerCase() === ref.toLowerCase()
  );

  if (found) {
    return found;
  }

  if (targetRef) {
    const courtParam = searchParams.get('court') || 'Court 1 — Double Court';
    const dateParam = searchParams.get('date') || '2026-10-25';
    const totalParam = Number(searchParams.get('total')) || 4000;
    const advance = 500; // Fixed PKR 500 advance deposit

    return {
      id: `gen-${targetRef}`,
      referenceNumber: targetRef,
      courtId: 'court-1',
      courtName: courtParam,
      date: dateParam,
      startTime: '18:00',
      endTime: '19:00',
      durationMinutes: 60,
      totalAmount: totalParam,
      advanceRequiredAmount: advance,
      remainingAmount: totalParam - advance,
      status: (searchParams.get('status') as BookingStatus) || 'awaiting_payment',
      customerName: searchParams.get('name') || 'Guest Player',
      customerPhone: searchParams.get('phone') || '+92 300 0000000',
      createdAt: '2026-10-27T00:00:00.000Z',
      updatedAt: '2026-10-27T00:00:00.000Z',
      isDemo: true,
    };
  }

  return INITIAL_DEMO_BOOKINGS[0];
}

function StatusAndPaymentContent() {
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get('ref');

  // Hydration-safe client mount flag
  const isMounted = useIsClient();

  // Search input and active booking state
  const [searchInput, setSearchInput] = useState(refFromUrl || 'PADEL-PK-2026-8921');
  const [activeBooking, setActiveBooking] = useState<Booking | null>(() =>
    getBookingFromParams(refFromUrl, searchParams)
  );

  // Payment form states
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('easypaisa');
  const [transactionRef, setTransactionRef] = useState('');
  const [uploadedReceiptPreview, setUploadedReceiptPreview] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileSizeDisplay, setFileSizeDisplay] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Fetch live booking details from server on mount / ref change
  useEffect(() => {
    if (refFromUrl) {
      let isMounted = true;
      fetch(`/api/bookings/${encodeURIComponent(refFromUrl)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!isMounted) return;
          if (data.success && data.booking) {
            setActiveBooking(data.booking);
            if (data.booking.transactionRef) {
              setTransactionRef(data.booking.transactionRef);
            }
            if (data.booking.paymentMethod) {
              setSelectedMethod(data.booking.paymentMethod);
            }
          }
        })
        .catch(() => {});

      return () => {
        isMounted = false;
      };
    }
  }, [refFromUrl]);

  // Handle Search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;

    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(searchInput.trim())}`);
      const data = await res.json();

      if (data.success && data.booking) {
        setActiveBooking(data.booking);
        setUploadedReceiptPreview(null);
        setReceiptFile(null);
        setFileName('');
        setFileSizeDisplay('');
        setUploadError(null);
        setFormError(null);
        if (data.booking.transactionRef) {
          setTransactionRef(data.booking.transactionRef);
        }
      } else {
        alert(`Booking reference "${searchInput}" not found. Please verify your reference number.`);
      }
    } catch {
      alert('Error searching for booking. Please try again.');
    }
  };

  // Validated screenshot picker
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size using receiptStorage utility
    const validation = validateReceiptFile(file);

    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid file uploaded.');
      setUploadedReceiptPreview(null);
      setReceiptFile(null);
      setFileName('');
      setFileSizeDisplay('');
      return;
    }

    setUploadError(null);
    setFormError(null);
    setFileName(file.name);
    setReceiptFile(file);

    const sizeFormatted =
      file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(0)} KB`
        : `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    setFileSizeDisplay(sizeFormatted);

    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedReceiptPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleClearFile = () => {
    setReceiptFile(null);
    setUploadedReceiptPreview(null);
    setFileName('');
    setFileSizeDisplay('');
    setUploadError(null);
    setFormError(null);
  };

  // Submit live receipt to server (sets status strictly to PAYMENT_UNDER_REVIEW, notifies admin)
  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!activeBooking) return;

    if (!receiptFile && !uploadedReceiptPreview) {
      setFormError('Please upload a screenshot of your payment transfer before submitting.');
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(25);

    try {
      let res: Response;

      if (receiptFile) {
        const formData = new FormData();
        formData.append('receipt', receiptFile);
        formData.append('paymentMethod', selectedMethod);
        if (transactionRef.trim()) {
          formData.append('transactionRef', transactionRef.trim());
        }

        setUploadProgress(60);

        res = await fetch(`/api/bookings/${encodeURIComponent(activeBooking.referenceNumber)}/receipt`, {
          method: 'POST',
          body: formData,
        });
      } else {
        setUploadProgress(60);

        res = await fetch(`/api/bookings/${encodeURIComponent(activeBooking.referenceNumber)}/receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod: selectedMethod,
            transactionRef: transactionRef.trim() || undefined,
            receiptScreenshotUrl: uploadedReceiptPreview,
          }),
        });
      }

      setUploadProgress(90);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setFormError(data.error || 'Failed to submit receipt. Please try again.');
        setUploadProgress(null);
        return;
      }

      setUploadProgress(100);
      // Live update with server-returned booking in PAYMENT_UNDER_REVIEW status
      setActiveBooking(data.booking);
    } catch {
      setFormError('Network error submitting payment receipt. Please try again.');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setUploadProgress(null), 1000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header & Search Bar */}
      <div className="bg-[#0A2540] text-white py-10 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">
                Power Padel Arena • Advance Payment & Verification
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
                Booking & Payment Status
              </h1>
              <p className="text-xs sm:text-sm text-slate-200 mt-1">
                Follow transfer instructions below and upload your receipt screenshot for management verification.
              </p>
            </div>

            {/* Quick Reference Lookup */}
            <form onSubmit={handleSearch} className="flex items-center gap-2 max-w-md w-full">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Enter Ref (e.g. PADEL-PK-2026-8921)"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shrink-0 transition-colors shadow cursor-pointer"
              >
                Find
              </button>
            </form>
          </div>

          {/* Preset Demo Bookings Chips */}
          <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="text-[11px] font-semibold text-slate-400">Quick Test Records:</span>
            {INITIAL_DEMO_BOOKINGS.slice(0, 4).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setSearchInput(b.referenceNumber);
                  setActiveBooking(b);
                  setUploadedReceiptPreview(null);
                  setReceiptFile(null);
                  setFileName('');
                  setFileSizeDisplay('');
                  setUploadError(null);
                  setFormError(null);
                }}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-all cursor-pointer ${
                  activeBooking?.referenceNumber === b.referenceNumber
                    ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                {b.referenceNumber} ({b.status.replace('_', ' ')})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {activeBooking ? (
          <div className="space-y-8">
            {/* BOOKING SUMMARY HERO CARD */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-lg sm:text-xl text-slate-900">
                      {activeBooking.referenceNumber}
                    </span>
                    <StatusBadge status={activeBooking.status} size="lg" />
                  </div>
                  <p className="text-xs text-slate-500 mt-1" suppressHydrationWarning>
                    Created: {formatBookingCreatedAt(activeBooking.createdAt, isMounted)} • Player: {activeBooking.customerName} ({activeBooking.customerPhone})
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-xs text-slate-500 font-semibold block">Fixed Advance Required:</span>
                  <p className="text-2xl font-black text-orange-600">
                    PKR {activeBooking.advanceRequiredAmount.toLocaleString('en-US')}
                  </p>
                  <span className="text-[11px] text-slate-400">
                    Total: PKR {activeBooking.totalAmount.toLocaleString('en-US')} (Fixed Deposit)
                  </span>
                </div>
              </div>

              {/* Schedule detail pill badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-medium block">Reserved Court</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{activeBooking.courtName}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-medium block">Match Date & Time</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">
                    {activeBooking.date}
                  </span>
                  {activeBooking.slots && activeBooking.slots.length > 1 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {activeBooking.slots.map((s, idx) => (
                        <span
                          key={idx}
                          className="inline-block px-1.5 py-0.5 rounded bg-orange-100 text-orange-900 text-[10px] font-mono font-bold"
                        >
                          {s.startTime} - {s.endTime}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-600 font-medium block text-[11px] mt-0.5">
                      {activeBooking.startTime} - {activeBooking.endTime}
                    </span>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-medium block">Slot Duration</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{activeBooking.durationMinutes || 60} Minutes</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-medium block">Remaining at Venue</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">PKR {activeBooking.remainingAmount.toLocaleString('en-US')}</span>
                </div>
              </div>

              {/* STATUS SPECIFIC ALERTS */}
              {activeBooking.status === 'awaiting_payment' && (
                <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-sm">Action Required: Transfer PKR 500 Advance</span>
                    <p className="mt-1 leading-relaxed text-amber-800">
                      Your court slot is temporarily held for <strong>{CLUB_CONFIG.paymentDeadlineMinutes} minutes</strong>. Please transfer the fixed advance amount of <strong className="text-amber-950 font-bold">PKR 500</strong> via Easypaisa or Faysal Bank below, and upload your payment screenshot with Transaction Reference (TRX).
                    </p>
                  </div>
                </div>
              )}

              {activeBooking.status === 'payment_under_review' && (
                <div className="mt-6 p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold text-sm">Payment Under Manual Review</span>
                    <p className="leading-relaxed text-blue-800">
                      {activeBooking.transactionRef ? (
                        <>We have received your receipt screenshot and Transaction Reference: <span className="font-mono font-bold">{activeBooking.transactionRef}</span>.</>
                      ) : (
                        <>We have received your receipt screenshot (Transaction Reference: <span className="font-medium text-slate-700 italic">Not provided</span>).</>
                      )}
                    </p>
                    <p className="leading-relaxed text-blue-700">
                      Power Padel Arena management is cross-checking with our bank and Easypaisa statement. Your slot is reserved and kept unavailable to other customers while under review. Once verified, your status will update to <strong>Confirmed</strong>.
                    </p>
                    <p className="text-[11px] text-blue-900/80 font-medium italic">
                      Notice: Screenshot upload is evidence for human review and does not automatically confirm payment.
                    </p>
                  </div>
                </div>
              )}

              {activeBooking.status === 'confirmed' && (
                <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-sm">Reservation Officially Confirmed!</span>
                    <p className="mt-1 leading-relaxed text-emerald-800">
                      Your advance payment has been verified by Power Padel Arena management. Please arrive 10 minutes prior to your slot time with non-marking athletic shoes.
                    </p>
                    <p className="mt-1 font-semibold text-emerald-900">
                      Remaining balance due at venue counter: PKR {activeBooking.remainingAmount.toLocaleString('en-US')}
                    </p>
                  </div>
                </div>
              )}

              {activeBooking.status === 'rejected' && (
                <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-sm text-rose-950">Payment Rejected • Slot Released</span>
                      <p className="mt-1 leading-relaxed text-rose-800">
                        Rejection Reason: <strong>{activeBooking.rejectionReason || 'Transaction ID not verified on bank records.'}</strong>
                      </p>
                      <p className="mt-1 text-slate-600">
                        The slot has been released back into open availability. You may place a new booking reservation or contact club management on WhatsApp.
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/book"
                    className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shrink-0 inline-flex items-center gap-1.5 self-start sm:self-center shadow-sm"
                  >
                    <span>Book Another Slot</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>

            {/* PAYMENT INSTRUCTIONS & SCREENSHOT UPLOADER */}
            {(activeBooking.status === 'awaiting_payment' || activeBooking.status === 'payment_under_review') && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* LEFT: OFFICIAL PAYMENT ACCOUNTS (EASYPAISA & FAYSAL BANK) */}
                <div className="space-y-4">
                  <PaymentAccountsCard advanceAmount={activeBooking.advanceRequiredAmount || 500} highlightAdvance={true} />
                </div>

                {/* RIGHT: PROOF SUBMISSION FORM (WITH VALIDATION & UPLOAD) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Upload className="w-5 h-5 text-orange-500" />
                      <span>Upload Payment Screenshot</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Enter your Transaction Reference and attach a clear screenshot of your completed transfer.
                    </p>
                  </div>

                  {/* Form validation alert banner */}
                  {formError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 animate-in fade-in">
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmitReceipt} className="space-y-4">
                    {/* Method Selector */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Selected Payment Channel <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'easypaisa', label: 'Easypaisa', sub: '0316 2997913' },
                          { id: 'bank_transfer', label: 'Faysal Bank', sub: 'IBAN Transfer' },
                        ].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedMethod(item.id as PaymentMethod)}
                            className={`py-2.5 px-3 text-xs font-semibold rounded-xl border text-left transition-all cursor-pointer ${
                              selectedMethod === item.id
                                ? 'bg-[#0A2540] text-white border-[#0A2540] shadow-sm'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <span className="block font-bold">{item.label}</span>
                            <span className={`text-[10px] block ${selectedMethod === item.id ? 'text-orange-400' : 'text-slate-500'}`}>
                              {item.sub}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Transaction Reference Input */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Transaction ID / Reference Number (TRX) <span className="text-slate-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 11-digit Easypaisa TRX or Faysal Bank Ref (optional)"
                        value={transactionRef}
                        onChange={(e) => {
                          setTransactionRef(e.target.value);
                          if (formError) setFormError(null);
                        }}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Found in your payment confirmation SMS or mobile banking receipt (optional if visible on screenshot).
                      </p>
                    </div>

                    {/* Screenshot File Upload Area with Validation */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Payment Screenshot / E-Receipt Image <span className="text-rose-500">*</span>
                      </label>

                      <div className="flex flex-col gap-2.5">
                        {/* Prominent Visible File Selection Button */}
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

                        {/* Drag and Drop Zone as alternative */}
                        {!uploadedReceiptPreview && (
                          <div
                            className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors relative ${
                              uploadError
                                ? 'border-rose-300 bg-rose-50/30'
                                : 'border-slate-300 hover:border-orange-500 bg-slate-50/50'
                            }`}
                          >
                            <input
                              type="file"
                              accept={RECEIPT_STORAGE_CONFIG.allowedExtensions.join(',')}
                              onChange={handleFileChange}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="flex flex-col items-center justify-center space-y-1 pointer-events-none">
                              <Upload className="w-5 h-5 text-slate-400" />
                              <span className="text-[11px] font-semibold text-slate-600">
                                Or drag & drop your receipt image directly here
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Upload Error Display */}
                      {uploadError && (
                        <div className="mt-2.5 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                          <span>{uploadError}</span>
                        </div>
                      )}

                      {/* Upload Progress Indicator */}
                      {uploadProgress !== null && (
                        <div className="mt-3 space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-600 font-semibold">
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

                      {/* Receipt Preview Thumbnail */}
                      {uploadedReceiptPreview && !uploadError && (
                        <div className="mt-3 p-3 border border-emerald-200 rounded-xl bg-emerald-50/40 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={uploadedReceiptPreview}
                              alt="Receipt Preview"
                              className="w-14 h-14 object-cover rounded-lg border border-emerald-300 shadow-sm"
                            />
                            <div className="text-xs">
                              <p className="font-bold text-slate-900 truncate max-w-[200px]">{fileName || 'Receipt Selected'}</p>
                              {fileSizeDisplay && <p className="text-[11px] text-slate-500 mt-0.5">Size: {fileSizeDisplay}</p>}
                              <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                                <Check className="w-3 h-3 stroke-[3]" />
                                Valid screenshot format
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleClearFile}
                            className="px-2.5 py-1 text-xs text-rose-600 hover:text-rose-800 font-semibold rounded-lg bg-white border border-rose-200 hover:bg-rose-50 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Clear Manual Verification Disclaimer */}
                    <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Manual Verification Notice</span>
                      </p>
                      <p className="text-[11px] leading-relaxed text-amber-800">
                        Uploading a screenshot sends your booking to <strong>Payment Under Review</strong>.
                        It is evidence for manual management verification, not instant proof of payment. Only authorized management can confirm your reservation.
                      </p>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <span>Uploading & Submitting Receipt...</span>
                      ) : (
                        <>
                          <span>Submit Payment Screenshot</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Actions Footer */}
            <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 text-xs">
              <Link
                href="/book"
                className="text-slate-600 hover:text-slate-900 font-semibold"
              >
                ← Book Another Slot
              </Link>
              <div className="flex items-center gap-3">
                <a
                  href={`https://wa.me/${CLUB_CONFIG.whatsappNumberPlaceholder}?text=Assalam-o-Alaikum%20Power%20Padel%20Arena%2C%20regarding%20booking%20reference%20${activeBooking.referenceNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold hover:bg-emerald-100 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp Power Padel Desk</span>
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-4">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
            <h3 className="text-lg font-bold text-slate-900">No Booking Selected</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Please enter a valid booking reference code above or reserve a new court slot.
            </p>
            <Link
              href="/book"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-xs"
            >
              Go to Booking Calendar
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatusAndPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-xs">
          Loading booking status...
        </div>
      }
    >
      <StatusAndPaymentContent />
    </Suspense>
  );
}
