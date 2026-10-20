'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { INITIAL_DEMO_BOOKINGS } from '@/data/demoData';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DemoBanner } from '@/components/common/DemoBadge';
import { Booking, BookingStatus, PaymentMethod } from '@/types';
import {
  Search,
  CheckCircle2,
  Copy,
  Upload,
  AlertTriangle,
  Building,
  Smartphone,
  ShieldAlert,
  ArrowRight,
  Clock,
  MessageCircle,
  ExternalLink,
  Info,
} from 'lucide-react';

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
    const courtParam = searchParams.get('court') || 'Court 1 - Panoramic Pro';
    const dateParam = searchParams.get('date') || '2026-10-20';
    const totalParam = Number(searchParams.get('total')) || 4000;
    const advance = Math.round(totalParam * 0.5);

    return {
      id: `gen-${Date.now()}`,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: true,
    };
  }

  return INITIAL_DEMO_BOOKINGS[0];
}

function StatusAndPaymentContent() {
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get('ref');

  // Search input state
  const [searchInput, setSearchInput] = useState(refFromUrl || 'PADEL-PK-2026-8921');
  const [activeBooking, setActiveBooking] = useState<Booking | null>(() =>
    getBookingFromParams(refFromUrl, searchParams)
  );

  // Payment form states
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('bank_transfer');
  const [transactionRef, setTransactionRef] = useState('');
  const [uploadedReceiptPreview, setUploadedReceiptPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Handle Search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;

    const match = INITIAL_DEMO_BOOKINGS.find(
      (b) => b.referenceNumber.toLowerCase() === searchInput.trim().toLowerCase()
    );

    if (match) {
      setActiveBooking(match);
      setUploadedReceiptPreview(null);
      setTransactionRef('');
    } else {
      alert(`Booking reference "${searchInput}" not found in demo records. Try "PADEL-PK-2026-8921" or "PADEL-PK-2026-8922".`);
    }
  };

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(`${label} copied!`);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  // Simulated screenshot picker
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit simulated receipt
  const handleSubmitReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionRef.trim()) {
      alert('Please enter your Transaction Reference / ID from your banking app.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      if (activeBooking) {
        setActiveBooking({
          ...activeBooking,
          status: 'payment_under_review',
          paymentMethod: selectedMethod,
          transactionRef: transactionRef.trim(),
          receiptScreenshotUrl: uploadedReceiptPreview || '/demo/receipt-sample.png',
          updatedAt: new Date().toISOString(),
        });
      }
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <DemoBanner message="DEMO PAYMENT & VERIFICATION: Real screenshot uploads will be stored in Supabase private storage in Phase 6. No actual money is transferred." />

      {/* Header & Search Bar */}
      <div className="bg-slate-900 text-white py-10 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Self-Service Portal
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
                Booking & Payment Status
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Track your court reservation, view payment accounts, and upload transaction proof.
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
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0 transition-colors"
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
                }}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-all ${
                  activeBooking?.referenceNumber === b.referenceNumber
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
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
        {copyFeedback && (
          <div className="mb-4 p-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold text-center shadow-md animate-in fade-in">
            {copyFeedback}
          </div>
        )}

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
                  <p className="text-xs text-slate-500 mt-1">
                    Created: {new Date(activeBooking.createdAt).toLocaleString()} • Player: {activeBooking.customerName} ({activeBooking.customerPhone})
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-500">Advance Required:</span>
                  <p className="text-2xl font-extrabold text-emerald-600">
                    PKR {activeBooking.advanceRequiredAmount.toLocaleString()}
                  </p>
                  <span className="text-[11px] text-slate-400">
                    Total: PKR {activeBooking.totalAmount.toLocaleString()}
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
                  <span className="text-slate-500 font-medium block">Match Date</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{activeBooking.date}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-medium block">Slot Duration</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{activeBooking.durationMinutes} Minutes</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-medium block">Remaining at Venue</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">PKR {activeBooking.remainingAmount.toLocaleString()}</span>
                </div>
              </div>

              {/* STATUS SPECIFIC ALERTS */}
              {activeBooking.status === 'awaiting_payment' && (
                <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Awaiting Advance Payment</span>
                    <p className="mt-0.5 leading-relaxed text-amber-800">
                      Your slot is temporarily reserved. To complete confirmation, please transfer PKR {activeBooking.advanceRequiredAmount.toLocaleString()} via Bank Transfer, Easypaisa, or JazzCash below, and upload your receipt screenshot.
                    </p>
                  </div>
                </div>
              )}

              {activeBooking.status === 'payment_under_review' && (
                <div className="mt-6 p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Payment Under Manual Review</span>
                    <p className="mt-0.5 leading-relaxed text-blue-800">
                      We received transaction reference <span className="font-mono font-bold">{activeBooking.transactionRef || 'TRX-SAMPLE'}</span>. Club management is cross-checking with our bank statement. Once verified, your status will update to Confirmed and you will be notified on WhatsApp.
                    </p>
                  </div>
                </div>
              )}

              {activeBooking.status === 'confirmed' && (
                <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Reservation Officially Confirmed!</span>
                    <p className="mt-0.5 leading-relaxed text-emerald-800">
                      Your payment has been verified by management. Please arrive 10 minutes before your slot time with non-marking athletic shoes. Remaining PKR {activeBooking.remainingAmount.toLocaleString()} is payable at the venue desk.
                    </p>
                  </div>
                </div>
              )}

              {activeBooking.status === 'rejected' && (
                <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Payment Rejected</span>
                    <p className="mt-0.5 leading-relaxed text-rose-800">
                      Reason: {activeBooking.rejectionReason || 'Transaction ID not verified on bank records.'}
                    </p>
                    <p className="mt-1 text-slate-700">
                      Please reach out to club management on WhatsApp to resolve this or re-submit valid proof.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* PAYMENT INSTRUCTIONS & SCREENSHOT UPLOADER */}
            {(activeBooking.status === 'awaiting_payment' || activeBooking.status === 'payment_under_review') && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* LEFT: PAYMENT ACCOUNTS & INSTRUCTIONS */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Building className="w-5 h-5 text-emerald-600" />
                      <span>Official Payment Accounts</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Transfer <strong className="text-slate-900">PKR {activeBooking.advanceRequiredAmount.toLocaleString()}</strong> to any account below:
                    </p>
                  </div>

                  {/* 1. Bank Transfer Card */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Building className="w-4 h-4 text-slate-600" />
                        {CLUB_CONFIG.bankAccount.bankName}
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                        Recommended
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Account Title:</span>
                        <span className="font-semibold text-slate-900">{CLUB_CONFIG.bankAccount.accountTitle}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Account Number:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">{CLUB_CONFIG.bankAccount.accountNumber}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(CLUB_CONFIG.bankAccount.accountNumber, 'Account number')}
                            className="p-1 hover:bg-slate-200 rounded text-slate-600"
                            title="Copy Account Number"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">IBAN:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-700 text-[11px]">{CLUB_CONFIG.bankAccount.iban}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(CLUB_CONFIG.bankAccount.iban, 'IBAN')}
                            className="p-1 hover:bg-slate-200 rounded text-slate-600"
                            title="Copy IBAN"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Easypaisa & JazzCash Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Easypaisa */}
                    <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/60 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-800">Easypaisa</span>
                        <Smartphone className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Title: {CLUB_CONFIG.easypaisaAccount.accountTitle}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-mono font-bold text-slate-900 text-xs">
                            {CLUB_CONFIG.easypaisaAccount.accountNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(CLUB_CONFIG.easypaisaAccount.accountNumber, 'Easypaisa number')}
                            className="p-1 hover:bg-slate-200 rounded text-slate-600"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* JazzCash */}
                    <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/60 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-700">JazzCash</span>
                        <Smartphone className="w-4 h-4 text-red-600" />
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Title: {CLUB_CONFIG.jazzcashAccount.accountTitle}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-mono font-bold text-slate-900 text-xs">
                            {CLUB_CONFIG.jazzcashAccount.accountNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(CLUB_CONFIG.jazzcashAccount.accountNumber, 'JazzCash number')}
                            className="p-1 hover:bg-slate-200 rounded text-slate-600"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Anti-fraud / Security Notice */}
                  <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                    <p className="font-bold text-slate-800 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                      <span>Security & Fraud Prevention Notice</span>
                    </p>
                    <p>
                      Never share your bank login PIN, OTP, password, or ATM card CVV with anyone. The club only requires the transfer screenshot and Transaction ID.
                    </p>
                  </div>
                </div>

                {/* RIGHT: PROOF SUBMISSION FORM */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Upload className="w-5 h-5 text-emerald-600" />
                      <span>Upload Payment Receipt</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Submit your payment screenshot to initiate management verification.
                    </p>
                  </div>

                  <form onSubmit={handleSubmitReceipt} className="space-y-4">
                    {/* Method Selector */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Selected Payment Channel <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'bank_transfer', label: 'Bank Transfer' },
                          { id: 'easypaisa', label: 'Easypaisa' },
                          { id: 'jazzcash', label: 'JazzCash' },
                        ].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedMethod(item.id as PaymentMethod)}
                            className={`py-2 px-2 text-xs font-semibold rounded-lg border text-center transition-all ${
                              selectedMethod === item.id
                                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Transaction Reference Input */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Transaction ID / Reference Number (TRX) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 98402849102 or MEZN-89210"
                        value={transactionRef}
                        onChange={(e) => setTransactionRef(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Found in your payment receipt SMS or mobile banking statement.
                      </p>
                    </div>

                    {/* Screenshot File Upload Area */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Payment Screenshot / E-Receipt Image <span className="text-rose-500">*</span>
                      </label>
                      <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-5 text-center bg-slate-50/50 transition-colors relative">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                          <Upload className="w-7 h-7 text-slate-400" />
                          <span className="text-xs font-semibold text-slate-700">
                            {fileName ? fileName : 'Click to browse or drop screenshot here'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            PNG, JPG, or JPEG (Max 10MB)
                          </span>
                        </div>
                      </div>

                      {/* Receipt Preview Thumbnail */}
                      {uploadedReceiptPreview && (
                        <div className="mt-3 p-2 border border-slate-200 rounded-lg bg-slate-50 flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={uploadedReceiptPreview}
                            alt="Receipt Preview"
                            className="w-12 h-12 object-cover rounded border"
                          />
                          <div className="text-xs">
                            <p className="font-semibold text-slate-800">Screenshot Attached</p>
                            <p className="text-[11px] text-emerald-600 font-medium">Ready for review</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Clear Manual Verification Disclaimer */}
                    <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Manual Verification Notice</span>
                      </p>
                      <p className="text-[11px] leading-relaxed text-amber-800">
                        Uploading a screenshot sends your booking to <strong>Payment Under Review</strong>.
                        It is evidence for manual management verification, not instant proof of cleared funds.
                      </p>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-300 text-slate-950 font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <span>Submitting for Review...</span>
                      ) : (
                        <>
                          <span>Submit Payment for Verification</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* IF CONFIRMED OR EXPIRED ACTIONS */}
            <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 text-xs">
              <Link
                href="/book"
                className="text-slate-600 hover:text-slate-900 font-semibold"
              >
                ← Book Another Slot
              </Link>
              <div className="flex items-center gap-3">
                <a
                  href={`https://wa.me/${CLUB_CONFIG.whatsappNumberPlaceholder}?text=Assalam-o-Alaikum%2C%20regarding%20booking%20reference%20${activeBooking.referenceNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold hover:bg-emerald-100 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp Club Desk</span>
                </a>
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
                >
                  <span>Open Admin Demo View</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
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
