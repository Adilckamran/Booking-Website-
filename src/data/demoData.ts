import { Court, Booking, TimeSlot } from '@/types';
import { getHourlyRate } from '@/services/pricing/pricingService';

export const DEMO_COURTS: Court[] = [
  {
    id: 'court-1',
    courtNumber: 1,
    name: 'Court 1 — Double Court',
    type: 'double',
    surface: 'Mondo Supercourt XN (World Padel Tour Grade)',
    description: 'Premier panoramic double padel court for 4 players with tournament LED lighting.',
    features: ['Double Match Play (4 Players)', '12mm Tempered Glass', 'Anti-Glare Tournament LEDs', 'Spectator Seating'],
    hourlyRate: 3500, // Off-peak (06:00 to 18:00)
    peakHourlyRate: 4000, // Peak (18:00 to 06:00)
    isActive: true,
  },
  {
    id: 'court-2',
    courtNumber: 2,
    name: 'Court 2 — Double Court',
    type: 'double',
    surface: 'Textured Monofilament Padel Turf',
    description: 'High-energy double padel court for fast rallies, high bounces, and competitive match play.',
    features: ['Double Match Play (4 Players)', 'Corner Pillar Reinforcement', 'Official WPT Dimensions', 'Pro Court Line Markings'],
    hourlyRate: 3500, // Off-peak (06:00 to 18:00)
    peakHourlyRate: 4000, // Peak (18:00 to 06:00)
    isActive: true,
  },
  {
    id: 'court-3',
    courtNumber: 3,
    name: 'Court 3 — Single Court',
    type: 'single',
    surface: 'Shock-Absorbing Comfort Pro Turf',
    description: 'Dedicated single 1v1 padel court for precision singles match play and intensive coaching.',
    features: ['Single Match Play (2 Players)', 'Fixed PKR 2,000/hr All Day', 'Shock-Absorbing Turf', 'Coaching & Precision Drills'],
    hourlyRate: 2000, // Fixed rate all day and night (no peak pricing)
    peakHourlyRate: 2000, // Fixed rate all day and night
    isActive: true,
  },
];

/**
 * Standard 24-hour operating schedule slots (00:00 to 24:00)
 * Peak hours: 6:00 PM to before 6:00 AM (18:00 - 06:00)
 * Off-peak hours: 6:00 AM to before 6:00 PM (06:00 - 18:00)
 * The final hourly slot each day is 11:00 PM - 12:00 AM (23:00 - 00:00).
 */
export const OPERATING_SLOTS_DEF = [
  { startTime: '00:00', endTime: '01:00', label: '12:00 AM - 01:00 AM', isPeak: true },
  { startTime: '01:00', endTime: '02:00', label: '01:00 AM - 02:00 AM', isPeak: true },
  { startTime: '02:00', endTime: '03:00', label: '02:00 AM - 03:00 AM', isPeak: true },
  { startTime: '03:00', endTime: '04:00', label: '03:00 AM - 04:00 AM', isPeak: true },
  { startTime: '04:00', endTime: '05:00', label: '04:00 AM - 05:00 AM', isPeak: true },
  { startTime: '05:00', endTime: '06:00', label: '05:00 AM - 06:00 AM', isPeak: true },
  { startTime: '06:00', endTime: '07:00', label: '06:00 AM - 07:00 AM', isPeak: false },
  { startTime: '07:00', endTime: '08:00', label: '07:00 AM - 08:00 AM', isPeak: false },
  { startTime: '08:00', endTime: '09:00', label: '08:00 AM - 09:00 AM', isPeak: false },
  { startTime: '09:00', endTime: '10:00', label: '09:00 AM - 10:00 AM', isPeak: false },
  { startTime: '10:00', endTime: '11:00', label: '10:00 AM - 11:00 AM', isPeak: false },
  { startTime: '11:00', endTime: '12:00', label: '11:00 AM - 12:00 PM', isPeak: false },
  { startTime: '12:00', endTime: '13:00', label: '12:00 PM - 01:00 PM', isPeak: false },
  { startTime: '13:00', endTime: '14:00', label: '01:00 PM - 02:00 PM', isPeak: false },
  { startTime: '14:00', endTime: '15:00', label: '02:00 PM - 03:00 PM', isPeak: false },
  { startTime: '15:00', endTime: '16:00', label: '03:00 PM - 04:00 PM', isPeak: false },
  { startTime: '16:00', endTime: '17:00', label: '04:00 PM - 05:00 PM', isPeak: false },
  { startTime: '17:00', endTime: '18:00', label: '05:00 PM - 06:00 PM', isPeak: false },
  { startTime: '18:00', endTime: '19:00', label: '06:00 PM - 07:00 PM', isPeak: true },
  { startTime: '19:00', endTime: '20:00', label: '07:00 PM - 08:00 PM', isPeak: true },
  { startTime: '20:00', endTime: '21:00', label: '08:00 PM - 09:00 PM', isPeak: true },
  { startTime: '21:00', endTime: '22:00', label: '09:00 PM - 10:00 PM', isPeak: true },
  { startTime: '22:00', endTime: '23:00', label: '10:00 PM - 11:00 PM', isPeak: true },
  { startTime: '23:00', endTime: '00:00', label: '11:00 PM - 12:00 AM', isPeak: true },
];

/**
 * Generate simulated slots for demo interaction
 */
export function getDemoSlotsForCourt(courtId: string, date: string): TimeSlot[] {
  const court = DEMO_COURTS.find((c) => c.id === courtId) || DEMO_COURTS[0];

  return OPERATING_SLOTS_DEF.map((def, idx) => {
    let status: TimeSlot['status'] = 'available';
    if (idx === 12 || idx === 13) {
      status = 'booked';
    } else if (idx === 14) {
      status = 'held';
    } else if (idx === 15 && courtId === 'court-1') {
      status = 'booked';
    }

    const hour = parseInt(def.startTime.split(':')[0], 10);
    const { rate, isPeak } = getHourlyRate(court.id, hour);

    return {
      id: `${courtId}-${date}-${def.startTime}`,
      startTime: def.startTime,
      endTime: def.endTime,
      label: def.label,
      isPeak,
      price: rate,
      status,
      heldUntil: status === 'held' ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : undefined,
    };
  });
}

export const INITIAL_DEMO_BOOKINGS: Booking[] = [
  {
    id: 'b-001',
    referenceNumber: 'PADEL-PK-2026-8921',
    courtId: 'court-1',
    courtName: 'Court 1 — Double Court',
    date: '2026-10-25',
    startTime: '19:00',
    endTime: '20:00',
    durationMinutes: 60,
    totalAmount: 4000,
    advanceRequiredAmount: 500,
    remainingAmount: 3500,
    status: 'payment_under_review',
    customerName: 'Hamza Tariq',
    customerPhone: '+92 300 8472910',
    customerEmail: 'hamza.tariq@example.com',
    paymentMethod: 'easypaisa',
    transactionRef: 'EP-902819204',
    receiptScreenshotUrl: '/demo/receipt-sample.png',
    createdAt: '2026-10-25T13:45:00Z',
    updatedAt: '2026-10-25T14:10:00Z',
    isDemo: true,
  },
  {
    id: 'b-002',
    referenceNumber: 'PADEL-PK-2026-8922',
    courtId: 'court-2',
    courtName: 'Court 2 — Double Court',
    date: '2026-10-25',
    startTime: '16:00',
    endTime: '17:00',
    durationMinutes: 60,
    totalAmount: 3500,
    advanceRequiredAmount: 500,
    remainingAmount: 3000,
    status: 'awaiting_payment',
    customerName: 'Bilal Ahmed',
    customerPhone: '+92 321 4455667',
    createdAt: '2026-10-25T14:20:00Z',
    updatedAt: '2026-10-25T14:20:00Z',
    isDemo: true,
  },
  {
    id: 'b-003',
    referenceNumber: 'PADEL-PK-2026-8919',
    courtId: 'court-3',
    courtName: 'Court 3 — Single Court',
    date: '2026-10-25',
    startTime: '18:00',
    endTime: '19:00',
    durationMinutes: 60,
    totalAmount: 2000,
    advanceRequiredAmount: 500,
    remainingAmount: 1500,
    status: 'confirmed',
    customerName: 'Zayd Khan',
    customerPhone: '+92 333 9876543',
    paymentMethod: 'bank_transfer',
    transactionRef: 'FAYS-TRX-8391002',
    createdAt: '2026-10-25T11:00:00Z',
    updatedAt: '2026-10-25T11:35:00Z',
    isDemo: true,
  },
  {
    id: 'b-004',
    referenceNumber: 'PADEL-PK-2026-8915',
    courtId: 'court-1',
    courtName: 'Court 1 — Double Court',
    date: '2026-10-25',
    startTime: '17:00',
    endTime: '19:00',
    durationMinutes: 120, // 2-hour cross-boundary booking: 17-18 offpeak (3500) + 18-19 peak (4000) = 7500
    totalAmount: 7500,
    advanceRequiredAmount: 500,
    remainingAmount: 7000,
    status: 'rejected',
    customerName: 'Usman Ali',
    customerPhone: '+92 345 1122334',
    paymentMethod: 'easypaisa',
    transactionRef: 'EP-00000000',
    rejectionReason: 'Transaction ID not matched in bank statement.',
    createdAt: '2026-10-25T09:15:00Z',
    updatedAt: '2026-10-25T09:40:00Z',
    isDemo: true,
  },
  {
    id: 'b-005',
    referenceNumber: 'PADEL-PK-2026-8910',
    courtId: 'court-2',
    courtName: 'Court 2 — Double Court',
    date: '2026-10-25',
    startTime: '21:00',
    endTime: '22:00',
    durationMinutes: 60,
    totalAmount: 4000,
    advanceRequiredAmount: 500,
    remainingAmount: 3500,
    status: 'cancelled',
    customerName: 'Daniyal Raza',
    customerPhone: '+92 312 8899001',
    cancellationReason: 'Cancelled by customer due to rain / schedule conflict.',
    createdAt: '2026-10-24T18:00:00Z',
    updatedAt: '2026-10-25T08:00:00Z',
    isDemo: true,
  },
  {
    id: 'b-006',
    referenceNumber: 'PADEL-PK-2026-8898',
    courtId: 'court-3',
    courtName: 'Court 3 — Single Court',
    date: '2026-10-25',
    startTime: '14:00',
    endTime: '16:00',
    durationMinutes: 120, // 2 hours on Court 3: 2000 + 2000 = 4000
    totalAmount: 4000,
    advanceRequiredAmount: 500,
    remainingAmount: 3500,
    status: 'expired',
    customerName: 'Saad Malik',
    customerPhone: '+92 301 7766554',
    createdAt: '2026-10-25T12:00:00Z',
    updatedAt: '2026-10-25T12:35:00Z',
    isDemo: true,
  },
];
