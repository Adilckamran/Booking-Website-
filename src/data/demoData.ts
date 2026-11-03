import { Court, Booking, TimeSlot } from '@/types';
import { getHalfHourRate, formatTime12 } from '@/services/pricing/pricingService';

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
 * Standard 24-hour operating schedule slots (00:00 to 24:00) with 30-minute intervals
 * Peak hours: 6:00 PM to before 6:00 AM (18:00 - 06:00)
 * Off-peak hours: 6:00 AM to before 6:00 PM (06:00 - 18:00)
 * Exactly 48 30-minute intervals per 24-hour day.
 */
export interface OperatingSlotDef {
  startTime: string;
  endTime: string;
  label: string;
  isPeak: boolean;
}

export const OPERATING_SLOTS_DEF: OperatingSlotDef[] = Array.from({ length: 48 }, (_, i) => {
  const startTotalMins = i * 30;
  const sh = Math.floor(startTotalMins / 60);
  const sm = startTotalMins % 60;
  const endTotalMins = (startTotalMins + 30) % 1440;
  const eh = Math.floor(endTotalMins / 60);
  const em = endTotalMins % 60;

  const startTime = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
  const endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  const isPeak = sh >= 18 || sh < 6;
  const label = `${formatTime12(startTime)} - ${formatTime12(endTime)}`;

  return { startTime, endTime, label, isPeak };
});

/**
 * Generate simulated slots for demo interaction
 */
export function getDemoSlotsForCourt(courtId: string, date: string): TimeSlot[] {
  const court = DEMO_COURTS.find((c) => c.id === courtId) || DEMO_COURTS[0];

  return OPERATING_SLOTS_DEF.map((def, idx) => {
    let status: TimeSlot['status'] = 'available';
    if (idx === 24 || idx === 25) {
      status = 'booked';
    } else if (idx === 26) {
      status = 'held';
    } else if (idx === 36 && courtId === 'court-1') {
      status = 'booked';
    }

    const hour = parseInt(def.startTime.split(':')[0], 10);
    const minute = parseInt(def.startTime.split(':')[1], 10);
    const { rate, isPeak } = getHalfHourRate(court.id, hour, minute);

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
