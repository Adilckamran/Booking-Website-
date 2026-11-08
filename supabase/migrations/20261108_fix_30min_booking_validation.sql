-- ==============================================================================
-- POWER PADEL ARENA - 30-MINUTE INTERVAL BOOKING VALIDATION UPGRADE
-- Migration Date: 2026-11-08
--
-- PURPOSE:
-- 1. Updates public.create_multi_slot_booking and public.create_multi_slot_booking_secure
--    to support genuine 30-minute interval booking validation:
--    - 60 minutes = exactly 2 consecutive 30-minute intervals
--    - 90 minutes = exactly 3 consecutive 30-minute intervals
--    - 120 minutes = exactly 4 consecutive 30-minute intervals
-- 2. Eliminates legacy 1-hour slot expectations (p_duration_minutes / 60)
-- 3. Enforces strict consecutive interval adjacency across all 24 operating hours
-- 4. Rejects missing, duplicate, overlapping, or non-consecutive intervals
-- 5. Preserves advisory locks, Security Definer, search_path = public, and pricing rules
-- ==============================================================================

-- 1. UPDATE ONLINE BOOKING RPC (30-MINUTE INTERVALS & 60/90/120M DURATIONS)
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
    v_expected_slots INT;
    v_slot_count INT;
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
    v_now TIMESTAMPTZ := clock_timestamp();
    v_slot_elem JSONB;
    v_prev_end TEXT := NULL;
    v_elem_start TEXT;
    v_elem_end TEXT;
BEGIN
    -- 1. Validate court existence
    IF p_court_id NOT IN ('court-1', 'court-2', 'court-3') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid court identifier: ' || COALESCE(p_court_id, 'null') || '. Permitted courts: court-1, court-2, court-3.');
    END IF;

    -- 2. Validate match duration (strictly 60, 90, or 120 minutes)
    IF p_duration_minutes NOT IN (60, 90, 120) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid duration: ' || COALESCE(p_duration_minutes::TEXT, 'null') || ' minutes. Allowed match durations are strictly 60, 90, or 120 minutes.');
    END IF;

    v_expected_slots := p_duration_minutes / 30;

    -- 3. Validate slot array if provided
    IF p_slots IS NOT NULL AND jsonb_typeof(p_slots) = 'array' AND jsonb_array_length(p_slots) > 0 THEN
        v_slot_count := jsonb_array_length(p_slots);
        IF v_slot_count <> v_expected_slots THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'For a ' || p_duration_minutes || '-minute match, exactly ' || v_expected_slots || ' consecutive 30-minute interval(s) must be selected (received ' || v_slot_count || ').'
            );
        END IF;

        -- Validate each slot in p_slots for format and consecutive adjacency
        FOR v_i IN 0..(v_slot_count - 1)
        LOOP
            v_slot_elem := p_slots->v_i;
            v_elem_start := CASE 
                WHEN jsonb_typeof(v_slot_elem) = 'object' THEN v_slot_elem->>'startTime'
                ELSE trim(both '"' from v_slot_elem::TEXT)
            END;

            IF v_elem_start IS NULL OR v_elem_start !~ '^([01][0-9]|2[0-3]):(00|30)$' THEN
                RETURN jsonb_build_object('success', false, 'error', 'Invalid slot time format for interval ' || COALESCE(v_elem_start, 'null') || '. Slots must be on the hour or half-hour (e.g. 19:00, 19:30).');
            END IF;

            IF v_i = 0 THEN
                p_start_time := v_elem_start;
            ELSE
                IF v_elem_start <> v_prev_end THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'Selected intervals must be consecutive on the same court. Interval ' || v_elem_start || ' does not follow ' || v_prev_end || '.'
                    );
                END IF;
            END IF;

            v_prev_end := public.calculate_interval_end_time(v_elem_start, 30);
        END LOOP;
    END IF;

    -- 4. Validate start time format (HH:00 or HH:30 across 24h)
    IF p_start_time IS NULL OR p_start_time !~ '^([01][0-9]|2[0-3]):(00|30)$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid start time: ' || COALESCE(p_start_time, 'null') || '. Permitted start times must be at 30-minute intervals (e.g. 19:00, 19:30).');
    END IF;

    -- 5. Validate customer full name
    IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Customer full name must be at least 3 characters.');
    END IF;

    -- 6. Validate customer mobile (strictly 11 digits Pakistani format: 03XXXXXXXXX)
    IF p_customer_phone IS NULL OR p_customer_phone !~ '^03[0-9]{9}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid Pakistani mobile number. Must be exactly 11 digits starting with 03 (e.g. 03162997913).');
    END IF;

    -- 7. Validate initial booking status
    IF p_status NOT IN ('awaiting_payment', 'payment_under_review') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid initial booking status: ' || COALESCE(p_status, 'null') || '. Self-confirmation is prohibited.');
    END IF;

    -- 8. Calculate range timestamps in Asia/Karachi (UTC+5)
    v_start_at := (p_date::TEXT || ' ' || p_start_time || ':00+05:00')::TIMESTAMPTZ;
    v_end_at := v_start_at + (p_duration_minutes || ' minutes')::INTERVAL;
    v_candidate_range := tstzrange(v_start_at, v_end_at, '[)');
    v_expected_end := public.calculate_interval_end_time(p_start_time, p_duration_minutes);

    -- 9. Advisory locks on court (dual key for full compatibility)
    PERFORM pg_advisory_xact_lock(hashtext('ppa_court_' || p_court_id));
    PERFORM pg_advisory_xact_lock(hashtext('power_padel_booking_' || p_court_id || '_' || p_date::TEXT));

    -- Clean up expired holds
    UPDATE public.bookings
    SET status = 'expired', updated_at = v_now
    WHERE court_id = p_court_id
      AND status = 'awaiting_payment'
      AND (held_until <= v_now OR (held_until IS NULL AND created_at <= (v_now - INTERVAL '15 minutes')));

    -- 10. Overlap Conflict Check
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

    -- 11. Generate 30-minute segment pricing breakdown
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

    -- 12. Insert Authoritative Parent Booking Record
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

    -- 13. Create Child Booking Slots (30-Minute Intervals)
    INSERT INTO public.booking_slots (
        booking_id,
        booking_ref,
        court_id,
        court_name,
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
        p_reference_number,
        p_court_id,
        p_court_name,
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

    -- 14. Insert notification if payment receipt was uploaded
    IF p_receipt_screenshot_url IS NOT NULL AND trim(p_receipt_screenshot_url) <> '' THEN
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
            p_reference_number,
            'receipt_submitted',
            'Payment Screenshot Submitted',
            'Customer ' || trim(p_customer_name) || ' submitted payment receipt for ' || p_court_name || ' on ' || p_date::TEXT || ' (' || p_start_time || ' - ' || v_expected_end || '). TRX: ' || COALESCE(p_transaction_ref, 'N/A') || '. Advance: PKR 500.',
            trim(p_customer_name),
            p_customer_phone,
            500,
            false,
            v_now
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'bookingId', v_booking_id,
        'reference_number', p_reference_number,
        'referenceNumber', p_reference_number,
        'total_amount', v_computed_total,
        'totalAmount', v_computed_total,
        'advance_required_amount', 500,
        'advanceRequiredAmount', 500,
        'remaining_amount', GREATEST(v_computed_total - 500, 0),
        'remainingAmount', GREATEST(v_computed_total - 500, 0),
        'status', p_status,
        'slots', v_canonical_slots
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_multi_slot_booking(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM public;
GRANT EXECUTE ON FUNCTION public.create_multi_slot_booking(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;

-- 2. UPDATE/REPLACE LEGACY create_multi_slot_booking_secure TO FORWARD TO 30-MINUTE RPC
CREATE OR REPLACE FUNCTION public.create_multi_slot_booking_secure(
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
BEGIN
    -- Delegates directly to the authoritative 30-minute procedure
    RETURN public.create_multi_slot_booking(
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
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_payment_method,
        p_transaction_ref,
        p_receipt_screenshot_url,
        p_status,
        p_slots
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_multi_slot_booking_secure(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM public;
GRANT EXECUTE ON FUNCTION public.create_multi_slot_booking_secure(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
