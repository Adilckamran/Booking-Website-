-- ==============================================================================
-- POWER PADEL ARENA - COURT PRICING & CLASSIFICATION UPDATE MIGRATION
-- Migration: 20261025_court_pricing_update.sql
-- 
-- BUSINESS SPECIFICATION:
-- Exactly 3 courts:
-- 1. Court 1 — Double Court:
--    - Off-peak: PKR 3,500/hr (6:00 AM to before 6:00 PM)
--    - Peak: PKR 4,000/hr (6:00 PM to before 6:00 AM)
-- 2. Court 2 — Double Court:
--    - Off-peak: PKR 3,500/hr (6:00 AM to before 6:00 PM)
--    - Peak: PKR 4,000/hr (6:00 PM to before 6:00 AM)
-- 3. Court 3 — Single Court:
--    - Fixed rate: PKR 2,000/hr all day and night (no peak/off-peak pricing)
-- 
-- ADVANCE DEPOSIT:
-- - Fixed PKR 500 across all bookings
-- ==============================================================================

-- 1. UPDATE EXISTING COURTS WITHOUT DELETING ANY DATA
-- Upsert Court 1 (Double Court)
INSERT INTO public.courts (id, court_number, name, type, surface, description, hourly_rate, peak_hourly_rate, is_active)
VALUES (
    'court-1',
    1,
    'Court 1 — Double Court',
    'double',
    'Mondo Supercourt XN (World Padel Tour Grade)',
    'Premier panoramic double padel court for 4 players with tournament LED lighting.',
    3500,
    4000,
    true
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    surface = EXCLUDED.surface,
    description = EXCLUDED.description,
    hourly_rate = 3500,
    peak_hourly_rate = 4000,
    is_active = true;

-- Upsert Court 2 (Double Court)
INSERT INTO public.courts (id, court_number, name, type, surface, description, hourly_rate, peak_hourly_rate, is_active)
VALUES (
    'court-2',
    2,
    'Court 2 — Double Court',
    'double',
    'Textured Monofilament Padel Turf',
    'High-energy double padel court for fast rallies, high bounces, and competitive match play.',
    3500,
    4000,
    true
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    surface = EXCLUDED.surface,
    description = EXCLUDED.description,
    hourly_rate = 3500,
    peak_hourly_rate = 4000,
    is_active = true;

-- Upsert Court 3 (Single Court)
INSERT INTO public.courts (id, court_number, name, type, surface, description, hourly_rate, peak_hourly_rate, is_active)
VALUES (
    'court-3',
    3,
    'Court 3 — Single Court',
    'single',
    'Shock-Absorbing Comfort Pro Turf',
    'Dedicated single 1v1 padel court for precision singles match play and intensive coaching.',
    2000,
    2000,
    true
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    surface = EXCLUDED.surface,
    description = EXCLUDED.description,
    hourly_rate = 2000,
    peak_hourly_rate = 2000,
    is_active = true;

-- Deactivate any other legacy or test courts to guarantee exactly 3 active courts
UPDATE public.courts
SET is_active = false
WHERE id NOT IN ('court-1', 'court-2', 'court-3');

-- 2. ENSURE FIXED ADVANCE AMOUNT IN BOOKINGS SCHEMA
ALTER TABLE public.bookings
ALTER COLUMN advance_required_amount SET DEFAULT 500;

-- 3. STORED PROCEDURE FOR SEGMENT-BY-SEGMENT PRICING CALCULATION
CREATE OR REPLACE FUNCTION public.calculate_booking_quote(
    p_court_id TEXT,
    p_start_time TEXT,
    p_duration_minutes INT DEFAULT 60
)
RETURNS TABLE (
    total_amount INT,
    advance_amount INT,
    remaining_amount INT,
    duration_minutes INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_segments INT;
    v_start_hour INT;
    v_current_hour INT;
    v_hourly_rate INT;
    v_total INT := 0;
    v_advance INT := 500;
    v_remaining INT;
    i INT;
BEGIN
    v_segments := GREATEST(1, ROUND(p_duration_minutes::NUMERIC / 60));
    v_start_hour := SPLIT_PART(p_start_time, ':', 1)::INT;

    FOR i IN 0..(v_segments - 1) LOOP
        v_current_hour := (v_start_hour + i) % 24;

        IF p_court_id = 'court-3' THEN
            -- Court 3 is strictly fixed at PKR 2,000/hr all day and night
            v_hourly_rate := 2000;
        ELSE
            -- Courts 1 and 2: Peak (18:00 - 06:00) = PKR 4,000; Off-peak (06:00 - 18:00) = PKR 3,500
            IF v_current_hour >= 18 OR v_current_hour < 6 THEN
                v_hourly_rate := 4000;
            ELSE
                v_hourly_rate := 3500;
            END IF;
        END IF;

        v_total := v_total + v_hourly_rate;
    END LOOP;

    v_remaining := GREATEST(0, v_total - v_advance);

    RETURN QUERY
    SELECT v_total, v_advance, v_remaining, (v_segments * 60);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_booking_quote(TEXT, TEXT, INT) FROM public;
GRANT EXECUTE ON FUNCTION public.calculate_booking_quote(TEXT, TEXT, INT) TO anon, authenticated, service_role;

-- 4. UPDATE get_active_court_slots TO INCLUDE DURATION
-- Note: PostgreSQL requires dropping the existing function first when modifying the return table signature.
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
    SELECT b.start_time, b.end_time, b.duration_minutes, b.status, b.created_at
    FROM public.bookings b
    WHERE b.court_id = p_court_id
      AND b.date = p_date
      AND b.status IN ('awaiting_payment', 'payment_under_review', 'confirmed');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_court_slots(TEXT, DATE) FROM public;
GRANT EXECUTE ON FUNCTION public.get_active_court_slots(TEXT, DATE) TO anon, authenticated, service_role;
