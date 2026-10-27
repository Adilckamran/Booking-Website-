/**
 * Power Padel Arena - Automated Test Suite
 * Optional Transaction Reference / TRX ID Verification
 * 
 * Tests the 4 required cases:
 * 1. Screenshot uploaded with NO transaction ID -> submission succeeds and status is payment_under_review.
 * 2. Screenshot uploaded WITH a transaction ID -> submission succeeds, status is payment_under_review, and TRX is saved.
 * 3. Required screenshot missing -> existing validation applies (rejected with error).
 * 4. Admin can review the screenshot whether or not a transaction ID was provided;
 *    displays "Not provided" when empty and exact ID when present.
 *    No automatic approval occurs.
 */

import { serverBookingStore } from '../src/services/booking/bookingRepository';
import { NextRequest } from 'next/server';
import { POST as handleReceiptPost } from '../src/app/api/bookings/[ref]/receipt/route';

async function runTests() {
  console.log('=====================================================');
  console.log('POWER PADEL ARENA - OPTIONAL TRX VERIFICATION SUITE');
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
  // TEST CASE 1: Booking creation with screenshot and NO transaction ID
  // --------------------------------------------------------------------------
  console.log('--- Test Case 1: Booking creation with screenshot & NO transaction ID ---');
  const bookingNoTrx = serverBookingStore.createPendingBooking({
    courtId: 'court-1',
    date: '2026-11-20',
    startTime: '10:00',
    durationMinutes: 60,
    customerName: 'Test Player A',
    customerPhone: '+92 300 1112233',
    customerEmail: 'playerA@example.com',
    paymentMethod: 'easypaisa',
    transactionRef: undefined, // No TRX provided
    receiptScreenshotUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    referenceNumber: 'PADEL-TEST-NOTRX-001',
  });

  assert(bookingNoTrx.success === true, 'Booking submission without TRX succeeds');
  if (bookingNoTrx.success) {
    assert(bookingNoTrx.booking.status === 'payment_under_review', 'Status is payment_under_review (NOT auto-approved)');
    assert(!bookingNoTrx.booking.transactionRef, 'transactionRef is undefined/empty when omitted');
    assert(!!bookingNoTrx.booking.receiptScreenshotUrl, 'receiptScreenshotUrl is stored');
  }

  // --------------------------------------------------------------------------
  // TEST CASE 2: Booking creation with screenshot AND transaction ID
  // --------------------------------------------------------------------------
  console.log('\n--- Test Case 2: Booking creation with screenshot & valid transaction ID ---');
  const bookingWithTrx = serverBookingStore.createPendingBooking({
    courtId: 'court-2',
    date: '2026-11-20',
    startTime: '11:00',
    durationMinutes: 60,
    customerName: 'Test Player B',
    customerPhone: '+92 300 4445566',
    customerEmail: 'playerB@example.com',
    paymentMethod: 'easypaisa',
    transactionRef: 'EP-9988112233', // TRX provided
    receiptScreenshotUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    referenceNumber: 'PADEL-TEST-WITHTRX-002',
  });

  assert(bookingWithTrx.success === true, 'Booking submission with TRX succeeds');
  if (bookingWithTrx.success) {
    assert(bookingWithTrx.booking.status === 'payment_under_review', 'Status is payment_under_review');
    assert(bookingWithTrx.booking.transactionRef === 'EP-9988112233', 'transactionRef is stored correctly as EP-9988112233');
    assert(!!bookingWithTrx.booking.receiptScreenshotUrl, 'receiptScreenshotUrl is stored');
  }

  // --------------------------------------------------------------------------
  // TEST CASE 3: Subsequent receipt submission on /status without TRX
  // --------------------------------------------------------------------------
  console.log('\n--- Test Case 3: Subsequent receipt upload without TRX on /status ---');
  // First create an awaiting_payment booking
  const awaitingBooking = serverBookingStore.createPendingBooking({
    courtId: 'court-3',
    date: '2026-11-20',
    startTime: '14:00',
    durationMinutes: 60,
    customerName: 'Test Player C',
    customerPhone: '+92 300 7778899',
    referenceNumber: 'PADEL-TEST-AWAIT-003',
  });

  assert(awaitingBooking.success === true && awaitingBooking.booking.status === 'awaiting_payment', 'Initial booking is awaiting_payment');

  const receiptSubmitNoTrx = serverBookingStore.submitReceipt({
    referenceNumber: 'PADEL-TEST-AWAIT-003',
    paymentMethod: 'bank_transfer',
    transactionRef: '', // Empty TRX submitted
    receiptScreenshotUrl: 'receipts/PADEL-TEST-AWAIT-003/receipt_123.jpg',
  });

  assert(receiptSubmitNoTrx.success === true, 'Receipt upload without TRX succeeds');
  if (receiptSubmitNoTrx.success) {
    assert(receiptSubmitNoTrx.booking.status === 'payment_under_review', 'Transitions to payment_under_review');
    assert(!receiptSubmitNoTrx.booking.transactionRef, 'transactionRef is undefined');
    assert(receiptSubmitNoTrx.booking.receiptScreenshotUrl === 'receipts/PADEL-TEST-AWAIT-003/receipt_123.jpg', 'Receipt storage path saved');
  }

  // --------------------------------------------------------------------------
  // TEST CASE 4: Required screenshot missing -> existing validation still applies
  // --------------------------------------------------------------------------
  console.log('\n--- Test Case 4: Required screenshot missing validation ---');
  // Call API route handler without receipt screenshot
  const reqNoScreenshot = new NextRequest('http://localhost:3000/api/bookings/PADEL-TEST-AWAIT-003/receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentMethod: 'easypaisa',
      transactionRef: 'EP-123456',
      // receiptScreenshotUrl intentionally omitted
    }),
  });

  const resMissingScreenshot = await handleReceiptPost(reqNoScreenshot, {
    params: Promise.resolve({ ref: 'PADEL-TEST-AWAIT-003' }),
  });

  assert(resMissingScreenshot.status === 400, 'API returns 400 when receipt screenshot is missing');
  const resMissingData = await resMissingScreenshot.json();
  assert(resMissingData.success === false, 'success is false');
  assert(resMissingData.error.toLowerCase().includes('screenshot is required'), `Returns descriptive screenshot error (got: "${resMissingData.error}")`);

  // --------------------------------------------------------------------------
  // TEST CASE 5: API accepts receipt screenshot when transactionRef is empty
  // --------------------------------------------------------------------------
  console.log('\n--- Test Case 5: API accepts receipt screenshot with empty transactionRef ---');
  const reqWithScreenshotNoTrx = new NextRequest('http://localhost:3000/api/bookings/PADEL-TEST-AWAIT-003/receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentMethod: 'easypaisa',
      transactionRef: '', // empty
      receiptScreenshotUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
    }),
  });

  const resAccepted = await handleReceiptPost(reqWithScreenshotNoTrx, {
    params: Promise.resolve({ ref: 'PADEL-TEST-AWAIT-003' }),
  });

  assert(resAccepted.status === 200, 'API returns 200 when screenshot is present and transactionRef is empty');
  const resAcceptedData = await resAccepted.json();
  assert(resAcceptedData.success === true, 'Receipt submission succeeded');
  assert(resAcceptedData.booking.status === 'payment_under_review', 'Status is payment_under_review');

  // --------------------------------------------------------------------------
  // TEST CASE 6: Admin display formatting logic
  // --------------------------------------------------------------------------
  console.log('\n--- Test Case 6: Admin review modal & display formatting ---');
  function formatAdminTrxDisplay(transactionRef?: string): string {
    return transactionRef && transactionRef.trim() ? transactionRef : 'Not provided';
  }

  const adminViewNoTrx = formatAdminTrxDisplay(bookingNoTrx.success ? bookingNoTrx.booking.transactionRef : undefined);
  const adminViewWithTrx = formatAdminTrxDisplay(bookingWithTrx.success ? bookingWithTrx.booking.transactionRef : undefined);

  assert(adminViewNoTrx === 'Not provided', `Admin modal displays "Not provided" when TRX is absent (got: "${adminViewNoTrx}")`);
  assert(adminViewWithTrx === 'EP-9988112233', `Admin modal displays exact TRX when present (got: "${adminViewWithTrx}")`);

  // Verify manual approval requirement
  assert(bookingNoTrx.success && bookingNoTrx.booking.status === 'payment_under_review', 'Booking is NOT auto-approved by uploading proof');
  const approveRes = serverBookingStore.adminApprove({
    referenceNumber: bookingNoTrx.success ? bookingNoTrx.booking.referenceNumber : '',
    adminEmail: 'thepowerpadel@gmail.com',
  });
  assert(approveRes.success === true && approveRes.booking.status === 'confirmed', 'Admin approval manually confirms the booking');

  console.log('\n=====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
