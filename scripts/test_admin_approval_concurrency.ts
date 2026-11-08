import assert from 'node:assert';
import { serverBookingStore } from '../src/services/booking/bookingRepository';
import { CLUB_CONFIG } from '../src/config/clubConfig';

async function runApprovalConcurrencyTests() {
  console.log('================================================================');
  console.log('POWER PADEL ARENA - ADMIN APPROVAL CONCURRENCY & OVERLAP TESTS');
  console.log('================================================================\n');

  const testDate = '2026-12-01';
  const adminEmail = CLUB_CONFIG.businessEmail; // thepowerpadel@gmail.com
  const unauthorizedEmail = 'hacker@example.com';

  // --- Scenario 1: Overlapping Pending Bookings on the Same Court ---
  console.log('--- Test 1: Overlapping Pending Bookings on the Same Court ---');
  // Booking A: Court 1, 19:00 for 90 mins (19:00 - 20:30)
  const bookingA = await serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    startTime: '19:00',
    durationMinutes: 90,
    customerName: 'Player Alpha',
    customerPhone: '+923001111111',
    customerEmail: 'alpha@example.com',
  });
  assert(bookingA.success, 'Created Booking Alpha');
  // Set status to payment_under_review
  const storeA = serverBookingStore.getAllBookings().find(b => b.referenceNumber === bookingA.booking.referenceNumber)!;
  storeA.status = 'payment_under_review';

  // Booking B: Court 1, 20:00 for 60 mins (20:00 - 21:00) -> Overlaps with 20:00-20:30 of Alpha!
  const dummyRefB = 'PP-TEST-BETA';
  (serverBookingStore as any).bookings.push({
    id: 'test-beta-id',
    referenceNumber: dummyRefB,
    courtId: 'court-1',
    courtName: 'Court 1',
    date: testDate,
    startTime: '20:00',
    endTime: '21:00',
    durationMinutes: 60,
    customerName: 'Player Beta',
    customerPhone: '+923002222222',
    customerEmail: 'beta@example.com',
    totalAmount: 4000,
    advanceRequiredAmount: 500,
    remainingAmount: 3500,
    status: 'payment_under_review',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slots: [{ startTime: '20:00', endTime: '20:30' }, { startTime: '20:30', endTime: '21:00' }],
  });

  // 1. Admin approves Alpha first
  const approveAlpha = serverBookingStore.adminApprove({
    referenceNumber: bookingA.booking.referenceNumber,
    adminEmail,
  });
  assert(approveAlpha.success, 'Alpha approved successfully');
  console.log('[PASS] Booking Alpha (19:00 - 20:30) approved and status = confirmed');

  // 2. Admin attempts to approve Beta next (which overlaps Alpha 20:00 - 20:30)
  const approveBeta = serverBookingStore.adminApprove({
    referenceNumber: dummyRefB,
    adminEmail,
  });
  assert(!approveBeta.success, 'Beta approval was rejected due to overlap');
  console.log(`[PASS] Overlapping Booking Beta rejected on approval: "${approveBeta.error}"`);

  // --- Scenario 2: Adjacent Non-Overlapping Bookings on the Same Court ---
  console.log('\n--- Test 2: Adjacent Non-Overlapping Bookings on the Same Court ---');
  // Booking C: Court 1, 20:30 for 60 mins (20:30 - 21:30) -> Back-to-back with Alpha (19:00 - 20:30)
  const dummyRefC = 'PP-TEST-GAMMA';
  (serverBookingStore as any).bookings.push({
    id: 'test-gamma-id',
    referenceNumber: dummyRefC,
    courtId: 'court-1',
    courtName: 'Court 1',
    date: testDate,
    startTime: '20:30',
    endTime: '21:30',
    durationMinutes: 60,
    customerName: 'Player Gamma',
    customerPhone: '+923003333333',
    customerEmail: 'gamma@example.com',
    totalAmount: 4000,
    advanceRequiredAmount: 500,
    remainingAmount: 3500,
    status: 'payment_under_review',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slots: [{ startTime: '20:30', endTime: '21:00' }, { startTime: '21:00', endTime: '21:30' }],
  });

  const approveGamma = serverBookingStore.adminApprove({
    referenceNumber: dummyRefC,
    adminEmail,
  });
  assert(approveGamma.success, 'Gamma approved successfully without conflict');
  console.log('[PASS] Adjacent Booking Gamma (20:30 - 21:30) approved successfully alongside Alpha (19:00 - 20:30)');

  // --- Scenario 3: Simultaneous Bookings on Different Courts ---
  console.log('\n--- Test 3: Simultaneous Bookings on Different Courts ---');
  const dummyRefDelta = 'PP-TEST-DELTA';
  // Booking Delta: Court 2, 19:00 - 20:30 (same time as Alpha, but different court)
  (serverBookingStore as any).bookings.push({
    id: 'test-delta-id',
    referenceNumber: dummyRefDelta,
    courtId: 'court-2',
    courtName: 'Court 2',
    date: testDate,
    startTime: '19:00',
    endTime: '20:30',
    durationMinutes: 90,
    customerName: 'Player Delta',
    customerPhone: '+923004444444',
    customerEmail: 'delta@example.com',
    totalAmount: 6000,
    advanceRequiredAmount: 500,
    remainingAmount: 5500,
    status: 'payment_under_review',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slots: [{ startTime: '19:00', endTime: '19:30' }, { startTime: '19:30', endTime: '20:00' }, { startTime: '20:00', endTime: '20:30' }],
  });

  const approveDelta = serverBookingStore.adminApprove({
    referenceNumber: dummyRefDelta,
    adminEmail,
  });
  assert(approveDelta.success, 'Delta on Court 2 approved successfully');
  console.log('[PASS] Simultaneous booking Delta on Court 2 approved without contention');

  // --- Scenario 4: Authorization Protection ---
  console.log('\n--- Test 4: Authorization Protection ---');
  const unauthorizedRes = serverBookingStore.adminApprove({
    referenceNumber: dummyRefC,
    adminEmail: unauthorizedEmail,
  });
  assert(!unauthorizedRes.success, 'Unauthorized email was blocked');
  console.log(`[PASS] Unauthorized admin blocked: "${unauthorizedRes.error}"`);

  // --- Scenario 5: Idempotency & Ineligible Status Protections ---
  console.log('\n--- Test 5: Idempotency & Ineligible Status Protections ---');
  // Idempotency: Re-approving Alpha
  const reapproveAlpha = serverBookingStore.adminApprove({
    referenceNumber: bookingA.booking.referenceNumber,
    adminEmail,
  });
  assert(reapproveAlpha.success, 'Re-approving already confirmed booking is handled cleanly');
  console.log('[PASS] Re-approving already confirmed booking Alpha returns success');

  // Non-existent booking
  const nonExistentRes = serverBookingStore.adminApprove({
    referenceNumber: 'PP-NON-EXISTENT-999',
    adminEmail,
  });
  assert(!nonExistentRes.success, 'Non-existent booking rejected');
  console.log(`[PASS] Non-existent booking rejected: "${nonExistentRes.error}"`);

  console.log('\n================================================================');
  console.log('ALL APPROVAL CONCURRENCY & OVERLAP UNIT TESTS PASSED');
  console.log('================================================================');
}

runApprovalConcurrencyTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
