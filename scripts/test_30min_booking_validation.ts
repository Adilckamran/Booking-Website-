/**
 * Power Padel Arena - Comprehensive 30-Minute Interval Booking Validation Test Suite
 *
 * Test Scenarios:
 * 1. 60-Minute Booking (2 consecutive 30-minute intervals).
 * 2. 90-Minute Booking (3 consecutive 30-minute intervals).
 * 3. 120-Minute Booking (4 consecutive 30-minute intervals).
 * 4. Non-consecutive intervals rejection (e.g. 19:00 and 20:00 for 60m).
 * 5. Interval count mismatch rejection (e.g. 1 slot or 3 slots for 60m).
 * 6. Duplicate intervals rejection (e.g. ["19:00", "19:00"]).
 * 7. Price calculation validation across 30-minute segments (Peak, Off-Peak, Boundary Split, Court 3 Single Court).
 * 8. Overlap detection & rejection ([19:00, 20:30) vs [20:00, 21:00) rejected; [20:30, 21:30) allowed; different court allowed).
 * 9. Legacy error string regression check: confirm "one-hour slot(s)" is NEVER returned.
 * 10. End-to-end integration with Supabase Staging if configured.
 */

import {
  serverBookingStore,
  createPendingBooking,
  validateConsecutiveIntervals,
} from '../src/services/booking/bookingRepository';
import {
  calculateBookingPrice,
  calculateMultipleSlotsPrice,
  getHalfHourRate,
} from '../src/services/pricing/pricingService';
import {
  getSupabaseAdminClient,
  isSupabaseConfigured,
  isSupabaseAdminConfigured,
} from '../src/services/database/supabaseClient';

async function runValidationTests() {
  console.log('========================================================================');
  console.log('POWER PADEL ARENA - 30-MINUTE INTERVAL BOOKING VALIDATION TEST SUITE');
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

  const testDate = '2026-11-25';

  // --------------------------------------------------------------------------
  // TEST 1: 60-MINUTE BOOKING (2 CONSECUTIVE 30-MIN INTERVALS)
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Testing 60-Minute Booking (2 consecutive 30-min intervals) ---');
  const intervals60 = ['19:00', '19:30'];
  const val60 = validateConsecutiveIntervals(intervals60, 60);
  assert(val60.valid === true, 'validateConsecutiveIntervals accepts ["19:00", "19:30"] for 60m');
  assert(val60.startTime === '19:00', 'Derived primary start time is 19:00');
  assert(val60.intervals?.length === 2, 'Interval count is 2');

  const res60 = await createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    slots: intervals60,
    durationMinutes: 60,
    customerName: 'Ahmad Khan',
    customerPhone: '03001234567',
    customerEmail: 'ahmad@example.com',
  });
  assert(res60.success === true, '60-minute booking creation succeeded');
  if (res60.success) {
    assert(res60.booking.durationMinutes === 60, 'Booking duration is 60 minutes');
    assert(res60.booking.startTime === '19:00', 'Start time is 19:00');
    assert(res60.booking.endTime === '20:00', 'End time is 20:00');
    assert(res60.booking.totalAmount === 4000, `Court 1 peak price is PKR 4,000 (got ${res60.booking.totalAmount})`);
    assert(res60.booking.advanceRequiredAmount === 500, 'Advance required is fixed PKR 500');
    assert(res60.booking.remainingAmount === 3500, 'Remaining balance is PKR 3,500');
    assert(res60.booking.slots?.length === 2, 'Stored 2 child slot segments');
  }

  // --------------------------------------------------------------------------
  // TEST 2: 90-MINUTE BOOKING (3 CONSECUTIVE 30-MIN INTERVALS)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Testing 90-Minute Booking (3 consecutive 30-min intervals) ---');
  const intervals90 = ['20:00', '20:30', '21:00'];
  const val90 = validateConsecutiveIntervals(intervals90, 90);
  assert(val90.valid === true, 'validateConsecutiveIntervals accepts 3 consecutive slots for 90m');
  assert(val90.startTime === '20:00', 'Derived primary start time is 20:00');

  const res90 = await createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    slots: intervals90,
    durationMinutes: 90,
    customerName: 'Bilal Tariq',
    customerPhone: '03009876543',
    customerEmail: 'bilal@example.com',
  });
  assert(res90.success === true, '90-minute booking creation succeeded');
  if (res90.success) {
    assert(res90.booking.durationMinutes === 90, 'Booking duration is 90 minutes');
    assert(res90.booking.startTime === '20:00', 'Start time is 20:00');
    assert(res90.booking.endTime === '21:30', 'End time is 21:30');
    assert(res90.booking.totalAmount === 6000, `Court 1 peak 90m price is PKR 6,000 (got ${res90.booking.totalAmount})`);
    assert(res90.booking.advanceRequiredAmount === 500, 'Advance required is fixed PKR 500');
    assert(res90.booking.remainingAmount === 5500, 'Remaining balance is PKR 5,500');
    assert(res90.booking.slots?.length === 3, 'Stored 3 child slot segments');
  }

  // --------------------------------------------------------------------------
  // TEST 3: 120-MINUTE BOOKING (4 CONSECUTIVE 30-MIN INTERVALS)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing 120-Minute Booking (4 consecutive 30-min intervals) ---');
  const intervals120 = ['21:30', '22:00', '22:30', '23:00'];
  const val120 = validateConsecutiveIntervals(intervals120, 120);
  assert(val120.valid === true, 'validateConsecutiveIntervals accepts 4 consecutive slots for 120m');

  const res120 = await createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    slots: intervals120,
    durationMinutes: 120,
    customerName: 'Usman Ali',
    customerPhone: '03121234567',
    customerEmail: 'usman@example.com',
  });
  assert(res120.success === true, '120-minute booking creation succeeded');
  if (res120.success) {
    assert(res120.booking.durationMinutes === 120, 'Booking duration is 120 minutes');
    assert(res120.booking.startTime === '21:30', 'Start time is 21:30');
    assert(res120.booking.endTime === '23:30', 'End time is 23:30');
    assert(res120.booking.totalAmount === 8000, `Court 1 peak 120m price is PKR 8,000 (got ${res120.booking.totalAmount})`);
    assert(res120.booking.advanceRequiredAmount === 500, 'Advance required is fixed PKR 500');
    assert(res120.booking.remainingAmount === 7500, 'Remaining balance is PKR 7,500');
    assert(res120.booking.slots?.length === 4, 'Stored 4 child slot segments');
  }

  // --------------------------------------------------------------------------
  // TEST 4: REJECTION OF NON-CONSECUTIVE INTERVALS
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Testing Non-Consecutive Intervals Rejection ---');
  const nonConsecutive = ['19:00', '20:00']; // missing 19:30
  const valNonConsecutive = validateConsecutiveIntervals(nonConsecutive, 60);
  assert(valNonConsecutive.valid === false, 'validateConsecutiveIntervals rejects ["19:00", "20:00"]');
  assert(
    valNonConsecutive.error?.includes('consecutive') === true,
    `Error clearly states intervals must be consecutive: "${valNonConsecutive.error}"`
  );

  const resNonConsecutive = await createPendingBooking({
    courtId: 'court-2',
    date: testDate,
    slots: nonConsecutive,
    durationMinutes: 60,
    customerName: 'Test Player',
    customerPhone: '03001112233',
  });
  assert(resNonConsecutive.success === false, 'createPendingBooking rejects non-consecutive intervals');

  // --------------------------------------------------------------------------
  // TEST 5: REJECTION OF SLOT COUNT MISMATCH
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Testing Interval Count Mismatch Rejection ---');
  // 1 slot for 60 min
  const valCount1 = validateConsecutiveIntervals(['19:00'], 60);
  assert(valCount1.valid === false, 'Rejects 1 interval for 60m');
  assert(
    valCount1.error?.includes('exactly 2 consecutive 30-minute interval(s) must be selected') === true,
    `Error explains requirement: "${valCount1.error}"`
  );

  // 3 slots for 60 min
  const valCount3 = validateConsecutiveIntervals(['19:00', '19:30', '20:00'], 60);
  assert(valCount3.valid === false, 'Rejects 3 intervals for 60m');

  // 2 slots for 90 min
  const valCount90 = validateConsecutiveIntervals(['19:00', '19:30'], 90);
  assert(valCount90.valid === false, 'Rejects 2 intervals for 90m (expected 3)');

  // --------------------------------------------------------------------------
  // TEST 6: REJECTION OF DUPLICATE INTERVALS
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Testing Duplicate Intervals Rejection ---');
  const duplicates = ['19:00', '19:00'];
  const valDuplicates = validateConsecutiveIntervals(duplicates, 60);
  assert(valDuplicates.valid === false, 'Rejects duplicate interval ["19:00", "19:00"]');
  assert(valDuplicates.error?.includes('Duplicate') === true, `Duplicate error caught: "${valDuplicates.error}"`);

  // --------------------------------------------------------------------------
  // TEST 7: OVERLAP DETECTION AND REJECTION
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Testing Overlap Protection & Boundary Rules ---');
  // At this point Court 1 has:
  // 19:00 - 20:00 (Ahmad Khan)
  // 20:00 - 21:30 (Bilal Tariq)
  // 21:30 - 23:30 (Usman Ali)

  // 7a. Overlapping booking on Court 1 (e.g. 19:30 - 20:30) must be rejected
  const conflictRes = await createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    slots: ['19:30', '20:00'],
    durationMinutes: 60,
    customerName: 'Conflicting Player',
    customerPhone: '03009998877',
  });
  assert(conflictRes.success === false, 'Overlapping booking [19:30, 20:30) on Court 1 is REJECTED');

  // 7b. Adjacent booking (e.g. 18:00 - 19:00) on Court 1 must be allowed
  const adjacentRes = await createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    slots: ['18:00', '18:30'],
    durationMinutes: 60,
    customerName: 'Adjacent Player',
    customerPhone: '03009998877',
  });
  assert(adjacentRes.success === true, 'Adjacent booking [18:00, 19:00) touching 19:00 on Court 1 is ALLOWED');

  // 7c. Simultaneous booking on Court 2 (e.g. 19:00 - 20:00) must be allowed
  const court2Res = await createPendingBooking({
    courtId: 'court-2',
    date: testDate,
    slots: ['19:00', '19:30'],
    durationMinutes: 60,
    customerName: 'Court 2 Player',
    customerPhone: '03008887766',
  });
  assert(court2Res.success === true, 'Simultaneous booking [19:00, 20:00) on Court 2 is ALLOWED');

  // --------------------------------------------------------------------------
  // TEST 8: PRICING ENGINE VALIDATION ACROSS 30-MIN SEGMENTS
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Testing 30-Min Pricing Across Courts & Boundaries ---');
  // Off-peak Court 1: 10:00 - 11:00 (2 x 1,750 = PKR 3,500)
  const priceOffPeak = calculateBookingPrice('court-1', '10:00', 60);
  assert(priceOffPeak.totalAmount === 3500, `Court 1 off-peak 60m = PKR 3,500 (got ${priceOffPeak.totalAmount})`);

  // Peak Court 1: 19:00 - 20:00 (2 x 2,000 = PKR 4,000)
  const pricePeak = calculateBookingPrice('court-1', '19:00', 60);
  assert(pricePeak.totalAmount === 4000, `Court 1 peak 60m = PKR 4,000 (got ${pricePeak.totalAmount})`);

  // Boundary split: 17:30 for 60 mins -> 17:30 (Off-peak: 1,750) + 18:00 (Peak: 2,000) = PKR 3,750
  const priceBoundary = calculateBookingPrice('court-1', '17:30', 60);
  assert(priceBoundary.totalAmount === 3750, `Court 1 boundary split 17:30-18:30 = PKR 3,750 (got ${priceBoundary.totalAmount})`);
  assert(priceBoundary.segments[0].rate === 1750 && !priceBoundary.segments[0].isPeak, 'Segment 1 (17:30-18:00) is Off-Peak PKR 1,750');
  assert(priceBoundary.segments[1].rate === 2000 && priceBoundary.segments[1].isPeak, 'Segment 2 (18:00-18:30) is Peak PKR 2,000');

  // Court 3 Single Court: fixed PKR 1,000 per 30m all day
  const priceC3_60 = calculateBookingPrice('court-3', '19:00', 60);
  assert(priceC3_60.totalAmount === 2000, `Court 3 (Single) 60m = PKR 2,000 (got ${priceC3_60.totalAmount})`);
  const priceC3_90 = calculateBookingPrice('court-3', '19:00', 90);
  assert(priceC3_90.totalAmount === 3000, `Court 3 (Single) 90m = PKR 3,000 (got ${priceC3_90.totalAmount})`);
  const priceC3_120 = calculateBookingPrice('court-3', '19:00', 120);
  assert(priceC3_120.totalAmount === 4000, `Court 3 (Single) 120m = PKR 4,000 (got ${priceC3_120.totalAmount})`);

  // --------------------------------------------------------------------------
  // TEST 9: REGRESSION CHECK - CONFIRM "one-hour slot(s)" IS NEVER RETURNED
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Regression Check: Old "one-hour slot(s)" Error Elimination ---');
  const testSubmissions = [
    { slots: ['19:00', '19:30'], duration: 60 },
    { slots: ['19:00', '19:30', '20:00'], duration: 90 },
    { slots: ['19:00', '19:30', '20:00', '20:30'], duration: 120 },
    { slots: ['19:00', '20:00'], duration: 60 },
    { slots: ['19:00'], duration: 60 },
  ];

  for (const item of testSubmissions) {
    const v = validateConsecutiveIntervals(item.slots, item.duration);
    if (!v.valid) {
      assert(
        !v.error?.includes('one-hour slot(s)') && !v.error?.includes('one-hour'),
        `Validation error for [${item.slots.join(', ')}] does NOT contain legacy "one-hour slot(s)" text`
      );
    }
  }

  // --------------------------------------------------------------------------
  // TEST 10: SUPABASE STAGING ENVIRONMENT CHECK
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Database Staging Integration Status ---');
  if (isSupabaseConfigured() && isSupabaseAdminConfigured()) {
    console.log('[INFO] Supabase credentials are configured in environment.');
    const admin = getSupabaseAdminClient();
    if (admin) {
      try {
        const { data, error } = await admin.from('bookings').select('id, reference_number, court_id, status').limit(3);
        if (error) {
          console.log(`[WARN] Supabase query returned: ${error.message}`);
        } else {
          console.log(`[PASS] Supabase Staging connection active. Found ${data?.length ?? 0} existing records.`);
          passed++;
        }
      } catch (err: any) {
        console.log(`[INFO] Supabase query skipped/unreachable: ${err.message}`);
      }
    }
  } else {
    console.log('[INFO] Supabase connection is operating in high-performance local store mode.');
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runValidationTests().catch((err) => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});
