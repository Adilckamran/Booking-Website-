-- ==============================================================================
-- POWER PADEL ARENA - PRODUCTION DATABASE SCHEMA & DOUBLE-BOOKING CONSTRAINTS
-- Migration: 20261023_booking_schema.sql
-- ==============================================================================

-- 1. COURTS TABLE
CREATE TABLE IF NOT EXISTS public.courts (
    id TEXT PRIMARY KEY,
    court_number INT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'panoramic',
    surface TEXT NOT NULL,
    description TEXT,
    hourly_rate INT NOT NULL DEFAULT 4000,
    peak_hourly_rate INT NOT NULL DEFAULT 4000,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Seed default courts for Power Padel Arena
INSERT INTO public.courts (id, court_number, name, type, surface, hourly_rate, peak_hourly_rate, is_active)
VALUES
    ('court-1', 1, 'Court 1 - Panoramic Pro', 'panoramic', 'Mondo Supercourt XN (World Padel Tour Grade)', 4000, 4000, true),
    ('court-2', 2, 'Court 2 - Center Court', 'outdoor', 'Textured Monofilament Padel Turf', 4000, 4000, true),
    ('court-3', 3, 'Court 3 - Indoor Climate Control', 'indoor', 'Shock-Absorbing Comfort Pro Turf', 4000, 4000, true)
ON CONFLICT (id) DO UPDATE SET
    hourly_rate = EXCLUDED.hourly_rate,
    peak_hourly_rate = EXCLUDED.peak_hourly_rate;

-- 2. BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_number TEXT NOT NULL UNIQUE,
    court_id TEXT NOT NULL REFERENCES public.courts(id) ON DELETE RESTRICT,
    court_name TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TEXT NOT NULL, -- e.g. '18:00'
    end_time TEXT NOT NULL,   -- e.g. '19:00'
    duration_minutes INT NOT NULL DEFAULT 60,
    total_amount INT NOT NULL DEFAULT 4000,
    advance_required_amount INT NOT NULL DEFAULT 500, -- Fixed PKR 500 advance deposit
    remaining_amount INT NOT NULL DEFAULT 3500,        -- Payable at venue counter
    status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (
        status IN ('awaiting_payment', 'payment_under_review', 'confirmed', 'rejected', 'cancelled', 'expired')
    ),
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    payment_method TEXT CHECK (payment_method IN ('easypaisa', 'bank_transfer', 'jazzcash', 'cash_at_venue')),
    transaction_ref TEXT,
    receipt_screenshot_url TEXT,
    rejection_reason TEXT,
    held_until TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    rejected_at TIMESTAMPTZ,
    rejected_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 3. CRITICAL SERVER-SIDE / DATABASE CONSTRAINT: PREVENT DOUBLE BOOKINGS
-- ==============================================================================
-- A court slot cannot have more than ONE active booking at the same date and time.
-- Active statuses: 'awaiting_payment' (temporary hold), 'payment_under_review' (under review), 'confirmed' (locked).
-- When a booking is 'rejected', 'cancelled', or 'expired', it is excluded, releasing the slot atomically!
CREATE UNIQUE INDEX IF NOT EXISTS idx_prevent_double_booking
ON public.bookings (court_id, date, start_time)
WHERE status IN ('awaiting_payment', 'payment_under_review', 'confirmed');

-- Index for fast status search and customer lookup
CREATE INDEX IF NOT EXISTS idx_bookings_reference ON public.bookings (reference_number);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.bookings (date);

-- ==============================================================================
-- 4. ADMIN NOTIFICATIONS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.admin_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_ref TEXT NOT NULL REFERENCES public.bookings(reference_number) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('receipt_submitted', 'slot_held', 'booking_confirmed', 'booking_rejected')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    advance_amount INT NOT NULL DEFAULT 500,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON public.admin_notifications (is_read, created_at DESC);

-- ==============================================================================
-- 5. ATOMIC STORED PROCEDURES (RPC) FOR APPROVAL, REJECTION & SECURE LOOKUPS
-- ==============================================================================

-- Atomic Approval: re-checks slot availability and marks confirmed
-- Enforces caller authorization: caller must be service_role or authenticated club admin (thepowerpadel@gmail.com)
CREATE OR REPLACE FUNCTION public.approve_booking_and_lock_slot(
    p_booking_ref TEXT,
    p_admin_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking RECORD;
    v_conflicting_confirmed_count INT;
    v_caller_role TEXT;
    v_jwt_email TEXT;
    v_effective_admin TEXT;
BEGIN
    v_caller_role := auth.role();
    v_jwt_email := auth.jwt() ->> 'email';

    -- Security Guard: Caller must be service_role or the verified club admin
    IF v_caller_role <> 'service_role' THEN
        IF v_jwt_email IS NULL OR lower(v_jwt_email) <> 'thepowerpadel@gmail.com' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Caller is not an authorized administrator.');
        END IF;
        v_effective_admin := v_jwt_email;
    ELSE
        v_effective_admin := COALESCE(p_admin_email, 'thepowerpadel@gmail.com');
    END IF;

    -- Row-level lock on the target booking
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE reference_number = p_booking_ref
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
    END IF;

    IF v_booking.status = 'confirmed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Booking is already confirmed');
    END IF;

    IF v_booking.status = 'rejected' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot approve a rejected booking. Slot was already released.');
    END IF;

    -- Double-check that no other confirmed booking exists for this slot
    SELECT COUNT(*) INTO v_conflicting_confirmed_count
    FROM public.bookings
    WHERE court_id = v_booking.court_id
      AND date = v_booking.date
      AND start_time = v_booking.start_time
      AND status = 'confirmed'
      AND reference_number <> p_booking_ref;

    IF v_conflicting_confirmed_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Conflict: Another booking is already confirmed for this court and time.');
    END IF;

    -- Update to confirmed
    UPDATE public.bookings
    SET status = 'confirmed',
        approved_at = timezone('utc'::text, now()),
        approved_by = v_effective_admin,
        updated_at = timezone('utc'::text, now())
    WHERE reference_number = p_booking_ref;

    -- Create log notification
    INSERT INTO public.admin_notifications (booking_ref, type, title, message, customer_name, customer_phone, advance_amount, is_read)
    VALUES (
        p_booking_ref,
        'booking_confirmed',
        'Booking Approved',
        'Booking ' || p_booking_ref || ' was confirmed and slot locked by ' || v_effective_admin,
        v_booking.customer_name,
        v_booking.customer_phone,
        v_booking.advance_required_amount,
        true
    );

    RETURN jsonb_build_object('success', true, 'message', 'Booking successfully confirmed and slot locked.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_booking_and_lock_slot(TEXT, TEXT) FROM public;
REVOKE EXECUTE ON FUNCTION public.approve_booking_and_lock_slot(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_booking_and_lock_slot(TEXT, TEXT) TO authenticated, service_role;

-- Atomic Rejection: requires rejection reason, marks rejected, atomically releases slot
-- Enforces caller authorization: caller must be service_role or authenticated club admin (thepowerpadel@gmail.com)
CREATE OR REPLACE FUNCTION public.reject_booking_and_release_slot(
    p_booking_ref TEXT,
    p_rejection_reason TEXT,
    p_admin_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking RECORD;
    v_caller_role TEXT;
    v_jwt_email TEXT;
    v_effective_admin TEXT;
BEGIN
    v_caller_role := auth.role();
    v_jwt_email := auth.jwt() ->> 'email';

    -- Security Guard: Caller must be service_role or the verified club admin
    IF v_caller_role <> 'service_role' THEN
        IF v_jwt_email IS NULL OR lower(v_jwt_email) <> 'thepowerpadel@gmail.com' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Caller is not an authorized administrator.');
        END IF;
        v_effective_admin := v_jwt_email;
    ELSE
        v_effective_admin := COALESCE(p_admin_email, 'thepowerpadel@gmail.com');
    END IF;

    IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required.');
    END IF;

    SELECT * INTO v_booking
    FROM public.bookings
    WHERE reference_number = p_booking_ref
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
    END IF;

    -- Updating status to 'rejected' automatically excludes it from idx_prevent_double_booking,
    -- immediately and atomically releasing the slot for other customers!
    UPDATE public.bookings
    SET status = 'rejected',
        rejection_reason = trim(p_rejection_reason),
        rejected_at = timezone('utc'::text, now()),
        rejected_by = v_effective_admin,
        updated_at = timezone('utc'::text, now())
    WHERE reference_number = p_booking_ref;

    INSERT INTO public.admin_notifications (booking_ref, type, title, message, customer_name, customer_phone, advance_amount, is_read)
    VALUES (
        p_booking_ref,
        'booking_rejected',
        'Payment Rejected',
        'Booking ' || p_booking_ref || ' rejected by ' || v_effective_admin || ': ' || trim(p_rejection_reason),
        v_booking.customer_name,
        v_booking.customer_phone,
        v_booking.advance_required_amount,
        true
    );

    RETURN jsonb_build_object('success', true, 'message', 'Booking rejected and slot released successfully.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_booking_and_release_slot(TEXT, TEXT, TEXT) FROM public;
REVOKE EXECUTE ON FUNCTION public.reject_booking_and_release_slot(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_booking_and_release_slot(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Secure Function: Slot Availability Query (Returns only slot timing and booking status. Zero customer PII).
CREATE OR REPLACE FUNCTION public.get_active_court_slots(
    p_court_id TEXT,
    p_date DATE
)
RETURNS TABLE (
    start_time TEXT,
    status TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT b.start_time, b.status, b.created_at
    FROM public.bookings b
    WHERE b.court_id = p_court_id
      AND b.date = p_date
      AND b.status IN ('awaiting_payment', 'payment_under_review', 'confirmed');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_court_slots(TEXT, DATE) FROM public;
GRANT EXECUTE ON FUNCTION public.get_active_court_slots(TEXT, DATE) TO anon, authenticated, service_role;

-- Secure Function: Customer Booking Status Lookup by Exact Reference Number
-- Prevents table scanning: requires the exact matching reference number.
CREATE OR REPLACE FUNCTION public.get_booking_by_reference(
    p_booking_ref TEXT
)
RETURNS TABLE (
    id UUID,
    reference_number TEXT,
    court_id TEXT,
    court_name TEXT,
    date DATE,
    start_time TEXT,
    end_time TEXT,
    duration_minutes INT,
    total_amount INT,
    advance_required_amount INT,
    remaining_amount INT,
    status TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    payment_method TEXT,
    transaction_ref TEXT,
    receipt_screenshot_url TEXT,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_booking_ref IS NULL OR trim(p_booking_ref) = '' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        b.id,
        b.reference_number,
        b.court_id,
        b.court_name,
        b.date,
        b.start_time,
        b.end_time,
        b.duration_minutes,
        b.total_amount,
        b.advance_required_amount,
        b.remaining_amount,
        b.status,
        b.customer_name,
        b.customer_phone,
        b.customer_email,
        b.payment_method,
        b.transaction_ref,
        b.receipt_screenshot_url,
        b.rejection_reason,
        b.created_at,
        b.updated_at
    FROM public.bookings b
    WHERE b.reference_number = trim(p_booking_ref)
    LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_booking_by_reference(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.get_booking_by_reference(TEXT) TO anon, authenticated, service_role;

-- Automatic Trigger: Logs receipt submission notification when customer uploads evidence
CREATE OR REPLACE FUNCTION public.handle_receipt_submission_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'payment_under_review' AND OLD.status = 'awaiting_payment' THEN
        INSERT INTO public.admin_notifications (
            booking_ref,
            type,
            title,
            message,
            customer_name,
            customer_phone,
            advance_amount,
            is_read
        )
        VALUES (
            NEW.reference_number,
            'receipt_submitted',
            'Payment Screenshot Submitted',
            'Customer ' || NEW.customer_name || ' uploaded receipt. TRX: ' || COALESCE(NEW.transaction_ref, 'N/A') || '. Advance: PKR ' || NEW.advance_required_amount || '.',
            NEW.customer_name,
            NEW.customer_phone,
            NEW.advance_required_amount,
            false
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_receipt_submission_notification ON public.bookings;
CREATE TRIGGER trigger_receipt_submission_notification
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.handle_receipt_submission_notification();

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Courts are readable by anyone
DROP POLICY IF EXISTS "Courts are publicly viewable" ON public.courts;
CREATE POLICY "Courts are publicly viewable"
ON public.courts FOR SELECT
USING (true);

-- SECURE BOOKINGS POLICIES:
-- 1. DROP the insecure blanket public SELECT policy
DROP POLICY IF EXISTS "Customers can view own booking by reference" ON public.bookings;

-- 2. Public customers can create pending bookings
-- Enforces status = 'awaiting_payment' and fixed advance deposit = 500
DROP POLICY IF EXISTS "Public can create pending booking" ON public.bookings;
CREATE POLICY "Public can create pending booking"
ON public.bookings FOR INSERT
TO public
WITH CHECK (
    status = 'awaiting_payment'
    AND advance_required_amount = 500
);

-- 3. Customers can submit receipt (ONLY transition from awaiting_payment to payment_under_review)
-- CANNOT approve, reject, or mark confirmed!
DROP POLICY IF EXISTS "Customers can submit receipt" ON public.bookings;
CREATE POLICY "Customers can submit receipt"
ON public.bookings FOR UPDATE
TO public
USING (status = 'awaiting_payment')
WITH CHECK (
    status = 'payment_under_review'
    AND (approved_at IS NULL)
    AND (rejected_at IS NULL)
);

-- 4. Authenticated admins (thepowerpadel@gmail.com) have full access to all bookings
DROP POLICY IF EXISTS "Admins have full access to bookings" ON public.bookings;
CREATE POLICY "Admins have full access to bookings"
ON public.bookings FOR ALL
TO authenticated
USING (
    auth.jwt() ->> 'email' = 'thepowerpadel@gmail.com'
)
WITH CHECK (
    auth.jwt() ->> 'email' = 'thepowerpadel@gmail.com'
);

-- 5. Admin notifications are strictly confidential (admin only)
DROP POLICY IF EXISTS "Admins have full access to notifications" ON public.admin_notifications;
CREATE POLICY "Admins have full access to notifications"
ON public.admin_notifications FOR ALL
TO authenticated
USING (
    auth.jwt() ->> 'email' = 'thepowerpadel@gmail.com'
)
WITH CHECK (
    auth.jwt() ->> 'email' = 'thepowerpadel@gmail.com'
);

-- ==============================================================================
-- 7. PRIVATE RECEIPT STORAGE BUCKET & STORAGE POLICIES
-- ==============================================================================
-- Provision the private bucket in Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'receipts-private',
    'receipts-private',
    false, -- STRICTLY PRIVATE: Direct unauthenticated public URL access is disabled
    5242880, -- 5 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

-- Customers can upload receipts into receipts-private
-- Allows INSERT only; no UPDATE or DELETE permission is granted to public,
-- preventing overwrites or deletion of uploaded evidence.
DROP POLICY IF EXISTS "Public can upload receipts to private bucket" ON storage.objects;
CREATE POLICY "Public can upload receipts to private bucket"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
    bucket_id = 'receipts-private'
);

-- Only authenticated club administrator can view/download private receipts
-- Direct public SELECT is completely disabled.
DROP POLICY IF EXISTS "Admin can view private receipts" ON storage.objects;
CREATE POLICY "Admin can view private receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'receipts-private'
    AND auth.jwt() ->> 'email' = 'thepowerpadel@gmail.com'
);
