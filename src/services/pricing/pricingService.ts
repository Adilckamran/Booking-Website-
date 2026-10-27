/**
 * Power Padel Arena - Pricing Calculation Engine
 * 
 * BUSINESS SPECIFICATION:
 * - Court 1 (Double Court):
 *   - Off-peak: PKR 3,500/hr (6:00 AM to before 6:00 PM)
 *   - Peak: PKR 4,000/hr (6:00 PM to before 6:00 AM)
 * - Court 2 (Double Court):
 *   - Off-peak: PKR 3,500/hr (6:00 AM to before 6:00 PM)
 *   - Peak: PKR 4,000/hr (6:00 PM to before 6:00 AM)
 * - Court 3 (Single Court):
 *   - Fixed: PKR 2,000/hr all day and night (no peak/off-peak pricing)
 * 
 * ADVANCE PAYMENT:
 * - Fixed PKR 500 per booking.
 */

export interface HourlySegment {
  startTime: string; // e.g. "17:00"
  endTime: string;   // e.g. "18:00"
  label: string;     // e.g. "05:00 PM - 06:00 PM"
  isPeak: boolean;
  rate: number;
}

export interface PricingCalculationResult {
  courtId: string;
  courtName: string;
  courtType: 'double' | 'single';
  durationMinutes: number;
  segments: HourlySegment[];
  totalAmount: number;
  advanceRequiredAmount: number;
  remainingAmount: number;
}

/**
 * Determines whether a given hour (0-23) falls into Peak hours.
 * Peak hours: 6:00 PM (18:00) to before 6:00 AM (06:00).
 * Off-peak hours: 6:00 AM (06:00) to before 6:00 PM (18:00).
 */
export function isPeakHour(hour: number): boolean {
  return hour >= 18 || hour < 6;
}

/**
 * Returns the hourly rate for a specific court and starting hour.
 */
export function getHourlyRate(courtId: string, hour: number): { rate: number; isPeak: boolean } {
  const peak = isPeakHour(hour);

  // Court 3 (Single Court) is strictly fixed at PKR 2,000 per hour, all day and night
  if (courtId === 'court-3') {
    return {
      rate: 2000,
      isPeak: false, // Court 3 does not apply peak pricing
    };
  }

  // Courts 1 and 2 (Double Courts): PKR 3,500 off-peak / PKR 4,000 peak
  return {
    rate: peak ? 4000 : 3500,
    isPeak: peak,
  };
}

/**
 * Formats a 24h hour (0-23) into human-readable 12h label (e.g., 6 -> "06:00 AM", 18 -> "06:00 PM")
 */
function formatHour12(hour: number): string {
  const h24 = ((hour % 24) + 24) % 24;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:00 ${ampm}`;
}

/**
 * Formats a 24h hour (0-23) into "HH:00" string
 */
function formatHour24(hour: number): string {
  const h24 = ((hour % 24) + 24) % 24;
  return `${String(h24).padStart(2, '0')}:00`;
}

/**
 * Calculates exact pricing for an arbitrary list of (potentially non-consecutive) slots.
 * Each slot is computed using its own start hour and court rate.
 */
export function calculateMultipleSlotsPrice(
  courtId: string,
  startTimes: string[]
): PricingCalculationResult {
  const courtName =
    courtId === 'court-1'
      ? 'Court 1 — Double Court'
      : courtId === 'court-2'
      ? 'Court 2 — Double Court'
      : 'Court 3 — Single Court';

  const courtType = courtId === 'court-3' ? 'single' : 'double';
  const durationMinutes = Math.max(60, startTimes.length * 60);
  const segments: HourlySegment[] = [];
  let totalAmount = 0;

  for (const startTime of startTimes) {
    const hour = parseInt(startTime.split(':')[0], 10);
    const nextHour = (hour + 1) % 24;
    const segmentStart = formatHour24(hour);
    const segmentEnd = formatHour24(nextHour);
    const label = `${formatHour12(hour)} - ${formatHour12(nextHour)}`;
    const { rate, isPeak } = getHourlyRate(courtId, hour);

    segments.push({
      startTime: segmentStart,
      endTime: segmentEnd,
      label,
      isPeak,
      rate,
    });

    totalAmount += rate;
  }

  const advanceRequiredAmount = 500; // Fixed PKR 500 advance deposit
  const remainingAmount = Math.max(0, totalAmount - advanceRequiredAmount);

  return {
    courtId,
    courtName,
    courtType,
    durationMinutes,
    segments,
    totalAmount,
    advanceRequiredAmount,
    remainingAmount,
  };
}

/**
 * Calculates the exact pricing for a booking segment-by-segment.
 * For bookings crossing 6:00 PM or 6:00 AM, each hourly segment is
 * computed using its applicable rate.
 */
export function calculateBookingPrice(
  courtId: string,
  startTime: string,
  durationMinutes: number = 60
): PricingCalculationResult {
  const normalizedDuration = Math.max(60, Math.round(durationMinutes / 60) * 60);
  const segmentCount = normalizedDuration / 60;
  
  const startHour = parseInt(startTime.split(':')[0], 10);
  const segments: HourlySegment[] = [];
  let totalAmount = 0;

  for (let i = 0; i < segmentCount; i++) {
    const currentHour = (startHour + i) % 24;
    const nextHour = (currentHour + 1) % 24;

    const segmentStart = formatHour24(currentHour);
    const segmentEnd = formatHour24(nextHour);
    const label = `${formatHour12(currentHour)} - ${formatHour12(nextHour)}`;

    const { rate, isPeak } = getHourlyRate(courtId, currentHour);
    
    segments.push({
      startTime: segmentStart,
      endTime: segmentEnd,
      label,
      isPeak,
      rate,
    });

    totalAmount += rate;
  }

  const advanceRequiredAmount = 500; // Fixed PKR 500 advance deposit
  const remainingAmount = Math.max(0, totalAmount - advanceRequiredAmount);

  const courtName =
    courtId === 'court-1'
      ? 'Court 1 - Double Court'
      : courtId === 'court-2'
      ? 'Court 2 - Double Court'
      : 'Court 3 - Single Court';

  const courtType = courtId === 'court-3' ? 'single' : 'double';

  return {
    courtId,
    courtName,
    courtType,
    durationMinutes: normalizedDuration,
    segments,
    totalAmount,
    advanceRequiredAmount,
    remainingAmount,
  };
}

/**
 * Calculates end time string (e.g. "18:00" + 120 mins -> "20:00")
 */
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  const startHour = parseInt(startTime.split(':')[0], 10);
  const durationHours = Math.max(1, Math.round(durationMinutes / 60));
  const endHour = (startHour + durationHours) % 24;
  return formatHour24(endHour);
}
