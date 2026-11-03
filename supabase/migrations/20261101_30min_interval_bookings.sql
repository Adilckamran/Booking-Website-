-- ==============================================================================
-- POWER PADEL ARENA - 30-MINUTE INTERVAL & FLEXIBLE DURATION BOOKINGS MIGRATION
-- Migration Date: 2026-11-01
--
-- PURPOSE:
-- 1. Upgrades booking schema to support flexible 30-minute interval starts (00:00, 00:30, ... 23:30).
-- 2. Upgrades permitted match durations to strictly 60, 90, and 120 minutes.
-- 3. Adds start_at, end_at TIMESTAMPTZ and booking_range TSTZRANGE to public.bookings.
-- 4. Uses PostgreSQL btree_gist extension and GiST range indexing for high-performance interval overlap protection.
-- 5. Upgrades public.create_multi_slot_booking and public.create_manual_booking_secure to support:
--    - 30-minute start times across 24h
--    - Exact segment-by-segment pricing (PKR 1,750 off-peak / PKR 2,000 peak per 30m for Courts 1 & 2; PKR 1,000 per 30m for Court 3)
--    - Fixed PKR 500 advance deposit
--    - Atomic interval overlap check against conflicting active reservations
-- 6. Fully backwards compatible with existing bookings, transactions, and storage paths.
-- ==============================================================================

-- 1. ENABLE EXTENSION
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. ADD RANGE COLUMNS TO BOOKINGS & BOOKING_SLOTS
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS booking_range TSTZRANGE;

ALTER TABLE public.booking_slots ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;
ALTER TABLE public.booking_slots ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;
ALTER TABLE public.booking_slots ADD COLUMN IF NOT EXISTS slot_range TSTZRANGE;

-- 3. BACKFILL EXISTING RECORDS (Pakistan Time UTC+5)
UPDATE public.bookings
SET
    start_at = (date::TEXT || ' ' || start_time || ':00+05:00')::TIMESTAMPTZ,
    end_at = (date::TEXT || ' ' || start_time || ':00+05:00')::TIMESTAMPTZ + (COALESCE(duration_minutes, 60) || ' minutes')::INTERVAL
WHERE start_at IS NULL AND date IS NOT NULL AND start_time IS NOT NULL;

UPDATE public.bookings
SET booking_range = tstzrange(start_at, end_at, '[)')
WHERE booking_range IS NULL AND start_at IS NOT NULL AND end_at IS NOT NULL;

UPDATE public.booking_slots
SET
    start_at = (date::TEXT || ' ' || start_time || ':00+05:00')::TIMESTAMPTZ,
    end_at = (date::TEXT || ' ' || start_time || ':00+05:00')::TIMESTAMPTZ + (COALESCE(duration_minutes, 60) || ' minutes')::INTERVAL
WHERE start_at IS NULL AND date IS NOT NULL AND start_time IS NOT NULL;

UPDATE public.booking_slots
SET slot_range = tstzrange(start_at, end_at, '[)')
WHERE slot_range IS NULL AND start_at IS NOT NULL AND end_at IS NOT NULL;

-- 4. AUTOMATIC RANGE MAINTENANCE TRIGGER
CREATE OR REPLACE FUNCTION public.maintain_booking_range()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.date IS NOT NULL AND NEW.start_time IS NOT NULL THEN
        NEW.start_at := (NEW.date::TEXT || ' ' || NEW.start_time || ':00+05:00')::TIMESTAMPTZ;
        NEW.end_at := NEW.start_at + (COALESCE(NEW.duration_minutes, 60) || ' minutes')::INTERVAL;
        NEW.booking_range := tstzrange(NEW.start_at, NEW.end_at, '[)');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_booking_range ON public.bookings;
CREATE TRIGGER trg_maintain_booking_range
BEFORE INSERT OR UPDATE OF date, start_time, duration_minutes ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.maintain_booking_range();

-- 5. GIST INDEXES FOR RANGE QUERIES
CREATE INDEX IF NOT EXISTS idx_bookings_range ON public.bookings USING gist (booking_range);
CREATE INDEX IF NOT EXISTS idx_bookings_court_range ON public.bookings USING gist (court_id, booking_range);
CREATE INDEX IF NOT EXISTS idx_booking_slots_range ON public.booking_slots USING gist (slot_range);
CREATE INDEX IF NOT EXISTS idx_booking_slots_court_range ON public.booking_slots USING gist (court_id, slot_range);

-- 6. IMMUTABLE HALF-HOUR PRICING HELPER
CREATE OR REPLACE FUNCTION public.calculate_half_hour_rate(
    p_court_id TEXT,
    p_slot_time TEXT
)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_court_id = 'court-3' THEN 1000
        WHEN split_part(p_slot_time, ':', 1)::INT >= 18 OR split_part(p_slot_time, ':', 1)::INT < 6 THEN 2000
        ELSE 1750
    END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_half_hour_rate(TEXT, TEXT) TO anon, authenticated, service_role;

-- 7. END TIME CALCULATION HELPER
CREATE OR REPLACE FUNCTION public.calculate_interval_end_time(
    p_start_time TEXT,
    p_duration_minutes INT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_parts TEXT[];
    v_total_mins INT;
    v_end_mins INT;
    v_end_hour INT;
    v_end_min INT;
BEGIN
    v_parts := string_to_array(p_start_time, ':');
    v_total_mins := (v_parts[1]::INT * 60) + v_parts[2]::INT + p_duration_minutes;
    v_end_mins := v_total_mins % 1440;
    v_end_hour := v_end_mins / 60;
    v_end_min := v_end_mins % 60;
    RETURN lpad(v_end_hour::TEXT, 2, '0') || ':' || lpad(v_end_min::TEXT, 2, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_interval_end_time(TEXT, INT) TO anon, authenticated, service_role;

-- 8. UPDATE ONLINE BOOKING RPC (30-MINUTE INTERVALS & 60/90/120M DURATIONS)
CREATE OR REPLACE FUNCTION public.create_multi_slot_booking(
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
    p_status TEXT DEFAULT 'awaiting_payment',
    p_slots JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking_id UUID;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_candidate_range TSTZRANGE;
    v_computed_total INT := 0;
    v_num_segments INT;
    v_i INT;
    v_seg_mins INT;
    v_seg_hour INT;
    v_seg_min INT;
    v_seg_start_time TEXT;
    v_seg_end_time TEXT;
    v_seg_rate INT;
    v_seg_is_peak BOOLEAN;
    v_canonical_slots JSONB := '[]'::jsonb;
    v_expected_end TEXT;
    v_active_conflict RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Validate court existence
    IF p_court_id NOT IN ('court-1', 'court-2', 'court-3') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid court identifier: ' || COALESCE(p_court_id, 'null') || '. Permitted courts: court-1, court-2, court-3.');
    END IF;

    -- 2. Validate match duration (strictly 60, 90, or 120 minutes)
    IF p_duration_minutes NOT IN (60, 90, 120) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid duration: ' || COALESCE(p_duration_minutes::TEXT, 'null') || ' minutes. Allowed match durations are strictly 60, 90, or 120 minutes.');
    END IF;

    -- 3. Validate start time format (HH:00 or HH:30 across 24h)
    IF p_start_time IS NULL OR p_start_time !~ '^([01][0-9]|2[0-3]):(00|30)$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid start time: ' || COALESCE(p_start_time, 'null') || '. Permitted start times must be at 30-minute intervals (e.g. 19:00, 19:30).');
    END IF;

    -- 4. Validate customer full name
    IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Customer full name must be at least 3 characters.');
    END IF;

    -- 5. Validate customer mobile (strictly 11 digits Pakistani format: 03XXXXXXXXX)
    IF p_customer_phone IS NULL OR p_customer_phone !~ '^03[0-9]{9}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid Pakistani mobile number. Must be exactly 11 digits starting with 03 (e.g. 03162997913).');
    END IF;

    -- 6. Validate initial booking status
    IF p_status NOT IN ('awaiting_payment', 'payment_under_review') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid initial booking status: ' || COALESCE(p_status, 'null') || '. Self-confirmation is prohibited.');
    END IF;

    -- 7. Calculate range timestamps in Asia/Karachi (UTC+5)
    v_start_at := (p_date::TEXT || ' ' || p_start_time || ':00+05:00')::TIMESTAMPTZ;
    v_end_at := v_start_at + (p_duration_minutes || ' minutes')::INTERVAL;
    v_candidate_range := tstzrange(v_start_at, v_end_at, '[)');
    v_expected_end := public.calculate_interval_end_time(p_start_time, p_duration_minutes);

    -- 8. Advisory lock on court to guarantee atomic double-booking protection
    PERFORM pg_advisory_xact_lock(hashtext('ppa_court_' || p_court_id));

    -- Clean up expired holds
    UPDATE public.bookings
    SET status = 'expired', updated_at = v_now
    WHERE court_id = p_court_id
      AND status = 'awaiting_payment'
      AND (held_until <= v_now OR (held_until IS NULL AND created_at <= (v_now - INTERVAL '15 minutes')));

    -- 9. Overlap Conflict Check
    SELECT b.id, b.reference_number, b.status, b.start_time, b.end_time
    INTO v_active_conflict
    FROM public.bookings b
    WHERE b.court_id = p_court_id
      AND b.status IN ('confirmed', 'payment_under_review', 'awaiting_payment')
      AND (
          b.status IN ('confirmed', 'payment_under_review')
          OR (b.status = 'awaiting_payment' AND (b.held_until IS NULL OR b.held_until > v_now))
      )
      AND b.booking_range && v_candidate_range
    LIMIT 1;

    IF v_active_conflict.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'isConflict', true,
            'error', 'The requested match time (' || p_start_time || ' to ' || v_expected_end || ') conflicts with existing reservation ' || v_active_conflict.reference_number || ' (' || v_active_conflict.status || '). Please choose another available start time.'
        );
    END IF;

    -- 10. Generate 30-minute segment pricing breakdown
    v_num_segments := p_duration_minutes / 30;
    FOR v_i IN 0..(v_num_segments - 1)
    LOOP
        v_seg_mins := (split_part(p_start_time, ':', 1)::INT * 60 + split_part(p_start_time, ':', 2)::INT + (v_i * 30)) % 1440;
        v_seg_hour := v_seg_mins / 60;
        v_seg_min := v_seg_mins % 60;
        v_seg_start_time := lpad(v_seg_hour::TEXT, 2, '0') || ':' || lpad(v_seg_min::TEXT, 2, '0');
        v_seg_end_time := public.calculate_interval_end_time(v_seg_start_time, 30);
        v_seg_rate := public.calculate_half_hour_rate(p_court_id, v_seg_start_time);
        v_seg_is_peak := (p_court_id <> 'court-3') AND (v_seg_hour >= 18 OR v_seg_hour < 6);

        v_computed_total := v_computed_total + v_seg_rate;

        v_canonical_slots := v_canonical_slots || jsonb_build_array(
            jsonb_build_object(
                'startTime', v_seg_start_time,
                'endTime', v_seg_end_time,
                'durationMinutes', 30,
                'price', v_seg_rate,
                'isPeak', v_seg_is_peak,
                'label', v_seg_start_time || ' - ' || v_seg_end_time
            )
        );
    END LOOP;

    -- 11. Insert Authoritative Parent Booking Record
    INSERT INTO public.bookings (
        reference_number,
        court_id,
        court_name,
        date,
        start_time,
        end_time,
        start_at,
        end_at,
        booking_range,
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
        slots,
        held_until,
        created_at,
        updated_at
    ) VALUES (
        p_reference_number,
        p_court_id,
        p_court_name,
        p_date,
        p_start_time,
        v_expected_end,
        v_start_at,
        v_end_at,
        v_candidate_range,
        p_duration_minutes,
        v_computed_total,
        500,
        GREATEST(v_computed_total - 500, 0),
        p_status,
        trim(p_customer_name),
        p_customer_phone,
        p_customer_email,
        p_payment_method,
        p_transaction_ref,
        p_receipt_screenshot_url,
        v_canonical_slots,
        CASE WHEN p_status = 'awaiting_payment' THEN (v_now + INTERVAL '15 minutes') ELSE NULL END,
        v_now,
        v_now
    ) RETURNING id INTO v_booking_id;

    -- 12. Create Child Booking Slots for Calendar Compatibility
    INSERT INTO public.booking_slots (
        booking_id,
        court_id,
        date,
        start_time,
        end_time,
        start_at,
        end_at,
        slot_range,
        duration_minutes,
        price,
        is_peak,
        status,
        held_until,
        created_at,
        updated_at
    )
    SELECT
        v_booking_id,
        p_court_id,
        p_date,
        (elem->>'startTime')::TEXT,
        (elem->>'endTime')::TEXT,
        (p_date::TEXT || ' ' || (elem->>'startTime')::TEXT || ':00+05:00')::TIMESTAMPTZ,
        (p_date::TEXT || ' ' || (elem->>'startTime')::TEXT || ':00+05:00')::TIMESTAMPTZ + INTERVAL '30 minutes',
        tstzrange(
            (p_date::TEXT || ' ' || (elem->>'startTime')::TEXT || ':00+05:00')::TIMESTAMPTZ,
            (p_date::TEXT || ' ' || (elem->>'startTime')::TEXT || ':00+05:00')::TIMESTAMPTZ + INTERVAL '30 minutes',
            '[)'
        ),
        30,
        (elem->>'price')::INT,
        (elem->>'isPeak')::BOOLEAN,
        p_status,
        CASE WHEN p_status = 'awaiting_payment' THEN (v_now + INTERVAL '15 minutes') ELSE NULL END,
        v_now,
        v_now
    FROM jsonb_array_elements(v_canonical_slots) AS elem;

    RETURN jsonb_build_object(
        'success', true,
        'bookingId', v_booking_id,
        'referenceNumber', p_reference_number,
        'totalAmount', v_computed_total,
        'advanceRequiredAmount', 500,
        'remainingAmount', GREATEST(v_computed_total - 500, 0),
        'status', p_status,
        'startTime', p_start_time,
        'endTime', v_expected_end,
        'durationMinutes', p_duration_minutes,
        'slots', v_canonical_slots
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_multi_slot_booking(
    TEXT, TEXT, TEXT, DATE, TEXT, TEXT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO anon, authenticated, service_role;

-- 9. UPDATE ADMIN MANUAL BOOKING RPC (30-MINUTE INTERVALS & 60/90/120M DURATIONS)
CREATE OR REPLACE FUNCTION public.create_manual_booking_secure(
    p_court_id TEXT,
    p_date DATE,
    p_start_time TEXT,
    p_duration_minutes INT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_customer_email TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'cash_at_venue',
    p_is_paid BOOLEAN DEFAULT true,
    p_admin_email TEXT DEFAULT 'thepowerpadel@gmail.com'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking_id UUID;
    v_ref TEXT;
    v_random_suffix INT;
    v_court_name TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_candidate_range TSTZRANGE;
    v_initial_status TEXT;
    v_total_amount INT := 0;
    v_advance_amount INT := 0;
    v_remaining_amount INT := 0;
    v_num_segments INT;
    v_i INT;
    v_seg_mins INT;
    v_seg_hour INT;
    v_seg_min INT;
    v_seg_start_time TEXT;
    v_seg_end_time TEXT;
    v_seg_rate INT;
    v_seg_is_peak BOOLEAN;
    v_canonical_slots JSONB := '[]'::jsonb;
    v_expected_end TEXT;
    v_active_conflict RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF lower(p_admin_email) <> 'thepowerpadel@gmail.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only authorized arena administrators can create manual reservations.');
    END IF;

    IF p_court_id NOT IN ('court-1', 'court-2', 'court-3') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid court identifier: ' || COALESCE(p_court_id, 'null') || '.');
    END IF;

    v_court_name := CASE
        WHEN p_court_id = 'court-1' THEN 'Court 1 — Double Court'
        WHEN p_court_id = 'court-2' THEN 'Court 2 — Double Court'
        ELSE 'Court 3 — Single Court'
    END;

    IF p_duration_minutes NOT IN (60, 90, 120) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid duration: ' || COALESCE(p_duration_minutes::TEXT, 'null') || ' minutes. Allowed durations: 60, 90, or 120 minutes.');
    END IF;

    IF p_start_time IS NULL OR p_start_time !~ '^([01][0-9]|2[0-3]):(00|30)$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid start time format. Time must be in 30-minute intervals (e.g. 18:00, 18:30).');
    END IF;

    v_start_at := (p_date::TEXT || ' ' || p_start_time || ':00+05:00')::TIMESTAMPTZ;
    v_end_at := v_start_at + (p_duration_minutes || ' minutes')::INTERVAL;
    v_candidate_range := tstzrange(v_start_at, v_end_at, '[)');
    v_expected_end := public.calculate_interval_end_time(p_start_time, p_duration_minutes);

    -- Advisory lock on court
    PERFORM pg_advisory_xact_lock(hashtext('ppa_court_' || p_court_id));

    -- Clean up expired holds
    UPDATE public.bookings
    SET status = 'expired', updated_at = v_now
    WHERE court_id = p_court_id
      AND status = 'awaiting_payment'
      AND (held_until <= v_now OR (held_until IS NULL AND created_at <= (v_now - INTERVAL '15 minutes')));

    -- Overlap conflict check
    SELECT b.id, b.reference_number, b.status
    INTO v_active_conflict
    FROM public.bookings b
    WHERE b.court_id = p_court_id
      AND b.status IN ('confirmed', 'payment_under_review', 'awaiting_payment')
      AND (
          b.status IN ('confirmed', 'payment_under_review')
          OR (b.status = 'awaiting_payment' AND (b.held_until IS NULL OR b.held_until > v_now))
      )
      AND b.booking_range && v_candidate_range
    LIMIT 1;

    IF v_active_conflict.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'isConflict', true,
            'error', 'Slot Already Booked - This court and time range (' || p_start_time || ' to ' || v_expected_end || ') conflicts with reservation ' || v_active_conflict.reference_number || ' (' || v_active_conflict.status || ').'
        );
    END IF;

    -- Generate segments
    v_num_segments := p_duration_minutes / 30;
    FOR v_i IN 0..(v_num_segments - 1)
    LOOP
        v_seg_mins := (split_part(p_start_time, ':', 1)::INT * 60 + split_part(p_start_time, ':', 2)::INT + (v_i * 30)) % 1440;
        v_seg_hour := v_seg_mins / 60;
        v_seg_min := v_seg_mins % 60;
        v_seg_start_time := lpad(v_seg_hour::TEXT, 2, '0') || ':' || lpad(v_seg_min::TEXT, 2, '0');
        v_seg_end_time := public.calculate_interval_end_time(v_seg_start_time, 30);
        v_seg_rate := public.calculate_half_hour_rate(p_court_id, v_seg_start_time);
        v_seg_is_peak := (p_court_id <> 'court-3') AND (v_seg_hour >= 18 OR v_seg_hour < 6);

        v_total_amount := v_total_amount + v_seg_rate;

        v_canonical_slots := v_canonical_slots || jsonb_build_array(
            jsonb_build_object(
                'startTime', v_seg_start_time,
                'endTime', v_seg_end_time,
                'durationMinutes', 30,
                'price', v_seg_rate,
                'isPeak', v_seg_is_peak,
                'label', v_seg_start_time || ' - ' || v_seg_end_time
            )
        );
    END LOOP;

    v_initial_status := CASE WHEN p_is_paid THEN 'confirmed' ELSE 'awaiting_payment' END;
    v_advance_amount := CASE WHEN p_is_paid THEN v_total_amount ELSE 500 END;
    v_remaining_amount := CASE WHEN p_is_paid THEN 0 ELSE GREATEST(v_total_amount - 500, 0) END;

    v_random_suffix := floor(1000 + random() * 9000)::INT;
    v_ref := 'PPA-MANUAL-' || to_char(p_date, 'YYYYMMDD') || '-' || v_random_suffix::TEXT;

    INSERT INTO public.bookings (
        reference_number,
        court_id,
        court_name,
        date,
        start_time,
        end_time,
        start_at,
        end_at,
        booking_range,
        duration_minutes,
        slots,
        total_amount,
        advance_required_amount,
        remaining_amount,
        status,
        customer_name,
        customer_phone,
        customer_email,
        payment_method,
        held_until,
        created_at,
        updated_at
    ) VALUES (
        v_ref,
        p_court_id,
        v_court_name,
        p_date,
        p_start_time,
        v_expected_end,
        v_start_at,
        v_end_at,
        v_candidate_range,
        p_duration_minutes,
        v_canonical_slots,
        v_total_amount,
        v_advance_amount,
        v_remaining_amount,
        v_initial_status,
        trim(p_customer_name),
        trim(p_customer_phone),
        p_customer_email,
        p_payment_method,
        CASE WHEN p_is_paid THEN NULL ELSE (v_now + INTERVAL '15 minutes') END,
        v_now,
        v_now
    ) RETURNING id INTO v_booking_id;

    INSERT INTO public.booking_slots (
        booking_id,
        court_id,
        date,
        start_time,
        end_time,
        start_at,
        end_at,
        slot_range,
        duration_minutes,
        price,
        is_peak,
        status,
        held_until,
        created_at,
        updated_at
    )
    SELECT
        v_booking_id,
        p_court_id,
        p_date,
        (elem->>'startTime')::TEXT,
        (elem->>'endTime')::TEXT,
        (p_date::TEXT || ' ' || (elem->>'startTime')::TEXT || ':00+05:00')::TIMESTAMPTZ,
        (p_date::TEXT || ' ' || (elem->>'startTime')::TEXT || ':00+05:00')::TIMESTAMPTZ + INTERVAL '30 minutes',
        tstzrange(
            (p_date::TEXT || ' ' || (elem->>'startTime')::TEXT || ':00+05:00')::TIMESTAMPTZ,
            (p_date::TEXT || ' ' || (elem->>'startTime')::TEXT || ':00+05:00')::TIMESTAMPTZ + INTERVAL '30 minutes',
            '[)'
        ),
        30,
        (elem->>'price')::INT,
        (elem->>'isPeak')::BOOLEAN,
        v_initial_status,
        CASE WHEN p_is_paid THEN NULL ELSE (v_now + INTERVAL '15 minutes') END,
        v_now,
        v_now
    FROM jsonb_array_elements(v_canonical_slots) AS elem;

    RETURN jsonb_build_object(
        'success', true,
        'bookingId', v_booking_id,
        'referenceNumber', v_ref,
        'totalAmount', v_total_amount,
        'advanceRequiredAmount', v_advance_amount,
        'remainingAmount', v_remaining_amount,
        'status', v_initial_status,
        'startTime', p_start_time,
        'endTime', v_expected_end,
        'durationMinutes', p_duration_minutes,
        'slots', v_canonical_slots
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_manual_booking_secure(
    TEXT, DATE, TEXT, INT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT
) TO anon, authenticated, service_role;
