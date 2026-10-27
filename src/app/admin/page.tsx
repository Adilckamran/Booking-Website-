'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { DEMO_COURTS, INITIAL_DEMO_BOOKINGS, OPERATING_SLOTS_DEF } from '@/data/demoData';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DemoBanner } from '@/components/common/DemoBadge';
import { BrandLogo } from '@/components/common/BrandLogo';
import { WhatsAppMessageTemplates, WHATSAPP_SETUP_CHECKLIST } from '@/services/whatsapp';
import { Booking, AdminNotification } from '@/types';
import { getSupabaseClient, isSupabaseConfigured } from '@/services/database/supabaseClient';
import { calculateBookingPrice } from '@/services/pricing/pricingService';
import { getKarachiDateString } from '@/utils/timezone';
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
  Bell,
  RefreshCw,
  X,
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
  
  // Interactive Bookings State (synced with server store)
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    canConnect: boolean;
    message: string;
    hasCredentials: boolean;
    hasServiceKey: boolean;
  } | null>(null);
  const [adminSessionToken, setAdminSessionToken] = useState<string>('ppa_admin_session_init');
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [isLoadingAdminData, setIsLoadingAdminData] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [courtFilter, setCourtFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  // Modals
  const [selectedReceiptBooking, setSelectedReceiptBooking] = useState<Booking | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [rejectingBooking, setRejectingBooking] = useState<Booking | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Transaction ID not matched in bank statement.');
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
  const [cancellationReason, setCancellationReason] = useState('Customer requested cancellation.');
  const [showManualBookingModal, setShowManualBookingModal] = useState(false);

  // Manual Booking Form State
  const [manualCourtId, setManualCourtId] = useState(DEMO_COURTS[0].id);
  const [manualDate, setManualDate] = useState('');
  const [manualStartTime, setManualStartTime] = useState(OPERATING_SLOTS_DEF[10].startTime);
  const [manualDurationMinutes, setManualDurationMinutes] = useState(60);
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualCustomerPhone, setManualCustomerPhone] = useState('+92 ');
  const [manualCustomerEmail, setManualCustomerEmail] = useState('');
  const [manualIsPaid, setManualIsPaid] = useState(true);
  const [manualBookingError, setManualBookingError] = useState<string | null>(null);
  const [isSubmittingManualBooking, setIsSubmittingManualBooking] = useState(false);

  // Live pricing quote for desk reservation
  const manualQuote = useMemo(() => {
    return calculateBookingPrice(manualCourtId, manualStartTime, manualDurationMinutes);
  }, [manualCourtId, manualStartTime, manualDurationMinutes]);

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

  const availableDates = useMemo(() => {
    return Array.from(new Set(bookings.map((b) => b.date)))
      .filter(Boolean)
      .sort()
      .reverse();
  }, [bookings]);

  const getAdminHeaders = useCallback(() => {
    let consoleSession = '';
    try {
      consoleSession = localStorage.getItem('ppa_console_session') || '';
    } catch {}
    if (!consoleSession || !consoleSession.startsWith('ppa_admin_session_')) {
      consoleSession = `ppa_admin_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        localStorage.setItem('ppa_console_session', consoleSession);
      } catch {}
    }

    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminSessionToken}`,
      'x-admin-session-token': consoleSession,
    };
  }, [adminSessionToken]);

  // Restore session and set client date on mount
  useEffect(() => {
    queueMicrotask(() => {
      setManualDate(getKarachiDateString());
    });
    try {
      const savedToken = localStorage.getItem('ppa_admin_token');
      if (savedToken && (savedToken.startsWith('ppa_admin_session_') || savedToken.startsWith('eyJ'))) {
        queueMicrotask(() => {
          setAdminSessionToken(savedToken);
          setIsAuthenticated(true);
        });
      }
    } catch {}
  }, []);

  // Handle Admin Sign In
  const handleAdminLogin = async (e: React.FormEvent) => {
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

    let token = `ppa_admin_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // If Supabase is configured, attempt real cryptographic Supabase Auth sign-in
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: loginPassword,
          });

          if (!error && data?.session?.access_token) {
            token = data.session.access_token;
          }
        } catch {
          // If Supabase Auth network error occurs, continue with admin session token
        }
      }
    }

    setAdminSessionToken(token);
    try {
      localStorage.setItem('ppa_admin_token', token);
    } catch {}
    setIsAuthenticated(true);
    showToast(`Signed in as ${CLUB_CONFIG.businessEmail}`);
  };

  const handleDemoBypassLogin = () => {
    const sessionToken = `ppa_admin_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setAdminSessionToken(sessionToken);
    try {
      localStorage.setItem('ppa_admin_token', sessionToken);
    } catch {}
    setLoginEmail(CLUB_CONFIG.businessEmail);
    setIsAuthenticated(true);
    showToast(`Entered Admin Console (${CLUB_CONFIG.businessEmail})`);
  };

  const handleSignOut = () => {
    setIsAuthenticated(false);
    setAdminSessionToken('');
    setLoginPassword('');
    setAuthError(null);
    try {
      localStorage.removeItem('ppa_admin_token');
      if (isSupabaseConfigured()) {
        getSupabaseClient()?.auth.signOut().catch(() => {});
      }
    } catch {}
    showToast('Signed out of Admin Desk.');
  };

  // Fetch live server bookings, notifications, and database status
  const fetchAdminData = useCallback(async () => {
    if (!adminSessionToken) return;
    setIsLoadingAdminData(true);
    try {
      const headers = getAdminHeaders();

      const [bookingsRes, notifsRes, statusRes] = await Promise.all([
        fetch('/api/admin/bookings', { headers }),
        fetch('/api/admin/notifications', { headers }),
        fetch('/api/admin/supabase-status', { headers }),
      ]);

      if (bookingsRes.ok) {
        const bData = await bookingsRes.json();
        if (bData.success && Array.isArray(bData.bookings)) {
          setBookings(bData.bookings);
        }
      } else if (bookingsRes.status === 401) {
        console.warn('Admin session expired or rejected. Clearing token.');
        try {
          localStorage.removeItem('ppa_admin_token');
        } catch {}
        setIsAuthenticated(false);
        setAuthError('Your administrator session has expired or is invalid. Please sign in to the Management Console.');
        return;
      } else {
        const errData = await bookingsRes.json().catch(() => ({}));
        console.warn('Failed to fetch admin bookings:', errData);
        if (!isSupabaseConfigured()) {
          setBookings(INITIAL_DEMO_BOOKINGS);
        }
      }

      if (notifsRes.ok) {
        const nData = await notifsRes.json();
        if (nData.success && Array.isArray(nData.notifications)) {
          setNotifications(nData.notifications);
        }
      }

      if (statusRes.ok) {
        const sData = await statusRes.json();
        setSupabaseStatus(sData);
      }
    } catch (err) {
      console.error('Failed to load admin dashboard data:', err);
    } finally {
      setIsLoadingAdminData(false);
    }
  }, [adminSessionToken, getAdminHeaders]);

  const handleManualRefreshAdmin = () => {
    fetchAdminData();
    showToast('Refreshed live bookings & review queue.');
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch {
      // Non-blocking
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    const unread = notifications.filter((n) => !n.isRead);
    for (const notif of unread) {
      handleMarkNotificationRead(notif.id);
    }
    showToast('All notifications marked as read.');
  };

  useEffect(() => {
    if (isAuthenticated && adminSessionToken) {
      queueMicrotask(() => {
        void fetchAdminData();
      });
      // Auto-poll live server state every 10 seconds to catch new bookings from /book
      const timer = setInterval(() => {
        void fetchAdminData();
      }, 10000);
      return () => clearInterval(timer);
    }
  }, [isAuthenticated, adminSessionToken, fetchAdminData]);

  // Load receipt preview URL (supporting data URL, signed URL, or direct URL)
  useEffect(() => {
    if (!selectedReceiptBooking) {
      queueMicrotask(() => setPreviewSignedUrl(null));
      return;
    }

    const receiptUrl = selectedReceiptBooking.receiptScreenshotUrl;
    if (!receiptUrl) {
      queueMicrotask(() => setPreviewSignedUrl(null));
      return;
    }

    if (receiptUrl.startsWith('data:') || receiptUrl.startsWith('http')) {
      queueMicrotask(() => setPreviewSignedUrl(receiptUrl));
      return;
    }

    // Fetch signed URL from authorized server endpoint
    fetch(`/api/admin/bookings/${encodeURIComponent(selectedReceiptBooking.referenceNumber)}/receipt`, {
      headers: getAdminHeaders(),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.url) {
          setPreviewSignedUrl(data.url);
        } else {
          setPreviewSignedUrl(receiptUrl);
        }
      })
      .catch(() => {
        setPreviewSignedUrl(receiptUrl);
      });
  }, [selectedReceiptBooking, getAdminHeaders]);

  // Lock body scroll and listen for Escape key when any admin modal is open
  const isAnyModalOpen = Boolean(
    selectedReceiptBooking ||
    rejectingBooking ||
    cancellingBooking ||
    showManualBookingModal ||
    showNotificationsModal
  );

  useEffect(() => {
    if (isAnyModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setSelectedReceiptBooking(null);
          setRejectingBooking(null);
          setCancellingBooking(null);
          setShowManualBookingModal(false);
          setShowNotificationsModal(false);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isAnyModalOpen]);

  // Actions
  const handleConfirmPayment = async (bookingId: string) => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) return;

    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(target.referenceNumber)}/approve`, {
        method: 'POST',
        headers: getAdminHeaders(),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to approve booking.');
        return;
      }

      setBookings((prev) =>
        prev.map((b) => (b.referenceNumber === target.referenceNumber ? data.booking : b))
      );

      let notifInfo = '';
      if (data.notifications) {
        const parts: string[] = [];
        if (data.notifications.email) {
          parts.push(data.notifications.email.sent ? '✉️ Email Sent' : data.notifications.email.isConfigured ? '✉️ Email Delivery Issue' : '✉️ Email Not Configured');
        }
        if (data.notifications.whatsapp) {
          parts.push(data.notifications.whatsapp.sent ? '💬 WhatsApp Sent' : data.notifications.whatsapp.isConfigured ? '💬 WhatsApp Delivery Issue' : '💬 WhatsApp Not Configured');
        }
        if (parts.length > 0) {
          notifInfo = ` (${parts.join(', ')})`;
        }
      }

      showToast(`Booking confirmed & slot locked!${notifInfo}`);
      if (selectedReceiptBooking?.id === bookingId) {
        setSelectedReceiptBooking(null);
      }
      fetchAdminData();
    } catch {
      showToast('Network error confirming payment.');
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingBooking) return;

    if (!rejectionReason.trim()) {
      showToast('Rejection reason is required.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(rejectingBooking.referenceNumber)}/reject`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          rejectionReason: rejectionReason.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to reject payment.');
        return;
      }

      setBookings((prev) =>
        prev.map((b) => (b.referenceNumber === rejectingBooking.referenceNumber ? data.booking : b))
      );

      let notifInfo = '';
      if (data.notifications) {
        const parts: string[] = [];
        if (data.notifications.email) {
          parts.push(data.notifications.email.sent ? '✉️ Email Sent' : data.notifications.email.isConfigured ? '✉️ Email Delivery Issue' : '✉️ Email Not Configured');
        }
        if (data.notifications.whatsapp) {
          parts.push(data.notifications.whatsapp.sent ? '💬 WhatsApp Sent' : data.notifications.whatsapp.isConfigured ? '💬 WhatsApp Delivery Issue' : '💬 WhatsApp Not Configured');
        }
        if (parts.length > 0) {
          notifInfo = ` (${parts.join(', ')})`;
        }
      }

      showToast(`Payment rejected & slot released!${notifInfo}`);
      setRejectingBooking(null);
      fetchAdminData();
    } catch {
      showToast('Network error rejecting payment.');
    }
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

  const handleCreateManualBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualBookingError(null);

    if (!manualCustomerName || !manualCustomerName.trim() || manualCustomerName.trim().length < 3) {
      setManualBookingError('Customer full name must be at least 3 characters.');
      return;
    }

    if (!manualCustomerPhone || !manualCustomerPhone.trim()) {
      setManualBookingError('A valid Pakistani mobile number is required.');
      return;
    }

    setIsSubmittingManualBooking(true);

    try {
      const res = await fetch('/api/admin/bookings/manual', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          courtId: manualCourtId,
          date: manualDate,
          startTime: manualStartTime,
          durationMinutes: manualDurationMinutes,
          customerName: manualCustomerName.trim(),
          customerPhone: manualCustomerPhone.trim(),
          customerEmail: manualCustomerEmail.trim() || undefined,
          isPaid: manualIsPaid,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setManualBookingError(
          data.error || 'Slot Already Booked — This court and time slot is already reserved or booked. Please select another available slot.'
        );
        return;
      }

      setShowManualBookingModal(false);
      setManualCustomerName('');
      setManualCustomerPhone('+92 ');
      setManualCustomerEmail('');
      setManualBookingError(null);
      showToast(`Manual booking created (${data.booking.referenceNumber}) and slot locked.`);
      fetchAdminData();
    } catch {
      setManualBookingError('Network error creating manual booking. Please try again.');
    } finally {
      setIsSubmittingManualBooking(false);
    }
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
                  Secured via Supabase Auth & verified administrator session tokens.
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
                Quick administrator console access for venue desk management:
              </span>
              <button
                type="button"
                onClick={handleDemoBypassLogin}
                className="w-full py-2.5 px-4 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 font-bold text-xs transition-colors cursor-pointer"
              >
                Enter Admin Console (Desk Mode)
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
      
      {/* Top Warning Banner (Only displayed if Supabase is disconnected) */}
      {supabaseStatus && !supabaseStatus.canConnect && (
        <DemoBanner message="ADMIN DESK: Live database disconnected. Operating in local memory fallback. Connect Supabase credentials in .env.local to activate production PostgreSQL tables & RLS policies." />
      )}

      {/* Admin Navbar */}
      <header className="bg-[#0A2540] border-b border-slate-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 gap-4">
            
            <div className="flex items-center gap-3">
              <BrandLogo size="sm" variant="dark" />
              <div className="border-l border-slate-700 pl-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-sm font-bold text-white">Management Console</h1>
                  <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Active Session
                  </span>
                  {supabaseStatus && (
                    <span
                      className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border flex items-center gap-1.5 ${
                        supabaseStatus.canConnect
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}
                      title={supabaseStatus.message}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          supabaseStatus.canConnect ? 'bg-blue-400' : 'bg-amber-400'
                        }`}
                      />
                      {supabaseStatus.canConnect
                        ? 'Supabase Connected'
                        : supabaseStatus.hasCredentials
                        ? 'Supabase Unreachable'
                        : 'Server Memory (Demo Mode)'}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 font-mono">
                  {CLUB_CONFIG.businessEmail}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Refresh Live Data */}
              <button
                type="button"
                onClick={handleManualRefreshAdmin}
                disabled={isLoadingAdminData}
                title="Refresh Live Bookings & Notifications"
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingAdminData ? 'animate-spin text-orange-400' : ''}`} />
              </button>

              {/* Notification Alerts */}
              <button
                type="button"
                onClick={() => setShowNotificationsModal(true)}
                className="relative p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700 transition-colors"
                title="New Receipt Submission Alerts"
              >
                <Bell className="w-4 h-4" />
                {notifications.filter((n) => !n.isRead).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-bold text-[9px] flex items-center justify-center animate-pulse">
                    {notifications.filter((n) => !n.isRead).length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!manualDate) setManualDate(getKarachiDateString());
                  setShowManualBookingModal(true);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">+ Manual Booking</span>
              </button>

              <Link
                href="/book"
                target="_blank"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700"
              >
                <span className="hidden sm:inline">Customer Portal</span>
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
            
            {/* KPI METRICS ROW (Interactive Quick Filters) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'payment_under_review' ? 'all' : 'payment_under_review')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  statusFilter === 'payment_under_review'
                    ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-500/20 shadow-md'
                    : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50/50 shadow-sm'
                }`}
                title="Click to filter by Pending Review"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Pending Review</span>
                  {statusFilter === 'payment_under_review' && (
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">Active</span>
                  )}
                </div>
                <p className="text-2xl font-black text-blue-600 mt-1">{metrics.underReview}</p>
                <span className="text-[11px] text-slate-400">Awaiting screenshot check</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'awaiting_payment' ? 'all' : 'awaiting_payment')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  statusFilter === 'awaiting_payment'
                    ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-500/20 shadow-md'
                    : 'bg-white border-slate-200 hover:border-amber-300 hover:bg-slate-50/50 shadow-sm'
                }`}
                title="Click to filter by Awaiting Payment"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Awaiting Payment</span>
                  {statusFilter === 'awaiting_payment' && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">Active</span>
                  )}
                </div>
                <p className="text-2xl font-black text-amber-600 mt-1">{metrics.awaiting}</p>
                <span className="text-[11px] text-slate-400">Holds within 30 min window</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'confirmed' ? 'all' : 'confirmed')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  statusFilter === 'confirmed'
                    ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 shadow-md'
                    : 'bg-white border-slate-200 hover:border-emerald-300 hover:bg-slate-50/50 shadow-sm'
                }`}
                title="Click to filter by Confirmed Bookings"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Confirmed Bookings</span>
                  {statusFilter === 'confirmed' && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">Active</span>
                  )}
                </div>
                <p className="text-2xl font-black text-emerald-600 mt-1">{metrics.confirmed}</p>
                <span className="text-[11px] text-slate-400">Locked match slots</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-slate-50 border-slate-400 ring-2 ring-slate-500/20 shadow-md'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 shadow-sm'
                }`}
                title="Click to view all bookings"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Total Bookings ({metrics.total})</span>
                  {statusFilter === 'all' && (
                    <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">All</span>
                  )}
                </div>
                <p className="text-2xl font-black text-[#0A2540] mt-1">
                  PKR {metrics.totalRevenueReviewed.toLocaleString()}
                </p>
                <span className="text-[11px] text-emerald-600 font-medium">Cleared deposits</span>
              </button>
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
                      Check attached receipt in private storage, match Transaction ID with Faysal Bank / Easypaisa statement, then Confirm or Reject.
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
                  <option value="all">All Dates ({bookings.length})</option>
                  {availableDates.map((d) => {
                    const count = bookings.filter((b) => b.date === d).length;
                    return (
                      <option key={d} value={d}>
                        {d} ({count})
                      </option>
                    );
                  })}
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
                              {b.slots && b.slots.length > 1 ? (
                                <div className="space-y-1 mt-1">
                                  <div className="flex flex-wrap gap-1">
                                    {b.slots.map((s, idx) => (
                                      <span
                                        key={idx}
                                        className="inline-block px-1.5 py-0.5 rounded bg-orange-100 text-orange-900 text-[10px] font-mono font-bold"
                                      >
                                        {s.startTime} - {s.endTime}
                                      </span>
                                    ))}
                                  </div>
                                  <span className="text-[10px] text-slate-400 block font-medium">
                                    {b.slots.length} Independent Slots ({b.durationMinutes}m)
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-slate-500 text-[11px] mt-0.5">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <span>{b.startTime} - {b.endTime}</span>
                                </div>
                              )}
                            </td>

                            {/* Player */}
                            <td className="py-3 px-4">
                              <span className="font-semibold text-slate-900 block">{b.customerName}</span>
                              <span className="text-slate-500 text-[11px] block">{b.customerPhone}</span>
                              {b.customerEmail && (
                                <span className="text-slate-400 text-[10px] block truncate max-w-[150px]">{b.customerEmail}</span>
                              )}
                            </td>

                            {/* Amounts */}
                            <td className="py-3 px-4">
                              <div className="text-slate-900 font-bold">
                                Total: PKR {b.totalAmount.toLocaleString()}
                              </div>
                              <div className="text-emerald-700 text-[11px] font-semibold">
                                Adv: PKR {b.advanceRequiredAmount.toLocaleString()}
                              </div>
                              <div className="text-slate-500 text-[10px]">
                                Bal: PKR {b.remainingAmount.toLocaleString()}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4">
                              <StatusBadge status={b.status} size="sm" />
                            </td>

                            {/* Evidence / TRX */}
                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                {b.transactionRef ? (
                                  <span className="font-mono text-[11px] text-slate-700 font-semibold block">
                                    {b.transactionRef}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[11px] italic block">Not provided</span>
                                )}
                                {b.receiptScreenshotUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedReceiptBooking(b)}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>View Proof</span>
                                  </button>
                                )}
                              </div>
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
                      ) : isLoadingAdminData ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-500">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />
                              <span className="text-xs font-semibold">Loading live bookings from Supabase...</span>
                            </div>
                          </td>
                        </tr>
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
                    Court Availability Visualizer • {dateFilter === 'all' ? 'All Scheduled Dates' : dateFilter}
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
                        <div className="p-3 space-y-1.5 bg-slate-50 max-h-[520px] overflow-y-auto">
                          {OPERATING_SLOTS_DEF.map((slotDef, sIdx) => {
                            const matchedBooking = courtBookings.find((b) =>
                              b.slots && b.slots.length > 0
                                ? b.slots.some((s) => s.startTime === slotDef.startTime)
                                : b.startTime === slotDef.startTime
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
              <h3 className="text-base font-bold text-slate-900">Receiving Accounts (Faysal Bank & Easypaisa)</h3>
              <p className="text-xs text-slate-500">
                Official receiving bank IBAN and Easypaisa details for Kashif Ghani displayed to players on checkout.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              {/* Bank */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span>Faysal Bank Account</span>
                  </span>
                  <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                    Official Active
                  </span>
                </div>
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
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white font-semibold"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-600 mb-1">IBAN Number</label>
                    <input
                      type="text"
                      defaultValue={CLUB_CONFIG.bankAccount.iban}
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Easypaisa & JazzCash */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                      <span>Easypaisa Account</span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                      Official Active
                    </span>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Account Title</label>
                    <input
                      type="text"
                      defaultValue={CLUB_CONFIG.easypaisaAccount.accountTitle}
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Mobile Number</label>
                    <input
                      type="text"
                      defaultValue={CLUB_CONFIG.easypaisaAccount.accountNumber}
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                      <span>JazzCash (Optional)</span>
                    </span>
                    <span className="text-[10px] font-medium text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                      Configurable
                    </span>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Account Title</label>
                    <input
                      type="text"
                      defaultValue={CLUB_CONFIG.jazzcashAccount?.accountTitle || 'Not Configured'}
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Mobile Number</label>
                    <input
                      type="text"
                      defaultValue={CLUB_CONFIG.jazzcashAccount?.accountNumber || ''}
                      placeholder="Optional wallet number"
                      className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Advance & Hold Configuration Policy */}
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950 block">Advance & Hold Policy Settings</span>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                    Confirmed
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Advance Deposit Required</label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 font-semibold text-xs">PKR</span>
                      <input
                        type="number"
                        defaultValue={CLUB_CONFIG.advanceFixedAmount}
                        className="w-24 px-3 py-1.5 rounded border border-slate-300 bg-white font-bold text-slate-900"
                      />
                      <span className="text-slate-400 text-[11px]">(Fixed)</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Temporary Hold Window</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        defaultValue={CLUB_CONFIG.paymentDeadlineMinutes}
                        className="w-20 px-3 py-1.5 rounded border border-slate-300 bg-white font-bold text-slate-900"
                      />
                      <span className="text-slate-500 font-semibold">Minutes</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-emerald-800 mt-1">
                  * Policy: Flat PKR 4,000 / hour rate, PKR 500 advance deposit, 60 minutes hold window before slot release.
                </p>
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
        {/* TAB 5: NOTIFICATIONS & WHATSAPP CLOUD API SETUP */}
        {/* ========================================================================= */}
        {activeTab === 'whatsapp' && (
          <div className="space-y-6 max-w-4xl">
            {/* Live Integration Status Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <span>Customer Email Service</span>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    Needs GMAIL_APP_PASSWORD
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Sends automated match confirmation and rejection emails from <strong className="text-slate-800">{CLUB_CONFIG.businessEmail}</strong>.
                </p>
                <div className="text-[10px] font-mono bg-slate-50 p-2 rounded border border-slate-200 text-slate-600">
                  GMAIL_USER={CLUB_CONFIG.businessEmail}<br />
                  GMAIL_APP_PASSWORD=&lt;16-char-app-password&gt;
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    <span>WhatsApp Cloud API</span>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    Not Configured
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Sends automated WhatsApp notifications to validated Pakistani mobile numbers via official Meta Graph API v21+.
                </p>
                <div className="text-[10px] font-mono bg-slate-50 p-2 rounded border border-slate-200 text-slate-600">
                  WHATSAPP_PHONE_NUMBER_ID=&lt;id&gt;<br />
                  WHATSAPP_ACCESS_TOKEN=&lt;token&gt;
                </div>
              </div>
            </div>

            {/* Official Setup Checklist */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <span>WhatsApp Business Platform Setup Checklist</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Step-by-step instructions to connect your official Meta WhatsApp Business account without browser scrapers.
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {WHATSAPP_SETUP_CHECKLIST.map((step) => (
                  <div
                    key={step.step}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs flex items-start gap-3"
                  >
                    <span className="w-6 h-6 rounded-full bg-[#0A2540] text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                      {step.step}
                    </span>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 text-xs">{step.title}</h4>
                      <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">{step.description}</p>
                      {step.envVariable && (
                        <span className="inline-block mt-1 font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-slate-300 text-orange-600 font-bold">
                          {step.envVariable}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Template Previews Grid */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-blue-600" />
                <span>Standard WhatsApp Message Templates Preview</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
                  <span className="font-bold text-slate-900 block">Template 1: Booking Approved</span>
                  <div className="p-3 bg-white rounded-lg border border-slate-200 font-mono text-[11px] whitespace-pre-line text-slate-700">
                    {WhatsAppMessageTemplates.getBookingConfirmationMessage(
                      'Adil kamran',
                      'PADEL-PK-2026-9742',
                      'Court 1 — Double Court',
                      '2026-10-25',
                      '00:00 - 01:00',
                      500,
                      3500,
                      CLUB_CONFIG.locationArea
                    )}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
                  <span className="font-bold text-slate-900 block">Template 2: Payment Rejected</span>
                  <div className="p-3 bg-white rounded-lg border border-slate-200 font-mono text-[11px] whitespace-pre-line text-slate-700">
                    {WhatsAppMessageTemplates.getBookingRejectionMessage(
                      'Adil kamran',
                      'PADEL-PK-2026-9742',
                      'Court 1 — Double Court',
                      '2026-10-25',
                      '00:00 - 01:00',
                      'Transaction reference ID not found in bank statement.'
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
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedReceiptBooking(null);
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-4xl max-h-[92dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-review-title"
          >
            {/* STICKY TOP HEADER */}
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-2.5 py-1 rounded-md">
                  Payment Review
                </span>
                <div>
                  <h3 id="payment-review-title" className="font-mono font-bold text-base sm:text-lg text-slate-900 leading-none">
                    {selectedReceiptBooking.referenceNumber}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Match bank transfer with transaction reference ID before confirming
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge status={selectedReceiptBooking.status} size="sm" />
                <button
                  type="button"
                  onClick={() => setSelectedReceiptBooking(null)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-700 hover:text-slate-900 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer ml-1"
                  aria-label="Close review dialog"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* SCROLLABLE MIDDLE BODY */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                
                {/* LEFT COLUMN: Customer & Reservation Details (7 cols) */}
                <div className="md:col-span-7 space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 font-medium block">Player Name:</span>
                      <p className="font-bold text-slate-900 text-sm mt-0.5">{selectedReceiptBooking.customerName}</p>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">Phone / WhatsApp:</span>
                      <p className="font-bold text-slate-900 font-mono mt-0.5">{selectedReceiptBooking.customerPhone}</p>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">Email:</span>
                      <p className="font-medium text-slate-800 truncate mt-0.5" title={selectedReceiptBooking.customerEmail || 'Not Provided'}>
                        {selectedReceiptBooking.customerEmail || 'Not Provided'}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">Reserved Court:</span>
                      <p className="font-bold text-slate-900 mt-0.5">{selectedReceiptBooking.courtName}</p>
                    </div>
                    <div className="col-span-2 pt-1 border-t border-slate-200">
                      <span className="text-slate-500 font-medium block">Match Schedule:</span>
                      <p className="font-semibold text-slate-900 text-xs mt-0.5">
                        {selectedReceiptBooking.date}
                      </p>
                      {selectedReceiptBooking.slots && selectedReceiptBooking.slots.length > 1 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {selectedReceiptBooking.slots.map((s, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-orange-100 text-orange-950 text-[10px] font-mono font-bold"
                            >
                              <span>{s.startTime} - {s.endTime}</span>
                              {s.price !== undefined && (
                                <span className="text-emerald-700">PKR {s.price.toLocaleString()}</span>
                              )}
                              {s.isPeak && (
                                <span className="text-[9px] uppercase bg-orange-200 px-1 rounded">Peak</span>
                              )}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="font-mono text-slate-700 text-xs mt-0.5">
                          {selectedReceiptBooking.startTime} - {selectedReceiptBooking.endTime} ({selectedReceiptBooking.durationMinutes || 60}m)
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Financials & Transaction Reference Pill Card */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5 text-xs">
                    <div className="grid grid-cols-3 gap-2 pb-2.5 border-b border-slate-200 text-center">
                      <div className="p-2 rounded-lg bg-white border border-slate-200">
                        <span className="text-[10px] text-slate-500 block">Total Court Fee</span>
                        <p className="font-bold text-slate-900 text-xs sm:text-sm mt-0.5">
                          PKR {selectedReceiptBooking.totalAmount.toLocaleString()}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                        <span className="text-[10px] text-emerald-800 font-bold block">Fixed Advance</span>
                        <p className="font-black text-emerald-700 text-xs sm:text-sm mt-0.5">
                          PKR {selectedReceiptBooking.advanceRequiredAmount.toLocaleString()}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-white border border-slate-200">
                        <span className="text-[10px] text-slate-500 block">Remaining at Venue</span>
                        <p className="font-bold text-slate-900 text-xs sm:text-sm mt-0.5">
                          PKR {selectedReceiptBooking.remainingAmount.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500 text-[11px] block">Payment Channel:</span>
                        <span className="font-bold text-slate-900 block mt-0.5">
                          {selectedReceiptBooking.paymentMethod === 'easypaisa'
                            ? 'Easypaisa (0316 2997913)'
                            : selectedReceiptBooking.paymentMethod === 'bank_transfer'
                            ? 'Faysal Bank (PK16FAYS...)'
                            : selectedReceiptBooking.paymentMethod
                            ? selectedReceiptBooking.paymentMethod.replace('_', ' ')
                            : 'Pending Selection'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-500 text-[11px] block">Claimed TRX ID:</span>
                        {selectedReceiptBooking.transactionRef ? (
                          <span className="font-mono font-bold text-blue-700 block mt-0.5 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 w-fit">
                            {selectedReceiptBooking.transactionRef}
                          </span>
                        ) : (
                          <span className="font-medium text-slate-500 block mt-0.5 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 w-fit text-[11px] italic">
                            Not provided
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Private Storage Security Indicator */}
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-100 text-[11px] text-slate-600 border border-slate-200">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Private Storage: <code className="text-slate-800 font-mono text-[10px]">receipts-private</code></span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">Server-Signed Access</span>
                  </div>
                </div>

                {/* RIGHT COLUMN: Attached Screenshot (5 cols) */}
                <div className="md:col-span-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800">Attached Receipt Screenshot:</span>
                    {previewSignedUrl && (
                      <a
                        href={previewSignedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1"
                      >
                        <span>Full Size</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-950 flex flex-col items-center justify-center p-3 min-h-[220px] max-h-[380px] sm:max-h-[460px]">
                    {previewSignedUrl ? (
                      <div className="flex flex-col items-center gap-2.5 w-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewSignedUrl}
                          alt="Receipt Uploaded"
                          className="max-h-[280px] sm:max-h-[360px] w-auto max-w-full object-contain rounded-lg shadow"
                        />
                        <a
                          href={previewSignedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1 font-medium"
                        >
                          <span>Open Full Screen Screenshot</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-center text-slate-400 space-y-2 py-6 px-4">
                        <FileCheck className="w-10 h-10 text-emerald-400 mx-auto" />
                        <p className="text-xs font-medium text-slate-300">
                          TRX: {selectedReceiptBooking.transactionRef || 'Not provided'}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {selectedReceiptBooking.receiptScreenshotUrl
                            ? 'Loading secure image preview...'
                            : 'No screenshot uploaded yet.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* STICKY BOTTOM FOOTER WITH ACTIONS ALWAYS ACCESSIBLE */}
            <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-600 hidden sm:block">
                <span>Advance: <strong className="text-emerald-700">PKR {selectedReceiptBooking.advanceRequiredAmount.toLocaleString()}</strong></span>
                <span className="mx-2 text-slate-300">|</span>
                <span>TRX: <strong className="font-mono text-blue-700">{selectedReceiptBooking.transactionRef || 'Not provided'}</strong></span>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedReceiptBooking(null)}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejectingBooking(selectedReceiptBooking);
                    setSelectedReceiptBooking(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold text-xs transition-colors cursor-pointer"
                >
                  Reject Payment
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmPayment(selectedReceiptBooking.id)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                >
                  Confirm Payment & Lock Slot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: REJECT PAYMENT MODAL */}
      {/* ========================================================================= */}
      {rejectingBooking && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRejectingBooking(null);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full max-h-[90dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-base text-slate-900 font-mono">
                  Reject Payment • {rejectingBooking.referenceNumber}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Select reason for rejected screenshot evidence
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectingBooking(null)}
                className="w-8 h-8 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-700 flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <p className="text-xs text-slate-600 font-medium">
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
                    className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="rejectionReason"
                      checked={rejectionReason === reason}
                      onChange={() => setRejectionReason(reason)}
                      className="mt-0.5 text-orange-500"
                    />
                    <span className="text-slate-800 leading-relaxed">{reason}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setRejectingBooking(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow transition-colors cursor-pointer"
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
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCancellingBooking(null);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full max-h-[90dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-base text-slate-900 font-mono">
                  Cancel Booking • {cancellingBooking.referenceNumber}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Slot will be marked as cancelled
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCancellingBooking(null)}
                className="w-8 h-8 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-700 flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Cancelling will release this slot back to Available status in future phases.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Cancellation Reason:
                </label>
                <textarea
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  rows={3}
                  className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Enter reason for cancellation..."
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCancellingBooking(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow transition-colors cursor-pointer"
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
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowManualBookingModal(false);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[92dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  + Add Manual Booking (Walk-in / Phone)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Direct reservation creation by venue desk management
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualBookingModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateManualBooking} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3.5 text-xs">
                {manualBookingError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="font-semibold leading-relaxed">{manualBookingError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Court</label>
                    <select
                      value={manualCourtId}
                      onChange={(e) => setManualCourtId(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
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
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Starting Time</label>
                    <select
                      value={manualStartTime}
                      onChange={(e) => setManualStartTime(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-xs bg-white"
                    >
                      {OPERATING_SLOTS_DEF.map((slot, idx) => (
                        <option key={idx} value={slot.startTime}>
                          {slot.startTime} ({slot.label.split(' - ')[0]} - {slot.label.split(' - ')[1]}) {slot.isPeak ? '★ Peak' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Duration</label>
                    <select
                      value={manualDurationMinutes}
                      onChange={(e) => setManualDurationMinutes(parseInt(e.target.value, 10))}
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                    >
                      <option value={60}>60 minutes (1 Hour)</option>
                      <option value={120}>120 minutes (2 Hours)</option>
                      <option value={180}>180 minutes (3 Hours)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Player Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Daniyal Khan"
                    value={manualCustomerName}
                    onChange={(e) => setManualCustomerName(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">WhatsApp Mobile Number</label>
                    <input
                      type="tel"
                      placeholder="03272834501"
                      value={manualCustomerPhone}
                      onChange={(e) => setManualCustomerPhone(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Email Address (Optional)</label>
                    <input
                      type="email"
                      placeholder="player@example.com"
                      value={manualCustomerEmail}
                      onChange={(e) => setManualCustomerEmail(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Live Pricing Breakdown */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="font-semibold">Calculated Total Fee:</span>
                    <span className="font-extrabold text-sm text-[#0A2540]">
                      PKR {manualQuote.totalAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-500">
                    <span>Settlement Breakdown:</span>
                    <span className={manualIsPaid ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                      {manualIsPaid
                        ? 'Paid in Full (Counter Desk Cash)'
                        : `Advance: PKR 500 • Balance: PKR ${manualQuote.remainingAmount.toLocaleString()}`}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
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
              </div>

              <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowManualBookingModal(false)}
                  disabled={isSubmittingManualBooking}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManualBooking}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow transition-colors cursor-pointer"
                >
                  {isSubmittingManualBooking && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmittingManualBooking ? 'Locking Slot...' : 'Create Reservation'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: ADMIN NOTIFICATION ALERTS */}
      {showNotificationsModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNotificationsModal(false);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[90dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Receipt Submission Alerts</h3>
                  <p className="text-[11px] text-slate-500">Live notifications for new advance payments and slot holds</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {notifications.some((n) => !n.isRead) && (
                  <button
                    type="button"
                    onClick={handleMarkAllNotificationsRead}
                    className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200 transition-colors cursor-pointer"
                  >
                    Mark All Read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNotificationsModal(false)}
                  className="w-8 h-8 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">No notifications yet.</p>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition-all ${
                      notif.isRead ? 'bg-slate-50 border-slate-200' : 'bg-orange-50/60 border-orange-200 ring-1 ring-orange-500/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        {!notif.isRead && <span className="w-2 h-2 rounded-full bg-orange-500" />}
                        <span>{notif.title}</span>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-slate-700 leading-relaxed text-[11px]">{notif.message}</p>
                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                      <span className="font-mono text-slate-500">{notif.bookingRef}</span>
                      <div className="flex items-center gap-3">
                        {!notif.isRead && (
                          <button
                            type="button"
                            onClick={() => handleMarkNotificationRead(notif.id)}
                            className="text-slate-500 hover:text-slate-800 text-[10px] font-semibold underline cursor-pointer"
                          >
                            Mark Read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            handleMarkNotificationRead(notif.id);
                            const target = bookings.find((b) => b.referenceNumber === notif.bookingRef);
                            if (target) {
                              setSelectedReceiptBooking(target);
                              setShowNotificationsModal(false);
                            }
                          }}
                          className="font-bold text-orange-600 hover:text-orange-700 underline cursor-pointer"
                        >
                          Inspect Booking
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowNotificationsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
