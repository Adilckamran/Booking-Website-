/**
 * Power Padel Arena - Pricing Calculation Engine
 * 
 * BUSINESS SPECIFICATION:
 * - Court 1 (Double Court):
 *   - Off-peak: PKR 3,500/hr (PKR 1,750 per 30 mins) from 6:00 AM to before 6:00 PM (06:00 - 18:00)
 *   - Peak: PKR 4,000/hr (PKR 2,000 per 30 mins) from 6:00 PM to before 6:00 AM (18:00 - 06:00)
 * - Court 2 (Double Court):
 *   - Off-peak: PKR 3,500/hr (PKR 1,750 per 30 mins) from 6:00 AM to before 6:00 PM (06:00 - 18:00)
 *   - Peak: PKR 4,000/hr (PKR 2,000 per 30 mins) from 6:00 PM to before 6:00 AM (18:00 - 06:00)
 * - Court 3 (Single Court):
 *   - Fixed: PKR 2,000/hr (PKR 1,000 per 30 mins) throughout all 24 hours (no peak pricing)
 * 
 * ADVANCE PAYMENT:
 * - Fixed PKR 500 per booking.
 * 
 * DURATIONS SUPPORTED:
 * - Strictly 60, 90, and 120 minutes with 30-minute starting interval granularity.
 */

import { formatTime12, calculateEndTime, getKarachiTimestamp } from '@/utils/timezone';

export { formatTime12, calculateEndTime, getKarachiTimestamp };

export interface SlotSegment {
  startTime: string; // e.g. "17:00"
  endTime: string;   // e.g. "17:30"
  label: string;     // e.g. "05:00 PM - 05:30 PM"
  isPeak: boolean;
  rate: number;
}

export type HourlySegment = SlotSegment;

export interface PricingCalculationResult {
  courtId: string;
  courtName: string;
  courtType: 'double' | 'single';
  durationMinutes: number;
  segments: SlotSegment[];
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
      isPeak: false,
    };
  }

  // Courts 1 and 2 (Double Courts): PKR 3,500 off-peak / PKR 4,000 peak
  return {
    rate: peak ? 4000 : 3500,
    isPeak: peak,
  };
}

/**
 * Returns the 30-minute slot rate for a specific court and starting hour/minute.
 * - Court 3: PKR 1,000 per 30 minutes (PKR 2,000/hr) fixed all 24 hours.
 * - Courts 1 & 2:
 *   - Off-peak (06:00 to before 18:00): PKR 1,750 per 30 minutes (PKR 3,500/hr).
 *   - Peak (18:00 to before 06:00): PKR 2,000 per 30 minutes (PKR 4,000/hr).
 */
export function getHalfHourRate(
  courtId: string,
  hourOrTime: number | string,
  _minute: number = 0
): { rate: number; isPeak: boolean } {
  const hour = typeof hourOrTime === 'string' ? parseInt(hourOrTime.split(':')[0], 10) : hourOrTime;
  const peak = isPeakHour(hour);

  if (courtId === 'court-3') {
    return {
      rate: 1000,
      isPeak: false,
    };
  }

  return {
    rate: peak ? 2000 : 1750,
    isPeak: peak,
  };
}

/**
 * Calculates exact pricing for an arbitrary list of slots.
 */
export function calculateMultipleSlotsPrice(
  courtId: string,
  startTimes: string[],
  slotDurationMinutes: number = 30
): PricingCalculationResult {
  const courtName =
    courtId === 'court-1'
      ? 'Court 1 — Double Court'
      : courtId === 'court-2'
      ? 'Court 2 — Double Court'
      : 'Court 3 — Single Court';

  const courtType = courtId === 'court-3' ? 'single' : 'double';
  const segments: SlotSegment[] = [];
  let totalAmount = 0;

  for (const startTime of startTimes) {
    const [hour, minute] = startTime.split(':').map(Number);
    const endMins = (hour * 60 + (minute || 0) + slotDurationMinutes) % 1440;
    const nextHour = Math.floor(endMins / 60);
    const nextMinute = endMins % 60;

    const segmentStart = `${String(hour).padStart(2, '0')}:${String(minute || 0).padStart(2, '0')}`;
    const segmentEnd = `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
    const label = `${formatTime12(segmentStart)} - ${formatTime12(segmentEnd)}`;

    const { rate, isPeak } =
      slotDurationMinutes === 60
        ? getHourlyRate(courtId, hour)
        : getHalfHourRate(courtId, hour, minute || 0);

    segments.push({
      startTime: segmentStart,
      endTime: segmentEnd,
      label,
      isPeak,
      rate,
    });

    totalAmount += rate;
  }

  const durationMinutes = Math.max(slotDurationMinutes, startTimes.length * slotDurationMinutes);
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
 * Calculates the exact pricing for a booking segment-by-segment in 30-minute increments.
 * Automatically supports 60, 90, 120 minutes and cross-midnight boundaries.
 */
export function calculateBookingPrice(
  courtId: string,
  startTime: string,
  durationMinutes: number = 60
): PricingCalculationResult {
  const normalizedDuration = Math.max(30, Math.round(durationMinutes / 30) * 30);
  const segmentCount = normalizedDuration / 30;

  const [startHour, startMin] = startTime.split(':').map(Number);
  const segments: SlotSegment[] = [];
  let totalAmount = 0;

  for (let i = 0; i < segmentCount; i++) {
    const curTotalMins = (startHour * 60 + (startMin || 0) + i * 30) % 1440;
    const curHour = Math.floor(curTotalMins / 60);
    const curMinute = curTotalMins % 60;

    const nextTotalMins = (curTotalMins + 30) % 1440;
    const nextHour = Math.floor(nextTotalMins / 60);
    const nextMinute = nextTotalMins % 60;

    const segmentStart = `${String(curHour).padStart(2, '0')}:${String(curMinute).padStart(2, '0')}`;
    const segmentEnd = `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
    const label = `${formatTime12(segmentStart)} - ${formatTime12(segmentEnd)}`;

    const { rate, isPeak } = getHalfHourRate(courtId, curHour, curMinute);

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
      ? 'Court 1 — Double Court'
      : courtId === 'court-2'
      ? 'Court 2 — Double Court'
      : 'Court 3 — Single Court';

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
