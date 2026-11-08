-- Migration: 20261107_serialize_booking_approvals.sql
-- Description: Concurrency fix for approve_booking_and_lock_slot PostgreSQL function.
-- Adds transaction-level PostgreSQL advisory locking (pg_advisory_xact_lock) on court_id
-- to serialize concurrent approval attempts and prevent double-booking race conditions
-- between overlapping pending/under-review bookings on the same court.

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
    v_target_court_id TEXT;
    v_target_date DATE;
    v_booking RECORD;
    v_target_range TSTZRANGE;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_conflicting_confirmed_ref TEXT;
    v_caller_role TEXT;
    v_jwt_email TEXT;
    v_effective_admin TEXT;
    v_now TIMESTAMPTZ;
BEGIN
    -- 1. Security Guard: Caller must be service_role or the verified club admin
    v_caller_role := auth.role();
    v_jwt_email := auth.jwt() ->> 'email';

    IF v_caller_role IS DISTINCT FROM 'service_role' THEN
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

    -- 2. Lookup court_id and date for initial lock acquisition
    SELECT court_id, date
    INTO v_target_court_id, v_target_date
    FROM public.bookings
    WHERE reference_number = p_booking_ref;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
    END IF;

    -- 3. Acquire transaction-level advisory locks to serialize court transactions
    -- Lock A (Court-level): Serializes all approvals, online bookings, and manual bookings for this court
    PERFORM pg_advisory_xact_lock(hashtext('ppa_court_' || v_target_court_id));

    -- Lock B (Court+Date legacy compatibility): Guarantees serialization with legacy booking RPCs
    IF v_target_date IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('power_padel_booking_' || v_target_court_id || '_' || v_target_date::TEXT));
    END IF;

    -- 4. Transaction-safe wall-clock timestamp evaluated after acquiring lock
    v_now := clock_timestamp();

    -- 5. Re-select target booking with row-level lock (FOR UPDATE) to get latest committed row state
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE reference_number = p_booking_ref
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
    END IF;

    -- 6. Status and Eligibility Validations
    -- Idempotent approval
    IF v_booking.status = 'confirmed' THEN
        RETURN jsonb_build_object(
            'success', true, 
            'message', 'Booking is already confirmed',
            'reference_number', p_booking_ref
        );
    END IF;

    -- Rejection cannot be undone via approval
    IF v_booking.status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Cannot approve a rejected booking. Slot was already released.'
        );
    END IF;

    -- Expired booking cannot be approved
    IF v_booking.status = 'expired' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Cannot approve an expired booking. Slot was already released.'
        );
    END IF;

    -- Cancelled booking cannot be approved
    IF v_booking.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Cannot approve a cancelled booking.'
        );
    END IF;

    -- Awaiting payment: check if temporary hold has expired
    IF v_booking.status = 'awaiting_payment' THEN
        IF (v_booking.held_until IS NOT NULL AND v_booking.held_until <= v_now)
           OR (v_booking.held_until IS NULL AND v_booking.created_at <= (v_now - INTERVAL '60 minutes')) THEN
            UPDATE public.bookings
            SET status = 'expired', updated_at = v_now
            WHERE reference_number = p_booking_ref;

            RETURN jsonb_build_object(
                'success', false, 
                'error', 'Cannot approve booking: temporary hold has expired.'
            );
        END IF;
    END IF;

    -- Allowed active statuses for approval are payment_under_review and active awaiting_payment
    IF v_booking.status NOT IN ('payment_under_review', 'awaiting_payment') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Cannot approve booking with status: ' || COALESCE(v_booking.status, 'null')
        );
    END IF;

    -- 7. Compute target range with fallback for legacy/unmigrated records
    IF v_booking.booking_range IS NOT NULL THEN
        v_target_range := v_booking.booking_range;
    ELSIF v_booking.start_at IS NOT NULL AND v_booking.end_at IS NOT NULL THEN
        v_target_range := tstzrange(v_booking.start_at, v_booking.end_at, '[)');
    ELSIF v_booking.date IS NOT NULL AND v_booking.start_time IS NOT NULL THEN
        v_start_at := (v_booking.date::TEXT || ' ' || (CASE WHEN length(v_booking.start_time) = 5 THEN v_booking.start_time || ':00' ELSE v_booking.start_time END) || '+05:00')::TIMESTAMPTZ;
        v_end_at := v_start_at + (COALESCE(v_booking.duration_minutes, 60) || ' minutes')::INTERVAL;
        v_target_range := tstzrange(v_start_at, v_end_at, '[)');
    ELSE
        v_target_range := NULL;
    END IF;

    -- Safety validation: Prevent approval if the target booking has neither a valid parent range NOR usable child slot records
    IF v_target_range IS NULL AND NOT EXISTS (
        SELECT 1 FROM public.booking_slots bs
        WHERE bs.booking_ref = p_booking_ref
          AND (
              bs.slot_range IS NOT NULL 
              OR (bs.date IS NOT NULL AND bs.start_time IS NOT NULL)
          )
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot approve booking: Unable to establish a valid booking time range or usable slot interval records.'
        );
    END IF;

    -- 8. Overlap Conflict Check
    -- Serialized under advisory lock: checks both parent booking ranges and child booking slots.
    -- Dynamically constructs half-open [) tstzrange on the fly whenever slot_range is NULL,
    -- guaranteeing reliable conflict detection across 30-min intervals, different durations, and non-consecutive slots.
    SELECT b_other.reference_number INTO v_conflicting_confirmed_ref
    FROM public.bookings b_other
    WHERE b_other.court_id = v_booking.court_id
      AND b_other.status = 'confirmed'
      AND b_other.reference_number <> p_booking_ref
      AND (
          -- Check 1: Target parent range vs confirmed parent range
          (
              v_target_range IS NOT NULL 
              AND (
                  (b_other.booking_range IS NOT NULL AND b_other.booking_range && v_target_range)
                  OR (
                      b_other.booking_range IS NULL 
                      AND b_other.start_at IS NOT NULL 
                      AND b_other.end_at IS NOT NULL 
                      AND tstzrange(b_other.start_at, b_other.end_at, '[)') && v_target_range
                  )
                  OR (
                      b_other.booking_range IS NULL 
                      AND b_other.start_at IS NULL 
                      AND b_other.date IS NOT NULL 
                      AND b_other.start_time IS NOT NULL 
                      AND tstzrange(
                          (b_other.date::TEXT || ' ' || (CASE WHEN length(b_other.start_time) = 5 THEN b_other.start_time || ':00' ELSE b_other.start_time END) || '+05:00')::TIMESTAMPTZ,
                          (b_other.date::TEXT || ' ' || (CASE WHEN length(b_other.start_time) = 5 THEN b_other.start_time || ':00' ELSE b_other.start_time END) || '+05:00')::TIMESTAMPTZ + (COALESCE(b_other.duration_minutes, 60) || ' minutes')::INTERVAL,
                          '[)'
                      ) && v_target_range
                  )
              )
          )
          -- Check 2: Target parent range vs confirmed child slots (constructs range if slot_range is NULL)
          OR (
              v_target_range IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM public.booking_slots bs_other
                  WHERE bs_other.booking_ref = b_other.reference_number
                    AND COALESCE(
                        bs_other.slot_range,
                        tstzrange(
                            (bs_other.date::TEXT || ' ' || (CASE WHEN length(bs_other.start_time) = 5 THEN bs_other.start_time || ':00' ELSE bs_other.start_time END) || '+05:00')::TIMESTAMPTZ,
                            (bs_other.date::TEXT || ' ' || (CASE WHEN length(bs_other.start_time) = 5 THEN bs_other.start_time || ':00' ELSE bs_other.start_time END) || '+05:00')::TIMESTAMPTZ + (COALESCE(bs_other.duration_minutes, 30) || ' minutes')::INTERVAL,
                            '[)'
                        )
                    ) && v_target_range
              )
          )
          -- Check 3: Target child slots vs confirmed parent range or confirmed child slots (slot-by-slot)
          OR EXISTS (
              SELECT 1 FROM public.booking_slots bs_my
              WHERE bs_my.booking_ref = p_booking_ref
                AND (
                    -- Compare bs_my against b_other's parent range
                    (
                        (b_other.booking_range IS NOT NULL OR (b_other.date IS NOT NULL AND b_other.start_time IS NOT NULL))
                        AND COALESCE(
                            bs_my.slot_range,
                            tstzrange(
                                (bs_my.date::TEXT || ' ' || (CASE WHEN length(bs_my.start_time) = 5 THEN bs_my.start_time || ':00' ELSE bs_my.start_time END) || '+05:00')::TIMESTAMPTZ,
                                (bs_my.date::TEXT || ' ' || (CASE WHEN length(bs_my.start_time) = 5 THEN bs_my.start_time || ':00' ELSE bs_my.start_time END) || '+05:00')::TIMESTAMPTZ + (COALESCE(bs_my.duration_minutes, 30) || ' minutes')::INTERVAL,
                                '[)'
                            )
                        ) && COALESCE(
                            b_other.booking_range,
                            tstzrange(
                                (b_other.date::TEXT || ' ' || (CASE WHEN length(b_other.start_time) = 5 THEN b_other.start_time || ':00' ELSE b_other.start_time END) || '+05:00')::TIMESTAMPTZ,
                                (b_other.date::TEXT || ' ' || (CASE WHEN length(b_other.start_time) = 5 THEN b_other.start_time || ':00' ELSE b_other.start_time END) || '+05:00')::TIMESTAMPTZ + (COALESCE(b_other.duration_minutes, 60) || ' minutes')::INTERVAL,
                                '[)'
                            )
                        )
                    )
                    -- Compare bs_my against bs_other (slot-by-slot)
                    OR EXISTS (
                        SELECT 1 FROM public.booking_slots bs_other
                        WHERE bs_other.booking_ref = b_other.reference_number
                          AND COALESCE(
                              bs_my.slot_range,
                              tstzrange(
                                  (bs_my.date::TEXT || ' ' || (CASE WHEN length(bs_my.start_time) = 5 THEN bs_my.start_time || ':00' ELSE bs_my.start_time END) || '+05:00')::TIMESTAMPTZ,
                                  (bs_my.date::TEXT || ' ' || (CASE WHEN length(bs_my.start_time) = 5 THEN bs_my.start_time || ':00' ELSE bs_my.start_time END) || '+05:00')::TIMESTAMPTZ + (COALESCE(bs_my.duration_minutes, 30) || ' minutes')::INTERVAL,
                                  '[)'
                              )
                          ) && COALESCE(
                              bs_other.slot_range,
                              tstzrange(
                                  (bs_other.date::TEXT || ' ' || (CASE WHEN length(bs_other.start_time) = 5 THEN bs_other.start_time || ':00' ELSE bs_other.start_time END) || '+05:00')::TIMESTAMPTZ,
                                  (bs_other.date::TEXT || ' ' || (CASE WHEN length(bs_other.start_time) = 5 THEN bs_other.start_time || ':00' ELSE bs_other.start_time END) || '+05:00')::TIMESTAMPTZ + (COALESCE(bs_other.duration_minutes, 30) || ' minutes')::INTERVAL,
                                  '[)'
                              )
                          )
                    )
                )
          )
      )
    LIMIT 1;

    IF v_conflicting_confirmed_ref IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Conflict: Another booking (' || v_conflicting_confirmed_ref || ') is already confirmed for an overlapping time interval.'
        );
    END IF;

    -- 9. Update parent booking to confirmed
    -- Trigger trg_sync_booking_slots_status automatically updates child booking_slots to 'confirmed'
    UPDATE public.bookings
    SET status = 'confirmed',
        approved_at = v_now,
        approved_by = v_effective_admin,
        updated_at = v_now
    WHERE reference_number = p_booking_ref;

    -- 10. Audit Log Notification
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
        p_booking_ref,
        'booking_confirmed',
        'Booking Approved',
        'Booking ' || p_booking_ref || ' was confirmed and slot(s) locked by ' || v_effective_admin || '.',
        v_booking.customer_name,
        v_booking.customer_phone,
        v_booking.advance_required_amount,
        true,
        v_now
    );

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Booking successfully confirmed and slot(s) locked.',
        'reference_number', p_booking_ref
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_booking_and_lock_slot(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_booking_and_lock_slot(TEXT, TEXT) TO authenticated, service_role;
