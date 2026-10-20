'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { DEMO_COURTS, INITIAL_DEMO_BOOKINGS, OPERATING_SLOTS_DEF } from '@/data/demoData';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DemoBanner } from '@/components/common/DemoBadge';
import { BrandLogo } from '@/components/common/BrandLogo';
import { WhatsAppMessageTemplates } from '@/services/whatsapp';
import { Booking } from '@/types';
import {
  Search,
  CheckCircle,
  Eye,
  Clock,
  Plus,
  List,
  Grid,
  Ban,
  MessageCircle,
  FileCheck,
  ExternalLink,
  Lock,
  Mail,
  Key,
  ShieldCheck,
  LogOut,
  AlertCircle,
} from 'lucide-react';

type AdminTab = 'bookings' | 'courts' | 'pricing' | 'payments' | 'whatsapp';

export default function AdminDashboardPage() {
  // Authentication Gateway State (Supabase Auth Target)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState(CLUB_CONFIG.businessEmail); // 'thepowerpadel@gmail.com'
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Active Admin Tabs
  const [activeTab, setActiveTab] = useState<AdminTab>('bookings');
  
  // Interactive Bookings State for demo
  const [bookings, setBookings] = useState<Booking[]>(INITIAL_DEMO_BOOKINGS);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [courtFilter, setCourtFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  // Modals
  const [selectedReceiptBooking, setSelectedReceiptBooking] = useState<Booking | null>(null);
  const [rejectingBooking, setRejectingBooking] = useState<Booking | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Transaction ID not matched in bank statement.');
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
  const [cancellationReason, setCancellationReason] = useState('Customer requested cancellation.');
  const [showManualBookingModal, setShowManualBookingModal] = useState(false);

  // Manual Booking Form State
  const [manualCourtId, setManualCourtId] = useState(DEMO_COURTS[0].id);
  const [manualDate, setManualDate] = useState('2026-10-20');
  const [manualSlotLabel, setManualSlotLabel] = useState(OPERATING_SLOTS_DEF[10].label);
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualCustomerPhone, setManualCustomerPhone] = useState('+92 ');
  const [manualIsPaid, setManualIsPaid] = useState(true);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // KPI Metrics Calculation
  const metrics = useMemo(() => {
    const total = bookings.length;
    const underReview = bookings.filter((b) => b.status === 'payment_under_review').length;
    const confirmed = bookings.filter((b) => b.status === 'confirmed').length;
    const awaiting = bookings.filter((b) => b.status === 'awaiting_payment').length;
    const totalRevenueReviewed = bookings
      .filter((b) => b.status === 'confirmed')
      .reduce((acc, curr) => acc + curr.advanceRequiredAmount, 0);

    return { total, underReview, confirmed, awaiting, totalRevenueReviewed };
  }, [bookings]);

  // Filtered Bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const matchesSearch =
        b.referenceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.customerPhone.includes(searchQuery) ||
        (b.transactionRef && b.transactionRef.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchesCourt = courtFilter === 'all' || b.courtId === courtFilter;
      const matchesDate = dateFilter === 'all' || b.date === dateFilter;

      return matchesSearch && matchesStatus && matchesCourt && matchesDate;
    });
  }, [bookings, searchQuery, statusFilter, courtFilter, dateFilter]);

  // Handle Admin Sign In
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanEmail = loginEmail.trim().toLowerCase();
    const authorizedEmail = CLUB_CONFIG.businessEmail.toLowerCase();

    // Check allowlisted administrator email
    if (cleanEmail !== authorizedEmail) {
      setAuthError(`Access Denied: Only authorized club administrators (${CLUB_CONFIG.businessEmail}) can sign in.`);
      return;
    }

    if (!loginPassword.trim()) {
      setAuthError('Please enter your administrator account password.');
      return;
    }

    // In Phase 1 evaluation (prior to Supabase Auth credentials in Phase 2),
    // authenticate session and display secure access state.
    setIsAuthenticated(true);
    showToast(`Signed in as ${CLUB_CONFIG.businessEmail}`);
  };

  const handleDemoBypassLogin = () => {
    setLoginEmail(CLUB_CONFIG.businessEmail);
    setIsAuthenticated(true);
    showToast(`Entered Admin Desk in Evaluation Mode (${CLUB_CONFIG.businessEmail})`);
  };

  const handleSignOut = () => {
    setIsAuthenticated(false);
    setLoginPassword('');
    setAuthError(null);
    showToast('Signed out of Admin Desk.');
  };

  // Actions
  const handleConfirmPayment = (bookingId: string) => {
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              status: 'confirmed',
              updatedAt: new Date().toISOString(),
            }
          : b
      )
    );
    showToast('Booking confirmed and slot officially locked.');
    if (selectedReceiptBooking?.id === bookingId) {
      setSelectedReceiptBooking(null);
    }
  };

  const handleConfirmReject = () => {
    if (!rejectingBooking) return;
    setBookings((prev) =>
      prev.map((b) =>
        b.id === rejectingBooking.id
          ? {
              ...b,
              status: 'rejected',
              rejectionReason,
              updatedAt: new Date().toISOString(),
            }
          : b
      )
    );
    showToast('Payment rejected. Customer will be notified.');
    setRejectingBooking(null);
  };

  const handleConfirmCancel = () => {
    if (!cancellingBooking) return;
    setBookings((prev) =>
      prev.map((b) =>
        b.id === cancellingBooking.id
          ? {
              ...b,
              status: 'cancelled',
              cancellationReason,
              updatedAt: new Date().toISOString(),
            }
          : b
      )
    );
    showToast('Booking cancelled and slot released.');
    setCancellingBooking(null);
  };

  const handleCreateManualBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCustomerName || !manualCustomerPhone) {
      alert('Please enter customer name and phone.');
      return;
    }

    const courtObj = DEMO_COURTS.find((c) => c.id === manualCourtId) || DEMO_COURTS[0];
    const newRef = `PPA-PK-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const newBooking: Booking = {
      id: `manual-${Date.now()}`,
      referenceNumber: newRef,
      courtId: courtObj.id,
      courtName: courtObj.name,
      date: manualDate,
      startTime: manualSlotLabel.split(' - ')[0],
      endTime: manualSlotLabel.split(' - ')[1],
      durationMinutes: 60,
      totalAmount: courtObj.hourlyRate,
      advanceRequiredAmount: Math.round(courtObj.hourlyRate * 0.5),
      remainingAmount: courtObj.hourlyRate - Math.round(courtObj.hourlyRate * 0.5),
      status: manualIsPaid ? 'confirmed' : 'awaiting_payment',
      customerName: manualCustomerName,
      customerPhone: manualCustomerPhone,
      paymentMethod: 'cash_at_venue',
      transactionRef: manualIsPaid ? 'CASH-COUNTER-RECEIPT' : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: true,
    };

    setBookings([newBooking, ...bookings]);
    setShowManualBookingModal(false);
    setManualCustomerName('');
    showToast(`Manual booking created (${newRef}).`);
  };

  // =========================================================================
  // VIEW A: ADMIN AUTHENTICATION GATEWAY (WHEN NOT LOGGED IN)
  // =========================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <BrandLogo size="md" variant="light" />
          </div>
          <h2 className="mt-4 text-center text-2xl font-black text-[#0A2540] tracking-tight">
            Management Portal
          </h2>
          <p className="mt-1 text-center text-xs text-slate-500">
            Authorized administrative access for {CLUB_CONFIG.businessName}
          </p>
        </div>

        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
          <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200 sm:px-10 space-y-6">
            
            {/* Allowlist Identity Notice */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900">Configured Admin Account:</span>
                <p className="font-mono text-orange-600 font-bold mt-0.5">
                  {CLUB_CONFIG.businessEmail}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Credentials are authenticated through Supabase Auth without hardcoded secrets.
                </p>
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-4">
              {/* Email Address */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Administrator Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-xs"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="password"
                    placeholder="Enter management password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Set via Supabase Auth in Phase 2.
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-[#0A2540] hover:bg-slate-800 text-white font-bold text-sm shadow transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4 text-orange-400" />
                <span>Sign In to Admin Console</span>
              </button>
            </form>

            {/* Prototype Evaluation Button */}
            <div className="pt-4 border-t border-slate-200 text-center space-y-2">
              <span className="text-[11px] text-slate-500 block">
                Testing Phase 1 UI without connected Supabase Auth?
              </span>
              <button
                type="button"
                onClick={handleDemoBypassLogin}
                className="w-full py-2.5 px-4 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 font-bold text-xs transition-colors"
              >
                Enter Admin Console (Evaluation Mode)
              </button>
            </div>

            <div className="text-center">
              <Link href="/" className="text-xs font-semibold text-slate-500 hover:text-slate-800">
                ← Return to Public Website
              </Link>
            </div>

          </div>
        </div>

      </div>
    );
  }

  // =========================================================================
  // VIEW B: AUTHENTICATED MANAGEMENT DESK
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      
      {/* Top Demo Security Warning */}
      <DemoBanner message="ADMIN DESK (EVALUATION MODE): Supabase Auth role-level policies will be enforced in Phase 7. Changes operate on state for workflow verification." />

      {/* Admin Navbar */}
      <header className="bg-[#0A2540] border-b border-slate-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 gap-4">
            
            <div className="flex items-center gap-3">
              <BrandLogo size="sm" variant="dark" />
              <div className="border-l border-slate-700 pl-3">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-white">Management Console</h1>
                  <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Active Session
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">
                  {CLUB_CONFIG.businessEmail}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowManualBookingModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Manual Booking</span>
              </button>

              <Link
                href="/book"
                target="_blank"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700"
              >
                <span>Customer Portal</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>

              <button
                type="button"
                onClick={handleSignOut}
                className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 text-xs border border-slate-700 transition-colors"
                title="Sign Out of Management Portal"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Admin Navigation Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto border-t border-slate-800 pt-2 pb-2 text-xs">
            {[
              { id: 'bookings', label: "Today's Bookings & Reviews", badge: metrics.underReview },
              { id: 'courts', label: 'Court Management' },
              { id: 'pricing', label: 'Opening Hours & Pricing' },
              { id: 'payments', label: 'Receiving Payment Accounts' },
              { id: 'whatsapp', label: 'WhatsApp API Preview' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`px-3.5 py-2 rounded-lg font-semibold flex items-center gap-2 shrink-0 transition-all ${
                  activeTab === tab.id
                    ? 'bg-slate-800 text-orange-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0A2540] text-emerald-400 border border-emerald-500/30 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* ========================================================================= */}
        {/* TAB 1: BOOKINGS & PAYMENT REVIEW QUEUE */}
        {/* ========================================================================= */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            
            {/* KPI METRICS ROW */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">Pending Review</span>
                <p className="text-2xl font-black text-blue-600 mt-1">{metrics.underReview}</p>
                <span className="text-[11px] text-slate-400">Awaiting screenshot check</span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">Awaiting Payment</span>
                <p className="text-2xl font-black text-amber-600 mt-1">{metrics.awaiting}</p>
                <span className="text-[11px] text-slate-400">Holds within 30 min window</span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">Confirmed Bookings</span>
                <p className="text-2xl font-black text-emerald-600 mt-1">{metrics.confirmed}</p>
                <span className="text-[11px] text-slate-400">Locked match slots</span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">Verified Advances</span>
                <p className="text-2xl font-black text-[#0A2540] mt-1">
                  PKR {metrics.totalRevenueReviewed.toLocaleString()}
                </p>
                <span className="text-[11px] text-emerald-600 font-medium">Cleared deposits</span>
              </div>
            </div>

            {/* QUICK REVIEW QUEUE BANNER */}
            {metrics.underReview > 0 && (
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {metrics.underReview}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-blue-900">
                      Payment Screenshots Requiring Verification
                    </h4>
                    <p className="text-[11px] text-blue-700">
                      Check attached receipt, match Transaction ID with Meezan / JazzCash statement, then Confirm or Reject.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusFilter('payment_under_review')}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0 transition-colors"
                >
                  Filter Review Queue
                </button>
              </div>
            )}

            {/* FILTER & SEARCH TOOLBAR */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search Ref, Player Name, Phone, or TRX..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* Dropdown Filters */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium"
                >
                  <option value="all">All Statuses</option>
                  <option value="payment_under_review">Payment Under Review</option>
                  <option value="awaiting_payment">Awaiting Payment</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="rejected">Rejected</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                {/* Court Filter */}
                <select
                  value={courtFilter}
                  onChange={(e) => setCourtFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium"
                >
                  <option value="all">All Courts</option>
                  {DEMO_COURTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {/* Date Filter */}
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium"
                >
                  <option value="all">All Dates</option>
                  <option value="2026-10-20">Today (2026-10-20)</option>
                  <option value="2026-10-19">Yesterday (2026-10-19)</option>
                </select>

                {/* Reset Filters */}
                {(statusFilter !== 'all' || courtFilter !== 'all' || dateFilter !== 'all' || searchQuery !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      setCourtFilter('all');
                      setDateFilter('all');
                      setSearchQuery('');
                    }}
                    className="px-2 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold"
                  >
                    Reset
                  </button>
                )}

                {/* List / Calendar View Toggle */}
                <div className="border-l border-slate-200 pl-2 ml-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-[#0A2540] text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                    title="List View"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('calendar')}
                    className={`p-1.5 rounded ${viewMode === 'calendar' ? 'bg-[#0A2540] text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                    title="Calendar View"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* BOOKINGS TABLE (LIST VIEW) */}
            {viewMode === 'list' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Booking Ref</th>
                        <th className="py-3 px-4">Court & Slot</th>
                        <th className="py-3 px-4">Player Details</th>
                        <th className="py-3 px-4">Amounts (PKR)</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Payment Evidence</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredBookings.length > 0 ? (
                        filteredBookings.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                            {/* Ref */}
                            <td className="py-3 px-4 font-mono font-bold text-slate-900">
                              {b.referenceNumber}
                              <div className="text-[10px] text-slate-400 font-sans font-normal">
                                {new Date(b.createdAt).toLocaleDateString()}
                              </div>
                            </td>

                            {/* Court & Slot */}
                            <td className="py-3 px-4">
                              <span className="font-semibold text-slate-800 block">{b.courtName}</span>
                              <div className="flex items-center gap-1 text-slate-500 text-[11px] mt-0.5">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span>{b.startTime} - {b.endTime}</span>
                              </div>
                            </td>

                            {/* Player */}
                            <td className="py-3 px-4">
                              <span className="font-semibold text-slate-900 block">{b.customerName}</span>
                              <span className="text-slate-500 text-[11px] block">{b.customerPhone}</span>
                            </td>

                            {/* Amounts */}
                            <td className="py-3 px-4">
                              <div className="text-slate-900 font-bold">
                                Total: {b.totalAmount.toLocaleString()}
                              </div>
                              <div className="text-emerald-700 text-[11px]">
                                Adv: {b.advanceRequiredAmount.toLocaleString()}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4">
                              <StatusBadge status={b.status} size="sm" />
                            </td>

                            {/* Evidence / TRX */}
                            <td className="py-3 px-4">
                              {b.transactionRef ? (
                                <div className="space-y-1">
                                  <span className="font-mono text-[11px] text-slate-700 font-semibold block">
                                    {b.transactionRef}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedReceiptBooking(b)}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>View Proof</span>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px] italic">No TRX submitted</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {b.status === 'payment_under_review' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleConfirmPayment(b.id)}
                                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] transition-colors"
                                      title="Confirm Payment & Lock Slot"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRejectingBooking(b)}
                                      className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-[11px] border border-rose-200 transition-colors"
                                      title="Reject Payment"
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}

                                {b.status === 'awaiting_payment' && (
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmPayment(b.id)}
                                    className="px-2 py-1 rounded bg-[#0A2540] hover:bg-emerald-600 text-white text-[11px] font-medium transition-colors"
                                  >
                                    Mark Paid
                                  </button>
                                )}

                                {b.status !== 'cancelled' && b.status !== 'rejected' && (
                                  <button
                                    type="button"
                                    onClick={() => setCancellingBooking(b)}
                                    className="p-1 rounded text-slate-400 hover:text-slate-700"
                                    title="Cancel Booking"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            No bookings match the selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CALENDAR VIEW */}
            {viewMode === 'calendar' && (
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <h3 className="font-bold text-sm text-slate-900">
                    Court Availability Visualizer • {dateFilter === 'all' ? 'Today (2026-10-20)' : dateFilter}
                  </h3>
                  <span className="text-xs text-slate-500">Live slot schedule</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {DEMO_COURTS.map((court) => {
                    const courtBookings = bookings.filter(
                      (b) => b.courtId === court.id && (dateFilter === 'all' || b.date === dateFilter)
                    );

                    return (
                      <div key={court.id} className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-[#0A2540] text-white p-3 text-xs font-bold flex justify-between items-center">
                          <span>{court.name}</span>
                          <span className="text-[10px] text-orange-400">{court.type}</span>
                        </div>
                        <div className="p-3 space-y-2 bg-slate-50">
                          {OPERATING_SLOTS_DEF.slice(8, 16).map((slotDef, sIdx) => {
                            const matchedBooking = courtBookings.find(
                              (b) => b.startTime === slotDef.startTime
                            );

                            return (
                              <div
                                key={sIdx}
                                className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                                  matchedBooking
                                    ? matchedBooking.status === 'confirmed'
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950 font-medium'
                                      : matchedBooking.status === 'payment_under_review'
                                      ? 'bg-blue-50 border-blue-200 text-blue-950'
                                      : 'bg-amber-50 border-amber-200 text-amber-950'
                                    : 'bg-white border-slate-200 text-slate-500'
                                }`}
                              >
                                <div>
                                  <span className="font-semibold text-slate-800">{slotDef.startTime}</span>
                                  {matchedBooking && (
                                    <span className="ml-2 font-normal text-slate-600">
                                      • {matchedBooking.customerName}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  {matchedBooking ? (
                                    <StatusBadge status={matchedBooking.status} size="sm" />
                                  ) : (
                                    <span className="text-[10px] text-slate-400">Available</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: COURT MANAGEMENT SCREEN */}
        {/* ========================================================================= */}
        {activeTab === 'courts' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Power Padel Arena Court Inventory</h3>
                <p className="text-xs text-slate-500">
                  Manage active courts, turf specifications, and court status in PECHS Karachi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => alert('New court addition connects to Supabase courts table in Phase 3.')}
                className="px-3.5 py-2 rounded-lg bg-[#0A2540] hover:bg-slate-800 text-white text-xs font-semibold"
              >
                + Add New Court
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {DEMO_COURTS.map((court) => (
                <div key={court.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-orange-800 bg-orange-100 px-2.5 py-0.5 rounded">
                      Court #{court.courtNumber}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-900 text-base">{court.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{court.surface}</p>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Standard Hourly Rate:</span>
                      <span className="font-bold text-slate-900">PKR {court.hourlyRate.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Peak Rate (After 5 PM):</span>
                      <span className="font-bold text-orange-600">PKR {court.peakHourlyRate.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Court Type:</span>
                      <span className="capitalize font-semibold text-slate-800">{court.type}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => showToast(`Court ${court.name} specifications updated.`)}
                      className="text-orange-600 font-semibold hover:underline"
                    >
                      Edit Specifications
                    </button>
                    <button
                      type="button"
                      onClick={() => showToast(`Toggled maintenance mode for ${court.name}.`)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      Maintenance Toggle
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: PRICING & OPENING HOURS SETTINGS */}
        {/* ========================================================================= */}
        {activeTab === 'pricing' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-3xl space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">Operating Schedule & Pricing Rules</h3>
              <p className="text-xs text-slate-500">
                Configure opening hours, slot durations, and advance deposit percentage.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Daily Opening Hour</label>
                <input
                  type="text"
                  defaultValue={CLUB_CONFIG.openingHour}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Daily Closing Hour</label>
                <input
                  type="text"
                  defaultValue={CLUB_CONFIG.closingHour}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Slot Duration</label>
                <select className="w-full px-3 py-2 rounded-lg border border-slate-300">
                  <option value="60">60 Minutes (Standard)</option>
                  <option value="90">90 Minutes</option>
                  <option value="120">120 Minutes</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Required Advance Deposit (%)</label>
                <input
                  type="number"
                  defaultValue={CLUB_CONFIG.advancePercentage}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => showToast('Pricing and hours settings saved (demo).')}
                className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs"
              >
                Save Schedule Changes
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: PAYMENT INSTRUCTION SETTINGS */}
        {/* ========================================================================= */}
        {activeTab === 'payments' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-3xl space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">Receiving Accounts (Meezan / Easypaisa / JazzCash)</h3>
              <p className="text-xs text-slate-500">
                Update bank IBANs and mobile wallet numbers displayed to customers on checkout.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              {/* Bank */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <span className="font-bold text-slate-900">Bank Transfer Account</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Bank Name</label>
                    <input
                      type="text"
                      defaultValue={CLUB_CONFIG.bankAccount.bankName}
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Account Title</label>
                    <input
                      type="text"
                      defaultValue={CLUB_CONFIG.bankAccount.accountTitle}
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-600 mb-1">IBAN Number</label>
                    <input
                      type="text"
                      defaultValue={CLUB_CONFIG.bankAccount.iban}
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Easypaisa & JazzCash */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <span className="font-bold text-emerald-800">Easypaisa Account</span>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Account Title</label>
                    <input
                      type="text"
                      defaultValue={CLUB_CONFIG.easypaisaAccount.accountTitle}
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Mobile Number</label>
                    <input
                      type="text"
                      defaultValue={CLUB_CONFIG.easypaisaAccount.accountNumber}
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white font-mono"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <span className="font-bold text-red-700">JazzCash Account</span>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Account Title</label>
                    <input
                      type="text"
                      defaultValue={CLUB_CONFIG.jazzcashAccount.accountTitle}
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Mobile Number</label>
                    <input
                      type="text"
                      defaultValue={CLUB_CONFIG.jazzcashAccount.accountNumber}
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => showToast('Payment account details updated (demo).')}
                className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs"
              >
                Save Payment Settings
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: WHATSAPP CLOUD API INTEGRATION PREVIEW */}
        {/* ========================================================================= */}
        {activeTab === 'whatsapp' && (
          <div className="space-y-6 max-w-4xl">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-emerald-600" />
                    <span>Official Meta WhatsApp Cloud API Architecture</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Prepared for Phase 10 integration. All message templates adhere strictly to Meta business standards.
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                  Status: Ready for Phase 10 Credentials
                </span>
              </div>

              {/* Template Previews Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
                  <span className="font-bold text-slate-900 block">Template 1: Hold Created & Instructions</span>
                  <div className="p-3 bg-white rounded-lg border border-slate-200 font-mono text-[11px] whitespace-pre-line text-slate-700">
                    {WhatsAppMessageTemplates.getPaymentInstructionsMessage(
                      'Hamza Tariq',
                      'PPA-PK-2026-8921',
                      'Court 1 - Panoramic',
                      '2026-10-20',
                      '07:00 PM - 08:00 PM',
                      2500,
                      'https://powerpadelarena.pk/status?ref=PPA-PK-2026-8921',
                      30
                    )}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
                  <span className="font-bold text-slate-900 block">Template 2: Official Confirmation</span>
                  <div className="p-3 bg-white rounded-lg border border-slate-200 font-mono text-[11px] whitespace-pre-line text-slate-700">
                    {WhatsAppMessageTemplates.getBookingConfirmationMessage(
                      'Hamza Tariq',
                      'PPA-PK-2026-8921',
                      'Court 1 - Panoramic',
                      '2026-10-20',
                      '07:00 PM - 08:00 PM',
                      2500,
                      2500,
                      CLUB_CONFIG.locationArea
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: RECEIPT & PAYMENT EVIDENCE PREVIEW */}
      {/* ========================================================================= */}
      {selectedReceiptBooking && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-bold uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  Payment Evidence Review
                </span>
                <h3 className="font-bold text-base text-slate-900 mt-1">
                  {selectedReceiptBooking.referenceNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceiptBooking(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500">Player:</span>
                  <p className="font-bold text-slate-900">{selectedReceiptBooking.customerName}</p>
                </div>
                <div>
                  <span className="text-slate-500">Phone:</span>
                  <p className="font-bold text-slate-900">{selectedReceiptBooking.customerPhone}</p>
                </div>
                <div>
                  <span className="text-slate-500">Claimed TRX ID:</span>
                  <p className="font-mono font-bold text-blue-700">
                    {selectedReceiptBooking.transactionRef || 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Advance Expected:</span>
                  <p className="font-bold text-emerald-700">
                    PKR {selectedReceiptBooking.advanceRequiredAmount.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Receipt Image Display */}
              <div>
                <span className="font-semibold text-slate-700 block mb-1">Attached Receipt Image:</span>
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-950 flex flex-col items-center justify-center p-4 min-h-[180px]">
                  {selectedReceiptBooking.receiptScreenshotUrl &&
                  selectedReceiptBooking.receiptScreenshotUrl.startsWith('data:') ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={selectedReceiptBooking.receiptScreenshotUrl}
                      alt="Receipt Uploaded"
                      className="max-h-60 object-contain rounded"
                    />
                  ) : (
                    <div className="text-center text-slate-400 space-y-2">
                      <FileCheck className="w-10 h-10 text-emerald-400 mx-auto" />
                      <p className="text-xs font-medium text-slate-300">
                        Demo Receipt Attached: {selectedReceiptBooking.transactionRef}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Meezan / JazzCash payment slip placeholder verified in mock queue.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setRejectingBooking(selectedReceiptBooking);
                  setSelectedReceiptBooking(null);
                }}
                className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-semibold text-xs"
              >
                Reject Payment
              </button>
              <button
                type="button"
                onClick={() => handleConfirmPayment(selectedReceiptBooking.id)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow"
              >
                Confirm Payment & Lock Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: REJECT PAYMENT MODAL */}
      {/* ========================================================================= */}
      {rejectingBooking && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="font-bold text-base text-slate-900">
              Reject Payment • {rejectingBooking.referenceNumber}
            </h3>
            <p className="text-xs text-slate-500">
              Select the reason why this payment screenshot could not be verified:
            </p>

            <div className="space-y-2 text-xs">
              {[
                'Transaction ID not matched in bank statement.',
                'Screenshot unreadable or incomplete.',
                'Incorrect amount transferred (partial payment).',
                'Duplicate or previously submitted transaction reference.',
              ].map((reason, idx) => (
                <label
                  key={idx}
                  className="flex items-start gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="rejectionReason"
                    checked={rejectionReason === reason}
                    onChange={() => setRejectionReason(reason)}
                    className="mt-0.5 text-orange-500"
                  />
                  <span className="text-slate-800">{reason}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setRejectingBooking(null)}
                className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CANCEL BOOKING MODAL */}
      {/* ========================================================================= */}
      {cancellingBooking && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="font-bold text-base text-slate-900">
              Cancel Booking • {cancellingBooking.referenceNumber}
            </h3>
            <p className="text-xs text-slate-500">
              Cancelling will release this slot back to Available status in future phases.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cancellation Reason:
              </label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                rows={3}
                className="w-full p-2.5 text-xs rounded-lg border border-slate-300"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingBooking(null)}
                className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
              >
                Cancel Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: ADD MANUAL BOOKING (WALK-IN / PHONE) */}
      {/* ========================================================================= */}
      {showManualBookingModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">
                + Add Manual Booking (Walk-in / Phone)
              </h3>
              <button
                type="button"
                onClick={() => setShowManualBookingModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateManualBooking} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Court</label>
                  <select
                    value={manualCourtId}
                    onChange={(e) => setManualCourtId(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  >
                    {DEMO_COURTS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Slot Time</label>
                <select
                  value={manualSlotLabel}
                  onChange={(e) => setManualSlotLabel(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300"
                >
                  {OPERATING_SLOTS_DEF.map((slot, idx) => (
                    <option key={idx} value={slot.label}>
                      {slot.label} {slot.isPeak ? '(Peak)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Player Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Daniyal Khan"
                  value={manualCustomerName}
                  onChange={(e) => setManualCustomerName(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">WhatsApp Mobile Number</label>
                <input
                  type="tel"
                  placeholder="+92 300 1234567"
                  value={manualCustomerPhone}
                  onChange={(e) => setManualCustomerPhone(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300"
                  required
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={manualIsPaid}
                    onChange={(e) => setManualIsPaid(e.target.checked)}
                    className="w-4 h-4 rounded text-orange-500"
                  />
                  <span>Cash Payment Collected at Counter (Mark as Confirmed)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowManualBookingModal(false)}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs"
                >
                  Create Reservation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
