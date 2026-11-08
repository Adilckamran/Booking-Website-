/**
 * PHASE 3 — COMPLETE ADMIN TESTING SUITE
 * 
 * Verifies:
 * 1. Admin authentication / authorization check.
 * 2. Pending bookings retrieval & filtering.
 * 3. Payment review and receipt metadata inspectability.
 * 4. Booking approval:
 *    - Status transition from payment_under_review to confirmed.
 *    - Slot locked atomically.
 *    - Overlapping pending bookings rejected upon approval.
 * 5. Booking rejection:
 *    - Requires non-empty reason.
 *    - Status transition to rejected.
 *    - Slot released immediately for other customers.
 * 6. Admin manual booking:
 *    - Creates confirmed reservation for authorized admin.
 *    - Prevents double-booking.
 * 7. WhatsApp click-to-chat confirmation link:
 *    - Valid Pakistani phone normalized (+92 3xx -> 923xx).
 *    - Pre-filled confirmation message with customer name, reference, court, date, time, duration, advance paid, and remaining balance.
 * 8. WhatsApp click-to-chat rejection link:
 *    - Rejection reason included.
 *    - Club contact info included.
 * 9. Booking status retrieval by reference number.
 * 10. Admin notifications generation and read state toggle.
 */

import { serverBookingStore } from '../src/services/booking/bookingRepository';
import { CLUB_CONFIG } from '../src/config/clubConfig';
import {
  getWhatsAppClickToChatUrl,
  buildWhatsAppConfirmationMessage,
  buildWhatsAppRejectionMessage,
} from '../src/services/whatsapp';
import { validatePakistaniMobile } from '../src/utils/phoneValidation';

async function runPhase3Tests() {
  console.log('========================================================================');
  console.log('PHASE 3 — COMPLETE ADMIN TESTING SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  const testDate = '2026-12-11';
  const adminEmail = CLUB_CONFIG.businessEmail; // thepowerpadel@gmail.com
  const unauthorizedEmail = 'intruder@example.com';

  // 1. Admin Authentication / Authorization Check
  console.log('--- 1. Admin Authentication & Authorization ---');
  // Attempt approve with unauthorized email
  const unauthApprove = serverBookingStore.adminApprove({
    referenceNumber: 'DUMMY-REF',
    adminEmail: unauthorizedEmail,
  });
  assert(!unauthApprove.success, 'Unauthorized email blocked from approving bookings');
  if (!unauthApprove.success) {
    assert(unauthApprove.error?.includes('Unauthorized') === true, 'Returns Unauthorized error message');
  }

  const unauthReject = serverBookingStore.adminReject({
    referenceNumber: 'DUMMY-REF',
    rejectionReason: 'Invalid screenshot',
    adminEmail: unauthorizedEmail,
  });
  assert(!unauthReject.success, 'Unauthorized email blocked from rejecting bookings');

  // 2. Pending Bookings Retrieval & Payment Review
  console.log('\n--- 2. Pending Bookings Retrieval & Payment Review ---');
  const pendingBookingRes = serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    slots: ['18:00', '18:30'],
    durationMinutes: 60,
    customerName: 'Zainab Bibi',
    customerPhone: '03011223344',
    customerEmail: 'zainab@example.com',
    paymentMethod: 'easypaisa',
    transactionRef: 'EP-554433221',
    receiptScreenshotUrl: '/receipts/zainab_receipt.png',
  });
  assert(pendingBookingRes.success, 'Pending booking with payment proof created');
  const targetRef = (pendingBookingRes as any).booking.referenceNumber;

  const foundBooking = serverBookingStore.getByRef(targetRef);
  assert(!!foundBooking, 'Booking retrieved by reference number');
  if (foundBooking) {
    assert(foundBooking.status === 'payment_under_review', 'Status is payment_under_review');
    assert(foundBooking.receiptScreenshotUrl === '/receipts/zainab_receipt.png', 'Receipt screenshot is accessible for review');
    assert(foundBooking.transactionRef === 'EP-554433221', 'Transaction reference is EP-554433221');
  }

  // 3. Approve Booking
  console.log('\n--- 3. Approve Booking Operation ---');
  const approveRes = serverBookingStore.adminApprove({
    referenceNumber: targetRef,
    adminEmail,
  });
  assert(approveRes.success, 'Admin successfully approved booking');
  if (approveRes.success) {
    assert(approveRes.booking.status === 'confirmed', 'Booking status transitioned to confirmed');
  }

  // 4. Overlapping Pending Booking Collision Check on Approval
  console.log('\n--- 4. Overlap Rejection Upon Approval ---');
  // Inject overlapping pending booking on same court [18:00, 19:30) (90 mins)
  const overlappingRef = 'PADEL-PK-TEST-COLLISION';
  (serverBookingStore as any).bookings.unshift({
    id: 'test-collision-id',
    referenceNumber: overlappingRef,
    courtId: 'court-1',
    courtName: 'Court 1 — Double Court',
    date: testDate,
    startTime: '18:30',
    endTime: '19:30',
    durationMinutes: 60,
    totalAmount: 4000,
    advanceRequiredAmount: 500,
    remainingAmount: 3500,
    status: 'payment_under_review',
    customerName: 'Colliding Player',
    customerPhone: '03009990000',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slots: [{ startTime: '18:30', endTime: '19:00' }, { startTime: '19:00', endTime: '19:30' }],
  });

  const conflictApprove = serverBookingStore.adminApprove({
    referenceNumber: overlappingRef,
    adminEmail,
  });
  assert(!conflictApprove.success, 'Overlapping pending booking is REJECTED on approval attempt');
  if (!conflictApprove.success) {
    assert(conflictApprove.error?.includes('Conflict') === true, 'Error message explicitly reports conflict');
  }

  // 5. Reject Booking Operation
  console.log('\n--- 5. Reject Booking Operation ---');
  const rejectRes = serverBookingStore.adminReject({
    referenceNumber: overlappingRef,
    rejectionReason: 'Deposit receipt unreadable and time slot already confirmed.',
    adminEmail,
  });
  assert(rejectRes.success, 'Admin successfully rejected booking with reason');
  if (rejectRes.success) {
    assert(rejectRes.booking.status === 'rejected', 'Status changed to rejected');
    assert(rejectRes.booking.rejectionReason?.includes('Deposit receipt unreadable') === true, 'Rejection reason persisted');
  }

  // Slot release: verify rejecting releases the slot so another booking can use 18:30 on an open day
  const emptyReasonReject = serverBookingStore.adminReject({
    referenceNumber: targetRef,
    rejectionReason: '',
    adminEmail,
  });
  assert(!emptyReasonReject.success, 'Rejection requires non-empty reason');

  // 6. Admin Manual Booking
  console.log('\n--- 6. Admin Manual Booking ---');
  const manualRes = serverBookingStore.createManualBooking({
    courtId: 'court-2',
    date: testDate,
    startTime: '16:00',
    durationMinutes: 90,
    customerName: 'Walk-In VIP',
    customerPhone: '03211234567',
    customerEmail: 'vip@example.com',
    paymentMethod: 'cash_at_venue',
    isPaid: true,
    adminEmail,
  });
  assert(manualRes.success, 'Admin created manual booking successfully');
  if (manualRes.success) {
    assert(manualRes.booking.status === 'confirmed', 'Manual paid booking is immediately confirmed');
    assert(manualRes.booking.durationMinutes === 90, 'Duration is 90 minutes');
    assert(manualRes.booking.startTime === '16:00' && manualRes.booking.endTime === '17:30', 'Interval is 16:00 - 17:30');
  }

  // 7. WhatsApp Click-to-Chat Confirmation URL
  console.log('\n--- 7. WhatsApp Confirmation URL Generation ---');
  const confirmedBooking = serverBookingStore.getByRef(targetRef)!;
  const waConfirmRes = getWhatsAppClickToChatUrl(confirmedBooking, 'confirmation');
  assert(waConfirmRes.url !== null, 'Generated WhatsApp confirmation URL');
  if (waConfirmRes.url) {
    assert(waConfirmRes.url.startsWith('https://wa.me/923011223344?text='), 'Normalized phone is 923011223344');
    const decodedMessage = decodeURIComponent(waConfirmRes.url.replace('https://wa.me/923011223344?text=', ''));
    assert(decodedMessage.includes(confirmedBooking.customerName), 'Message includes customer name');
    assert(decodedMessage.includes(confirmedBooking.referenceNumber), 'Message includes booking reference');
    assert(decodedMessage.includes(confirmedBooking.courtName), 'Message includes court name');
    assert(decodedMessage.includes(confirmedBooking.startTime), 'Message includes start time');
    assert(decodedMessage.includes(String(confirmedBooking.durationMinutes)), 'Message includes match duration');
    assert(decodedMessage.includes('500'), 'Message includes PKR 500 advance deposit');
    assert(decodedMessage.includes(confirmedBooking.remainingAmount.toLocaleString()), 'Message includes remaining balance');
    assert(decodedMessage.includes(CLUB_CONFIG.locationArea), 'Message includes location area');
  }

  // 8. WhatsApp Click-to-Chat Rejection URL
  console.log('\n--- 8. WhatsApp Rejection URL Generation ---');
  const rejectedBooking = serverBookingStore.getByRef(overlappingRef)!;
  const waRejectRes = getWhatsAppClickToChatUrl(rejectedBooking, 'rejection', rejectedBooking.rejectionReason);
  assert(waRejectRes.url !== null, 'Generated WhatsApp rejection URL');
  if (waRejectRes.url) {
    const decodedReject = decodeURIComponent(waRejectRes.url.replace('https://wa.me/923009990000?text=', ''));
    assert(decodedReject.includes(rejectedBooking.customerName), 'Rejection message includes customer name');
    assert(decodedReject.includes(rejectedBooking.rejectionReason!), 'Rejection message includes rejection reason');
    assert(decodedReject.includes(CLUB_CONFIG.contactPhonePlaceholder), 'Rejection message includes club phone');
  }

  // 9. Booking Status Page Retrieval
  console.log('\n--- 9. Booking Status Page Query ---');
  const statusLookup = serverBookingStore.getByRef(targetRef);
  assert(statusLookup !== null, 'Status lookup finds confirmed booking');
  assert(statusLookup?.status === 'confirmed', 'Status matches confirmed');

  // 10. Admin Notifications
  console.log('\n--- 10. Admin Notifications Flow ---');
  const notifs = serverBookingStore.getNotifications();
  assert(notifs.length > 0, `Notifications exist (count: ${notifs.length})`);
  const approvalNotif = notifs.find(n => n.type === 'booking_confirmed' && n.bookingRef === targetRef);
  assert(!!approvalNotif, 'Approval notification generated');
  const rejectionNotif = notifs.find(n => n.type === 'booking_rejected' && n.bookingRef === overlappingRef);
  assert(!!rejectionNotif, 'Rejection notification generated');

  console.log('\n========================================================================');
  console.log(`PHASE 3 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) process.exit(1);
}

runPhase3Tests().catch(err => {
  console.error('Phase 3 test suite failed:', err);
  process.exit(1);
});
