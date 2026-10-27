-- ==============================================================================
-- POWER PADEL ARENA — MANUAL BOOKING & LIVE SLOT AVAILABILITY UPDATE
-- File: supabase/migrations/20261026_manual_booking_and_slot_status.sql
--
-- PURPOSE:
-- 1. Helper function to compute continuous 24-hour club schedule minutes (06:00 AM to 05:59 AM).
-- 2. Update get_active_court_slots to automatically exclude expired temporary holds.
-- 3. Atomic create_manual_booking procedure with advisory lock, overlap check, and admin authorization.
--
-- SAFETY ASSURANCES:
-- 1. Non-destructive: No tables, columns, or existing booking records are dropped or reset.
-- 2. Preserves valid bookings: Confirmed and payment_under_review bookings are strictly protected.
-- 3. Drop & recreate get_active_court_slots prevents PostgreSQL return-type mismatch error.
-- ==============================================================================

-- ==============================================================================
-- 1. HELPER FUNCTION: OPERATING SLOT MINUTES
--    Monotonically maps 24-hour club operating hours starting at 06:00 AM (0 mins)
--    to 05:59 AM next morning (1439 mins).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.operating_slot_minutes(p_time TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN split_part(p_time, ':', 1)::INT >= 6 
    THEN (split_part(p_time, ':', 1)::INT - 6) * 60 + split_part(p_time, ':', 2)::INT
    ELSE (split_part(p_time, ':', 1)::INT + 18) * 60 + split_part(p_time, ':', 2)::INT
  END;
$$;

GRANT EXECUTE ON FUNCTION public.operating_slot_minutes(TEXT) TO anon, authenticated, service_role;

-- ==============================================================================
-- 2. UPDATE get_active_court_slots TO EXCLUDE EXPIRED HOLDS AUTOMATICALLY
--    A temporary hold in 'awaiting_payment' older than 30 mins no longer blocks
--    public slot availability.
--    NOTE: We DROP first to ensure clean replacement without PostgreSQL return type conflicts.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.get_active_court_slots(TEXT, DATE);

CREATE OR REPLACE FUNCTION public.get_active_court_slots(
    p_court_id TEXT,
    p_date DATE
)
RETURNS TABLE (
    start_time TEXT,
    end_time TEXT,
    duration_minutes INT,
    status TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.start_time,
        b.end_time,
        COALESCE(b.duration_minutes, 60) AS duration_minutes,
        b.status,
        b.created_at
    FROM public.bookings b
    WHERE b.court_id = p_court_id
      AND b.date = p_date
      AND (
          b.status IN ('payment_under_review', 'confirmed')
          OR (
              b.status = 'awaiting_payment'
              AND (
                  (b.held_until IS NOT NULL AND b.held_until > timezone('utc'::text, now()))
                  OR (b.held_until IS NULL AND b.created_at > timezone('utc'::text, now()) - interval '30 minutes')
              )
          )
      );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_court_slots(TEXT, DATE) FROM public;
GRANT EXECUTE ON FUNCTION public.get_active_court_slots(TEXT, DATE) TO anon, authenticated, service_role;

-- ==============================================================================
-- 3. ATOMIC MANUAL BOOKING STORED PROCEDURE WITH CONCURRENCY ADVISORY LOCK
--    Prevents double bookings across multiple admins or overlapping web submissions.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_manual_booking(
    p_court_id TEXT,
    p_court_name TEXT,
    p_date DATE,
    p_start_time TEXT,
    p_end_time TEXT,
    p_duration_minutes INT,
    p_total_amount INT,
    p_advance_amount INT,
    p_remaining_amount INT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_customer_email TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'cash_at_venue',
    p_is_paid BOOLEAN DEFAULT true,
    p_admin_email TEXT DEFAULT 'thepowerpadel@gmail.com',
    p_reference_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_jwt_email TEXT;
    v_effective_admin TEXT;
    v_req_start_min INT;
    v_req_end_min INT;
    v_conflicting_ref TEXT;
    v_conflicting_status TEXT;
    v_new_ref TEXT;
    v_booking_id UUID;
    v_status TEXT;
    v_now TIMESTAMPTZ;
BEGIN
    v_now := timezone('utc'::text, now());
    v_caller_role := auth.role();
    v_jwt_email := auth.jwt() ->> 'email';

    -- 1. Security Authorization Guard:
    -- Caller must be service_role or authenticated club administrator (thepowerpadel@gmail.com)
    IF v_caller_role <> 'service_role' THEN
        IF v_jwt_email IS NULL OR lower(v_jwt_email) <> 'thepowerpadel@gmail.com' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Unauthorized: Caller is not an authorized administrator.'
            );
        END IF;
        v_effective_admin := v_jwt_email;
    ELSE
        v_effective_admin := COALESCE(p_admin_email, 'thepowerpadel@gmail.com');
    END IF;

    -- 2. Acquire transaction-level advisory lock on court + date to serialize concurrent bookings
    PERFORM pg_advisory_xact_lock(hashtext('manual_booking_' || p_court_id || '_' || p_date::TEXT));

    -- 3. Mark any expired holds as 'expired' to clean up table state for this court and date
    UPDATE public.bookings
    SET status = 'expired',
        updated_at = v_now
    WHERE court_id = p_court_id
      AND date = p_date
      AND status = 'awaiting_payment'
      AND (
          (held_until IS NOT NULL AND held_until <= v_now)
          OR (held_until IS NULL AND created_at <= v_now - interval '30 minutes')
      );

    -- 4. Calculate requested operating minute span
    v_req_start_min := public.operating_slot_minutes(p_start_time);
    v_req_end_min := v_req_start_min + p_duration_minutes;

    -- 5. Check for overlapping active bookings on the same court and date
    -- Overlap formula: GREATEST(start1, start2) < LEAST(end1, end2)
    -- Adjacent bookings (e.g. 13:00-14:00 and 14:00-15:00) share boundaries and do NOT overlap!
    SELECT b.reference_number, b.status INTO v_conflicting_ref, v_conflicting_status
    FROM public.bookings b
    WHERE b.court_id = p_court_id
      AND b.date = p_date
      AND b.status IN ('awaiting_payment', 'payment_under_review', 'confirmed')
      AND (
          GREATEST(v_req_start_min, public.operating_slot_minutes(b.start_time)) < 
          LEAST(v_req_end_min, public.operating_slot_minutes(b.start_time) + COALESCE(b.duration_minutes, 60))
      )
    LIMIT 1;

    IF v_conflicting_ref IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Slot Already Booked — This court and time slot is already reserved or booked. Please select another available slot.',
            'conflictingRef', v_conflicting_ref,
            'conflictingStatus', v_conflicting_status
        );
    END IF;

    -- 6. Prepare reference number and status
    IF p_reference_number IS NOT NULL AND trim(p_reference_number) <> '' THEN
        v_new_ref := p_reference_number;
    ELSE
        v_new_ref := 'PPA-PK-2026-' || (1000 + floor(random() * 9000)::INT)::TEXT;
    END IF;

    IF p_is_paid THEN
        v_status := 'confirmed';
    ELSE
        v_status := 'awaiting_payment';
    END IF;

    -- 7. Insert manual booking record
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
        held_until,
        approved_at,
        approved_by,
        created_at,
        updated_at
    ) VALUES (
        v_new_ref,
        p_court_id,
        p_court_name,
        p_date,
        p_start_time,
        p_end_time,
        p_duration_minutes,
        p_total_amount,
        p_advance_amount,
        p_remaining_amount,
        v_status,
        trim(p_customer_name),
        trim(p_customer_phone),
        trim(p_customer_email),
        p_payment_method,
        CASE WHEN p_is_paid THEN 'CASH-COUNTER-DESK' ELSE NULL END,
        CASE WHEN NOT p_is_paid THEN v_now + interval '30 minutes' ELSE NULL END,
        CASE WHEN p_is_paid THEN v_now ELSE NULL END,
        CASE WHEN p_is_paid THEN v_effective_admin ELSE NULL END,
        v_now,
        v_now
    )
    RETURNING id INTO v_booking_id;

    -- 8. Insert admin notification
    INSERT INTO public.admin_notifications (
        booking_ref,
        type,
        title,
        message,
        customer_name,
        customer_phone,
        advance_amount,
        is_read,
        created_at
    ) VALUES (
        v_new_ref,
        CASE WHEN p_is_paid THEN 'booking_confirmed' ELSE 'slot_held' END,
        CASE WHEN p_is_paid THEN 'Manual Booking (Confirmed)' ELSE 'Manual Booking (Awaiting Cash)' END,
        'Desk booking created by ' || v_effective_admin || ' for ' || p_customer_name || ' (' || p_court_name || ', ' || p_date || ' ' || p_start_time || ').',
        p_customer_name,
        p_customer_phone,
        p_advance_amount,
        true,
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Manual booking created successfully.',
        'booking', jsonb_build_object(
            'id', v_booking_id,
            'referenceNumber', v_new_ref,
            'courtId', p_court_id,
            'courtName', p_court_name,
            'date', p_date,
            'startTime', p_start_time,
            'endTime', p_end_time,
            'durationMinutes', p_duration_minutes,
            'totalAmount', p_total_amount,
            'advanceRequiredAmount', p_advance_amount,
            'remainingAmount', p_remaining_amount,
            'status', v_status,
            'customerName', p_customer_name,
            'customerPhone', p_customer_phone,
            'customerEmail', p_customer_email,
            'paymentMethod', p_payment_method,
            'transactionRef', CASE WHEN p_is_paid THEN 'CASH-COUNTER-DESK' ELSE NULL END,
            'createdAt', v_now,
            'updatedAt', v_now,
            'isDemo', false
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_booking FROM public;
REVOKE EXECUTE ON FUNCTION public.create_manual_booking FROM anon;
GRANT EXECUTE ON FUNCTION public.create_manual_booking TO authenticated, service_role;
