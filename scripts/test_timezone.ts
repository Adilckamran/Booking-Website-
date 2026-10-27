import {
  getKarachiDateString,
  getKarachiRollingDates,
  isDateInPastInKarachi,
  getKarachiDateParts,
} from '../src/utils/timezone';

function runTests() {
  console.log('=====================================================');
  console.log('POWER PADEL ARENA - TIMEZONE VERIFICATION SUITE');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Simulate Karachi Time at 11:59 PM PKT (UTC: 2026-10-27T18:59:00Z)
  // --------------------------------------------------------------------------
  const t1159PM = new Date('2026-10-27T18:59:00Z');
  const dateStr1 = getKarachiDateString(t1159PM);
  const parts1 = getKarachiDateParts(t1159PM);
  const window1 = getKarachiRollingDates(7, t1159PM);

  assert(dateStr1 === '2026-10-27', `11:59 PM PKT date must be 2026-10-27 (got ${dateStr1})`);
  assert(parts1.year === 2026 && parts1.month === 10 && parts1.day === 27, '11:59 PM parts match 2026-10-27');
  assert(window1[0].iso === '2026-10-27' && window1[0].dayName === 'Today', 'Window[0] is Today (2026-10-27)');
  assert(window1[1].iso === '2026-10-28' && window1[1].dayName === 'Tomorrow', 'Window[1] is Tomorrow (2026-10-28)');
  assert(window1[6].iso === '2026-11-02', `Window[6] is 2026-11-02 (got ${window1[6].iso})`);

  // --------------------------------------------------------------------------
  // TEST 2: Simulate Karachi Time at 12:01 AM PKT (UTC: 2026-10-27T19:01:00Z)
  // --------------------------------------------------------------------------
  const t1201AM = new Date('2026-10-27T19:01:00Z');
  const dateStr2 = getKarachiDateString(t1201AM);
  const parts2 = getKarachiDateParts(t1201AM);
  const window2 = getKarachiRollingDates(7, t1201AM);

  assert(dateStr2 === '2026-10-28', `12:01 AM PKT date must be 2026-10-28 (got ${dateStr2})`);
  assert(parts2.year === 2026 && parts2.month === 10 && parts2.day === 28, '12:01 AM parts match 2026-10-28');
  assert(window2[0].iso === '2026-10-28' && window2[0].dayName === 'Today', 'Window[0] advances to Today (2026-10-28)');
  assert(window2[1].iso === '2026-10-29' && window2[1].dayName === 'Tomorrow', 'Window[1] is Tomorrow (2026-10-29)');
  assert(window2[6].iso === '2026-11-03', `Window[6] advances to 2026-11-03 (got ${window2[6].iso})`);

  // --------------------------------------------------------------------------
  // TEST 3: Simulate Karachi Time at 1:30 AM PKT (UTC: 2026-10-27T20:30:00Z)
  // --------------------------------------------------------------------------
  // (In UTC, this is still 8:30 PM on Oct 27, which previously caused the bug)
  const t0130AM = new Date('2026-10-27T20:30:00Z');
  const dateStr3 = getKarachiDateString(t0130AM);
  const window3 = getKarachiRollingDates(7, t0130AM);

  assert(dateStr3 === '2026-10-28', `01:30 AM PKT date must be 2026-10-28 (got ${dateStr3})`);
  assert(window3[0].iso === '2026-10-28', 'Window[0] is 2026-10-28 at 01:30 AM PKT');
  assert(window3[0].formatted === 'Oct 28', `Formatted date is 'Oct 28' (got ${window3[0].formatted})`);

  // --------------------------------------------------------------------------
  // TEST 4: Visitor Device Timezone Immunity
  // --------------------------------------------------------------------------
  // Even if a user visits from New York (UTC-4), London (UTC+0), or Tokyo (UTC+9),
  // when an event occurs at 01:30 AM PKT, the calculated business date MUST remain 2026-10-28.
  const internationalInstant = new Date('2026-10-27T20:30:00Z');
  const visitorDate = getKarachiDateString(internationalInstant);
  assert(visitorDate === '2026-10-28', 'Visitor outside Pakistan sees correct Karachi business date');

  // --------------------------------------------------------------------------
  // TEST 5: Past Date Validation Check
  // --------------------------------------------------------------------------
  // At 1:30 AM on Oct 28 in Karachi:
  // - 2026-10-27 is IN THE PAST (should be rejected)
  // - 2026-10-28 is TODAY (valid)
  // - 2026-10-29 is FUTURE (valid)
  assert(isDateInPastInKarachi('2026-10-27', t0130AM) === true, '2026-10-27 is past at 01:30 AM Oct 28 PKT');
  assert(isDateInPastInKarachi('2026-10-28', t0130AM) === false, '2026-10-28 is NOT past at 01:30 AM Oct 28 PKT');
  assert(isDateInPastInKarachi('2026-10-29', t0130AM) === false, '2026-10-29 is NOT past at 01:30 AM Oct 28 PKT');

  // --------------------------------------------------------------------------
  // TEST 6: Month Boundary Rollover (Oct 31 to Nov 1)
  // --------------------------------------------------------------------------
  const tOct31 = new Date('2026-10-31T05:00:00Z'); // 10:00 AM Oct 31 PKT
  const windowOct31 = getKarachiRollingDates(7, tOct31);
  assert(windowOct31[0].iso === '2026-10-31', 'Day 0 is 2026-10-31');
  assert(windowOct31[1].iso === '2026-11-01', 'Day 1 is 2026-11-01');
  assert(windowOct31[2].iso === '2026-11-02', 'Day 2 is 2026-11-02');
  assert(windowOct31[6].iso === '2026-11-06', 'Day 6 is 2026-11-06');

  console.log(`\n=====================================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`=====================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
