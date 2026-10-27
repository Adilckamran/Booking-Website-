-- ==============================================================================
-- POWER PADEL ARENA — STAGING VERIFICATION TEST SUITE
-- File: supabase/staging_verification_suite.sql
--
-- CAUTION: FOR STAGING SUPABASE PROJECTS ONLY.
-- DO NOT EXECUTE AGAINST PRODUCTION SUPABASE.
--
-- This script provides an end-to-end test harness with clearly identifiable
-- STG-TEST- prefixed records to verify every aspect of multi-slot booking,
-- backfilling, midnight wrapping, pricing rules, concurrency, and approval/rejection.
-- ==============================================================================

-- ==============================================================================
-- PHASE 1: PRE-MIGRATION SEED (Run this BEFORE applying 20261026_multi_slot_booking_schema.sql)
-- Purpose: Simulates existing legacy single-hour and multi-hour bookings in staging
-- to verify the migration's non-destructive backfill and receipt preservation.
-- ==============================================================================

INSERT INTO public.bookings (
    reference_number,
    court_id,
    court_name,
    date,
    start_time,
    end_time,
    duration_minutes,
    total_amount,
    advance_required_amount,
    remaining_amount,
    status,
    customer_name,
    customer_phone,
    customer_email,
    payment_method,
    transaction_ref,
    receipt_screenshot_url,
    created_at,
    updated_at
) VALUES 
(
    'STG-TEST-LEGACY-001',
    'court-1',
    'Court 1 — Double Court',
    CURRENT_DATE + 10,
    '18:00',
    '19:00',
    60,
    4000,
    500,
    3500,
    'confirmed',
    'Legacy Confirmed Player',
    '+923001111111',
    'legacy1@example.com',
    'easypaisa',
    'EP-1111',
    'receipts/legacy1.jpg',
    now(),
    now()
),
(
    'STG-TEST-LEGACY-002',
    'court-1',
    'Court 1 — Double Court',
    CURRENT_DATE + 10,
    '19:00',
    '20:00',
    60,
    4000,
    500,
    3500,
    'payment_under_review',
    'Legacy Review Player',
    '+923002222222',
    'legacy2@example.com',
    'bank_transfer',
    'TX-2222',
    'receipts/legacy2.jpg',
    now(),
    now()
),
(
    'STG-TEST-LEGACY-MULTI',
    'court-1',
    'Court 1 — Double Court',
    CURRENT_DATE + 10,
    '23:00',
    '01:00',
    120,
    8000,
    500,
    7500,
    'confirmed',
    'Legacy Midnight Multi Player',
    '+923003333333',
    'legacy3@example.com',
    'cash_at_venue',
    'COUNTER-01',
    NULL,
    now(),
    now()
)
ON CONFLICT (reference_number) DO NOTHING;

-- ==============================================================================
-- PHASE 2: APPLY MIGRATION
-- In Supabase SQL Editor, run: supabase/migrations/20261026_multi_slot_booking_schema.sql
-- ==============================================================================

-- ==============================================================================
-- PHASE 3: VERIFY BACKFILL & RECEIPT PRESERVATION
-- ==============================================================================

-- 3.1 Check parent booking slots JSONB
SELECT 
    reference_number, 
    duration_minutes, 
    total_amount, 
    jsonb_array_length(slots) AS slot_count
FROM public.bookings
WHERE reference_number LIKE 'STG-TEST-LEGACY-%'
ORDER BY reference_number;
-- EXPECTED:
-- STG-TEST-LEGACY-001   | 60  | 4000 | 1
-- STG-TEST-LEGACY-002   | 60  | 4000 | 1
-- STG-TEST-LEGACY-MULTI | 120 | 8000 | 2

-- 3.2 Check child rows generated in booking_slots
SELECT 
    booking_ref, 
    start_time, 
    end_time, 
    duration_minutes, 
    price, 
    is_peak, 
    status
FROM public.booking_slots
WHERE booking_ref LIKE 'STG-TEST-LEGACY-%'
ORDER BY booking_ref, start_time;
-- EXPECTED:
-- STG-TEST-LEGACY-001   | 18:00 | 19:00 | 60 | 4000 | true  | confirmed
-- STG-TEST-LEGACY-002   | 19:00 | 20:00 | 60 | 4000 | true  | payment_under_review
-- STG-TEST-LEGACY-MULTI | 00:00 | 01:00 | 60 | 4000 | true  | confirmed
-- STG-TEST-LEGACY-MULTI | 23:00 | 00:00 | 60 | 4000 | true  | confirmed

-- 3.3 Confirm customer receipt and transaction references remain intact
SELECT 
    reference_number, 
    customer_name, 
    receipt_screenshot_url, 
    transaction_ref
FROM public.bookings
WHERE reference_number LIKE 'STG-TEST-LEGACY-%'
ORDER BY reference_number;
-- EXPECTED:
-- receipts/legacy1.jpg, receipts/legacy2.jpg, and all transaction references preserved unchanged.

-- ==============================================================================
-- PHASE 4: MANUAL BOOKING TESTS (create_manual_booking)
-- NOTE: create_manual_booking enforces strict administrator authorization.
-- In Supabase SQL Editor, we simulate the authenticated club administrator
-- by setting session claims, and safely RESET them immediately upon completing Phase 4.
-- ==============================================================================

SET request.jwt.claims = '{"role": "service_role", "email": "thepowerpadel@gmail.com"}';

-- 4.1 1-Hour Manual Booking (Court 1, 10:00-11:00 Off-Peak, Cash Paid)
SELECT public.create_manual_booking(
    'court-1', 'Court 1 — Double Court', CURRENT_DATE + 11,
    '10:00', '11:00', 60, 3500, 3500, 0,
    'Staging Tester 1H', '+923000000001', 'tester1@example.com',
    'cash_at_venue', true, 'thepowerpadel@gmail.com', 'STG-TEST-MANUAL-1H'
);
-- EXPECTED: {"success": true, "message": "Manual booking created successfully."}
-- Child rows check: Exactly 1 row in booking_slots with duration_minutes = 60, price = 3500, is_peak = false.

-- 4.2 2-Hour Manual Booking Crossing Off-Peak into Peak (Court 1, 17:00-19:00, Cash Paid)
SELECT public.create_manual_booking(
    'court-1', 'Court 1 — Double Court', CURRENT_DATE + 11,
    '17:00', '19:00', 120, 7500, 7500, 0,
    'Staging Tester 2H', '+923000000002', 'tester2@example.com',
    'cash_at_venue', true, 'thepowerpadel@gmail.com', 'STG-TEST-MANUAL-2H'
);
-- EXPECTED: {"success": true}
-- Child rows check: Exactly 2 rows: 17:00-18:00 (3500, off-peak) and 18:00-19:00 (4000, peak). Total = 7500.

-- 4.3 3-Hour Manual Booking Crossing Midnight (Court 1, 23:00-02:00, Cash Paid)
SELECT public.create_manual_booking(
    'court-1', 'Court 1 — Double Court', CURRENT_DATE + 11,
    '23:00', '02:00', 180, 12000, 12000, 0,
    'Staging Tester 3H', '+923000000003', 'tester3@example.com',
    'cash_at_venue', true, 'thepowerpadel@gmail.com', 'STG-TEST-MANUAL-3H'
);
-- EXPECTED: {"success": true}
-- Child rows check: Exactly 3 rows: 23:00-00:00 (60m), 00:00-01:00 (60m), 01:00-02:00 (60m). All peak (4000). Total = 12000.

-- 4.4 Court 3 Flat Pricing Check (Court 3, 17:00-19:00, Cash Paid)
SELECT public.create_manual_booking(
    'court-3', 'Court 3 — Single Court', CURRENT_DATE + 11,
    '17:00', '19:00', 120, 4000, 4000, 0,
    'Staging Tester C3', '+923000000004', 'tester4@example.com',
    'cash_at_venue', true, 'thepowerpadel@gmail.com', 'STG-TEST-MANUAL-C3'
);
-- EXPECTED: {"success": true}
-- Child rows check: Exactly 2 rows with price = 2000 each (no peak pricing). Total = 4000.

-- 4.5 Boundary Guard Rejection: Match Exceeding 02:00 AM Closing Time
SELECT public.create_manual_booking(
    'court-1', 'Court 1 — Double Court', CURRENT_DATE + 11,
    '00:00', '03:00', 180, 12000, 12000, 0,
    'Staging Invalid', '+923000000005', NULL,
    'cash_at_venue', true, 'thepowerpadel@gmail.com', 'STG-TEST-MANUAL-OVER'
);
-- EXPECTED: {"success": false, "error": "A 180-minute match starting at 00:00 exceeds club closing hours (02:00 AM)."}

-- Safely reset session JWT claims back to default unprivileged/anonymous state
RESET request.jwt.claims;

-- ==============================================================================
-- PHASE 5: ONLINE MULTI-SLOT BOOKING TESTS (create_multi_slot_booking_secure)
-- NOTE: create_multi_slot_booking_secure represents the public web customer booking flow.
-- Runs with request.jwt.claims RESET (anonymous public context) to verify customer-facing constraints.
-- ==============================================================================

-- 5.1 Consecutive Online Multi-Slot (Court 2, 20:00-22:00, 120 min)
SELECT public.create_multi_slot_booking_secure(
    'STG-TEST-ONLINE-CONS', 'court-2', 'Court 2 — Double Court', CURRENT_DATE + 12,
    '20:00', '22:00', 120, 8000, 500, 7500,
    'Online Player A', '+923007777771', 'playerA@example.com', 'easypaisa', 'TX-771', 'receipts/test771.jpg',
    'payment_under_review',
    '[
        {"startTime":"20:00","endTime":"21:00","durationMinutes":60,"price":4000,"label":"20:00 - 21:00","isPeak":true},
        {"startTime":"21:00","endTime":"22:00","durationMinutes":60,"price":4000,"label":"21:00 - 22:00","isPeak":true}
    ]'::jsonb
);
-- EXPECTED: {"success": true, "status": "payment_under_review", "total_amount": 8000}
-- Parent start_time = '20:00', end_time = '22:00'. Exactly 2 child rows in booking_slots.

-- 5.2 Non-Consecutive Online Multi-Slot (Court 2, 09:00-10:00 and 19:00-20:00, 120 min)
SELECT public.create_multi_slot_booking_secure(
    'STG-TEST-ONLINE-NONCONS', 'court-2', 'Court 2 — Double Court', CURRENT_DATE + 12,
    '09:00', '10:00', 120, 7500, 500, 7000,
    'Online Player B', '+923007777772', 'playerB@example.com', 'bank_transfer', 'TX-772', 'receipts/test772.jpg',
    'payment_under_review',
    '[
        {"startTime":"09:00","endTime":"10:00","durationMinutes":60,"price":3500,"label":"09:00 - 10:00","isPeak":false},
        {"startTime":"19:00","endTime":"20:00","durationMinutes":60,"price":4000,"label":"19:00 - 20:00","isPeak":true}
    ]'::jsonb
);
-- EXPECTED: {"success": true, "total_amount": 7500}
-- Parent record has start_time: '09:00', end_time: '10:00' (initial slot, avoiding false continuous span).
-- Child rows record both 09:00-10:00 and 19:00-20:00.

-- 5.3 Anti-Tampering Price Check (Reject client underpayment attempt)
SELECT public.create_multi_slot_booking_secure(
    'STG-TEST-ONLINE-TAMPER', 'court-2', 'Court 2 — Double Court', CURRENT_DATE + 12,
    '19:00', '20:00', 60, 2000, 500, 1500,
    'Price Hacker', '+923007777773', NULL, 'easypaisa', NULL, NULL,
    'awaiting_payment',
    '[{"startTime":"19:00","endTime":"20:00","durationMinutes":60,"price":2000,"label":"19:00 - 20:00","isPeak":false}]'::jsonb
);
-- EXPECTED: {"success": false, "error": "Price mismatch on slot 19:00: expected PKR 4000 but received PKR 2000."}

-- ==============================================================================
-- PHASE 6: CONFLICT, OVERLAP & REFERENCE COLLISION TESTS
-- ==============================================================================

-- 6.1 Direct Slot Overlap Rejection
-- Attempt to book Court 2 at 20:00 on CURRENT_DATE + 12 (already booked by STG-TEST-ONLINE-CONS)
SELECT public.create_multi_slot_booking_secure(
    'STG-TEST-COLLISION-01', 'court-2', 'Court 2 — Double Court', CURRENT_DATE + 12,
    '20:00', '21:00', 60, 4000, 500, 3500,
    'Colliding Player', '+923008888881', NULL, 'easypaisa', NULL, NULL,
    'awaiting_payment',
    '[{"startTime":"20:00","endTime":"21:00","durationMinutes":60,"price":4000,"label":"20:00 - 21:00","isPeak":true}]'::jsonb
);
-- EXPECTED: {"success": false, "error": "Slot at 20:00 is already reserved by another customer (Ref: STG-TEST-ONLINE-CONS)."}

-- 6.2 Reference Collision Rollback Check
-- Attempt to reuse existing reference STG-TEST-ONLINE-CONS on an unbooked slot (11:00)
SELECT public.create_multi_slot_booking_secure(
    'STG-TEST-ONLINE-CONS', 'court-2', 'Court 2 — Double Court', CURRENT_DATE + 12,
    '11:00', '12:00', 60, 3500, 500, 3000,
    'Duplicate Ref User', '+923008888882', NULL, 'easypaisa', NULL, NULL,
    'awaiting_payment',
    '[{"startTime":"11:00","endTime":"12:00","durationMinutes":60,"price":3500,"label":"11:00 - 12:00","isPeak":false}]'::jsonb
);
-- EXPECTED: {"success": false, "error": "Booking reference collision: Reference number STG-TEST-ONLINE-CONS already exists. Please submit your request again."}
-- Verify slot 11:00 was rolled back and NOT booked:
SELECT count(*) FROM public.booking_slots 
WHERE court_id = 'court-2' AND date = CURRENT_DATE + 12 AND start_time = '11:00';
-- EXPECTED: 0

-- ==============================================================================
-- PHASE 7: APPROVAL & REJECTION LIFECYCLE TESTS
-- NOTE: approve_booking_and_lock_slot and reject_booking_and_release_slot require
-- administrator authorization. We simulate the club admin context and reset immediately afterward.
-- ==============================================================================

SET request.jwt.claims = '{"role": "service_role", "email": "thepowerpadel@gmail.com"}';

-- 7.1 Approve Consecutive Booking (Both slots must become confirmed)
SELECT public.approve_booking_and_lock_slot('STG-TEST-ONLINE-CONS', 'thepowerpadel@gmail.com');
-- EXPECTED: {"success": true, "message": "Booking successfully confirmed and slot(s) locked."}

SELECT booking_ref, start_time, status 
FROM public.booking_slots 
WHERE booking_ref = 'STG-TEST-ONLINE-CONS';
-- EXPECTED: Both 20:00 and 21:00 rows have status = 'confirmed'.

-- 7.2 Reject Non-Consecutive Booking (Both slots must be released immediately)
SELECT public.reject_booking_and_release_slot('STG-TEST-ONLINE-NONCONS', 'Invalid payment screenshot', 'thepowerpadel@gmail.com');
-- EXPECTED: {"success": true, "message": "Booking rejected and slot(s) released successfully."}

SELECT booking_ref, start_time, status 
FROM public.booking_slots 
WHERE booking_ref = 'STG-TEST-ONLINE-NONCONS';
-- EXPECTED: Both 09:00 and 19:00 rows have status = 'rejected'.

-- Safely reset session claims to anonymous public customer state before testing customer rebooking
RESET request.jwt.claims;

-- 7.3 Verify Released Slot Can Now Be Rebooked by Another Customer
SELECT public.create_multi_slot_booking_secure(
    'STG-TEST-REBOOK-0900', 'court-2', 'Court 2 — Double Court', CURRENT_DATE + 12,
    '09:00', '10:00', 60, 3500, 500, 3000,
    'Rebooking Player', '+923009999999', NULL, 'easypaisa', NULL, NULL,
    'awaiting_payment',
    '[{"startTime":"09:00","endTime":"10:00","durationMinutes":60,"price":3500,"label":"09:00 - 10:00","isPeak":false}]'::jsonb
);
-- EXPECTED: {"success": true} (Slot was successfully released and rebooked!)

-- ==============================================================================
-- PHASE 8: CLEANUP SCRIPT (Purges only STG-TEST records)
-- ==============================================================================

DELETE FROM public.bookings WHERE reference_number LIKE 'STG-TEST-%';

-- Confirm complete cascade cleanup:
SELECT count(*) AS remaining_test_bookings FROM public.bookings WHERE reference_number LIKE 'STG-TEST-%';
SELECT count(*) AS remaining_test_slots FROM public.booking_slots WHERE booking_ref LIKE 'STG-TEST-%';
SELECT count(*) AS remaining_test_notifs FROM public.admin_notifications WHERE booking_ref LIKE 'STG-TEST-%';
-- EXPECTED: All 3 counts must equal 0.
