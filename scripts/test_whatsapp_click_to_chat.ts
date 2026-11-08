/**
 * Unit Test Suite: WhatsApp Click-to-Chat Feature
 * 
 * Verifies:
 * 1. Pakistani phone normalization for all standard variations (03xx, +92, 0092, 92)
 * 2. Strict rejection of invalid / missing phone numbers without inventing data
 * 3. Generation of wa.me URLs with proper RFC-3986 encoding
 * 4. Required fields in confirmation message (name, ref, date, times, court, duration, total, advance, balance)
 * 5. Required fields in rejection message (name, ref, court, date, times, reason, contact info)
 * 6. Multi-slot booking message formatting
 */

import {
  formatPhoneForWhatsApp,
  buildWhatsAppConfirmationMessage,
  buildWhatsAppRejectionMessage,
  getWhatsAppClickToChatUrl,
} from '../src/services/whatsapp';
import { validatePakistaniMobile } from '../src/utils/phoneValidation';
import { Booking } from '../src/types';
import { CLUB_CONFIG } from '../src/config/clubConfig';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${msg}`);
    process.exit(1);
  }
}

console.log('🧪 Starting WhatsApp Click-to-Chat Test Suite...\n');

// =========================================================================
// TEST SUITE 1: Phone Validation & Normalization
// =========================================================================
console.log('--- Suite 1: Phone Validation & Normalization ---');

const validCases = [
  { input: '03001234567', expected: '923001234567' },
  { input: '03162997913', expected: '923162997913' },
  { input: '+92 316 2997913', expected: '923162997913' },
  { input: '+92-316-2997913', expected: '923162997913' },
  { input: '923162997913', expected: '923162997913' },
  { input: '00923162997913', expected: '923162997913' },
  { input: '0092 316 2997913', expected: '923162997913' },
  { input: '+92 0316 2997913', expected: '923162997913' },
  { input: '009203162997913', expected: '923162997913' },
  { input: ' 0321-9876543 ', expected: '923219876543' },
  { input: '(0345) 1234567', expected: '923451234567' },
];

for (const testCase of validCases) {
  const normalized = formatPhoneForWhatsApp(testCase.input);
  assert(
    normalized === testCase.expected,
    `Expected "${testCase.input}" to normalize to "${testCase.expected}", got "${normalized}"`
  );
  console.log(`  ✓ Valid: "${testCase.input}" -> ${normalized}`);
}

const invalidCases = [
  '',
  '   ',
  null as unknown as string,
  undefined as unknown as string,
  '12345',
  '030012345',         // 9 digits (too short)
  '030012345678',       // 12 digits (too long)
  '04001234567',        // doesn't start with 03
  '02135800000',        // landline, not cellular 03
  '+1 555 123 4567',    // US number
  '0300abcdefg',        // letters
  '0300-123-456!',      // symbol
];

for (const input of invalidCases) {
  const result = formatPhoneForWhatsApp(input);
  assert(
    result === null,
    `Expected invalid input "${input}" to return null, got "${result}"`
  );
  console.log(`  ✓ Rejected: "${input}" -> null`);
}

// =========================================================================
// TEST SUITE 2: Confirmation Message Generation
// =========================================================================
console.log('\n--- Suite 2: Confirmation Message Content ---');

const mockBooking60: Booking = {
  id: 'b-001',
  referenceNumber: 'PADEL-PK-2026-1001',
  courtId: 'court-1',
  courtName: 'Court 1 — Panoramic Court',
  date: '2026-11-15',
  startTime: '19:00',
  endTime: '20:00',
  durationMinutes: 60,
  totalAmount: 4000,
  advanceRequiredAmount: 500,
  remainingAmount: 3500,
  status: 'confirmed',
  customerName: 'Hamza Khan',
  customerPhone: '0300 1234567',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const confirmationMsg60 = buildWhatsAppConfirmationMessage(mockBooking60);

// Check required dynamic fields
assert(confirmationMsg60.includes('Hamza Khan'), 'Message must include customer name');
assert(confirmationMsg60.includes('PADEL-PK-2026-1001'), 'Message must include booking reference');
assert(confirmationMsg60.includes('Court 1 — Panoramic Court'), 'Message must include court name');
assert(confirmationMsg60.includes('2026-11-15'), 'Message must include booking date');
assert(confirmationMsg60.includes('19:00 - 20:00'), 'Message must include start and end time');
assert(confirmationMsg60.includes('60 mins'), 'Message must include duration');
assert(confirmationMsg60.includes('PKR 4,000'), 'Message must include total amount');
assert(confirmationMsg60.includes('PKR 500'), 'Message must include advance payment');
assert(confirmationMsg60.includes('PKR 3,500'), 'Message must include remaining amount');
assert(confirmationMsg60.includes(CLUB_CONFIG.locationArea), 'Message must include venue location');
console.log('  ✓ 60-minute confirmation message contains all required dynamic fields');

// Test 90-minute booking
const mockBooking90: Booking = {
  ...mockBooking60,
  id: 'b-002',
  referenceNumber: 'PADEL-PK-2026-1002',
  startTime: '20:30',
  endTime: '22:00',
  durationMinutes: 90,
  totalAmount: 6000,
  remainingAmount: 5500,
};

const confirmationMsg90 = buildWhatsAppConfirmationMessage(mockBooking90);
assert(confirmationMsg90.includes('90 mins'), '90-minute booking must state 90 mins');
assert(confirmationMsg90.includes('20:30 - 22:00'), '90-minute booking must show slot interval');
assert(confirmationMsg90.includes('PKR 6,000'), '90-minute booking must show total amount');
console.log('  ✓ 90-minute confirmation message correctly formatted');

// Test 120-minute booking
const mockBooking120: Booking = {
  ...mockBooking60,
  id: 'b-003',
  referenceNumber: 'PADEL-PK-2026-1003',
  startTime: '18:00',
  endTime: '20:00',
  durationMinutes: 120,
  totalAmount: 8000,
  remainingAmount: 7500,
};

const confirmationMsg120 = buildWhatsAppConfirmationMessage(mockBooking120);
assert(confirmationMsg120.includes('120 mins'), '120-minute booking must state 120 mins');
assert(confirmationMsg120.includes('18:00 - 20:00'), '120-minute booking must show slot interval');
console.log('  ✓ 120-minute confirmation message correctly formatted');

// Test zero remaining balance (fully paid)
const mockFullyPaid: Booking = {
  ...mockBooking60,
  advanceRequiredAmount: 4000,
  remainingAmount: 0,
};
const confirmationFullyPaid = buildWhatsAppConfirmationMessage(mockFullyPaid);
assert(confirmationFullyPaid.includes('PKR 0 (Fully Paid)'), 'Remaining amount should indicate Fully Paid');
console.log('  ✓ Fully-paid booking correctly formatted');

// =========================================================================
// TEST SUITE 3: Rejection Message Generation
// =========================================================================
console.log('\n--- Suite 3: Rejection Message Content ---');

const mockRejectedBooking: Booking = {
  ...mockBooking60,
  id: 'b-004',
  referenceNumber: 'PADEL-PK-2026-1004',
  status: 'rejected',
  rejectionReason: 'Transaction ID not matched in bank statement.',
};

const rejectionMsg = buildWhatsAppRejectionMessage(mockRejectedBooking, mockRejectedBooking.rejectionReason);

assert(rejectionMsg.includes('Hamza Khan'), 'Rejection message must include customer name');
assert(rejectionMsg.includes('PADEL-PK-2026-1004'), 'Rejection message must include reference number');
assert(rejectionMsg.includes('Court 1 — Panoramic Court'), 'Rejection message must include court name');
assert(rejectionMsg.includes('2026-11-15'), 'Rejection message must include date');
assert(rejectionMsg.includes('19:00 - 20:00'), 'Rejection message must include slot time');
assert(rejectionMsg.includes('Transaction ID not matched in bank statement.'), 'Rejection message must include reason');
assert(rejectionMsg.includes(CLUB_CONFIG.contactPhonePlaceholder), 'Rejection message must include phone contact');
assert(rejectionMsg.includes(CLUB_CONFIG.businessEmail), 'Rejection message must include email contact');
console.log('  ✓ Rejection message contains all required dynamic fields and club contacts');

// =========================================================================
// TEST SUITE 4: Click-to-Chat URL Generation
// =========================================================================
console.log('\n--- Suite 4: Click-to-Chat URL Generation ---');

const chatUrlResult = getWhatsAppClickToChatUrl(mockBooking60, 'confirmation');
assert(chatUrlResult.url !== null, 'Valid phone number must yield a non-null URL');
assert(chatUrlResult.phone === '923001234567', 'Phone must be normalized to 923001234567');
assert(chatUrlResult.url!.startsWith('https://wa.me/923001234567?text='), 'URL must begin with https://wa.me/923001234567?text=');

// Verify URL decode matches original message
const encodedText = chatUrlResult.url!.split('?text=')[1];
const decodedText = decodeURIComponent(encodedText);
assert(decodedText === chatUrlResult.message, 'Decoded message must match original text');
assert(decodedText.includes('PADEL-PK-2026-1001'), 'Decoded text must include booking reference');
console.log('  ✓ Click-to-chat URL correctly formed with RFC-3986 encoding');

// Rejection URL
const rejUrlResult = getWhatsAppClickToChatUrl(mockRejectedBooking, 'rejection', 'Duplicate payment receipt');
assert(rejUrlResult.url !== null, 'Rejection URL must not be null');
assert(rejUrlResult.url!.startsWith('https://wa.me/923001234567?text='), 'Rejection URL must have wa.me format');
const decodedRej = decodeURIComponent(rejUrlResult.url!.split('?text=')[1]);
assert(decodedRej.includes('Duplicate payment receipt'), 'Rejection reason must be present in URL text');
console.log('  ✓ Rejection Click-to-chat URL correctly constructed');

// Missing/invalid phone safety: Never invent a number
const missingPhoneBooking: Booking = {
  ...mockBooking60,
  customerPhone: '',
};
const missingResult = getWhatsAppClickToChatUrl(missingPhoneBooking, 'confirmation');
assert(missingResult.url === null, 'Missing phone must result in null URL');
assert(missingResult.phone === null, 'Missing phone must return null phone');
assert(typeof missingResult.error === 'string', 'Missing phone must provide an error explanation');
console.log(`  ✓ Missing phone safely handled: "${missingResult.error}"`);

const invalidPhoneBooking: Booking = {
  ...mockBooking60,
  customerPhone: '021 3456789', // Karachi landline, not mobile
};
const invalidResult = getWhatsAppClickToChatUrl(invalidPhoneBooking, 'confirmation');
assert(invalidResult.url === null, 'Invalid phone must result in null URL');
assert(invalidResult.phone === null, 'Invalid phone must return null phone');
console.log(`  ✓ Non-cellular phone safely rejected: "${invalidResult.error}"`);

console.log('\n======================================================');
console.log('🎉 ALL WHATSAPP CLICK-TO-CHAT TESTS PASSED (100%)');
console.log('======================================================\n');
