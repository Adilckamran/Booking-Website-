/**
 * PHASE 2 — COMPLETE BOOKING TESTING SUITE
 * 
 * Verifies:
 * 1. 60-minute booking: 2 consecutive intervals.
 * 2. 90-minute booking: 3 consecutive intervals.
 * 3. 120-minute booking: 4 consecutive intervals.
 * 4. Midnight-crossing booking (e.g. 23:30 + 60m, 23:00 + 90m, 23:30 + 120m).
 * 5. Peak/off-peak pricing:
 *    - Off-peak Court 1: PKR 3,500/hr (1,750 per 30m)
 *    - Peak Court 1: PKR 4,000/hr (2,000 per 30m)
 *    - Split boundary (17:30 - 18:30): PKR 3,750 (1,750 + 2,000)
 * 6. Court 3 single-court pricing (fixed PKR 2,000/hr, 1,000 per 30m all day).
 * 7. Advance payment calculation (PKR 500 fixed, remaining = total - 500).
 * 8. Duplicate interval rejection (["19:00", "19:00"]).
 * 9. Overlap prevention:
 *    - Conflicting intervals rejected.
 * 10. Adjacent booking acceptance:
 *     - [18:00, 19:00) and [19:00, 20:00) touching at boundary allowed.
 * 11. Different courts booking simultaneously allowed.
 * 12. Receipt upload and payment_under_review status.
 * 13. Booking appearing in admin store/panel and admin notifications.
 */

import {
  serverBookingStore,
  validateConsecutiveIntervals,
  intervalsOverlap,
} from '../src/services/booking/bookingRepository';
import {
  calculateBookingPrice,
  calculateEndTime,
  getHalfHourRate,
} from '../src/services/pricing/pricingService';
import { CLUB_CONFIG } from '../src/config/clubConfig';

async function runPhase2Tests() {
  console.log('========================================================================');
  console.log('PHASE 2 — COMPLETE BOOKING TESTING SUITE');
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

  const testDate = '2026-12-10';

  // 1. 60-Minute Booking (2 consecutive 30-min intervals)
  console.log('--- 1. 60-Minute Booking: 2 consecutive intervals ---');
  const val60 = validateConsecutiveIntervals(['19:00', '19:30'], 60);
  assert(val60.valid, 'Validation accepts 2 consecutive intervals for 60m');
  const res60 = serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    slots: ['19:00', '19:30'],
    durationMinutes: 60,
    customerName: 'Player Sixty',
    customerPhone: '03001112233',
  });
  assert(res60.success, '60m booking created successfully');
  if (res60.success) {
    assert(res60.booking.durationMinutes === 60, 'Duration is 60m');
    assert(res60.booking.startTime === '19:00' && res60.booking.endTime === '20:00', 'Interval is 19:00 - 20:00');
    assert(res60.booking.totalAmount === 4000, 'Total amount is PKR 4,000 (Peak)');
    assert(res60.booking.advanceRequiredAmount === 500, 'Advance is PKR 500');
    assert(res60.booking.remainingAmount === 3500, 'Remaining is PKR 3,500');
  }

  // 2. 90-Minute Booking (3 consecutive intervals)
  console.log('\n--- 2. 90-Minute Booking: 3 consecutive intervals ---');
  const val90 = validateConsecutiveIntervals(['20:00', '20:30', '21:00'], 90);
  assert(val90.valid, 'Validation accepts 3 consecutive intervals for 90m');
  const res90 = serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    slots: ['20:00', '20:30', '21:00'],
    durationMinutes: 90,
    customerName: 'Player Ninety',
    customerPhone: '03002223344',
  });
  assert(res90.success, '90m booking created successfully');
  if (res90.success) {
    assert(res90.booking.durationMinutes === 90, 'Duration is 90m');
    assert(res90.booking.startTime === '20:00' && res90.booking.endTime === '21:30', 'Interval is 20:00 - 21:30');
    assert(res90.booking.totalAmount === 6000, 'Total amount is PKR 6,000 (Peak 90m)');
    assert(res90.booking.advanceRequiredAmount === 500, 'Advance is PKR 500');
    assert(res90.booking.remainingAmount === 5500, 'Remaining is PKR 5,500');
  }

  // 3. 120-Minute Booking (4 consecutive intervals)
  console.log('\n--- 3. 120-Minute Booking: 4 consecutive intervals ---');
  const val120 = validateConsecutiveIntervals(['14:00', '14:30', '15:00', '15:30'], 120);
  assert(val120.valid, 'Validation accepts 4 consecutive intervals for 120m');
  const res120 = serverBookingStore.createPendingBooking({
    courtId: 'court-2',
    date: testDate,
    slots: ['14:00', '14:30', '15:00', '15:30'],
    durationMinutes: 120,
    customerName: 'Player TwoHours',
    customerPhone: '03003334455',
  });
  assert(res120.success, '120m booking created successfully');
  if (res120.success) {
    assert(res120.booking.durationMinutes === 120, 'Duration is 120m');
    assert(res120.booking.startTime === '14:00' && res120.booking.endTime === '16:00', 'Interval is 14:00 - 16:00');
    assert(res120.booking.totalAmount === 7000, 'Total amount is PKR 7,000 (Off-peak: 1,750 x 4)');
    assert(res120.booking.remainingAmount === 6500, 'Remaining is PKR 6,500');
  }

  // 4. Midnight-Crossing Booking
  console.log('\n--- 4. Midnight-Crossing Bookings ---');
  const endWrap60 = calculateEndTime('23:30', 60);
  assert(endWrap60 === '00:30', `23:30 + 60m correctly wraps to 00:30 next day (got ${endWrap60})`);
  const endWrap90 = calculateEndTime('23:00', 90);
  assert(endWrap90 === '00:30', `23:00 + 90m correctly wraps to 00:30 next day (got ${endWrap90})`);
  const endWrap120 = calculateEndTime('23:30', 120);
  assert(endWrap120 === '01:30', `23:30 + 120m correctly wraps to 01:30 next day (got ${endWrap120})`);

  const resMidnight = serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    slots: ['23:30', '00:00'],
    durationMinutes: 60,
    customerName: 'Night Player',
    customerPhone: '03004445566',
  });
  assert(resMidnight.success, 'Midnight cross booking created successfully');
  if (resMidnight.success) {
    assert(resMidnight.booking.startTime === '23:30' && resMidnight.booking.endTime === '00:30', 'Timing is 23:30 - 00:30');
    assert(resMidnight.booking.totalAmount === 4000, 'Peak pricing PKR 4,000 across midnight');
  }

  // 5. Peak/Off-Peak Pricing
  console.log('\n--- 5. Peak & Off-Peak Pricing Rules ---');
  // Off-peak: Court 1 at 10:00 (PKR 3,500/hr)
  const pOff = calculateBookingPrice('court-1', '10:00', 60);
  assert(pOff.totalAmount === 3500, `Court 1 Off-peak 60m = PKR 3,500 (got ${pOff.totalAmount})`);
  // Peak: Court 1 at 18:00 (PKR 4,000/hr)
  const pPeak = calculateBookingPrice('court-1', '18:00', 60);
  assert(pPeak.totalAmount === 4000, `Court 1 Peak 60m = PKR 4,000 (got ${pPeak.totalAmount})`);
  // Split boundary: 17:30 - 18:30 (17:30 is off-peak 1,750; 18:00 is peak 2,000 -> Total = 3,750)
  const pSplit = calculateBookingPrice('court-1', '17:30', 60);
  assert(pSplit.totalAmount === 3750, `Boundary split 17:30 - 18:30 = PKR 3,750 (got ${pSplit.totalAmount})`);
  assert(pSplit.segments[0].rate === 1750 && !pSplit.segments[0].isPeak, 'Segment 1 (17:30-18:00) is Off-Peak PKR 1,750');
  assert(pSplit.segments[1].rate === 2000 && pSplit.segments[1].isPeak, 'Segment 2 (18:00-18:30) is Peak PKR 2,000');

  // 6. Court 3 Single Court Pricing (Fixed PKR 2,000/hr, 1,000/30m all day)
  console.log('\n--- 6. Court 3 (Single Court) Pricing Rules ---');
  const pC3_60 = calculateBookingPrice('court-3', '10:00', 60);
  assert(pC3_60.totalAmount === 2000, `Court 3 daytime 60m = PKR 2,000 (got ${pC3_60.totalAmount})`);
  const pC3_peak = calculateBookingPrice('court-3', '20:00', 60);
  assert(pC3_peak.totalAmount === 2000, `Court 3 evening 60m = PKR 2,000 (fixed, no peak markup) (got ${pC3_peak.totalAmount})`);
  const pC3_90 = calculateBookingPrice('court-3', '20:00', 90);
  assert(pC3_90.totalAmount === 3000, `Court 3 90m = PKR 3,000 (got ${pC3_90.totalAmount})`);
  const pC3_120 = calculateBookingPrice('court-3', '20:00', 120);
  assert(pC3_120.totalAmount === 4000, `Court 3 120m = PKR 4,000 (got ${pC3_120.totalAmount})`);

  // 7. Advance Payment Calculation
  console.log('\n--- 7. Advance Payment Calculation ---');
  assert(pC3_60.advanceRequiredAmount === 500, 'Fixed PKR 500 advance deposit required');
  assert(pC3_60.remainingAmount === 1500, 'Remaining is PKR 1,500 (2000 - 500)');
  assert(pOff.advanceRequiredAmount === 500, 'Fixed PKR 500 advance on Court 1');
  assert(pOff.remainingAmount === 3000, 'Remaining is PKR 3,000 (3500 - 500)');

  // 8. Duplicate Interval Rejection
  console.log('\n--- 8. Duplicate Interval Rejection ---');
  const valDup = validateConsecutiveIntervals(['19:00', '19:00'], 60);
  assert(!valDup.valid, 'Duplicate interval ["19:00", "19:00"] rejected');
  assert(valDup.error?.includes('Duplicate') === true, `Error specifies duplicate: "${valDup.error}"`);

  // 9. Overlap Prevention
  console.log('\n--- 9. Overlap Prevention ---');
  // We already have Court 1 booked at 19:00 - 20:00 (res60)
  const resOverlap = serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    slots: ['19:30', '20:00'],
    durationMinutes: 60,
    customerName: 'Conflicting Player',
    customerPhone: '03009999999',
  });
  assert(!resOverlap.success, 'Overlapping booking [19:30, 20:30) on Court 1 is REJECTED');
  if (!resOverlap.success) {
    assert(resOverlap.isConflict === true, 'Flagged as conflict');
  }

  // 10. Adjacent Booking Acceptance
  console.log('\n--- 10. Adjacent Booking Acceptance (Half-Open Interval) ---');
  // Touching [19:00, 20:00) at 18:00 - 19:00
  const resAdjBefore = serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    slots: ['18:00', '18:30'],
    durationMinutes: 60,
    customerName: 'Adjacent Before Player',
    customerPhone: '03005556677',
  });
  assert(resAdjBefore.success, 'Adjacent booking [18:00, 19:00) touching 19:00 boundary is ALLOWED');

  // 11. Different Courts Booking Simultaneously
  console.log('\n--- 11. Simultaneous Booking on Different Courts ---');
  const resCourt3 = serverBookingStore.createPendingBooking({
    courtId: 'court-3',
    date: testDate,
    slots: ['19:00', '19:30'],
    durationMinutes: 60,
    customerName: 'Court 3 Player',
    customerPhone: '03006667788',
  });
  assert(resCourt3.success, 'Simultaneous booking [19:00, 20:00) on Court 3 is ALLOWED');

  // 12. Receipt Upload & Payment Under Review
  console.log('\n--- 12. Receipt Upload & Payment Under Review Status ---');
  const resReceipt = serverBookingStore.createPendingBooking({
    courtId: 'court-2',
    date: testDate,
    slots: ['21:00', '21:30'],
    durationMinutes: 60,
    customerName: 'Receipt Uploader',
    customerPhone: '03007778899',
    paymentMethod: 'easypaisa',
    transactionRef: 'TRX-EP-89210',
    receiptScreenshotUrl: '/receipts/test_receipt.jpg',
  });
  assert(resReceipt.success, 'Booking with receipt created successfully');
  if (resReceipt.success) {
    assert(resReceipt.booking.status === 'payment_under_review', 'Status set to payment_under_review');
    assert(resReceipt.booking.receiptScreenshotUrl === '/receipts/test_receipt.jpg', 'Receipt URL saved');
    assert(resReceipt.booking.transactionRef === 'TRX-EP-89210', 'TRX reference saved');
  }

  // 13. Booking Appearing in Admin Store & Notifications
  console.log('\n--- 13. Admin Store & Notification Synchronization ---');
  const allBookings = serverBookingStore.getAllBookings();
  const found60 = allBookings.find(b => b.referenceNumber === (res60 as any).booking.referenceNumber);
  assert(!!found60, '60m booking appears in admin booking store');

  const foundReceipt = allBookings.find(b => b.referenceNumber === (resReceipt as any).booking.referenceNumber);
  assert(!!foundReceipt, 'Receipt booking appears in admin booking store');

  const notifs = serverBookingStore.getNotifications();
  const receiptNotif = notifs.find(n => n.bookingRef === (resReceipt as any).booking.referenceNumber);
  assert(!!receiptNotif, 'Admin notification generated for uploaded receipt');
  if (receiptNotif) {
    assert(receiptNotif.type === 'receipt_submitted', 'Notification type is receipt_submitted');
    assert(receiptNotif.advanceAmount === 500, 'Notification records PKR 500 advance');
  }

  console.log('\n========================================================================');
  console.log(`PHASE 2 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) process.exit(1);
}

runPhase2Tests().catch(err => {
  console.error('Phase 2 test suite failed:', err);
  process.exit(1);
});
