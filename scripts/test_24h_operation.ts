/**
 * Power Padel Arena - Automated Test Suite
 * 24-Hour Operation & Boundary Verification
 * 
 * Verifies:
 * 1. 24-hour slot availability across all 24 hours (00:00 to 24:00).
 * 2. Slot 0 is 00:00-01:00 (12:00 AM - 01:00 AM) and Slot 23 is 23:00-00:00 (11:00 PM - 12:00 AM).
 * 3. Specific test hours: 1 AM, 2 AM, 3 AM, 5 AM, 6 AM, 5 PM, 6 PM, 11 PM, and Midnight.
 * 4. Pricing at 6 AM boundary (05:00 is Peak, 06:00 is Off-Peak) and 6 PM boundary (17:00 is Off-Peak, 18:00 is Peak).
 * 5. Court 3 fixed PKR 2,000 across all 24 hours.
 * 6. Customer online booking and Admin manual desk booking for 2 AM - 6 AM slots.
 * 7. Double-booking prevention during overnight/early morning hours.
 */

import { OPERATING_SLOTS_DEF } from '../src/data/demoData';
import { getHourlyRate } from '../src/services/pricing/pricingService';
import { serverBookingStore, getOperatingScheduleMinutes, resolveBookingTiming } from '../src/services/booking/bookingRepository';

async function runTests() {
  console.log('=====================================================');
  console.log('POWER PADEL ARENA - 24-HOUR OPERATION VERIFICATION');
  console.log('=====================================================\n');

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
  // TEST 1: OPERATING SLOTS DEFINITION INTEGRITY
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Operating Slots Definition (24 Hours) ---');
  assert(OPERATING_SLOTS_DEF.length === 24, `Exactly 24 hourly slots defined (got ${OPERATING_SLOTS_DEF.length})`);
  assert(OPERATING_SLOTS_DEF[0].startTime === '00:00' && OPERATING_SLOTS_DEF[0].endTime === '01:00', 'First slot is 00:00 - 01:00 (12:00 AM - 01:00 AM)');
  assert(OPERATING_SLOTS_DEF[23].startTime === '23:00' && OPERATING_SLOTS_DEF[23].endTime === '00:00', 'Final slot is 23:00 - 00:00 (11:00 PM - 12:00 AM)');

  // Verify missing early-morning slots 2:00 AM - 6:00 AM exist
  const earlyMorningSlots = ['02:00', '03:00', '04:00', '05:00'];
  for (const s of earlyMorningSlots) {
    const found = OPERATING_SLOTS_DEF.find((def) => def.startTime === s);
    assert(!!found, `Early-morning slot ${s} is present in OPERATING_SLOTS_DEF`);
  }

  // --------------------------------------------------------------------------
  // TEST 2: AVAILABILITY AT REQUIRED HOURS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Availability at Required Inspection Hours ---');
  const testDate = '2026-11-25';
  const availability = serverBookingStore.getAvailability('court-1', testDate);

  const requiredHours = [
    { hour: '00:00', name: 'Midnight (00:00)' },
    { hour: '01:00', name: '1:00 AM (01:00)' },
    { hour: '02:00', name: '2:00 AM (02:00)' },
    { hour: '03:00', name: '3:00 AM (03:00)' },
    { hour: '05:00', name: '5:00 AM (05:00)' },
    { hour: '06:00', name: '6:00 AM (06:00)' },
    { hour: '17:00', name: '5:00 PM (17:00)' },
    { hour: '18:00', name: '6:00 PM (18:00)' },
    { hour: '23:00', name: '11:00 PM (23:00)' },
  ];

  for (const item of requiredHours) {
    const slot = availability.find((s) => s.startTime === item.hour);
    assert(!!slot, `Availability API includes ${item.name}`);
    if (slot) {
      assert(slot.status === 'available', `${item.name} is available on test date`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 3: PRICING & BOUNDARY VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Pricing Rules & Boundary Verification ---');

  // Courts 1 & 2 Rates
  // 1 AM (01:00) -> Peak (PKR 4,000)
  assert(getHourlyRate('court-1', 1).rate === 4000 && getHourlyRate('court-1', 1).isPeak === true, 'Court 1 at 1:00 AM is Peak PKR 4,000');
  // 2 AM (02:00) -> Peak (PKR 4,000)
  assert(getHourlyRate('court-1', 2).rate === 4000 && getHourlyRate('court-1', 2).isPeak === true, 'Court 1 at 2:00 AM is Peak PKR 4,000');
  // 3 AM (03:00) -> Peak (PKR 4,000)
  assert(getHourlyRate('court-1', 3).rate === 4000 && getHourlyRate('court-1', 3).isPeak === true, 'Court 1 at 3:00 AM is Peak PKR 4,000');
  // 5 AM (05:00 - 06:00) -> Peak (PKR 4,000)
  assert(getHourlyRate('court-1', 5).rate === 4000 && getHourlyRate('court-1', 5).isPeak === true, '5:00 AM - 6:00 AM is Peak PKR 4,000 (pre-6 AM)');
  // 6 AM boundary (06:00 - 07:00) -> Off-peak (PKR 3,500)
  assert(getHourlyRate('court-1', 6).rate === 3500 && getHourlyRate('court-1', 6).isPeak === false, '6:00 AM - 7:00 AM is Off-Peak PKR 3,500 (boundary inclusive)');
  // 5 PM (17:00 - 18:00) -> Off-peak (PKR 3,500)
  assert(getHourlyRate('court-1', 17).rate === 3500 && getHourlyRate('court-1', 17).isPeak === false, '5:00 PM - 6:00 PM is Off-Peak PKR 3,500');
  // 6 PM boundary (18:00 - 19:00) -> Peak (PKR 4,000)
  assert(getHourlyRate('court-1', 18).rate === 4000 && getHourlyRate('court-1', 18).isPeak === true, '6:00 PM - 7:00 PM is Peak PKR 4,000 (boundary inclusive)');
  // 11 PM (23:00 - 00:00) -> Peak (PKR 4,000)
  assert(getHourlyRate('court-1', 23).rate === 4000 && getHourlyRate('court-1', 23).isPeak === true, '11:00 PM - 12:00 AM is Peak PKR 4,000');
  // Midnight (00:00 - 01:00) -> Peak (PKR 4,000)
  assert(getHourlyRate('court-1', 0).rate === 4000 && getHourlyRate('court-1', 0).isPeak === true, '12:00 AM - 01:00 AM is Peak PKR 4,000');

  // Court 3 (Single Court) Fixed Rate
  for (const h of [0, 1, 2, 3, 5, 6, 12, 17, 18, 23]) {
    const c3Rate = getHourlyRate('court-3', h);
    assert(c3Rate.rate === 2000, `Court 3 at hour ${h}:00 is strictly PKR 2,000 (got PKR ${c3Rate.rate})`);
  }

  // --------------------------------------------------------------------------
  // TEST 4: CUSTOMER ONLINE BOOKINGS FOR OVERNIGHT & MIDNIGHT SLOTS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Customer Online Bookings (Overnight & Midnight) ---');

  // 4a. 11:00 PM to Midnight (23:00 - 00:00)
  const book11PM = serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    startTime: '23:00',
    durationMinutes: 60,
    customerName: 'Customer 11PM',
    customerPhone: '+92 300 1122334',
    referenceNumber: 'PADEL-24H-TEST-2300',
  });
  assert(book11PM.success === true, 'Booking from 11:00 PM to Midnight succeeds');
  if (book11PM.success) {
    assert(book11PM.booking.startTime === '23:00' && book11PM.booking.endTime === '00:00', '11 PM booking timing is 23:00 - 00:00');
    assert(book11PM.booking.totalAmount === 4000, 'Total is PKR 4,000');
  }

  // 4b. Midnight to 1:00 AM (00:00 - 01:00)
  const bookMidnight = serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: testDate,
    startTime: '00:00',
    durationMinutes: 60,
    customerName: 'Customer Midnight',
    customerPhone: '+92 300 9988776',
    referenceNumber: 'PADEL-24H-TEST-0000',
  });
  assert(bookMidnight.success === true, 'Booking from Midnight to 1:00 AM succeeds');
  if (bookMidnight.success) {
    assert(bookMidnight.booking.startTime === '00:00' && bookMidnight.booking.endTime === '01:00', 'Midnight booking timing is 00:00 - 01:00');
    assert(bookMidnight.booking.date === testDate, `Booking is associated with calendar date ${testDate}`);
    assert(bookMidnight.booking.totalAmount === 4000, 'Total is PKR 4,000');
  }

  // 4c. 2:00 AM to 3:00 AM (02:00 - 03:00)
  const book2AM = serverBookingStore.createPendingBooking({
    courtId: 'court-2',
    date: testDate,
    startTime: '02:00',
    durationMinutes: 60,
    customerName: 'Customer 2AM',
    customerPhone: '+92 300 5566778',
    referenceNumber: 'PADEL-24H-TEST-0200',
  });
  assert(book2AM.success === true, 'Booking from 2:00 AM to 3:00 AM succeeds');
  if (book2AM.success) {
    assert(book2AM.booking.startTime === '02:00' && book2AM.booking.endTime === '03:00', '2 AM booking timing is 02:00 - 03:00');
    assert(book2AM.booking.totalAmount === 4000, 'Total is PKR 4,000');
  }

  // 4d. 5:00 AM to 6:00 AM (05:00 - 06:00)
  const book5AM = serverBookingStore.createPendingBooking({
    courtId: 'court-2',
    date: testDate,
    startTime: '05:00',
    durationMinutes: 60,
    customerName: 'Customer 5AM',
    customerPhone: '+92 300 7788990',
    referenceNumber: 'PADEL-24H-TEST-0500',
  });
  assert(book5AM.success === true, 'Booking from 5:00 AM to 6:00 AM succeeds');
  if (book5AM.success) {
    assert(book5AM.booking.startTime === '05:00' && book5AM.booking.endTime === '06:00', '5 AM booking timing is 05:00 - 06:00');
    assert(book5AM.booking.totalAmount === 4000, 'Total is PKR 4,000');
  }

  // --------------------------------------------------------------------------
  // TEST 5: DOUBLE-BOOKING PREVENTION DURING 24-HOUR SLOTS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Double-Booking Overlap Prevention ---');
  // Attempt to book the already-reserved 02:00 slot on Court 2
  const conflictRes = serverBookingStore.createPendingBooking({
    courtId: 'court-2',
    date: testDate,
    startTime: '02:00',
    durationMinutes: 60,
    customerName: 'Double Book Imposter',
    customerPhone: '+92 312 0000000',
    referenceNumber: 'PADEL-24H-TEST-CONFLICT',
  });
  assert(conflictRes.success === false, 'Duplicate booking for 02:00 slot is rejected');
  if (!conflictRes.success) {
    assert(conflictRes.error.toLowerCase().includes('already reserved') || conflictRes.error.toLowerCase().includes('booked'), `Returns conflict error message (got: "${conflictRes.error}")`);
  }

  // --------------------------------------------------------------------------
  // TEST 6: ADMIN MANUAL BOOKING FOR 24-HOUR SLOTS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Admin Manual Desk Booking for 24-Hour Slots ---');
  const adminManual3AM = serverBookingStore.createManualBooking({
    courtId: 'court-1',
    date: testDate,
    startTime: '03:00',
    durationMinutes: 60,
    customerName: 'Admin Desk 3AM Player',
    customerPhone: '+92 300 3344556',
    isPaid: true,
    adminEmail: 'thepowerpadel@gmail.com',
  });
  assert(adminManual3AM.success === true, 'Admin manual booking for 3:00 AM succeeds');
  if (adminManual3AM.success) {
    assert(adminManual3AM.booking.status === 'confirmed', 'Admin manual booking is immediately confirmed');
    assert(adminManual3AM.booking.startTime === '03:00' && adminManual3AM.booking.endTime === '04:00', 'Timing is 03:00 - 04:00');
  }

  // --------------------------------------------------------------------------
  // TEST 7: SCHEDULE MINUTES & CONSECUTIVE TIMING LOGIC
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Schedule Minutes & Consecutive Timing Logic ---');
  assert(getOperatingScheduleMinutes('00:00') === 0, '00:00 = 0 mins');
  assert(getOperatingScheduleMinutes('01:00') === 60, '01:00 = 60 mins');
  assert(getOperatingScheduleMinutes('02:00') === 120, '02:00 = 120 mins');
  assert(getOperatingScheduleMinutes('06:00') === 360, '06:00 = 360 mins');
  assert(getOperatingScheduleMinutes('18:00') === 1080, '18:00 = 1080 mins');
  assert(getOperatingScheduleMinutes('23:00') === 1380, '23:00 = 1380 mins');

  const consecutiveLate = resolveBookingTiming(['22:00', '23:00']);
  assert(consecutiveLate.isConsecutive === true, '22:00 and 23:00 are recognized as consecutive');
  assert(consecutiveLate.primaryStartTime === '22:00' && consecutiveLate.primaryEndTime === '00:00', 'Consecutive timing ends at 00:00');

  const consecutiveMidnight = resolveBookingTiming(['00:00', '01:00']);
  assert(consecutiveMidnight.isConsecutive === true, '00:00 and 01:00 are recognized as consecutive');
  assert(consecutiveMidnight.primaryStartTime === '00:00' && consecutiveMidnight.primaryEndTime === '02:00', 'Consecutive timing ends at 02:00');

  console.log('\n=====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled failure in 24h test suite:', err);
  process.exit(1);
});
