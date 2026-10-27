-- ==============================================================================
-- POWER PADEL ARENA - 24-HOUR OPERATING SCHEDULE MIGRATION
-- Migration Date: 2026-10-27
--
-- PURPOSE:
-- Upgrades the database procedures to support genuine 24-hour operation (00:00 - 24:00):
-- 1. Updates public.operating_slot_minutes to map 24 hours (00:00 = 0 mins to 23:59 = 1439 mins).
-- 2. Updates public.create_multi_slot_booking to permit all 24 hourly slots (00:00 through 23:00).
-- 3. Updates public.create_manual_booking_secure to remove the legacy 02:00 AM closing restriction.
-- 4. Preserves all existing bookings, child slots, RLS policies, and pricing rules:
--    - Court 1 & 2: PKR 3,500 off-peak (06:00-18:00) / PKR 4,000 peak (18:00-06:00).
--    - Court 3: PKR 2,000 fixed throughout all 24 hours.
-- ==============================================================================

-- 1. UPDATE OPERATING SLOT MINUTES (IMMUTABLE HELPER)
CREATE OR REPLACE FUNCTION public.operating_slot_minutes(p_time TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 
    split_part(p_time, ':', 1)::INT * 60 + split_part(p_time, ':', 2)::INT;
$$;

GRANT EXECUTE ON FUNCTION public.operating_slot_minutes(TEXT) TO anon, authenticated, service_role;

-- 2. UPDATE MULTI-SLOT ONLINE BOOKING FUNCTION (24-HOUR SUPPORT)
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
    v_slot JSONB;
    v_slot_start TEXT;
    v_slot_end TEXT;
    v_hour INT;
    v_expected_end TEXT;
    v_slot_price INT;
    v_slot_is_peak BOOLEAN;
    v_computed_total INT := 0;
    v_slot_count INT := 0;
    v_expected_slot_count INT;
    v_first_slot_start TEXT;
    v_first_slot_end TEXT;
    v_last_slot_start TEXT;
    v_last_slot_end TEXT;
    v_first_slot_min INT;
    v_last_slot_min INT;
    v_is_consecutive BOOLEAN;
    v_primary_start TEXT;
    v_primary_end TEXT;
    v_advance_required INT;
    v_remaining_amount INT;
    v_now TIMESTAMPTZ := NOW();
    v_slot_times TEXT[] := '{}';
    v_canonical_slots JSONB := '[]'::jsonb;
    v_active_conflict RECORD;
BEGIN
    -- 1. Validate court existence and naming
    IF p_court_id NOT IN ('court-1', 'court-2', 'court-3') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid court identifier: ' || COALESCE(p_court_id, 'null') || '. Permitted courts: court-1, court-2, court-3.');
    END IF;

    -- 2. Validate match duration (strictly 60, 120, or 180 minutes)
    IF p_duration_minutes NOT IN (60, 120, 180) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid duration: ' || COALESCE(p_duration_minutes::TEXT, 'null') || ' minutes. Allowed match durations are 60, 120, or 180 minutes.');
    END IF;

    v_expected_slot_count := p_duration_minutes / 60;

    -- 3. Validate customer name
    IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Customer full name must be at least 3 characters.');
    END IF;

    -- 4. Validate customer mobile (strictly 11 digits Pakistani format: 03XXXXXXXXX)
    IF p_customer_phone IS NULL OR p_customer_phone !~ '^03[0-9]{9}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid Pakistani mobile number. Must be exactly 11 digits starting with 03 (e.g. 03162997913).');
    END IF;

    -- 5. Validate status parameter (cannot tamper with confirmed status)
    IF p_status NOT IN ('awaiting_payment', 'payment_under_review') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid initial booking status: ' || COALESCE(p_status, 'null') || '. Self-confirmation is prohibited.');
    END IF;

    -- 6. Slot Normalization & Count Check
    IF p_slots IS NULL OR jsonb_array_length(p_slots) = 0 THEN
        IF p_start_time IS NULL OR p_start_time = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'At least one booking time slot must be selected.');
        END IF;
        p_slots := jsonb_build_array(
            jsonb_build_object(
                'startTime', p_start_time,
                'endTime', COALESCE(p_end_time, lpad(((split_part(p_start_time, ':', 1)::INT + 1) % 24)::TEXT, 2, '0') || ':00')
            )
        );
    END IF;

    v_slot_count := jsonb_array_length(p_slots);
    IF v_slot_count <> v_expected_slot_count THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Slot count mismatch: A ' || p_duration_minutes || '-minute match requires exactly ' || v_expected_slot_count || ' one-hour slot(s), but ' || v_slot_count || ' slot(s) were submitted.'
        );
    END IF;

    -- 7. Validate each hourly slot against 24-hour schedule (00:00 to 23:00)
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots)
    LOOP
        v_slot_start := v_slot->>'startTime';
        v_slot_end := v_slot->>'endTime';

        IF v_slot_start IS NULL OR v_slot_start !~ '^([01][0-9]|2[0-3]):00$' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid slot time format for ' || COALESCE(v_slot_start, 'null') || '. Slots must start on the hour (e.g. 09:00, 23:00).');
        END IF;

        v_hour := split_part(v_slot_start, ':', 1)::INT;
        v_expected_end := lpad(((v_hour + 1) % 24)::TEXT, 2, '0') || ':00';
        IF v_slot_end IS NOT NULL AND v_slot_end <> '' AND v_slot_end <> v_expected_end THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid slot end time for ' || v_slot_start || ': expected ' || v_expected_end || ' but received ' || v_slot_end || '.');
        END IF;
        v_slot_end := v_expected_end;

        -- Rate verification:
        -- Court 3: PKR 2,000/hr fixed 24h
        -- Court 1 & 2: PKR 3,500/hr off-peak (06:00 to 18:00), PKR 4,000/hr peak (18:00 to 06:00)
        IF p_court_id = 'court-3' THEN
            v_slot_price := 2000;
            v_slot_is_peak := false;
        ELSIF p_court_id IN ('court-1', 'court-2') THEN
            IF v_hour >= 18 OR v_hour < 6 THEN
                v_slot_price := 4000;
                v_slot_is_peak := true;
            ELSE
                v_slot_price := 3500;
                v_slot_is_peak := false;
            END IF;
        END IF;

        IF v_slot->>'price' IS NOT NULL AND (v_slot->>'price')::INT <> v_slot_price THEN
            RETURN jsonb_build_object('success', false, 'error', 'Price mismatch on slot ' || v_slot_start || ': expected PKR ' || v_slot_price || ' but received PKR ' || (v_slot->>'price') || '.');
        END IF;

        IF v_slot_start = ANY(v_slot_times) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Duplicate slot submitted: ' || v_slot_start || '. Distinct slots are required.');
        END IF;
        v_slot_times := array_append(v_slot_times, v_slot_start);

        v_computed_total := v_computed_total + v_slot_price;

        v_canonical_slots := v_canonical_slots || jsonb_build_array(
            jsonb_build_object(
                'startTime', v_slot_start,
                'endTime', v_slot_end,
                'durationMinutes', 60,
                'price', v_slot_price,
                'label', v_slot_start || ' - ' || v_slot_end,
                'isPeak', v_slot_is_peak
            )
        );
    END LOOP;

    -- 8. Validate totals
    IF p_total_amount IS NOT NULL AND p_total_amount <> v_computed_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'Total amount mismatch: expected PKR ' || v_computed_total || ' but received PKR ' || p_total_amount || '.');
    END IF;

    v_advance_required := 500;
    IF p_advance_required_amount IS NOT NULL AND p_advance_required_amount <> v_advance_required THEN
        RETURN jsonb_build_object('success', false, 'error', 'Advance deposit mismatch: expected PKR 500 but received PKR ' || p_advance_required_amount || '.');
    END IF;

    v_remaining_amount := v_computed_total - v_advance_required;
    IF p_remaining_amount IS NOT NULL AND p_remaining_amount <> v_remaining_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Remaining balance mismatch: expected PKR ' || v_remaining_amount || ' but received PKR ' || p_remaining_amount || '.');
    END IF;

    -- 9. Clean up expired holds for this court and date
    UPDATE public.bookings
    SET status = 'expired', updated_at = v_now
    WHERE court_id = p_court_id
      AND date = p_date
      AND status = 'awaiting_payment'
      AND (
          held_until <= v_now
          OR (held_until IS NULL AND created_at <= (v_now - INTERVAL '60 minutes'))
      );

    -- 10. Check conflicts and overlaps across all requested slots
    PERFORM pg_advisory_xact_lock(hashtext('power_padel_booking_' || p_court_id || '_' || p_date::TEXT));

    FOR v_slot IN SELECT * FROM jsonb_array_elements(v_canonical_slots)
    LOOP
        v_slot_start := v_slot->>'startTime';

        SELECT bs.id, bs.booking_ref, bs.status
        INTO v_active_conflict
        FROM public.booking_slots bs
        WHERE bs.court_id = p_court_id
          AND bs.date = p_date
          AND bs.start_time = v_slot_start
          AND bs.status IN ('awaiting_payment', 'payment_under_review', 'confirmed')
          AND (
              bs.status IN ('payment_under_review', 'confirmed')
              OR (bs.status = 'awaiting_payment' AND (bs.held_until IS NULL OR bs.held_until > v_now))
          )
        LIMIT 1;

        IF v_active_conflict.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'is_conflict', true,
                'error', 'Slot ' || v_slot_start || ' on ' || p_date::TEXT || ' is already reserved by another customer (' || v_active_conflict.status || ').'
            );
        END IF;
    END LOOP;

    -- 11. Determine primary start and end times
    SELECT 
        s->>'startTime',
        s->>'endTime',
        public.operating_slot_minutes(s->>'startTime')
    INTO 
        v_first_slot_start,
        v_first_slot_end,
        v_first_slot_min
    FROM jsonb_array_elements(v_canonical_slots) s
    ORDER BY public.operating_slot_minutes(s->>'startTime') ASC
    LIMIT 1;

    SELECT 
        s->>'startTime',
        s->>'endTime',
        public.operating_slot_minutes(s->>'startTime')
    INTO 
        v_last_slot_start,
        v_last_slot_end,
        v_last_slot_min
    FROM jsonb_array_elements(v_canonical_slots) s
    ORDER BY public.operating_slot_minutes(s->>'startTime') DESC
    LIMIT 1;

    v_is_consecutive := ((v_last_slot_min - v_first_slot_min) = (v_slot_count - 1) * 60);

    IF v_is_consecutive THEN
        v_primary_start := v_first_slot_start;
        v_primary_end := v_last_slot_end;
    ELSE
        v_primary_start := v_first_slot_start;
        v_primary_end := v_first_slot_end;
    END IF;

    -- 12. Insert Parent Booking
    BEGIN
        INSERT INTO public.bookings (
            reference_number,
            court_id,
            court_name,
            date,
            start_time,
            end_time,
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
            transaction_ref,
            receipt_screenshot_url,
            held_until,
            created_at,
            updated_at
        ) VALUES (
            p_reference_number,
            p_court_id,
            p_court_name,
            p_date,
            v_primary_start,
            v_primary_end,
            p_duration_minutes,
            v_canonical_slots,
            v_computed_total,
            v_advance_required,
            v_remaining_amount,
            p_status,
            p_customer_name,
            p_customer_phone,
            nullif(trim(p_customer_email), ''),
            nullif(trim(p_payment_method), ''),
            nullif(trim(p_transaction_ref), ''),
            nullif(trim(p_receipt_screenshot_url), ''),
            CASE WHEN p_status = 'awaiting_payment' THEN v_now + INTERVAL '60 minutes' ELSE NULL END,
            v_now,
            v_now
        )
        RETURNING id INTO v_booking_id;
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Booking reference collision: Reference number ' || p_reference_number || ' already in use. Please submit your request again.'
        );
    END;

    -- 13. Insert child slots
    FOR v_slot IN SELECT * FROM jsonb_array_elements(v_canonical_slots)
    LOOP
        v_slot_start := v_slot->>'startTime';
        v_slot_end := v_slot->>'endTime';
        v_slot_price := (v_slot->>'price')::INT;
        v_slot_is_peak := (v_slot->>'isPeak')::BOOLEAN;

        INSERT INTO public.booking_slots (
            booking_id,
            booking_ref,
            court_id,
            court_name,
            date,
            start_time,
            end_time,
            duration_minutes,
            price,
            is_peak,
            status,
            held_until,
            created_at,
            updated_at
        ) VALUES (
            v_booking_id,
            p_reference_number,
            p_court_id,
            p_court_name,
            p_date,
            v_slot_start,
            v_slot_end,
            60,
            v_slot_price,
            v_slot_is_peak,
            p_status,
            CASE WHEN p_status = 'awaiting_payment' THEN v_now + INTERVAL '60 minutes' ELSE NULL END,
            v_now,
            v_now
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'reference_number', p_reference_number,
        'court_id', p_court_id,
        'court_name', p_court_name,
        'date', p_date,
        'start_time', v_primary_start,
        'end_time', v_primary_end,
        'duration_minutes', p_duration_minutes,
        'total_amount', v_computed_total,
        'advance_required_amount', v_advance_required,
        'remaining_amount', v_remaining_amount,
        'status', p_status,
        'slots_count', v_slot_count,
        'is_consecutive', v_is_consecutive,
        'slots', v_canonical_slots
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_multi_slot_booking(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
TO anon, authenticated, service_role;

-- 3. UPDATE MANUAL DESK BOOKING FUNCTION (24-HOUR SUPPORT)
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
    v_court_type TEXT;
    v_initial_status TEXT;
    v_total_amount INT := 0;
    v_advance_amount INT := 0;
    v_remaining_amount INT := 0;
    v_hour INT;
    v_slot_count INT;
    v_slot_price INT;
    v_slot_is_peak BOOLEAN;
    v_now TIMESTAMPTZ := NOW();
    v_canonical_slots JSONB := '[]'::jsonb;
    v_i INT;
    v_cur_start TEXT;
    v_cur_end TEXT;
    v_final_end TEXT;
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
    v_court_type := CASE WHEN p_court_id = 'court-3' THEN 'single' ELSE 'double' END;

    IF p_duration_minutes NOT IN (60, 120, 180) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid duration: ' || COALESCE(p_duration_minutes::TEXT, 'null') || ' minutes.');
    END IF;

    v_slot_count := p_duration_minutes / 60;

    IF p_start_time IS NULL OR p_start_time !~ '^([01][0-9]|2[0-3]):00$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid start time format. Time must start on the hour (e.g. 18:00, 02:00).');
    END IF;

    -- Advisory lock on court and date
    PERFORM pg_advisory_xact_lock(hashtext('power_padel_booking_' || p_court_id || '_' || p_date::TEXT));

    -- Clean up expired temporary holds
    UPDATE public.bookings
    SET status = 'expired', updated_at = v_now
    WHERE court_id = p_court_id
      AND date = p_date
      AND status = 'awaiting_payment'
      AND (held_until <= v_now OR (held_until IS NULL AND created_at <= (v_now - INTERVAL '60 minutes')));

    -- Generate canonical segments for manual continuous duration
    FOR v_i IN 0..(v_slot_count - 1)
    LOOP
        v_hour := (split_part(p_start_time, ':', 1)::INT + v_i) % 24;
        v_cur_start := lpad(v_hour::TEXT, 2, '0') || ':00';
        v_cur_end := lpad(((v_hour + 1) % 24)::TEXT, 2, '0') || ':00';

        IF p_court_id = 'court-3' THEN
            v_slot_price := 2000;
            v_slot_is_peak := false;
        ELSE
            IF v_hour >= 18 OR v_hour < 6 THEN
                v_slot_price := 4000;
                v_slot_is_peak := true;
            ELSE
                v_slot_price := 3500;
                v_slot_is_peak := false;
            END IF;
        END IF;

        v_total_amount := v_total_amount + v_slot_price;

        -- Conflict check
        IF EXISTS (
            SELECT 1 FROM public.booking_slots bs
            WHERE bs.court_id = p_court_id
              AND bs.date = p_date
              AND bs.start_time = v_cur_start
              AND bs.status IN ('awaiting_payment', 'payment_under_review', 'confirmed')
              AND (bs.status IN ('payment_under_review', 'confirmed') OR (bs.status = 'awaiting_payment' AND (bs.held_until IS NULL OR bs.held_until > v_now)))
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Slot ' || v_cur_start || ' is already booked or reserved on ' || p_date::TEXT || '.'
            );
        END IF;

        v_canonical_slots := v_canonical_slots || jsonb_build_array(
            jsonb_build_object(
                'startTime', v_cur_start,
                'endTime', v_cur_end,
                'durationMinutes', 60,
                'price', v_slot_price,
                'label', v_cur_start || ' - ' || v_cur_end,
                'isPeak', v_slot_is_peak
            )
        );
    END LOOP;

    v_final_end := lpad(((split_part(p_start_time, ':', 1)::INT + v_slot_count) % 24)::TEXT, 2, '0') || ':00';
    v_initial_status := CASE WHEN p_is_paid THEN 'confirmed' ELSE 'awaiting_payment' END;
    v_advance_amount := CASE WHEN p_is_paid THEN v_total_amount ELSE 500 END;
    v_remaining_amount := CASE WHEN p_is_paid THEN 0 ELSE (v_total_amount - 500) END;

    -- Generate reference number
    v_random_suffix := floor(1000 + random() * 9000)::INT;
    v_ref := 'PPA-MANUAL-' || to_char(p_date, 'YYYYMMDD') || '-' || v_random_suffix::TEXT;

    INSERT INTO public.bookings (
        reference_number,
        court_id,
        court_name,
        date,
        start_time,
        end_time,
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
        transaction_ref,
        held_until,
        created_at,
        updated_at
    ) VALUES (
        v_ref,
        p_court_id,
        v_court_name,
        p_date,
        p_start_time,
        v_final_end,
        p_duration_minutes,
        v_canonical_slots,
        v_total_amount,
        v_advance_amount,
        v_remaining_amount,
        v_initial_status,
        trim(p_customer_name),
        trim(p_customer_phone),
        nullif(trim(p_customer_email), ''),
        p_payment_method,
        CASE WHEN p_is_paid THEN 'CASH-COUNTER-DESK' ELSE NULL END,
        CASE WHEN p_is_paid THEN NULL ELSE v_now + INTERVAL '60 minutes' END,
        v_now,
        v_now
    ) RETURNING id INTO v_booking_id;

    -- Insert child slots
    FOR v_i IN 0..(jsonb_array_length(v_canonical_slots) - 1)
    LOOP
        v_cur_start := (v_canonical_slots->v_i)->>'startTime';
        v_cur_end := (v_canonical_slots->v_i)->>'endTime';
        v_slot_price := ((v_canonical_slots->v_i)->>'price')::INT;
        v_slot_is_peak := ((v_canonical_slots->v_i)->>'isPeak')::BOOLEAN;

        INSERT INTO public.booking_slots (
            booking_id,
            booking_ref,
            court_id,
            court_name,
            date,
            start_time,
            end_time,
            duration_minutes,
            price,
            is_peak,
            status,
            held_until,
            created_at,
            updated_at
        ) VALUES (
            v_booking_id,
            v_ref,
            p_court_id,
            v_court_name,
            p_date,
            v_cur_start,
            v_cur_end,
            60,
            v_slot_price,
            v_slot_is_peak,
            v_initial_status,
            CASE WHEN p_is_paid THEN NULL ELSE v_now + INTERVAL '60 minutes' END,
            v_now,
            v_now
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'reference_number', v_ref,
        'court_id', p_court_id,
        'court_name', v_court_name,
        'date', p_date,
        'start_time', p_start_time,
        'end_time', v_final_end,
        'duration_minutes', p_duration_minutes,
        'total_amount', v_total_amount,
        'advance_required_amount', v_advance_amount,
        'remaining_amount', v_remaining_amount,
        'status', v_initial_status,
        'slots', v_canonical_slots
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_manual_booking_secure(TEXT, DATE, TEXT, INT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT)
TO anon, authenticated, service_role;
