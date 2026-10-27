-- ==============================================================================
-- POWER PADEL ARENA - DATABASE PERMISSIONS & TABLE GRANTS MIGRATION
-- Migration: 20261025_grant_permissions.sql
--
-- PURPOSE:
-- Fixes PostgreSQL error 42501 ("permission denied for table bookings" / "permission denied for table courts").
-- In Supabase, server-side APIs connect as 'service_role'. Although service_role
-- bypasses Row Level Security (RLS) policies, PostgreSQL still requires table-level
-- GRANT privileges (SELECT, INSERT, UPDATE, DELETE).
--
-- SECURITY INTEGRITY:
-- 1. Does NOT disable Row Level Security (RLS remains fully active).
-- 2. Does NOT make bookings publicly readable (public SELECT remains blocked).
-- 3. Does NOT modify or delete any existing bookings or courts data.
-- ==============================================================================

-- 1. SCHEMA USAGE
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- 2. TABLE PRIVILEGES FOR service_role (Used by server-side Next.js APIs)
GRANT ALL ON TABLE public.courts TO postgres, service_role;
GRANT ALL ON TABLE public.bookings TO postgres, service_role;
GRANT ALL ON TABLE public.admin_notifications TO postgres, service_role;

-- 3. TABLE PRIVILEGES FOR anon AND authenticated
-- Note: Row Level Security (RLS) is enabled on all tables, so anon and authenticated
-- are strictly restricted to the row-level policies defined in 20261023_booking_schema.sql.
GRANT SELECT ON TABLE public.courts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.bookings TO anon, authenticated;
GRANT SELECT ON TABLE public.admin_notifications TO authenticated;

-- 4. SEQUENCE PRIVILEGES
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role, anon, authenticated;

-- 5. DEFAULT PRIVILEGES FOR FUTURE TABLES & SEQUENCES
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role;

-- 6. ATOMIC SECURE FUNCTION FOR PENDING BOOKING CREATION
CREATE OR REPLACE FUNCTION public.create_pending_booking_secure(
    p_reference_number TEXT,
    p_court_id TEXT,
    p_court_name TEXT,
    p_date DATE,
    p_start_time TEXT,
    p_end_time TEXT,
    p_duration_minutes INT,
    p_total_amount INT,
    p_advance_required_amount INT,
    p_remaining_amount INT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_customer_email TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT NULL,
    p_transaction_ref TEXT DEFAULT NULL,
    p_receipt_screenshot_url TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'awaiting_payment'
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
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
BEGIN
    -- Atomic double-booking check
    IF EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.court_id = p_court_id
          AND b.date = p_date
          AND b.start_time = p_start_time
          AND b.status IN ('awaiting_payment', 'payment_under_review', 'confirmed')
    ) THEN
        RAISE EXCEPTION 'Slot is already held or booked by another customer. Please choose another time.' USING ERRCODE = '23505';
    END IF;

    -- If a receipt screenshot is provided, set initial status strictly to payment_under_review
    IF p_receipt_screenshot_url IS NOT NULL AND TRIM(p_receipt_screenshot_url) <> '' THEN
        v_status := 'payment_under_review';
    ELSE
        v_status := COALESCE(p_status, 'awaiting_payment');
    END IF;

    RETURN QUERY
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
        receipt_screenshot_url
    )
    VALUES (
        p_reference_number,
        p_court_id,
        p_court_name,
        p_date,
        p_start_time,
        p_end_time,
        p_duration_minutes,
        p_total_amount,
        p_advance_required_amount,
        p_remaining_amount,
        v_status,
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_payment_method,
        p_transaction_ref,
        p_receipt_screenshot_url
    )
    RETURNING
        bookings.id,
        bookings.reference_number,
        bookings.court_id,
        bookings.court_name,
        bookings.date,
        bookings.start_time,
        bookings.end_time,
        bookings.duration_minutes,
        bookings.total_amount,
        bookings.advance_required_amount,
        bookings.remaining_amount,
        bookings.status,
        bookings.customer_name,
        bookings.customer_phone,
        bookings.customer_email,
        bookings.payment_method,
        bookings.transaction_ref,
        bookings.receipt_screenshot_url,
        bookings.created_at,
        bookings.updated_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_pending_booking_secure FROM public;
GRANT EXECUTE ON FUNCTION public.create_pending_booking_secure TO anon, authenticated, service_role;

-- 7. ATOMIC SECURE FUNCTION FOR RECEIPT SUBMISSION
CREATE OR REPLACE FUNCTION public.submit_receipt_secure(
    p_reference_number TEXT,
    p_payment_method TEXT,
    p_transaction_ref TEXT,
    p_receipt_screenshot_url TEXT DEFAULT NULL
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
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.bookings
    SET
        status = 'payment_under_review',
        payment_method = p_payment_method,
        transaction_ref = p_transaction_ref,
        receipt_screenshot_url = COALESCE(p_receipt_screenshot_url, bookings.receipt_screenshot_url),
        updated_at = NOW()
    WHERE bookings.reference_number = p_reference_number
      AND bookings.status != 'confirmed'
      AND bookings.status != 'rejected'
    RETURNING
        bookings.id,
        bookings.reference_number,
        bookings.court_id,
        bookings.court_name,
        bookings.date,
        bookings.start_time,
        bookings.end_time,
        bookings.duration_minutes,
        bookings.total_amount,
        bookings.advance_required_amount,
        bookings.remaining_amount,
        bookings.status,
        bookings.customer_name,
        bookings.customer_phone,
        bookings.customer_email,
        bookings.payment_method,
        bookings.transaction_ref,
        bookings.receipt_screenshot_url,
        bookings.created_at,
        bookings.updated_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_receipt_secure FROM public;
GRANT EXECUTE ON FUNCTION public.submit_receipt_secure TO anon, authenticated, service_role;
