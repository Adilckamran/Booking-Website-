import { Booking, TimeSlot, PaymentMethod, AdminNotification, BookingSlotItem } from '@/types';
import { DEMO_COURTS, OPERATING_SLOTS_DEF, INITIAL_DEMO_BOOKINGS } from '@/data/demoData';
import { CLUB_CONFIG } from '@/config/clubConfig';
import {
  getSupabaseAdminClient,
  isSupabaseConfigured,
  isSupabaseAdminConfigured,
} from '@/services/database/supabaseClient';
import {
  calculateBookingPrice,
  calculateEndTime,
  getHourlyRate,
  calculateMultipleSlotsPrice,
} from '@/services/pricing/pricingService';
import {
  sendBookingConfirmationEmail,
  sendBookingRejectionEmail,
  EmailDispatchResult,
} from '@/services/email/emailService';
import {
  sendWhatsAppBookingConfirmation,
  sendWhatsAppBookingRejection,
  WhatsAppDispatchResult,
} from '@/services/whatsapp';

/**
 * Converts HH:MM string to continuous 24-hour club operating schedule minutes (00:00 = 0 mins).
 */
export function getOperatingScheduleMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  return h * 60 + m;
}

/**
 * Resolves primary startTime, endTime, and continuity for requested slots.
 * Prevents non-consecutive multi-hour selections from falsely appearing as continuous blocks.
 */
export function resolveBookingTiming(requestedSlots: string[]): {
  primaryStartTime: string;
  primaryEndTime: string;
  isConsecutive: boolean;
  sortedSlots: string[];
} {
  const sorted = [...requestedSlots].sort((a, b) => getOperatingScheduleMinutes(a) - getOperatingScheduleMinutes(b));
  const firstStart = sorted[0];
  const lastStart = sorted[sorted.length - 1];
  const firstMin = getOperatingScheduleMinutes(firstStart);
  const lastMin = getOperatingScheduleMinutes(lastStart);
  const isConsecutive = (lastMin - firstMin) === (sorted.length - 1) * 60;

  const firstHour = parseInt(firstStart.split(':')[0], 10);
  const firstEndTime = `${String((firstHour + 1) % 24).padStart(2, '0')}:00`;
  const lastHour = parseInt(lastStart.split(':')[0], 10);
  const lastEndTime = `${String((lastHour + 1) % 24).padStart(2, '0')}:00`;

  return {
    primaryStartTime: firstStart,
    primaryEndTime: isConsecutive ? lastEndTime : firstEndTime,
    isConsecutive,
    sortedSlots: sorted,
  };
}

/**
 * Slot index lookup in OPERATING_SLOTS_DEF
 */
function getSlotIndex(timeStr: string): number {
  return OPERATING_SLOTS_DEF.findIndex((s) => s.startTime === timeStr);
}

/**
 * Checks whether two time intervals overlap within the operating schedule.
 * [S1, S1 + D1) and [S2, S2 + D2)
 */
function slotsOverlap(
  start1: string,
  duration1: number,
  start2: string,
  duration2: number
): boolean {
  const idx1 = getSlotIndex(start1);
  const idx2 = getSlotIndex(start2);
  if (idx1 === -1 || idx2 === -1) {
    return start1 === start2;
  }
  const len1 = Math.max(1, Math.round((duration1 || 60) / 60));
  const len2 = Math.max(1, Math.round((duration2 || 60) / 60));
  return Math.max(idx1, idx2) < Math.min(idx1 + len1, idx2 + len2);
}

/**
 * Checks if a booking occupies a specific slot (supports multi-slot JSON or start_time/duration)
 */
function bookingOccupiesSlot(
  b: { startTime?: string; start_time?: string; durationMinutes?: number; duration_minutes?: number; slots?: unknown },
  targetStartTime: string
): boolean {
  const slotsArr = b.slots;
  if (Array.isArray(slotsArr) && slotsArr.length > 0) {
    return slotsArr.some((s: unknown) => {
      const sTime = typeof s === 'string' ? s : typeof s === 'object' && s !== null && 'startTime' in s ? String((s as { startTime: unknown }).startTime) : '';
      return sTime === targetStartTime;
    });
  }
  const st = b.startTime || b.start_time || '';
  const dur = b.durationMinutes || b.duration_minutes || 60;
  return slotsOverlap(st, dur, targetStartTime, 60);
}

/**
 * Server-Side In-Memory Authoritative Booking & Notification Store
 * Used when Supabase is not connected, providing live state persistence
 * across API calls in the Node.js runtime.
 */
class ServerBookingStore {
  private bookings: Booking[] = [...INITIAL_DEMO_BOOKINGS];
  private notifications: AdminNotification[] = [
    {
      id: 'notif-init-1',
      bookingRef: 'PADEL-PK-2026-8921',
      type: 'receipt_submitted',
      title: 'Payment Receipt Submitted',
      message: 'Hamza Tariq submitted Easypaisa receipt for Court 1 (19:00 - 20:00). TRX: EP-902819204. Advance: PKR 500.',
      customerName: 'Hamza Tariq',
      customerPhone: '+92 300 8472910',
      advanceAmount: 500,
      isRead: false,
      createdAt: new Date().toISOString(),
    },
  ];

  // 1. Get availability for a court & date
  public getAvailability(courtId: string, date: string): TimeSlot[] {
    const court = DEMO_COURTS.find((c) => c.id === courtId) || DEMO_COURTS[0];

    const now = Date.now();
    const activeBookings = this.bookings.filter((b) => {
      if (b.courtId !== courtId || b.date !== date) return false;
      if (b.status === 'rejected' || b.status === 'cancelled' || b.status === 'expired') return false;
      if (b.status === 'confirmed' || b.status === 'payment_under_review') return true;
      if (b.status === 'awaiting_payment') {
        const isExpired = new Date(b.createdAt).getTime() + CLUB_CONFIG.paymentDeadlineMinutes * 60 * 1000 <= now;
        return !isExpired;
      }
      return false;
    });

    return OPERATING_SLOTS_DEF.map((def) => {
      const activeMatch = activeBookings.find((b) => bookingOccupiesSlot(b, def.startTime));

      let status: TimeSlot['status'] = 'available';
      let heldUntil: string | undefined = undefined;

      if (activeMatch) {
        if (activeMatch.status === 'confirmed') {
          status = 'booked';
        } else if (activeMatch.status === 'payment_under_review' || activeMatch.status === 'awaiting_payment') {
          status = 'held'; // Displayed as 'Reserved' on public calendar
          heldUntil = new Date(new Date(activeMatch.createdAt).getTime() + CLUB_CONFIG.paymentDeadlineMinutes * 60 * 1000).toISOString();
        }
      }

      const hour = parseInt(def.startTime.split(':')[0], 10);
      const { rate, isPeak } = getHourlyRate(court.id, hour);

      return {
        id: `${courtId}-${date}-${def.startTime}`,
        startTime: def.startTime,
        endTime: def.endTime,
        label: def.label,
        isPeak,
        price: rate,
        status,
        heldUntil,
      };
    });
  }

  // 2. Create pending booking (with atomic server double-booking check)
  public createPendingBooking(params: {
    courtId: string;
    date: string;
    startTime?: string;
    slots?: string[];
    durationMinutes?: number;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    paymentMethod?: PaymentMethod;
    transactionRef?: string;
    receiptScreenshotUrl?: string;
    referenceNumber?: string;
  }): { success: true; booking: Booking } | { success: false; error: string } {
    const court = DEMO_COURTS.find((c) => c.id === params.courtId) || DEMO_COURTS[0];

    // Determine requested slots list
    const requestedSlots: string[] =
      params.slots && params.slots.length > 0
        ? [...params.slots]
        : params.startTime
        ? [params.startTime]
        : [];

    if (requestedSlots.length === 0) {
      return { success: false, error: 'No time slot specified.' };
    }

    // Verify all requested slots are valid operating hours
    for (const sTime of requestedSlots) {
      const valid = OPERATING_SLOTS_DEF.some((s) => s.startTime === sTime);
      if (!valid) {
        return { success: false, error: `Invalid time slot: ${sTime}` };
      }
    }

    // SERVER-SIDE DOUBLE BOOKING PREVENTION:
    // Check if any active booking conflicts with any of the requested slots
    const now = Date.now();
    const existingConflict = this.bookings.find((b) => {
      if (b.courtId !== params.courtId || b.date !== params.date) return false;
      if (b.status === 'rejected' || b.status === 'cancelled' || b.status === 'expired') return false;
      if (b.status === 'awaiting_payment') {
        const isExpired = new Date(b.createdAt).getTime() + CLUB_CONFIG.paymentDeadlineMinutes * 60 * 1000 <= now;
        if (isExpired) return false;
      }
      return requestedSlots.some((reqSlot) => bookingOccupiesSlot(b, reqSlot));
    });

    if (existingConflict) {
      return {
        success: false,
        error: `One or more selected slots on ${params.date} are already reserved by another customer (${existingConflict.status === 'confirmed' ? 'Confirmed' : 'Held Under Review'}).`,
      };
    }

    // Calculate dynamic pricing across all slots
    const pricing = calculateMultipleSlotsPrice(court.id, requestedSlots);
    const timing = resolveBookingTiming(requestedSlots);
    const primaryStartTime = timing.primaryStartTime;
    const primaryEndTime = timing.primaryEndTime;
    const durationMinutes = requestedSlots.length * 60;

    const bookingSlots: BookingSlotItem[] = pricing.segments.map((seg) => ({
      startTime: seg.startTime,
      endTime: seg.endTime,
      label: seg.label,
      price: seg.rate,
      isPeak: seg.isPeak,
    }));

    // Generate unique reference
    const randomRefNum = Math.floor(1000 + Math.random() * 9000);
    const referenceNumber = params.referenceNumber || `PADEL-PK-2026-${randomRefNum}`;
    const initialStatus: Booking['status'] = params.receiptScreenshotUrl ? 'payment_under_review' : 'awaiting_payment';

    const newBooking: Booking = {
      id: `booking-${Date.now()}-${randomRefNum}`,
      referenceNumber,
      courtId: court.id,
      courtName: court.name,
      date: params.date,
      startTime: primaryStartTime,
      endTime: primaryEndTime,
      durationMinutes,
      totalAmount: pricing.totalAmount,
      advanceRequiredAmount: pricing.advanceRequiredAmount, // Fixed PKR 500
      remainingAmount: pricing.remainingAmount, // total - 500
      status: initialStatus,
      customerName: params.customerName.trim(),
      customerPhone: params.customerPhone.trim(),
      customerEmail: params.customerEmail ? params.customerEmail.trim() : undefined,
      paymentMethod: params.paymentMethod,
      transactionRef: params.transactionRef ? params.transactionRef.trim() : undefined,
      receiptScreenshotUrl: params.receiptScreenshotUrl,
      slots: bookingSlots,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: true,
    };

    // Store atomically
    this.bookings.unshift(newBooking);

    // Notify admin
    this.notifications.unshift({
      id: `notif-${Date.now()}`,
      bookingRef: referenceNumber,
      type: params.receiptScreenshotUrl ? 'receipt_submitted' : 'slot_held',
      title: params.receiptScreenshotUrl ? 'Payment Screenshot Submitted' : 'Slot Held (Pending Payment)',
      message: params.receiptScreenshotUrl
        ? `${newBooking.customerName} submitted payment receipt for ${court.name} on ${newBooking.date} (${newBooking.startTime} - ${newBooking.endTime}). TRX: ${params.transactionRef || 'N/A'}. Advance: PKR 500.`
        : `${newBooking.customerName} initiated booking for ${court.name} on ${newBooking.date} (${newBooking.startTime} - ${newBooking.endTime}). Awaiting PKR 500 advance.`,
      customerName: newBooking.customerName,
      customerPhone: newBooking.customerPhone,
      advanceAmount: 500,
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    return { success: true, booking: newBooking };
  }

  // 3. Find by reference
  public getByRef(referenceNumber: string): Booking | null {
    return this.bookings.find((b) => b.referenceNumber.toLowerCase() === referenceNumber.toLowerCase()) || null;
  }

  // 4. Submit receipt (transitions to payment_under_review, creates admin notification)
  public submitReceipt(params: {
    referenceNumber: string;
    paymentMethod: PaymentMethod;
    transactionRef?: string;
    receiptScreenshotUrl?: string;
  }): { success: true; booking: Booking } | { success: false; error: string } {
    const bookingIndex = this.bookings.findIndex(
      (b) => b.referenceNumber.toLowerCase() === params.referenceNumber.toLowerCase()
    );

    if (bookingIndex === -1) {
      return { success: false, error: 'Booking reference not found.' };
    }

    const booking = this.bookings[bookingIndex];

    if (booking.status === 'confirmed') {
      return { success: false, error: 'This booking has already been verified and confirmed.' };
    }

    if (booking.status === 'rejected') {
      return { success: false, error: 'This booking was rejected. Please place a new booking reservation.' };
    }

    // Update booking strictly to PAYMENT_UNDER_REVIEW (Customers cannot confirm their own payment)
    const updatedBooking: Booking = {
      ...booking,
      status: 'payment_under_review',
      paymentMethod: params.paymentMethod,
      transactionRef: params.transactionRef ? params.transactionRef.trim() : undefined,
      receiptScreenshotUrl: params.receiptScreenshotUrl || booking.receiptScreenshotUrl,
      updatedAt: new Date().toISOString(),
    };

    this.bookings[bookingIndex] = updatedBooking;

    // Trigger Admin Notification
    const channelName = params.paymentMethod === 'easypaisa' ? 'Easypaisa' : 'Faysal Bank';
    const trxLabel = params.transactionRef?.trim() ? `TRX: ${params.transactionRef.trim()}. ` : '';
    this.notifications.unshift({
      id: `notif-receipt-${Date.now()}`,
      bookingRef: booking.referenceNumber,
      type: 'receipt_submitted',
      title: 'Payment Screenshot Submitted',
      message: `Customer ${booking.customerName} uploaded receipt via ${channelName}. ${trxLabel}Advance: PKR ${booking.advanceRequiredAmount}.`,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      advanceAmount: booking.advanceRequiredAmount,
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    return { success: true, booking: updatedBooking };
  }

  // 5. Admin Approve Booking (Atomically re-checks slot and locks confirmed)
  public adminApprove(params: {
    referenceNumber: string;
    adminEmail: string;
  }): { success: true; booking: Booking } | { success: false; error: string } {
    if (params.adminEmail.toLowerCase() !== CLUB_CONFIG.businessEmail.toLowerCase()) {
      return { success: false, error: 'Unauthorized: Only authorized club administrators can confirm payments.' };
    }

    const bookingIndex = this.bookings.findIndex(
      (b) => b.referenceNumber.toLowerCase() === params.referenceNumber.toLowerCase()
    );

    if (bookingIndex === -1) {
      return { success: false, error: 'Booking not found.' };
    }

    const booking = this.bookings[bookingIndex];

    // Re-check conflict to prevent double booking
    const conflictingConfirmed = this.bookings.find(
      (b) =>
        b.courtId === booking.courtId &&
        b.date === booking.date &&
        b.status === 'confirmed' &&
        b.referenceNumber !== booking.referenceNumber &&
        slotsOverlap(b.startTime, b.durationMinutes || 60, booking.startTime, booking.durationMinutes || 60)
    );

    if (conflictingConfirmed) {
      return { success: false, error: 'Conflict: Another booking is already confirmed for this court and time.' };
    }

    const confirmedBooking: Booking = {
      ...booking,
      status: 'confirmed',
      updatedAt: new Date().toISOString(),
    };

    this.bookings[bookingIndex] = confirmedBooking;

    this.notifications.unshift({
      id: `notif-approved-${Date.now()}`,
      bookingRef: booking.referenceNumber,
      type: 'booking_confirmed',
      title: 'Booking Approved',
      message: `Booking ${booking.referenceNumber} was approved and locked by ${params.adminEmail}.`,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      advanceAmount: booking.advanceRequiredAmount,
      isRead: true,
      createdAt: new Date().toISOString(),
    });

    return { success: true, booking: confirmedBooking };
  }

  // 6. Admin Reject Booking (Requires reason, marks rejected, atomically releases slot)
  public adminReject(params: {
    referenceNumber: string;
    rejectionReason: string;
    adminEmail: string;
  }): { success: true; booking: Booking } | { success: false; error: string } {
    if (params.adminEmail.toLowerCase() !== CLUB_CONFIG.businessEmail.toLowerCase()) {
      return { success: false, error: 'Unauthorized: Only authorized club administrators can reject payments.' };
    }

    if (!params.rejectionReason || !params.rejectionReason.trim()) {
      return { success: false, error: 'Rejection reason is required.' };
    }

    const bookingIndex = this.bookings.findIndex(
      (b) => b.referenceNumber.toLowerCase() === params.referenceNumber.toLowerCase()
    );

    if (bookingIndex === -1) {
      return { success: false, error: 'Booking not found.' };
    }

    const booking = this.bookings[bookingIndex];

    // Atomically update status to 'rejected'
    // Because status becomes 'rejected', the slot is automatically excluded from active bookings
    // and becomes available for other customers immediately!
    const rejectedBooking: Booking = {
      ...booking,
      status: 'rejected',
      rejectionReason: params.rejectionReason.trim(),
      updatedAt: new Date().toISOString(),
    };

    this.bookings[bookingIndex] = rejectedBooking;

    this.notifications.unshift({
      id: `notif-rejected-${Date.now()}`,
      bookingRef: booking.referenceNumber,
      type: 'booking_rejected',
      title: 'Payment Rejected & Slot Released',
      message: `Booking ${booking.referenceNumber} rejected by ${params.adminEmail}. Reason: ${params.rejectionReason}. Slot released.`,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      advanceAmount: booking.advanceRequiredAmount,
      isRead: true,
      createdAt: new Date().toISOString(),
    });

    return { success: true, booking: rejectedBooking };
  }

  // 6b. Admin Manual Booking (with atomic double-booking prevention)
  public createManualBooking(params: {
    courtId: string;
    date: string;
    startTime: string;
    durationMinutes: number;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    paymentMethod?: PaymentMethod;
    isPaid?: boolean;
    adminEmail: string;
  }): { success: true; booking: Booking } | { success: false; error: string } {
    const court = DEMO_COURTS.find((c) => c.id === params.courtId) || DEMO_COURTS[0];
    const duration = params.durationMinutes || 60;
    const now = Date.now();

    // Check for overlap against active bookings (ignoring rejected, cancelled, and expired holds)
    const existingConflict = this.bookings.find((b) => {
      if (b.courtId !== params.courtId || b.date !== params.date) return false;
      if (b.status === 'rejected' || b.status === 'cancelled' || b.status === 'expired') return false;
      if (b.status === 'awaiting_payment') {
        const isExpired = new Date(b.createdAt).getTime() + CLUB_CONFIG.paymentDeadlineMinutes * 60 * 1000 <= now;
        if (isExpired) return false;
      }
      return slotsOverlap(b.startTime, b.durationMinutes || 60, params.startTime, duration);
    });

    if (existingConflict) {
      return {
        success: false,
        error: 'Slot Already Booked — This court and time slot is already reserved or booked. Please select another available slot.',
      };
    }

    const { totalAmount, advanceRequiredAmount, remainingAmount } = calculateBookingPrice(
      court.id,
      params.startTime,
      duration
    );

    const ref = `PPA-PK-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const newBooking: Booking = {
      id: `manual-${Date.now()}`,
      referenceNumber: ref,
      courtId: court.id,
      courtName: court.name,
      date: params.date,
      startTime: params.startTime,
      endTime: calculateEndTime(params.startTime, duration),
      durationMinutes: duration,
      totalAmount,
      advanceRequiredAmount,
      remainingAmount,
      status: params.isPaid ? 'confirmed' : 'awaiting_payment',
      customerName: params.customerName.trim(),
      customerPhone: params.customerPhone.trim(),
      customerEmail: params.customerEmail?.trim(),
      paymentMethod: params.paymentMethod || 'cash_at_venue',
      transactionRef: params.isPaid ? 'CASH-COUNTER-DESK' : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: true,
    };

    this.bookings.unshift(newBooking);

    this.notifications.unshift({
      id: `notif-manual-${Date.now()}`,
      bookingRef: ref,
      type: params.isPaid ? 'booking_confirmed' : 'slot_held',
      title: params.isPaid ? 'Manual Booking (Confirmed)' : 'Manual Booking (Awaiting Cash)',
      message: `Manual desk booking created by ${params.adminEmail} for ${params.customerName} (${court.name}, ${params.date} ${params.startTime}).`,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      advanceAmount: advanceRequiredAmount,
      isRead: true,
      createdAt: new Date().toISOString(),
    });

    return { success: true, booking: newBooking };
  }

  // 7. Get all bookings for admin
  public getAllBookings(): Booking[] {
    return [...this.bookings];
  }

  // 8. Get admin notifications
  public getNotifications(): AdminNotification[] {
    return [...this.notifications];
  }

  // 9. Mark notification as read
  public markNotificationRead(id: string): boolean {
    const notif = this.notifications.find((n) => n.id === id);
    if (notif) {
      notif.isRead = true;
      return true;
    }
    return false;
  }
}

// Global server singleton to preserve memory state in Node across route requests
const globalForStore = global as unknown as { serverBookingStore?: ServerBookingStore };
export const serverBookingStore = globalForStore.serverBookingStore ?? new ServerBookingStore();
if (process.env.NODE_ENV !== 'production') globalForStore.serverBookingStore = serverBookingStore;

// ==============================================================================
// PUBLIC EXPORTED REPOSITORY INTERFACE (Dual-mode: Supabase OR Server Memory Store)
// ==============================================================================

export async function getSlotAvailability(courtId: string, date: string): Promise<TimeSlot[]> {
  const court = DEMO_COURTS.find((c) => c.id === courtId) || DEMO_COURTS[0];

  if (isSupabaseConfigured()) {
    const adminClient = getSupabaseAdminClient();
    if (adminClient) {
      try {
        const nowIso = new Date().toISOString();
        const thirtyMinsAgo = new Date(Date.now() - CLUB_CONFIG.paymentDeadlineMinutes * 60 * 1000).toISOString();

        // 1. Clean up expired holds in database (non-blocking)
        try {
          await adminClient
            .from('bookings')
            .update({ status: 'expired', updated_at: nowIso })
            .eq('court_id', courtId)
            .eq('date', date)
            .eq('status', 'awaiting_payment')
            .or(`held_until.lte.${nowIso},and(held_until.is.null,created_at.lte.${thirtyMinsAgo})`);
        } catch {
          // Non-blocking cleanup
        }

        // Try querying child booking_slots table if it exists
        let activeSlotRows: Array<{ start_time: string; status: string; held_until?: string | null; created_at: string }> | null = null;
        try {
          const { data: bSlots, error: bsErr } = await adminClient
            .from('booking_slots')
            .select('start_time, status, held_until, created_at')
            .eq('court_id', courtId)
            .eq('date', date)
            .in('status', ['awaiting_payment', 'payment_under_review', 'confirmed']);

          if (!bsErr && bSlots && bSlots.length > 0) {
            activeSlotRows = bSlots.filter((s) => {
              if (s.status === 'confirmed' || s.status === 'payment_under_review') return true;
              if (s.status === 'awaiting_payment') {
                if (s.held_until) return new Date(s.held_until).getTime() > Date.now();
                return new Date(s.created_at).getTime() + CLUB_CONFIG.paymentDeadlineMinutes * 60 * 1000 > Date.now();
              }
              return false;
            });
          }
        } catch {
          // Table booking_slots may not exist yet
        }

        let activeBookings: Array<{
          start_time: string;
          duration_minutes?: number;
          status: string;
          created_at: string;
          held_until?: string | null;
          slots?: unknown;
        }> | null = null;

        // 2. Fetch active bookings for court and date
        const { data, error } = await adminClient
          .from('bookings')
          .select('start_time, end_time, duration_minutes, status, created_at, held_until, slots')
          .eq('court_id', courtId)
          .eq('date', date)
          .in('status', ['awaiting_payment', 'payment_under_review', 'confirmed']);

        if (!error && data) {
          activeBookings = data.filter((b) => {
            if (b.status === 'confirmed' || b.status === 'payment_under_review') return true;
            if (b.status === 'awaiting_payment') {
              if (b.held_until) return new Date(b.held_until).getTime() > Date.now();
              return new Date(b.created_at).getTime() + CLUB_CONFIG.paymentDeadlineMinutes * 60 * 1000 > Date.now();
            }
            return false;
          });
        } else if (error && error.code === '42703') {
          // If 'slots' column not present yet, fallback to select without slots
          const { data: fbData } = await adminClient
            .from('bookings')
            .select('start_time, end_time, duration_minutes, status, created_at, held_until')
            .eq('court_id', courtId)
            .eq('date', date)
            .in('status', ['awaiting_payment', 'payment_under_review', 'confirmed']);
          if (fbData) {
            activeBookings = fbData.filter((b) => {
              if (b.status === 'confirmed' || b.status === 'payment_under_review') return true;
              if (b.status === 'awaiting_payment') {
                if (b.held_until) return new Date(b.held_until).getTime() > Date.now();
                return new Date(b.created_at).getTime() + CLUB_CONFIG.paymentDeadlineMinutes * 60 * 1000 > Date.now();
              }
              return false;
            });
          }
        }

        if (activeBookings || activeSlotRows) {
          return OPERATING_SLOTS_DEF.map((def) => {
            let matchStatus: TimeSlot['status'] = 'available';
            let heldUntil: string | undefined = undefined;

            const slotRowMatch = activeSlotRows?.find((s) => s.start_time === def.startTime);
            if (slotRowMatch) {
              if (slotRowMatch.status === 'confirmed') {
                matchStatus = 'booked';
              } else if (slotRowMatch.status === 'payment_under_review' || slotRowMatch.status === 'awaiting_payment') {
                matchStatus = 'held';
                heldUntil = slotRowMatch.held_until || new Date(new Date(slotRowMatch.created_at).getTime() + CLUB_CONFIG.paymentDeadlineMinutes * 60 * 1000).toISOString();
              }
            } else if (activeBookings) {
              const bMatch = activeBookings.find((b) => bookingOccupiesSlot(b, def.startTime));
              if (bMatch) {
                if (bMatch.status === 'confirmed') {
                  matchStatus = 'booked';
                } else if (bMatch.status === 'payment_under_review' || bMatch.status === 'awaiting_payment') {
                  matchStatus = 'held';
                  heldUntil = bMatch.held_until || new Date(new Date(bMatch.created_at).getTime() + CLUB_CONFIG.paymentDeadlineMinutes * 60 * 1000).toISOString();
                }
              }
            }

            const hour = parseInt(def.startTime.split(':')[0], 10);
            const { rate, isPeak } = getHourlyRate(court.id, hour);

            return {
              id: `${courtId}-${date}-${def.startTime}`,
              startTime: def.startTime,
              endTime: def.endTime,
              label: def.label,
              isPeak,
              price: rate,
              status: matchStatus,
              heldUntil,
            };
          });
        }
      } catch {
        // Fallback
      }
    }
  }

  // Memory store fallback
  return serverBookingStore.getAvailability(courtId, date);
}

export async function createPendingBooking(params: {
  courtId: string;
  date: string;
  startTime?: string;
  slots?: string[];
  durationMinutes?: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  paymentMethod?: PaymentMethod;
  transactionRef?: string;
  receiptScreenshotUrl?: string;
  referenceNumber?: string;
}): Promise<{ success: true; booking: Booking } | { success: false; error: string }> {
  const court = DEMO_COURTS.find((c) => c.id === params.courtId) || DEMO_COURTS[0];

  const requestedSlots: string[] =
    params.slots && params.slots.length > 0
      ? [...params.slots]
      : params.startTime
      ? [params.startTime]
      : [];

  if (requestedSlots.length === 0) {
    return { success: false, error: 'No time slot specified.' };
  }

  for (const sTime of requestedSlots) {
    const valid = OPERATING_SLOTS_DEF.some((s) => s.startTime === sTime);
    if (!valid) {
      return { success: false, error: `Invalid slot time: ${sTime}` };
    }
  }

  const timing = resolveBookingTiming(requestedSlots);
  const primaryStartTime = timing.primaryStartTime;
  const primaryEndTime = timing.primaryEndTime;
  const durationMinutes = requestedSlots.length * 60;

  const pricing = calculateMultipleSlotsPrice(court.id, requestedSlots);
  const initialStatus: Booking['status'] = params.receiptScreenshotUrl ? 'payment_under_review' : 'awaiting_payment';

  const bookingSlots: BookingSlotItem[] = pricing.segments.map((seg) => ({
    startTime: seg.startTime,
    endTime: seg.endTime,
    label: seg.label,
    price: seg.rate,
    isPeak: seg.isPeak,
  }));

  if (isSupabaseConfigured()) {
    if (!isSupabaseAdminConfigured()) {
      return {
        success: false,
        error: 'Database configuration error: SUPABASE_SERVICE_ROLE_KEY is missing or invalid in .env.local.',
      };
    }

    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      return {
        success: false,
        error: 'Database error: Failed to initialize Supabase server client.',
      };
    }

    const randomRefNum = Math.floor(1000 + Math.random() * 9000);
    const referenceNumber = params.referenceNumber || `PADEL-PK-2026-${randomRefNum}`;

    try {
      // 1. Try atomic PostgreSQL RPC if migration 20261026_multi_slot_booking_schema has been applied
      try {
        const { data: rpcRes, error: rpcErr } = await adminClient.rpc('create_multi_slot_booking_secure', {
          p_reference_number: referenceNumber,
          p_court_id: court.id,
          p_court_name: court.name,
          p_date: params.date,
          p_start_time: primaryStartTime,
          p_end_time: primaryEndTime,
          p_duration_minutes: durationMinutes,
          p_total_amount: pricing.totalAmount,
          p_advance_required_amount: pricing.advanceRequiredAmount,
          p_remaining_amount: pricing.remainingAmount,
          p_customer_name: params.customerName.trim(),
          p_customer_phone: params.customerPhone.trim(),
          p_customer_email: params.customerEmail?.trim() || null,
          p_payment_method: params.paymentMethod || null,
          p_transaction_ref: params.transactionRef ? params.transactionRef.trim() : null,
          p_receipt_screenshot_url: params.receiptScreenshotUrl || null,
          p_status: initialStatus,
          p_slots: bookingSlots,
        });

        if (rpcErr) {
          const isRpcMissing = rpcErr.code === '42883' || rpcErr.message.includes('function') || rpcErr.message.includes('not found');
          if (!isRpcMissing) {
            return { success: false, error: rpcErr.message };
          }
        } else if (rpcRes) {
          if (!rpcRes.success) {
            const isOperatingHoursRestriction =
              rpcRes.error?.includes('outside club operating hours') ||
              rpcRes.error?.includes('exceeds club closing hours');
            if (!isOperatingHoursRestriction) {
              return { success: false, error: rpcRes.error || 'Failed to reserve slots.' };
            }
            // If failure was due to legacy 02:00 AM operating hours restriction on an unmigrated database RPC,
            // fall through to direct transactional table insert!
          } else {
            return {
              success: true,
              booking: {
                id: rpcRes.booking_id,
                referenceNumber,
                courtId: court.id,
                courtName: court.name,
                date: params.date,
                startTime: primaryStartTime,
                endTime: primaryEndTime,
                durationMinutes,
                totalAmount: rpcRes.total_amount ?? pricing.totalAmount,
                advanceRequiredAmount: rpcRes.advance_required_amount ?? pricing.advanceRequiredAmount,
                remainingAmount: rpcRes.remaining_amount ?? pricing.remainingAmount,
                status: (rpcRes.status as Booking['status']) || initialStatus,
                customerName: params.customerName.trim(),
                customerPhone: params.customerPhone.trim(),
                customerEmail: params.customerEmail?.trim() || undefined,
                paymentMethod: params.paymentMethod,
                transactionRef: params.transactionRef ? params.transactionRef.trim() : undefined,
                receiptScreenshotUrl: params.receiptScreenshotUrl,
                slots: bookingSlots,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isDemo: false,
              },
            };
          }
        }
      } catch {
        // Fallback to table insert if RPC not yet created in Supabase
      }

      // 2. Direct database verify slot availability (against both bookings and booking_slots)
      let conflicts: Array<{ id?: string; start_time: string; duration_minutes?: number; status: string; slots?: unknown }> | null = null;
      const conflictRes = await adminClient
        .from('bookings')
        .select('id, start_time, duration_minutes, status, slots')
        .eq('court_id', court.id)
        .eq('date', params.date)
        .in('status', ['awaiting_payment', 'payment_under_review', 'confirmed']);

      if (!conflictRes.error && conflictRes.data) {
        conflicts = conflictRes.data;
      } else if (conflictRes.error && conflictRes.error.code === '42703') {
        const { data: fbConflicts } = await adminClient
          .from('bookings')
          .select('id, start_time, duration_minutes, status')
          .eq('court_id', court.id)
          .eq('date', params.date)
          .in('status', ['awaiting_payment', 'payment_under_review', 'confirmed']);
        if (fbConflicts) conflicts = fbConflicts;
      }

      if (conflicts && conflicts.length > 0) {
        for (const reqSlot of requestedSlots) {
          const conflictingBooking = conflicts.find((c) => bookingOccupiesSlot(c, reqSlot));
          if (conflictingBooking) {
            return {
              success: false,
              error: `Slot on ${params.date} at ${reqSlot} conflicts with an existing reservation (${conflictingBooking.status === 'confirmed' ? 'Confirmed' : 'Under Review'}).`,
            };
          }
        }
      }

      // Also check booking_slots table if present
      try {
        const { data: slotConflicts } = await adminClient
          .from('booking_slots')
          .select('start_time, status')
          .eq('court_id', court.id)
          .eq('date', params.date)
          .in('status', ['awaiting_payment', 'payment_under_review', 'confirmed'])
          .in('start_time', requestedSlots);

        if (slotConflicts && slotConflicts.length > 0) {
          return {
            success: false,
            error: `Slot on ${params.date} at ${slotConflicts[0].start_time} is already reserved by another customer.`,
          };
        }
      } catch {
        // Ignored if booking_slots table does not exist
      }

      // 2. Insert booking (using established referenceNumber)
      const insertRecord: Record<string, unknown> = {
        reference_number: referenceNumber,
        court_id: court.id,
        court_name: court.name,
        date: params.date,
        start_time: primaryStartTime,
        end_time: primaryEndTime,
        duration_minutes: durationMinutes,
        total_amount: pricing.totalAmount,
        advance_required_amount: pricing.advanceRequiredAmount, // Fixed PKR 500
        remaining_amount: pricing.remainingAmount,
        status: initialStatus,
        customer_name: params.customerName.trim(),
        customer_phone: params.customerPhone.trim(),
        customer_email: params.customerEmail?.trim() || null,
        payment_method: params.paymentMethod || null,
        transaction_ref: params.transactionRef ? params.transactionRef.trim() : null,
        receipt_screenshot_url: params.receiptScreenshotUrl || null,
        slots: bookingSlots,
      };

      let insertResult = await adminClient.from('bookings').insert(insertRecord).select().single();

      // If 'slots' column does not exist yet (code 42703), retry without slots column
      if (insertResult.error && insertResult.error.code === '42703') {
        const fallbackRecord = { ...insertRecord };
        delete fallbackRecord.slots;
        insertResult = await adminClient.from('bookings').insert(fallbackRecord).select().single();
      }

      const { data, error } = insertResult;

      if (error) {
        if (error.code === '23505') {
          return { success: false, error: 'One or more selected slots are already held or booked. Please choose another time.' };
        }
        return { success: false, error: error.message };
      }

      // Also attempt inserting child rows into booking_slots (safe non-blocking)
      if (data) {
        try {
          const childSlots = bookingSlots.map((bs) => ({
            booking_id: data.id,
            booking_ref: data.reference_number,
            court_id: data.court_id,
            court_name: data.court_name,
            date: data.date,
            start_time: bs.startTime,
            end_time: bs.endTime,
            price: bs.price,
            is_peak: bs.isPeak,
            status: data.status,
            held_until: data.held_until || null,
          }));
          await adminClient.from('booking_slots').insert(childSlots);
        } catch {
          // Non-blocking if table not migrated yet
        }
      }

      // If receipt screenshot was supplied at booking creation, log notification
      if (params.receiptScreenshotUrl && data) {
        try {
          await adminClient.from('admin_notifications').insert({
            booking_ref: data.reference_number,
            type: 'receipt_submitted',
            title: 'Payment Screenshot Submitted',
            message: `Customer ${data.customer_name} uploaded receipt during booking for ${data.court_name} on ${data.date}. TRX: ${params.transactionRef || 'N/A'}. Advance: PKR ${data.advance_required_amount}.`,
            customer_name: data.customer_name,
            customer_phone: data.customer_phone,
            advance_amount: data.advance_required_amount,
            is_read: false,
          });
        } catch {
          // Non-blocking notification
        }
      }

      return {
        success: true,
        booking: {
          id: data.id,
          referenceNumber: data.reference_number,
          courtId: data.court_id,
          courtName: data.court_name,
          date: data.date,
          startTime: data.start_time,
          endTime: data.end_time,
          durationMinutes: data.duration_minutes,
          totalAmount: data.total_amount,
          advanceRequiredAmount: data.advance_required_amount,
          remainingAmount: data.remaining_amount,
          status: data.status,
          customerName: data.customer_name,
          customerPhone: data.customer_phone,
          customerEmail: data.customer_email,
          paymentMethod: data.payment_method,
          transactionRef: data.transaction_ref,
          receiptScreenshotUrl: data.receipt_screenshot_url,
          slots: data.slots || bookingSlots,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          isDemo: false,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Database operation failed.';
      return { success: false, error: `Database error: ${msg}` };
    }
  }

  return serverBookingStore.createPendingBooking(params);
}

export async function getBookingByRef(referenceNumber: string): Promise<Booking | null> {
  const adminClient = getSupabaseAdminClient();
  if (adminClient) {
    try {
      const { data, error } = await adminClient
        .from('bookings')
        .select('*')
        .eq('reference_number', referenceNumber)
        .single();

      if (!error && data) {
        return {
          id: data.id,
          referenceNumber: data.reference_number,
          courtId: data.court_id,
          courtName: data.court_name,
          date: data.date,
          startTime: data.start_time,
          endTime: data.end_time,
          durationMinutes: data.duration_minutes,
          totalAmount: data.total_amount,
          advanceRequiredAmount: data.advance_required_amount,
          remainingAmount: data.remaining_amount,
          status: data.status,
          customerName: data.customer_name,
          customerPhone: data.customer_phone,
          customerEmail: data.customer_email,
          paymentMethod: data.payment_method,
          transactionRef: data.transaction_ref,
          receiptScreenshotUrl: data.receipt_screenshot_url,
          rejectionReason: data.rejection_reason,
          slots: data.slots || undefined,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          isDemo: false,
        };
      }
    } catch {
      // Fallback to memory store
    }
  }

  return serverBookingStore.getByRef(referenceNumber);
}

export async function submitReceipt(params: {
  referenceNumber: string;
  paymentMethod: PaymentMethod;
  transactionRef?: string;
  receiptScreenshotUrl?: string;
}): Promise<{ success: true; booking: Booking } | { success: false; error: string }> {
  const adminClient = getSupabaseAdminClient();
  if (adminClient) {
    try {
      const { data, error } = await adminClient
        .from('bookings')
        .update({
          status: 'payment_under_review',
          payment_method: params.paymentMethod,
          transaction_ref: params.transactionRef ? params.transactionRef.trim() : null,
          receipt_screenshot_url: params.receiptScreenshotUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('reference_number', params.referenceNumber)
        .select()
        .single();

      if (!error && data) {
        // Create notification row in database
        try {
          const trxText = params.transactionRef?.trim() ? `TRX: ${params.transactionRef.trim()}. ` : '';
          await adminClient.from('admin_notifications').insert({
            booking_ref: data.reference_number,
            type: 'receipt_submitted',
            title: 'Payment Screenshot Submitted',
            message: `Customer ${data.customer_name} uploaded receipt. ${trxText}Advance: PKR ${data.advance_required_amount}.`,
            customer_name: data.customer_name,
            customer_phone: data.customer_phone,
            advance_amount: data.advance_required_amount,
            is_read: false,
          });
        } catch {
          // Non-blocking notification
        }

        return {
          success: true,
          booking: {
            id: data.id,
            referenceNumber: data.reference_number,
            courtId: data.court_id,
            courtName: data.court_name,
            date: data.date,
            startTime: data.start_time,
            endTime: data.end_time,
            durationMinutes: data.duration_minutes,
            totalAmount: data.total_amount,
            advanceRequiredAmount: data.advance_required_amount,
            remainingAmount: data.remaining_amount,
            status: data.status,
            customerName: data.customer_name,
            customerPhone: data.customer_phone,
            paymentMethod: data.payment_method,
            transactionRef: data.transaction_ref,
            receiptScreenshotUrl: data.receipt_screenshot_url,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            isDemo: false,
          },
        };
      }

      if (error && error.code === '42501') {
        const { data: rpcRows, error: rpcErr } = await adminClient.rpc('submit_receipt_secure', {
          p_reference_number: params.referenceNumber,
          p_payment_method: params.paymentMethod,
          p_transaction_ref: params.transactionRef ? params.transactionRef.trim() : null,
          p_receipt_screenshot_url: params.receiptScreenshotUrl || null,
        });

        if (!rpcErr && rpcRows && rpcRows.length > 0) {
          const row = rpcRows[0];
          return {
            success: true,
            booking: {
              id: row.id,
              referenceNumber: row.reference_number,
              courtId: row.court_id,
              courtName: row.court_name,
              date: row.date,
              startTime: row.start_time,
              endTime: row.end_time,
              durationMinutes: row.duration_minutes,
              totalAmount: row.total_amount,
              advanceRequiredAmount: row.advance_required_amount,
              remainingAmount: row.remaining_amount,
              status: row.status,
              customerName: row.customer_name,
              customerPhone: row.customer_phone,
              paymentMethod: row.payment_method,
              transactionRef: row.transaction_ref,
              receiptScreenshotUrl: row.receipt_screenshot_url,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              isDemo: false,
            },
          };
        }

        return {
          success: false,
          error: 'Database permission denied (42501): The service_role lacks table privileges on "bookings". Please run supabase/migrations/20261025_grant_permissions.sql in the Supabase SQL Editor.',
        };
      }
    } catch {
      // Fallback
    }
  }

  return serverBookingStore.submitReceipt(params);
}

export interface AdminActionNotificationResult {
  email: EmailDispatchResult;
  whatsapp: WhatsAppDispatchResult;
}

export async function adminApproveBooking(params: {
  referenceNumber: string;
  adminEmail: string;
}): Promise<
  | { success: true; booking: Booking; notifications: AdminActionNotificationResult }
  | { success: false; error: string }
> {
  const previousBooking = await getBookingByRef(params.referenceNumber);
  const wasAlreadyConfirmed = previousBooking?.status === 'confirmed';

  let updatedBooking: Booking | null = null;
  const adminClient = getSupabaseAdminClient();

  if (adminClient) {
    try {
      const { data, error } = await adminClient.rpc('approve_booking_and_lock_slot', {
        p_booking_ref: params.referenceNumber,
        p_admin_email: params.adminEmail,
      });

      if (!error && data?.success) {
        updatedBooking = await getBookingByRef(params.referenceNumber);
      } else if (data?.error || error) {
        return { success: false, error: data?.error || error?.message || 'Database approval failed.' };
      }
    } catch {
      // Fallback
    }
  }

  if (!updatedBooking) {
    const memoryRes = serverBookingStore.adminApprove(params);
    if (!memoryRes.success) {
      return memoryRes;
    }
    updatedBooking = memoryRes.booking;
  }

  // Notification delivery: only if freshly confirmed, avoiding duplicate notifications on retry
  let emailResult: EmailDispatchResult = {
    attempted: false,
    sent: false,
    isConfigured: false,
    message: 'Booking was already confirmed; duplicate notification prevented.',
  };
  let whatsappResult: WhatsAppDispatchResult = {
    attempted: false,
    sent: false,
    isConfigured: false,
    message: 'Booking was already confirmed; duplicate notification prevented.',
  };

  if (!wasAlreadyConfirmed) {
    // Send customer email and WhatsApp notifications asynchronously
    [emailResult, whatsappResult] = await Promise.all([
      sendBookingConfirmationEmail(updatedBooking),
      sendWhatsAppBookingConfirmation(updatedBooking),
    ]);
  }

  return {
    success: true,
    booking: updatedBooking,
    notifications: {
      email: emailResult,
      whatsapp: whatsappResult,
    },
  };
}

export async function adminRejectBooking(params: {
  referenceNumber: string;
  rejectionReason: string;
  adminEmail: string;
}): Promise<
  | { success: true; booking: Booking; notifications: AdminActionNotificationResult }
  | { success: false; error: string }
> {
  const previousBooking = await getBookingByRef(params.referenceNumber);
  const wasAlreadyRejected = previousBooking?.status === 'rejected';

  let updatedBooking: Booking | null = null;
  const adminClient = getSupabaseAdminClient();

  if (adminClient) {
    try {
      const { data, error } = await adminClient.rpc('reject_booking_and_release_slot', {
        p_booking_ref: params.referenceNumber,
        p_rejection_reason: params.rejectionReason,
        p_admin_email: params.adminEmail,
      });

      if (!error && data?.success) {
        updatedBooking = await getBookingByRef(params.referenceNumber);
      } else if (data?.error || error) {
        return { success: false, error: data?.error || error?.message || 'Database rejection failed.' };
      }
    } catch {
      // Fallback
    }
  }

  if (!updatedBooking) {
    const memoryRes = serverBookingStore.adminReject(params);
    if (!memoryRes.success) {
      return memoryRes;
    }
    updatedBooking = memoryRes.booking;
  }

  // Notification delivery: only if freshly rejected, avoiding duplicate notifications on retry
  let emailResult: EmailDispatchResult = {
    attempted: false,
    sent: false,
    isConfigured: false,
    message: 'Booking was already rejected; duplicate notification prevented.',
  };
  let whatsappResult: WhatsAppDispatchResult = {
    attempted: false,
    sent: false,
    isConfigured: false,
    message: 'Booking was already rejected; duplicate notification prevented.',
  };

  if (!wasAlreadyRejected) {
    [emailResult, whatsappResult] = await Promise.all([
      sendBookingRejectionEmail(updatedBooking, params.rejectionReason),
      sendWhatsAppBookingRejection(updatedBooking, params.rejectionReason),
    ]);
  }

  return {
    success: true,
    booking: updatedBooking,
    notifications: {
      email: emailResult,
      whatsapp: whatsappResult,
    },
  };
}

export async function createManualBooking(params: {
  courtId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  paymentMethod?: PaymentMethod;
  isPaid?: boolean;
  adminEmail: string;
}): Promise<{ success: true; booking: Booking } | { success: false; error: string }> {
  const court = DEMO_COURTS.find((c) => c.id === params.courtId) || DEMO_COURTS[0];
  const duration = params.durationMinutes || 60;
  const endTime = calculateEndTime(params.startTime, duration);

  const { totalAmount, advanceRequiredAmount, remainingAmount } = calculateBookingPrice(
    court.id,
    params.startTime,
    duration
  );

  if (isSupabaseConfigured()) {
    const adminClient = getSupabaseAdminClient();
    if (adminClient) {
      try {
        const randomRefNum = Math.floor(1000 + Math.random() * 9000);
        const bookingRef = `PPA-PK-2026-${randomRefNum}`;

        // 1. Try atomic create_manual_booking RPC
        const { data, error } = await adminClient.rpc('create_manual_booking', {
          p_court_id: court.id,
          p_court_name: court.name,
          p_date: params.date,
          p_start_time: params.startTime,
          p_end_time: endTime,
          p_duration_minutes: duration,
          p_total_amount: totalAmount,
          p_advance_amount: advanceRequiredAmount,
          p_remaining_amount: remainingAmount,
          p_customer_name: params.customerName.trim(),
          p_customer_phone: params.customerPhone.trim(),
          p_customer_email: params.customerEmail?.trim() || null,
          p_payment_method: params.paymentMethod || 'cash_at_venue',
          p_is_paid: Boolean(params.isPaid),
          p_admin_email: params.adminEmail,
          p_reference_number: bookingRef,
        });

        if (!error && data?.success && data?.booking) {
          return {
            success: true,
            booking: {
              id: data.booking.id,
              referenceNumber: data.booking.referenceNumber,
              courtId: data.booking.courtId,
              courtName: data.booking.courtName,
              date: data.booking.date,
              startTime: data.booking.startTime,
              endTime: data.booking.endTime,
              durationMinutes: data.booking.durationMinutes,
              totalAmount: data.booking.totalAmount,
              advanceRequiredAmount: data.booking.advanceRequiredAmount,
              remainingAmount: data.booking.remainingAmount,
              status: data.booking.status,
              customerName: data.booking.customerName,
              customerPhone: data.booking.customerPhone,
              customerEmail: data.booking.customerEmail,
              paymentMethod: data.booking.paymentMethod,
              transactionRef: data.booking.transactionRef,
              slots: data.booking.slots,
              createdAt: data.booking.createdAt,
              updatedAt: data.booking.updatedAt,
              isDemo: false,
            },
          };
        }

        if (data && !data.success) {
          const isOperatingHoursRestriction =
            data.error?.includes('outside club operating hours') ||
            data.error?.includes('exceeds club closing hours');
          if (!isOperatingHoursRestriction) {
            return { success: false, error: data.error };
          }
        }

        // If RPC not found (e.g. before migration applied), execute direct safe transactional check
        const { data: conflicts, error: conflictErr } = await adminClient
          .from('bookings')
          .select('reference_number, start_time, duration_minutes, status, created_at, held_until')
          .eq('court_id', court.id)
          .eq('date', params.date)
          .in('status', ['awaiting_payment', 'payment_under_review', 'confirmed']);

        if (!conflictErr && conflicts) {
          const now = Date.now();
          const activeConflict = conflicts.find((c) => {
            if (c.status === 'awaiting_payment') {
              const isExpired = c.held_until
                ? new Date(c.held_until).getTime() <= now
                : new Date(c.created_at).getTime() + CLUB_CONFIG.paymentDeadlineMinutes * 60 * 1000 <= now;
              if (isExpired) return false;
            }
            return slotsOverlap(c.start_time, c.duration_minutes || 60, params.startTime, duration);
          });

          if (activeConflict) {
            return {
              success: false,
              error: 'Slot Already Booked — This court and time slot is already reserved or booked. Please select another available slot.',
            };
          }
        }

        const isPaid = Boolean(params.isPaid);
        const { data: inserted, error: insertErr } = await adminClient
          .from('bookings')
          .insert({
            reference_number: bookingRef,
            court_id: court.id,
            court_name: court.name,
            date: params.date,
            start_time: params.startTime,
            end_time: endTime,
            duration_minutes: duration,
            total_amount: totalAmount,
            advance_required_amount: advanceRequiredAmount,
            remaining_amount: remainingAmount,
            status: isPaid ? 'confirmed' : 'awaiting_payment',
            customer_name: params.customerName.trim(),
            customer_phone: params.customerPhone.trim(),
            customer_email: params.customerEmail?.trim() || undefined,
            payment_method: params.paymentMethod || 'cash_at_venue',
            transaction_ref: isPaid ? 'CASH-COUNTER-DESK' : undefined,
            approved_at: isPaid ? new Date().toISOString() : undefined,
            approved_by: isPaid ? params.adminEmail : undefined,
          })
          .select()
          .single();

        if (!insertErr && inserted) {
          return {
            success: true,
            booking: {
              id: inserted.id,
              referenceNumber: inserted.reference_number,
              courtId: inserted.court_id,
              courtName: inserted.court_name,
              date: inserted.date,
              startTime: inserted.start_time,
              endTime: inserted.end_time,
              durationMinutes: inserted.duration_minutes,
              totalAmount: inserted.total_amount,
              advanceRequiredAmount: inserted.advance_required_amount,
              remainingAmount: inserted.remaining_amount,
              status: inserted.status,
              customerName: inserted.customer_name,
              customerPhone: inserted.customer_phone,
              customerEmail: inserted.customer_email,
              paymentMethod: inserted.payment_method,
              transactionRef: inserted.transaction_ref,
              slots: inserted.slots || undefined,
              createdAt: inserted.created_at,
              updatedAt: inserted.updated_at,
              isDemo: false,
            },
          };
        }
      } catch (err) {
        console.error('[createManualBooking] Supabase error:', err);
      }
    }
  }

  return serverBookingStore.createManualBooking(params);
}

export async function getAdminBookings(): Promise<Booking[]> {
  const adminClient = getSupabaseAdminClient();
  if (adminClient) {
    try {
      const { data, error } = await adminClient
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((b) => ({
          id: b.id,
          referenceNumber: b.reference_number,
          courtId: b.court_id,
          courtName: b.court_name,
          date: b.date,
          startTime: b.start_time,
          endTime: b.end_time,
          durationMinutes: b.duration_minutes,
          totalAmount: b.total_amount,
          advanceRequiredAmount: b.advance_required_amount,
          remainingAmount: b.remaining_amount,
          status: b.status,
          customerName: b.customer_name,
          customerPhone: b.customer_phone,
          customerEmail: b.customer_email,
          paymentMethod: b.payment_method,
          transactionRef: b.transaction_ref,
          receiptScreenshotUrl: b.receipt_screenshot_url,
          rejectionReason: b.rejection_reason,
          slots: b.slots || undefined,
          createdAt: b.created_at,
          updatedAt: b.updated_at,
          isDemo: false,
        }));
      }
    } catch {
      // Fallback
    }
  }

  return serverBookingStore.getAllBookings();
}

export async function getAdminNotifications(): Promise<AdminNotification[]> {
  const adminClient = getSupabaseAdminClient();
  if (adminClient) {
    try {
      const { data, error } = await adminClient
        .from('admin_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        return data.map((n) => ({
          id: n.id,
          bookingRef: n.booking_ref,
          type: n.type,
          title: n.title,
          message: n.message,
          customerName: n.customer_name,
          customerPhone: n.customer_phone,
          advanceAmount: n.advance_amount,
          isRead: n.is_read,
          createdAt: n.created_at,
        }));
      }
    } catch {
      // Fallback
    }
  }

  return serverBookingStore.getNotifications();
}

export async function markNotificationAsRead(id: string): Promise<boolean> {
  const adminClient = getSupabaseAdminClient();
  if (adminClient) {
    try {
      await adminClient.from('admin_notifications').update({ is_read: true }).eq('id', id);
      return true;
    } catch {
      // Fallback
    }
  }
  return serverBookingStore.markNotificationRead(id);
}
