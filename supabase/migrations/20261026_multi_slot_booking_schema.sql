-- ==============================================================================
-- POWER PADEL ARENA — MULTI-SLOT BOOKING SCHEMA MIGRATION
-- File: supabase/migrations/20261026_multi_slot_booking_schema.sql
--
-- PURPOSE:
-- 1. Supports independent, non-consecutive 1-hour time slot selections in ONE booking.
-- 2. Adds JSONB `slots` column to `public.bookings` for direct array storage.
-- 3. Creates `public.booking_slots` child table for atomic double-booking enforcement.
-- 4. Automatically synchronizes slot statuses when bookings are approved, rejected, cancelled, or expired.
-- 5. Harmonizes web multi-slot booking with desk/admin manual bookings under a shared advisory lock.
-- 6. Enforces strict server-side pricing: Court 1/2 (PKR 3500 off-peak / PKR 4000 peak), Court 3 (PKR 2000 flat).
-- 7. Restricts public table access: exposes calendar availability only through restricted SECURITY DEFINER RPC.
-- 8. Validates match durations (60, 120, 180 mins), operating hours (06:00 - 02:00), and rejects status tampering.
-- 9. Corrects midnight ordering & non-consecutive representation: uses operating schedule minutes so non-consecutive selections never falsely appear continuous.
-- 10. Preserves historical pricing: does not divide legacy totals; derives slot rates from authoritative court schedules.
--
-- SAFETY & COMPATIBILITY VERIFICATION:
-- 1. Non-destructive: No tables, columns, or existing booking records are dropped or reset.
-- 2. Preserves existing bookings: All production bookings are backfilled into individual 1-hour slots without duplicates or data loss.
-- 3. Double-booking prevention: Enforced via unique partial index on (court_id, date, start_time).
-- 4. Zero customer PII exposure: public.booking_slots is inaccessible to anon; RPC exposes only timings/status.
-- 5. Full RLS & Role Privileges: Configured with explicit function signatures for postgres, service_role, anon, authenticated.
-- ==============================================================================

-- 0. HELPER FUNCTION: OPERATING SLOT MINUTES (Self-contained dependency)
--    Monotonically maps 24-hour club operating hours starting at 06:00 AM (0 mins)
--    to 05:59 AM next morning (1439 mins). Correctly sorts and evaluates midnight slots (23:00, 00:00, 01:00).
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

-- 1. Add `slots` JSONB column to public.bookings
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS slots JSONB DEFAULT '[]'::jsonb;

-- 2. Create child table `public.booking_slots` for per-slot availability & atomic locking
CREATE TABLE IF NOT EXISTS public.booking_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    booking_ref TEXT NOT NULL,
    court_id TEXT NOT NULL REFERENCES public.courts(id) ON DELETE RESTRICT,
    court_name TEXT,
    date DATE NOT NULL,
    start_time TEXT NOT NULL, -- e.g. '09:00'
    end_time TEXT NOT NULL,   -- e.g. '10:00'
    duration_minutes INT NOT NULL DEFAULT 60,
    price INT NOT NULL DEFAULT 4000,
    is_peak BOOLEAN DEFAULT false,
    status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (
        status IN ('awaiting_payment', 'payment_under_review', 'confirmed', 'rejected', 'cancelled', 'expired')
    ),
    held_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Critical double-booking prevention constraint for individual slots
CREATE UNIQUE INDEX IF NOT EXISTS idx_prevent_double_booking_slots
ON public.booking_slots (court_id, date, start_time)
WHERE status IN ('awaiting_payment', 'payment_under_review', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_booking_slots_ref ON public.booking_slots (booking_ref);
CREATE INDEX IF NOT EXISTS idx_booking_slots_date_court ON public.booking_slots (court_id, date);

-- 4. Backfill existing bookings into slots JSONB and booking_slots table (idempotent, supports multi-hour legacy bookings)
--
-- LEGACY PRICING DOCUMENTATION & AMBIGUITY RESOLUTION:
-- 1. All 4 existing production bookings are 60-minute single-hour bookings (duration_minutes = 60).
--    Their individual slot price equals total_amount exactly (PKR 4,000).
-- 2. If any legacy multi-hour booking (duration_minutes > 60) exists:
--    - The original total_amount, advance_required_amount, and remaining_amount columns on public.bookings
--      are preserved 100% untouched and remain the authoritative financial/invoice truth.
--    - In public.booking_slots and slots JSONB, individual slot prices are derived directly from the
--      club's official hourly rate card (Court 3: PKR 2,000 flat; Court 1 & 2: PKR 4,000 peak, PKR 3,500 off-peak).
--    - We DO NOT silently divide total_amount equally across hours (e.g. 7000 / 2 = 3500), which would
--      distort peak/off-peak variations and create rounding fractions.
--    - IMPORTANT HISTORICAL PRICING NOTE: If an administrator historically negotiated a discounted lump sum
--      or applied a custom rate to a legacy booking, the exact per-hour breakdown cannot be reliably reconstructed
--      because legacy schemas never stored individual slot prices. In such cases, child slot records reflect the
--      standard rate schedule, and MUST NOT be assumed to always sum to the parent booking's negotiated total.
--      The parent booking's total_amount remains the sole legal and accounting truth.
UPDATE public.bookings b
SET slots = (
    SELECT jsonb_agg(
        jsonb_build_object(
            'startTime', lpad(((split_part(b.start_time, ':', 1)::INT + gs.i) % 24)::TEXT, 2, '0') || ':00',
            'endTime', lpad(((split_part(b.start_time, ':', 1)::INT + gs.i + 1) % 24)::TEXT, 2, '0') || ':00',
            'durationMinutes', 60,
            'price', CASE 
                WHEN COALESCE(b.duration_minutes, 60) <= 60 THEN b.total_amount
                WHEN b.court_id = 'court-3' THEN 2000
                WHEN ((split_part(b.start_time, ':', 1)::INT + gs.i) % 24) >= 18 OR ((split_part(b.start_time, ':', 1)::INT + gs.i) % 24) < 6 THEN 4000
                ELSE 3500
            END,
            'label', (lpad(((split_part(b.start_time, ':', 1)::INT + gs.i) % 24)::TEXT, 2, '0') || ':00') || ' - ' || (lpad(((split_part(b.start_time, ':', 1)::INT + gs.i + 1) % 24)::TEXT, 2, '0') || ':00'),
            'isPeak', CASE 
                WHEN b.court_id = 'court-3' THEN false
                WHEN ((split_part(b.start_time, ':', 1)::INT + gs.i) % 24) >= 18 OR ((split_part(b.start_time, ':', 1)::INT + gs.i) % 24) < 6 THEN true
                ELSE false
            END
        )
    )
    FROM generate_series(0, GREATEST(0, (COALESCE(b.duration_minutes, 60) / 60) - 1)) AS gs(i)
)
WHERE b.slots IS NULL OR b.slots = '[]'::jsonb;

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
)
SELECT 
    b.id,
    b.reference_number,
    b.court_id,
    b.court_name,
    b.date,
    lpad(((split_part(b.start_time, ':', 1)::INT + gs.i) % 24)::TEXT, 2, '0') || ':00',
    lpad(((split_part(b.start_time, ':', 1)::INT + gs.i + 1) % 24)::TEXT, 2, '0') || ':00',
    60,
    CASE 
        WHEN COALESCE(b.duration_minutes, 60) <= 60 THEN b.total_amount
        WHEN b.court_id = 'court-3' THEN 2000
        WHEN ((split_part(b.start_time, ':', 1)::INT + gs.i) % 24) >= 18 OR ((split_part(b.start_time, ':', 1)::INT + gs.i) % 24) < 6 THEN 4000
        ELSE 3500
    END AS price,
    CASE 
        WHEN b.court_id = 'court-3' THEN false
        WHEN ((split_part(b.start_time, ':', 1)::INT + gs.i) % 24) >= 18 OR ((split_part(b.start_time, ':', 1)::INT + gs.i) % 24) < 6 THEN true
        ELSE false
    END AS is_peak,
    b.status,
    b.held_until,
    b.created_at,
    b.updated_at
FROM public.bookings b
CROSS JOIN LATERAL generate_series(0, GREATEST(0, (COALESCE(b.duration_minutes, 60) / 60) - 1)) AS gs(i)
WHERE NOT EXISTS (
    SELECT 1 FROM public.booking_slots bs WHERE bs.booking_ref = b.reference_number
);

-- 5. Trigger to synchronize booking_slots status and held_until automatically on booking update
CREATE OR REPLACE FUNCTION public.sync_booking_slots_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.booking_slots
    SET status = NEW.status,
        held_until = NEW.held_until,
        updated_at = NEW.updated_at
    WHERE booking_ref = NEW.reference_number;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_booking_slots_status ON public.bookings;
CREATE TRIGGER trg_sync_booking_slots_status
AFTER UPDATE OF status, held_until ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.sync_booking_slots_status();

-- 6. Restricted Public Availability Function (exposes only timing and status, zero customer PII)
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
    -- Active slots from booking_slots
    SELECT 
        s.start_time,
        s.end_time,
        s.duration_minutes,
        s.status,
        s.created_at
    FROM public.booking_slots s
    WHERE s.court_id = p_court_id
      AND s.date = p_date
      AND (
          s.status IN ('payment_under_review', 'confirmed')
          OR (
              s.status = 'awaiting_payment'
              AND (
                  (s.held_until IS NOT NULL AND s.held_until > timezone('utc'::text, now()))
                  OR (s.held_until IS NULL AND s.created_at > timezone('utc'::text, now()) - interval '60 minutes')
              )
          )
      )
    UNION
    -- Fallback active slots from public.bookings (only if not already in booking_slots)
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
                  OR (b.held_until IS NULL AND b.created_at > timezone('utc'::text, now()) - interval '60 minutes')
              )
          )
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.booking_slots bs WHERE bs.booking_ref = b.reference_number
      );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_court_slots(TEXT, DATE) FROM public;
GRANT EXECUTE ON FUNCTION public.get_active_court_slots(TEXT, DATE) TO anon, authenticated, service_role;

-- 7. Atomic Multi-Slot Booking Creation Procedure (ACID Transaction, Server-Side Pricing, Anti-Tamper)
DROP FUNCTION IF EXISTS public.create_multi_slot_booking_secure(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

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
DECLARE
    v_caller_role TEXT;
    v_booking_id UUID;
    v_now TIMESTAMPTZ;
    v_held_until TIMESTAMPTZ;
    v_status TEXT;
    v_db_court_name TEXT;
    v_slot_count INT;
    v_expected_slots INT;
    v_computed_total INT;
    v_advance_required INT;
    v_remaining_amount INT;
    v_canonical_slots JSONB;
    v_slot JSONB;
    v_slot_start TEXT;
    v_slot_end TEXT;
    v_expected_end TEXT;
    v_hour INT;
    v_slot_price INT;
    v_slot_is_peak BOOLEAN;
    v_slot_start_min INT;
    v_slot_end_min INT;
    v_conflict_ref TEXT;
    v_conflict_status TEXT;
    v_first_slot_start TEXT;
    v_first_slot_end TEXT;
    v_first_slot_min INT;
    v_last_slot_start TEXT;
    v_last_slot_end TEXT;
    v_last_slot_min INT;
    v_is_consecutive BOOLEAN;
    v_primary_start TEXT;
    v_primary_end TEXT;
BEGIN
    v_now := timezone('utc'::text, now());
    v_held_until := v_now + interval '60 minutes';
    v_caller_role := auth.role();

    -- 1. Acquire transaction-level advisory lock on court + date (serializes concurrent attempts)
    PERFORM pg_advisory_xact_lock(hashtext('power_padel_booking_' || p_court_id || '_' || p_date::TEXT));

    -- 2. Status Security Guard: Non-admin/public users cannot set privileged booking status
    IF v_caller_role <> 'service_role' THEN
        IF p_status IN ('confirmed', 'rejected', 'cancelled', 'expired') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Privileged booking status cannot be set upon booking creation.');
        END IF;
    END IF;

    -- Initial status is strictly payment_under_review (if receipt attached) or awaiting_payment
    IF p_receipt_screenshot_url IS NOT NULL AND trim(p_receipt_screenshot_url) <> '' THEN
        v_status := 'payment_under_review';
    ELSE
        v_status := 'awaiting_payment';
    END IF;

    -- Allow service_role to set awaiting_payment or payment_under_review if explicitly passed
    IF v_caller_role = 'service_role' AND p_status IN ('awaiting_payment', 'payment_under_review') THEN
        v_status := p_status;
    END IF;

    -- 3. Court Validation & Trusted Name Lookup
    IF p_court_id NOT IN ('court-1', 'court-2', 'court-3') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid court: ' || COALESCE(p_court_id, 'null') || '. Permitted courts are court-1, court-2, court-3.');
    END IF;

    SELECT name INTO v_db_court_name FROM public.courts WHERE id = p_court_id;
    IF v_db_court_name IS NULL THEN
        v_db_court_name := CASE 
            WHEN p_court_id = 'court-1' THEN 'Court 1 — Double Court'
            WHEN p_court_id = 'court-2' THEN 'Court 2 — Double Court'
            ELSE 'Court 3 — Single Court'
        END;
    END IF;

    -- 4. Date Validation
    IF p_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking date cannot be in the past.');
    END IF;

    -- 5. Duration Validation (Strictly 60, 120, or 180 minutes)
    IF p_duration_minutes NOT IN (60, 120, 180) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid match duration. Allowed durations are 60, 120, or 180 minutes.');
    END IF;

    -- 6. Slot Normalization & Count Check
    IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) = 0 THEN
        p_slots := jsonb_build_array(
            jsonb_build_object('startTime', p_start_time, 'endTime', p_end_time)
        );
    END IF;

    v_slot_count := jsonb_array_length(p_slots);
    v_expected_slots := p_duration_minutes / 60;
    IF v_slot_count <> v_expected_slots THEN
        RETURN jsonb_build_object('success', false, 'error', 'For a ' || p_duration_minutes || '-minute match, exactly ' || v_expected_slots || ' one-hour slot(s) must be selected (received ' || v_slot_count || ').');
    END IF;

    -- 7. Reject duplicate slots within the request
    IF (SELECT count(DISTINCT s->>'startTime') FROM jsonb_array_elements(p_slots) s) <> v_slot_count THEN
        RETURN jsonb_build_object('success', false, 'error', 'Duplicate time slots in request. Each selected slot must be distinct.');
    END IF;

    -- 8. Server-Side Pricing & Slot Boundary Derivation
    v_computed_total := 0;
    v_canonical_slots := '[]'::jsonb;

    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots)
    LOOP
        v_slot_start := v_slot->>'startTime';
        v_slot_end := v_slot->>'endTime';

        IF v_slot_start IS NULL OR v_slot_start !~ '^([01][0-9]|2[0-3]):00$' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid slot time format for ' || COALESCE(v_slot_start, 'null') || '. Slots must start on the hour (e.g. 09:00).');
        END IF;

        -- Operating hours: 06:00 to 01:00 (spans until 02:00 AM)
        IF v_slot_start NOT IN (
            '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
            '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
            '22:00', '23:00', '00:00', '01:00'
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Slot ' || v_slot_start || ' is outside club operating hours (06:00 AM - 02:00 AM).');
        END IF;

        v_hour := split_part(v_slot_start, ':', 1)::INT;
        v_expected_end := lpad(((v_hour + 1) % 24)::TEXT, 2, '0') || ':00';
        IF v_slot_end IS NOT NULL AND v_slot_end <> '' AND v_slot_end <> v_expected_end THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid slot end time for ' || v_slot_start || ': expected ' || v_expected_end || ' but received ' || v_slot_end || '.');
        END IF;
        v_slot_end := v_expected_end;

        -- Derive verified server-side rate:
        -- Court 3: PKR 2,000/hr all day and night (no peak rate)
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

        -- Validate against client-provided slot price if supplied
        IF v_slot->>'price' IS NOT NULL AND (v_slot->>'price')::INT <> v_slot_price THEN
            RETURN jsonb_build_object('success', false, 'error', 'Price mismatch on slot ' || v_slot_start || ': expected PKR ' || v_slot_price || ' but received PKR ' || (v_slot->>'price') || '.');
        END IF;

        IF v_slot->>'isPeak' IS NOT NULL AND (v_slot->>'isPeak')::BOOLEAN <> v_slot_is_peak THEN
            RETURN jsonb_build_object('success', false, 'error', 'Peak rate flag mismatch on slot ' || v_slot_start || '.');
        END IF;

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

    -- Reject total amount mismatch
    IF p_total_amount IS NOT NULL AND p_total_amount <> v_computed_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'Total amount mismatch: expected PKR ' || v_computed_total || ' but received PKR ' || p_total_amount || '.');
    END IF;

    v_advance_required := 500; -- Fixed PKR 500 advance deposit
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
          (held_until IS NOT NULL AND held_until <= v_now)
          OR (held_until IS NULL AND created_at <= v_now - interval '60 minutes')
      );

    -- 10. Check conflicts and overlaps across all requested slots
    FOR v_slot IN SELECT * FROM jsonb_array_elements(v_canonical_slots)
    LOOP
        v_slot_start := v_slot->>'startTime';
        v_slot_start_min := public.operating_slot_minutes(v_slot_start);
        v_slot_end_min := v_slot_start_min + 60;

        -- Check against active booking_slots
        SELECT bs.booking_ref, bs.status INTO v_conflict_ref, v_conflict_status
        FROM public.booking_slots bs
        WHERE bs.court_id = p_court_id
          AND bs.date = p_date
          AND bs.status IN ('awaiting_payment', 'payment_under_review', 'confirmed')
          AND (
              bs.status IN ('payment_under_review', 'confirmed')
              OR (bs.held_until IS NOT NULL AND bs.held_until > v_now)
              OR (bs.held_until IS NULL AND bs.created_at > v_now - interval '60 minutes')
          )
          AND (
              GREATEST(v_slot_start_min, public.operating_slot_minutes(bs.start_time)) < 
              LEAST(v_slot_end_min, public.operating_slot_minutes(bs.start_time) + COALESCE(bs.duration_minutes, 60))
          )
        LIMIT 1;

        -- Fallback check against unmigrated bookings in public.bookings
        IF v_conflict_ref IS NULL THEN
            SELECT b.reference_number, b.status INTO v_conflict_ref, v_conflict_status
            FROM public.bookings b
            WHERE b.court_id = p_court_id
              AND b.date = p_date
              AND b.status IN ('awaiting_payment', 'payment_under_review', 'confirmed')
              AND (
                  b.status IN ('payment_under_review', 'confirmed')
                  OR (b.held_until IS NOT NULL AND b.held_until > v_now)
                  OR (b.held_until IS NULL AND b.created_at > v_now - interval '60 minutes')
              )
              AND (
                  GREATEST(v_slot_start_min, public.operating_slot_minutes(b.start_time)) < 
                  LEAST(v_slot_end_min, public.operating_slot_minutes(b.start_time) + COALESCE(b.duration_minutes, 60))
              )
              AND NOT EXISTS (
                  SELECT 1 FROM public.booking_slots bs WHERE bs.booking_ref = b.reference_number
              )
            LIMIT 1;
        END IF;

        IF v_conflict_ref IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Slot at ' || v_slot_start || ' is already ' || CASE WHEN v_conflict_status = 'confirmed' THEN 'booked' ELSE 'reserved' END || ' by another customer (Ref: ' || v_conflict_ref || ').'
            );
        END IF;
    END LOOP;

    -- 11. Determine primary start and end times using operating schedule order (not alphanumeric TEXT min/max)
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

    -- A selection forms a single continuous block only if (last - first) = (count - 1) * 60 minutes
    v_is_consecutive := ((v_last_slot_min - v_first_slot_min) = (v_slot_count - 1) * 60);

    IF v_is_consecutive THEN
        v_primary_start := v_first_slot_start;
        v_primary_end := v_last_slot_end;
    ELSE
        -- For non-consecutive slots, represent parent timing as the primary initial slot (60 mins)
        -- so it never falsely implies a continuous multi-hour span across unreserved intervening hours.
        -- All individual selected slots are preserved in public.booking_slots and slots JSONB.
        v_primary_start := v_first_slot_start;
        v_primary_end := v_first_slot_end;
    END IF;

    -- 12. Reference collision check & Atomic Parent Insert
    IF EXISTS (SELECT 1 FROM public.bookings WHERE reference_number = p_reference_number) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Booking reference collision: Reference number ' || p_reference_number || ' already exists. Please submit your request again.'
        );
    END IF;

    BEGIN
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
            held_until,
            slots,
            created_at,
            updated_at
        ) VALUES (
            p_reference_number,
            p_court_id,
            v_db_court_name,
            p_date,
            v_primary_start,
            v_primary_end,
            p_duration_minutes,
            v_computed_total,
            v_advance_required,
            v_remaining_amount,
            v_status,
            trim(p_customer_name),
            trim(p_customer_phone),
            nullif(trim(p_customer_email), ''),
            p_payment_method,
            nullif(trim(p_transaction_ref), ''),
            p_receipt_screenshot_url,
            CASE WHEN v_status = 'awaiting_payment' THEN v_held_until ELSE NULL END,
            v_canonical_slots,
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

    -- 13. Insert child slots into public.booking_slots
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
            v_db_court_name,
            p_date,
            v_slot_start,
            v_slot_end,
            60,
            v_slot_price,
            v_slot_is_peak,
            v_status,
            CASE WHEN v_status = 'awaiting_payment' THEN v_held_until ELSE NULL END,
            v_now,
            v_now
        );
    END LOOP;

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
            'Customer ' || trim(p_customer_name) || ' submitted receipt for ' || v_db_court_name || ' on ' || p_date::TEXT || '. Advance: PKR ' || v_advance_required::TEXT || '.',
            trim(p_customer_name),
            trim(p_customer_phone),
            v_advance_required,
            false,
            v_now
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'reference_number', p_reference_number,
        'status', v_status,
        'total_amount', v_computed_total,
        'advance_required_amount', v_advance_required,
        'remaining_amount', v_remaining_amount
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_multi_slot_booking_secure(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM public;
GRANT EXECUTE ON FUNCTION public.create_multi_slot_booking_secure(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;

-- 8. Atomic Manual Booking Procedure with Multi-Hour Child Slots & Shared Advisory Locking
DROP FUNCTION IF EXISTS public.create_manual_booking(TEXT, TEXT, DATE, TEXT, TEXT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT);

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
    v_slot_count INT;
    v_db_court_name TEXT;
    v_computed_total INT;
    v_advance_amount INT;
    v_remaining_amount INT;
    v_slots_array JSONB;
    v_slot_obj JSONB;
    v_slot_hour INT;
    v_slot_next_hour INT;
    v_slot_start TEXT;
    v_slot_end TEXT;
    v_slot_price INT;
    v_slot_is_peak BOOLEAN;
    v_computed_end_time TEXT;
    v_slot JSONB;
BEGIN
    v_now := timezone('utc'::text, now());
    v_caller_role := auth.role();
    v_jwt_email := auth.jwt() ->> 'email';

    -- 1. Security Authorization Guard: Admin or Service Role only
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

    -- 2. Validate Court
    IF p_court_id NOT IN ('court-1', 'court-2', 'court-3') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid court: ' || COALESCE(p_court_id, 'null') || '. Allowed courts are court-1, court-2, court-3.');
    END IF;

    SELECT name INTO v_db_court_name FROM public.courts WHERE id = p_court_id;
    IF v_db_court_name IS NULL THEN
        v_db_court_name := COALESCE(p_court_name, CASE 
            WHEN p_court_id = 'court-1' THEN 'Court 1 — Double Court'
            WHEN p_court_id = 'court-2' THEN 'Court 2 — Double Court'
            ELSE 'Court 3 — Single Court'
        END);
    END IF;

    -- 3. Validate Date
    IF p_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking date cannot be in the past.');
    END IF;

    -- 4. Validate Duration (Must be strictly 60, 120, or 180 minutes)
    IF p_duration_minutes NOT IN (60, 120, 180) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Duration must be 60, 120, or 180 minutes.');
    END IF;
    v_slot_count := p_duration_minutes / 60;

    -- 5. Validate Operating Slot Time Format & Operating Schedule Boundaries (06:00 - 02:00 next morning)
    IF p_start_time IS NULL OR p_start_time !~ '^([01][0-9]|2[0-3]):00$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid start time format. Time must start on the hour (e.g. 18:00).');
    END IF;

    IF p_start_time NOT IN (
        '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
        '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
        '22:00', '23:00', '00:00', '01:00'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Start time ' || p_start_time || ' is outside club operating hours (06:00 AM - 02:00 AM).');
    END IF;

    v_req_start_min := public.operating_slot_minutes(p_start_time);
    v_req_end_min := v_req_start_min + p_duration_minutes;

    -- Club operating day closes at 02:00 AM (1200 operating minutes from 06:00 AM)
    IF v_req_end_min > 1200 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'A ' || p_duration_minutes || '-minute match starting at ' || p_start_time || ' exceeds club closing hours (02:00 AM).'
        );
    END IF;

    -- 6. Shared Advisory Lock (serializes concurrent web and desk booking transactions on court + date)
    PERFORM pg_advisory_xact_lock(hashtext('power_padel_booking_' || p_court_id || '_' || p_date::TEXT));

    -- 7. Clean up expired temporary holds on this court and date
    UPDATE public.bookings
    SET status = 'expired',
        updated_at = v_now
    WHERE court_id = p_court_id
      AND date = p_date
      AND status = 'awaiting_payment'
      AND (
          (held_until IS NOT NULL AND held_until <= v_now)
          OR (held_until IS NULL AND created_at <= v_now - interval '60 minutes')
      );

    -- 8. Conflict & Overlap Check against active booking_slots
    SELECT bs.booking_ref, bs.status INTO v_conflicting_ref, v_conflicting_status
    FROM public.booking_slots bs
    WHERE bs.court_id = p_court_id
      AND bs.date = p_date
      AND bs.status IN ('awaiting_payment', 'payment_under_review', 'confirmed')
      AND (
          bs.status IN ('payment_under_review', 'confirmed')
          OR (bs.held_until IS NOT NULL AND bs.held_until > v_now)
          OR (bs.held_until IS NULL AND bs.created_at > v_now - interval '60 minutes')
      )
      AND (
          GREATEST(v_req_start_min, public.operating_slot_minutes(bs.start_time)) < 
          LEAST(v_req_end_min, public.operating_slot_minutes(bs.start_time) + COALESCE(bs.duration_minutes, 60))
      )
    LIMIT 1;

    -- Fallback conflict check against public.bookings
    IF v_conflicting_ref IS NULL THEN
        SELECT b.reference_number, b.status INTO v_conflicting_ref, v_conflicting_status
        FROM public.bookings b
        WHERE b.court_id = p_court_id
          AND b.date = p_date
          AND b.status IN ('awaiting_payment', 'payment_under_review', 'confirmed')
          AND (
              b.status IN ('payment_under_review', 'confirmed')
              OR (b.held_until IS NOT NULL AND b.held_until > v_now)
              OR (b.held_until IS NULL AND b.created_at > v_now - interval '60 minutes')
          )
          AND (
              GREATEST(v_req_start_min, public.operating_slot_minutes(b.start_time)) < 
              LEAST(v_req_end_min, public.operating_slot_minutes(b.start_time) + COALESCE(b.duration_minutes, 60))
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.booking_slots bs WHERE bs.booking_ref = b.reference_number
          )
        LIMIT 1;
    END IF;

    IF v_conflicting_ref IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Slot Already Booked — This court and time slot is already reserved or booked. Please select another available slot.',
            'conflictingRef', v_conflicting_ref,
            'conflictingStatus', v_conflicting_status
        );
    END IF;

    -- 9. Generate Individual 1-Hour Child Slots & Compute Authoritative Schedule Pricing
    v_computed_total := 0;
    v_slots_array := '[]'::jsonb;

    FOR i IN 0..(v_slot_count - 1)
    LOOP
        v_slot_hour := (split_part(p_start_time, ':', 1)::INT + i) % 24;
        v_slot_next_hour := (v_slot_hour + 1) % 24;
        v_slot_start := lpad(v_slot_hour::TEXT, 2, '0') || ':00';
        v_slot_end := lpad(v_slot_next_hour::TEXT, 2, '0') || ':00';

        IF p_court_id = 'court-3' THEN
            v_slot_price := 2000;
            v_slot_is_peak := false;
        ELSE
            IF v_slot_hour >= 18 OR v_slot_hour < 6 THEN
                v_slot_price := 4000;
                v_slot_is_peak := true;
            ELSE
                v_slot_price := 3500;
                v_slot_is_peak := false;
            END IF;
        END IF;

        v_computed_total := v_computed_total + v_slot_price;

        v_slot_obj := jsonb_build_object(
            'startTime', v_slot_start,
            'endTime', v_slot_end,
            'durationMinutes', 60,
            'price', v_slot_price,
            'label', v_slot_start || ' - ' || v_slot_end,
            'isPeak', v_slot_is_peak
        );
        v_slots_array := v_slots_array || jsonb_build_array(v_slot_obj);
    END LOOP;

    -- Validate client/admin total_amount if provided
    IF p_total_amount IS NOT NULL AND p_total_amount <> v_computed_total THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Total amount mismatch: expected PKR ' || v_computed_total || ' but received PKR ' || p_total_amount || '.'
        );
    END IF;

    -- 10. Financial Balance & Status Validation
    IF p_is_paid THEN
        v_status := 'confirmed';
        IF p_advance_amount IS NOT NULL AND p_remaining_amount IS NOT NULL AND (p_advance_amount + p_remaining_amount = v_computed_total) THEN
            v_advance_amount := p_advance_amount;
            v_remaining_amount := p_remaining_amount;
        ELSE
            v_advance_amount := v_computed_total;
            v_remaining_amount := 0;
        END IF;
    ELSE
        v_status := 'awaiting_payment';
        v_advance_amount := 500;
        v_remaining_amount := v_computed_total - 500;
    END IF;

    -- Ensure total equals advance + remaining
    IF (v_advance_amount + v_remaining_amount) <> v_computed_total THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Financial calculation inconsistent: advance (' || v_advance_amount || ') + remaining (' || v_remaining_amount || ') does not equal total (' || v_computed_total || ').'
        );
    END IF;

    -- 11. Reference Number Collision Protection
    IF p_reference_number IS NOT NULL AND trim(p_reference_number) <> '' THEN
        v_new_ref := trim(p_reference_number);
        IF EXISTS (SELECT 1 FROM public.bookings WHERE reference_number = v_new_ref) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Booking reference collision: Reference number ' || v_new_ref || ' is already in use. Please retry with a new reference.'
            );
        END IF;
    ELSE
        LOOP
            v_new_ref := 'PPA-PK-2026-' || (1000 + floor(random() * 9000)::INT)::TEXT;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.bookings WHERE reference_number = v_new_ref);
        END LOOP;
    END IF;

    -- Compute continuous end time for parent record
    v_computed_end_time := lpad(((split_part(p_start_time, ':', 1)::INT + v_slot_count) % 24)::TEXT, 2, '0') || ':00';

    -- 12. Atomic Parent Booking Insert
    BEGIN
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
            slots,
            created_at,
            updated_at
        ) VALUES (
            v_new_ref,
            p_court_id,
            v_db_court_name,
            p_date,
            p_start_time,
            v_computed_end_time,
            p_duration_minutes,
            v_computed_total,
            v_advance_amount,
            v_remaining_amount,
            v_status,
            trim(p_customer_name),
            trim(p_customer_phone),
            nullif(trim(p_customer_email), ''),
            p_payment_method,
            CASE WHEN p_is_paid THEN 'CASH-COUNTER-DESK' ELSE NULL END,
            CASE WHEN NOT p_is_paid THEN v_now + interval '60 minutes' ELSE NULL END,
            CASE WHEN p_is_paid THEN v_now ELSE NULL END,
            CASE WHEN p_is_paid THEN v_effective_admin ELSE NULL END,
            v_slots_array,
            v_now,
            v_now
        )
        RETURNING id INTO v_booking_id;
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Booking reference collision: Reference number ' || v_new_ref || ' already exists. Please retry.'
        );
    END;

    -- 13. Insert Individual 1-Hour Child Rows into public.booking_slots (duration_minutes = 60)
    FOR v_slot IN SELECT * FROM jsonb_array_elements(v_slots_array)
    LOOP
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
            v_new_ref,
            p_court_id,
            v_db_court_name,
            p_date,
            v_slot->>'startTime',
            v_slot->>'endTime',
            60,
            (v_slot->>'price')::INT,
            (v_slot->>'isPeak')::BOOLEAN,
            v_status,
            CASE WHEN NOT p_is_paid THEN v_now + interval '60 minutes' ELSE NULL END,
            v_now,
            v_now
        );
    END LOOP;

    -- 14. Insert Admin Notification
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
        'Desk booking (' || p_duration_minutes || ' min) created by ' || v_effective_admin || ' for ' || trim(p_customer_name) || ' (' || v_db_court_name || ', ' || p_date::TEXT || ' ' || p_start_time || ').',
        trim(p_customer_name),
        trim(p_customer_phone),
        v_advance_amount,
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
            'courtName', v_db_court_name,
            'date', p_date,
            'startTime', p_start_time,
            'endTime', v_computed_end_time,
            'durationMinutes', p_duration_minutes,
            'totalAmount', v_computed_total,
            'advanceRequiredAmount', v_advance_amount,
            'remainingAmount', v_remaining_amount,
            'status', v_status,
            'customerName', trim(p_customer_name),
            'customerPhone', trim(p_customer_phone),
            'customerEmail', nullif(trim(p_customer_email), ''),
            'paymentMethod', p_payment_method,
            'transactionRef', CASE WHEN p_is_paid THEN 'CASH-COUNTER-DESK' ELSE NULL END,
            'slots', v_slots_array,
            'createdAt', v_now,
            'updatedAt', v_now,
            'isDemo', false
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_booking(TEXT, TEXT, DATE, TEXT, TEXT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_booking(TEXT, TEXT, DATE, TEXT, TEXT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated, service_role;

-- 9. Multi-Slot Aware Booking Approval Procedure
DROP FUNCTION IF EXISTS public.approve_booking_and_lock_slot(TEXT, TEXT);

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
    v_conflicting_confirmed_ref TEXT;
    v_caller_role TEXT;
    v_jwt_email TEXT;
    v_effective_admin TEXT;
    v_now TIMESTAMPTZ;
BEGIN
    v_now := timezone('utc'::text, now());
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

    -- Conflict check: Verify no other booking has confirmed status on ANY of this booking's slots
    SELECT bs_other.booking_ref INTO v_conflicting_confirmed_ref
    FROM public.booking_slots bs_other
    WHERE bs_other.court_id = v_booking.court_id
      AND bs_other.date = v_booking.date
      AND bs_other.status = 'confirmed'
      AND bs_other.booking_ref <> p_booking_ref
      AND EXISTS (
          SELECT 1 FROM public.booking_slots bs_my
          WHERE bs_my.booking_ref = p_booking_ref
            AND bs_my.start_time = bs_other.start_time
      )
    LIMIT 1;

    IF v_conflicting_confirmed_ref IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Conflict: Another booking (' || v_conflicting_confirmed_ref || ') is already confirmed for one of the selected time slots.'
        );
    END IF;

    -- Update parent booking to confirmed (trigger automatically synchronizes booking_slots)
    UPDATE public.bookings
    SET status = 'confirmed',
        approved_at = v_now,
        approved_by = v_effective_admin,
        updated_at = v_now
    WHERE reference_number = p_booking_ref;

    -- Create log notification
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

    RETURN jsonb_build_object('success', true, 'message', 'Booking successfully confirmed and slot(s) locked.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_booking_and_lock_slot(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_booking_and_lock_slot(TEXT, TEXT) TO authenticated, service_role;

-- 10. Multi-Slot Aware Booking Rejection Procedure
DROP FUNCTION IF EXISTS public.reject_booking_and_release_slot(TEXT, TEXT, TEXT);

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
    v_now TIMESTAMPTZ;
BEGIN
    v_now := timezone('utc'::text, now());
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

    -- Update parent booking to rejected (trigger automatically synchronizes booking_slots, immediately releasing them)
    UPDATE public.bookings
    SET status = 'rejected',
        rejection_reason = trim(p_rejection_reason),
        rejected_at = v_now,
        rejected_by = v_effective_admin,
        updated_at = v_now
    WHERE reference_number = p_booking_ref;

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
        'booking_rejected',
        'Payment Rejected',
        'Booking ' || p_booking_ref || ' rejected by ' || v_effective_admin || ': ' || trim(p_rejection_reason),
        v_booking.customer_name,
        v_booking.customer_phone,
        v_booking.advance_required_amount,
        true,
        v_now
    );

    RETURN jsonb_build_object('success', true, 'message', 'Booking rejected and slot(s) released successfully.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_booking_and_release_slot(TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_booking_and_release_slot(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 11. Row Level Security & Table Privileges for booking_slots (Strict Privacy: No Public SELECT)
ALTER TABLE public.booking_slots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.booking_slots FROM public, anon, authenticated;
GRANT ALL ON TABLE public.booking_slots TO postgres, service_role;

-- Remove any old public select policies
DROP POLICY IF EXISTS "Public can view active slots for calendar" ON public.booking_slots;
DROP POLICY IF EXISTS "Service role has full access to booking_slots" ON public.booking_slots;

-- Privileged service_role policy for backend API operations
CREATE POLICY "Service role has full access to booking_slots"
ON public.booking_slots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
