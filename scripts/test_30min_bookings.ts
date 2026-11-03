/**
 * Power Padel Arena - 30-Minute Interval & Flexible Duration Automated Test Suite
 *
 * Verifies:
 * 1. 48 30-minute intervals covering genuine 24-hour operation (00:00 - 23:30).
 * 2. End-time calculations for 60, 90, and 120-minute durations, including midnight crossings.
 * 3. Exact pricing calculation for 30-minute segments across Courts 1, 2, and 3:
 *    - Off-Peak (06:00 to 18:00): PKR 1,750 / 30m (PKR 3,500/hr)
 *    - Peak (18:00 to 06:00): PKR 2,000 / 30m (PKR 4,000/hr)
 *    - Court 3: Fixed PKR 1,000 / 30m (PKR 2,000/hr all day)
 *    - Boundary crossings (e.g. 17:00 + 90m, 17:30 + 60m, 05:00 + 90m)
 * 4. Fixed PKR 500 advance deposit and remaining balance calculation.
 * 5. Half-open interval overlap math: [s1, e1) and [s2, e2) overlap iff s1 < e2 && e1 > s2.
 * 6. Atomic double-booking prevention in server store for 60/90/120 minute sessions.
 * 7. Admin manual reservation with 30-min intervals and 60/90/120m durations.
 */

import { OPERATING_SLOTS_DEF } from '../src/data/demoData';
import {
  calculateBookingPrice,
  getHalfHourRate,
} from '../src/services/pricing/pricingService';
import { calculateEndTime, formatTime12, getKarachiTimestamp } from '../src/utils/timezone';
import {
  serverBookingStore,
  intervalsOverlap,
} from '../src/services/booking/bookingRepository';

async function runTestSuite() {
  console.log('================================================================');
  console.log('POWER PADEL ARENA - 30-MIN INTERVALS & DURATIONS TEST SUITE');
  console.log('================================================================\n');

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

  // --------------------------------------------------------------------------
  // TEST 1: 48 30-MINUTE INTERVALS GENERATION
  // --------------------------------------------------------------------------
  console.log('--- Test 1: 48 30-Minute Operating Intervals ---');
  assert(OPERATING_SLOTS_DEF.length === 48, `Exactly 48 intervals defined (got ${OPERATING_SLOTS_DEF.length})`);
  assert(OPERATING_SLOTS_DEF[0].startTime === '00:00' && OPERATING_SLOTS_DEF[0].endTime === '00:30', 'First interval: 00:00 to 00:30');
  assert(OPERATING_SLOTS_DEF[47].startTime === '23:30' && OPERATING_SLOTS_DEF[47].endTime === '00:00', 'Last interval: 23:30 to 00:00');

  // Verify all 30-min steps exist
  const expectedSamples = ['00:00', '00:30', '06:00', '06:30', '17:30', '18:00', '18:30', '23:00', '23:30'];
  for (const s of expectedSamples) {
    const found = OPERATING_SLOTS_DEF.find((def) => def.startTime === s);
    assert(!!found, `Operating interval ${s} is present`);
  }

  // --------------------------------------------------------------------------
  // TEST 2: END-TIME CALCULATIONS (60, 90, 120 MINUTES & MIDNIGHT CROSSINGS)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: End-Time Calculation with Durations & Midnight Crossings ---');
  assert(calculateEndTime('19:00', 60) === '20:00', '19:00 + 60m = 20:00');
  assert(calculateEndTime('19:00', 90) === '20:30', '19:00 + 90m = 20:30');
  assert(calculateEndTime('19:30', 90) === '21:00', '19:30 + 90m = 21:00');
  assert(calculateEndTime('20:00', 120) === '22:00', '20:00 + 120m = 22:00');
  assert(calculateEndTime('23:00', 60) === '00:00', '23:00 + 60m = 00:00 (Midnight wrap)');
  assert(calculateEndTime('23:00', 90) === '00:30', '23:00 + 90m = 00:30 (Cross-midnight wrap)');
  assert(calculateEndTime('23:30', 60) === '00:30', '23:30 + 60m = 00:30 (Cross-midnight wrap)');
  assert(calculateEndTime('23:30', 90) === '01:00', '23:30 + 90m = 01:00 (Cross-midnight wrap)');
  assert(calculateEndTime('23:30', 120) === '01:30', '23:30 + 120m = 01:30 (Cross-midnight wrap)');

  // --------------------------------------------------------------------------
  // TEST 3: HALF-HOUR RATES & PRICING CALCULATION
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Half-Hour Rates & Segment-by-Segment Pricing ---');

  // Rate rules
  assert(getHalfHourRate('court-3', '10:00').rate === 1000, 'Court 3 daytime: PKR 1,000 / 30m');
  assert(getHalfHourRate('court-3', '20:00').rate === 1000, 'Court 3 nighttime: PKR 1,000 / 30m');
  assert(getHalfHourRate('court-1', '10:00').rate === 1750, 'Court 1 off-peak (10:00): PKR 1,750 / 30m');
  assert(getHalfHourRate('court-1', '17:30').rate === 1750, 'Court 1 off-peak (17:30): PKR 1,750 / 30m');
  assert(getHalfHourRate('court-1', '18:00').rate === 2000, 'Court 1 peak (18:00): PKR 2,000 / 30m');
  assert(getHalfHourRate('court-1', '23:30').rate === 2000, 'Court 1 peak (23:30): PKR 2,000 / 30m');
  assert(getHalfHourRate('court-1', '05:30').rate === 2000, 'Court 1 peak (05:30): PKR 2,000 / 30m');
  assert(getHalfHourRate('court-1', '06:00').rate === 1750, 'Court 1 off-peak (06:00): PKR 1,750 / 30m');

  // Full session calculations
  // Court 3: Fixed PKR 2,000/hr
  const c3_60 = calculateBookingPrice('court-3', '18:00', 60);
  assert(c3_60.totalAmount === 2000 && c3_60.advanceRequiredAmount === 500 && c3_60.remainingAmount === 1500, 'Court 3 (60m): PKR 2,000 total, PKR 500 advance, PKR 1,500 remaining');

  const c3_90 = calculateBookingPrice('court-3', '18:00', 90);
  assert(c3_90.totalAmount === 3000 && c3_90.advanceRequiredAmount === 500 && c3_90.remainingAmount === 2500, 'Court 3 (90m): PKR 3,000 total, PKR 500 advance, PKR 2,500 remaining');

  const c3_120 = calculateBookingPrice('court-3', '18:00', 120);
  assert(c3_120.totalAmount === 4000 && c3_120.advanceRequiredAmount === 500 && c3_120.remainingAmount === 3500, 'Court 3 (120m): PKR 4,000 total, PKR 500 advance, PKR 3,500 remaining');

  // Court 1 Off-Peak pure: PKR 3,500/hr (PKR 1,750 / 30m)
  const c1_off_60 = calculateBookingPrice('court-1', '10:00', 60);
  assert(c1_off_60.totalAmount === 3500 && c1_off_60.advanceRequiredAmount === 500 && c1_off_60.remainingAmount === 3000, 'Court 1 Off-Peak (60m): PKR 3,500 total, PKR 500 advance');

  const c1_off_90 = calculateBookingPrice('court-1', '10:00', 90);
  assert(c1_off_90.totalAmount === 5250 && c1_off_90.advanceRequiredAmount === 500 && c1_off_90.remainingAmount === 4750, 'Court 1 Off-Peak (90m): PKR 5,250 total, PKR 500 advance');

  const c1_off_120 = calculateBookingPrice('court-1', '10:00', 120);
  assert(c1_off_120.totalAmount === 7000 && c1_off_120.advanceRequiredAmount === 500 && c1_off_120.remainingAmount === 6500, 'Court 1 Off-Peak (120m): PKR 7,000 total, PKR 500 advance');

  // Court 1 Peak pure: PKR 4,000/hr (PKR 2,000 / 30m)
  const c1_peak_60 = calculateBookingPrice('court-1', '19:00', 60);
  assert(c1_peak_60.totalAmount === 4000 && c1_peak_60.advanceRequiredAmount === 500 && c1_peak_60.remainingAmount === 3500, 'Court 1 Peak (60m): PKR 4,000 total, PKR 500 advance');

  const c1_peak_90 = calculateBookingPrice('court-1', '19:00', 90);
  assert(c1_peak_90.totalAmount === 6000 && c1_peak_90.advanceRequiredAmount === 500 && c1_peak_90.remainingAmount === 5500, 'Court 1 Peak (90m): PKR 6,000 total, PKR 500 advance');

  const c1_peak_120 = calculateBookingPrice('court-1', '19:00', 120);
  assert(c1_peak_120.totalAmount === 8000 && c1_peak_120.advanceRequiredAmount === 500 && c1_peak_120.remainingAmount === 7500, 'Court 1 Peak (120m): PKR 8,000 total, PKR 500 advance');

  // Boundary Crossings:
  // 17:00 for 90m: 17:00-17:30 (1750) + 17:30-18:00 (1750) + 18:00-18:30 (2000) = 5500
  const c1_cross_1700_90 = calculateBookingPrice('court-1', '17:00', 90);
  assert(c1_cross_1700_90.totalAmount === 5500, `17:00 (90m) cross-peak pricing = PKR 5,500 (got ${c1_cross_1700_90.totalAmount})`);

  // 17:30 for 60m: 17:30-18:00 (1750) + 18:00-18:30 (2000) = 3750
  const c1_cross_1730_60 = calculateBookingPrice('court-1', '17:30', 60);
  assert(c1_cross_1730_60.totalAmount === 3750, `17:30 (60m) cross-peak pricing = PKR 3,750 (got ${c1_cross_1730_60.totalAmount})`);

  // 05:00 for 90m: 05:00-05:30 (2000) + 05:30-06:00 (2000) + 06:00-06:30 (1750) = 5750
  const c1_cross_0500_90 = calculateBookingPrice('court-1', '05:00', 90);
  assert(c1_cross_0500_90.totalAmount === 5750, `05:00 (90m) cross-peak pricing = PKR 5,750 (got ${c1_cross_0500_90.totalAmount})`);

  // --------------------------------------------------------------------------
  // TEST 4: INTERVAL OVERLAP LOGIC (HALF-OPEN INTERVALS)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Interval Overlap Math ---');
  const d1_start = 1000;
  const d1_end = 2000;

  // Exact match
  assert(intervalsOverlap(d1_start, d1_end, 1000, 2000) === true, 'Exact match overlaps');

  // Partial overlap inside
  assert(intervalsOverlap(d1_start, d1_end, 1200, 1800) === true, 'Contained interval overlaps');

  // Overlap left
  assert(intervalsOverlap(d1_start, d1_end, 800, 1500) === true, 'Overlapping left boundary overlaps');

  // Overlap right
  assert(intervalsOverlap(d1_start, d1_end, 1500, 2500) === true, 'Overlapping right boundary overlaps');

  // Adjacent left: [500, 1000) and [1000, 2000) -> NO OVERLAP
  assert(intervalsOverlap(d1_start, d1_end, 500, 1000) === false, 'Adjacent left interval [500, 1000) does NOT overlap [1000, 2000)');

  // Adjacent right: [1000, 2000) and [2000, 2500) -> NO OVERLAP
  assert(intervalsOverlap(d1_start, d1_end, 2000, 2500) === false, 'Adjacent right interval [2000, 2500) does NOT overlap [1000, 2000)');

  // Completely disjoint
  assert(intervalsOverlap(d1_start, d1_end, 2500, 3000) === false, 'Completely disjoint interval does NOT overlap');

  // --------------------------------------------------------------------------
  // TEST 5: ATOMIC DOUBLE-BOOKING PREVENTION IN SERVER STORE
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Double-Booking Prevention in Booking Store ---');
  const testDate = '2026-11-20';

  // Booking 1: Court 1 at 19:00 for 90 minutes (covers 19:00 - 20:30)
  const bookRes1 = await serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    startTime: '19:00',
    durationMinutes: 90,
    customerName: 'Asad Iqbal',
    customerPhone: '03001234567',
  });
  assert(bookRes1.success === true, 'Booked Court 1: 19:00 for 90m (covers 19:00 - 20:30)');

  // Attempt Booking 2: Court 1 at 19:30 for 60m (19:30 - 20:30) -> MUST CONFLICT
  const bookRes2 = await serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    startTime: '19:30',
    durationMinutes: 60,
    customerName: 'Conflict Player 1',
    customerPhone: '03009999991',
  });
  assert(bookRes2.success === false && bookRes2.isConflict === true, 'Conflicting booking at 19:30 (60m) rejected');

  // Attempt Booking 3: Court 1 at 18:30 for 60m (18:30 - 19:30) -> MUST CONFLICT
  const bookRes3 = await serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    startTime: '18:30',
    durationMinutes: 60,
    customerName: 'Conflict Player 2',
    customerPhone: '03009999992',
  });
  assert(bookRes3.success === false && bookRes3.isConflict === true, 'Conflicting booking at 18:30 (60m) rejected');

  // Attempt Booking 4: Court 1 at 20:30 for 60m (20:30 - 21:30) -> MUST SUCCEED (Adjacent)
  const bookRes4 = await serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    startTime: '20:30',
    durationMinutes: 60,
    customerName: 'Adjacent Player',
    customerPhone: '03009999993',
  });
  assert(bookRes4.success === true, 'Adjacent booking at 20:30 (60m) successfully reserved');

  // Attempt Booking 5: Court 2 at 19:00 for 90m -> MUST SUCCEED (Different court)
  const bookRes5 = await serverBookingStore.createPendingBooking({
    courtId: 'court-2',
    date: testDate,
    startTime: '19:00',
    durationMinutes: 90,
    customerName: 'Court 2 Player',
    customerPhone: '03009999994',
  });
  assert(bookRes5.success === true, 'Different court (Court 2) at 19:00 (90m) successfully reserved');

  // --------------------------------------------------------------------------
  // TEST 6: ADMIN MANUAL BOOKING WITH 30-MIN RESOLUTION & DURATIONS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Admin Manual Booking ---');
  const manualRes = await serverBookingStore.createManualBooking({
    courtId: 'court-2',
    date: testDate,
    startTime: '21:00',
    durationMinutes: 120,
    customerName: 'VIP Club Member',
    customerPhone: '03008888888',
    isPaid: true,
    adminEmail: 'thepowerpadel@gmail.com',
  });
  assert(manualRes.success === true, 'Admin manual booking for 120m created successfully');
  if (manualRes.success) {
    assert(manualRes.booking.startTime === '21:00' && manualRes.booking.endTime === '23:00', 'Manual booking timing: 21:00 to 23:00');
    assert(manualRes.booking.status === 'confirmed', 'Manual paid booking has confirmed status');
    assert(manualRes.booking.totalAmount === 8000, 'Manual booking 120m peak on Court 2 = PKR 8,000');
  }

  // Attempt conflicting manual booking at 22:00 (90m) on Court 2 -> MUST CONFLICT
  const manualConflictRes = await serverBookingStore.createManualBooking({
    courtId: 'court-2',
    date: testDate,
    startTime: '22:00',
    durationMinutes: 90,
    customerName: 'Conflict Desk Player',
    customerPhone: '03007777777',
    adminEmail: 'thepowerpadel@gmail.com',
  });
  assert(manualConflictRes.success === false, 'Conflicting manual booking at 22:00 rejected by store');

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
