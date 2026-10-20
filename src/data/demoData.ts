import { Court, Booking, TimeSlot } from '@/types';

export const DEMO_COURTS: Court[] = [
  {
    id: 'court-1',
    courtNumber: 1,
    name: 'Court 1 - Panoramic Pro',
    type: 'panoramic',
    surface: 'Mondo Supercourt XN (World Padel Tour Grade)',
    description: 'Premier panoramic glass court with zero-obstruction rear view and tournament LED lighting.',
    features: ['12mm Tempered Glass', 'Anti-Glare 8x200W LEDs', 'Spectator Seating', 'Live Recording Camera'],
    hourlyRate: 4000,
    peakHourlyRate: 5000,
    isActive: true,
  },
  {
    id: 'court-2',
    courtNumber: 2,
    name: 'Court 2 - Center Court',
    type: 'outdoor',
    surface: 'Textured Monofilament Padel Turf',
    description: 'High-energy outdoor court designed for fast rallies, high bounces, and competitive match play.',
    features: ['Corner Pillar Reinforcement', 'Official WPT Dimensions', 'Pro Court Line Markings', 'Player Rest Dugout'],
    hourlyRate: 3500,
    peakHourlyRate: 4500,
    isActive: true,
  },
  {
    id: 'court-3',
    courtNumber: 3,
    name: 'Court 3 - Indoor Climate Control',
    type: 'indoor',
    surface: 'Shock-Absorbing Comfort Pro Turf',
    description: 'Fully air-conditioned indoor padel court shielded from summer heat and unpredictable weather.',
    features: ['Full Climate AC System', 'Acoustic Sound Dampening', '10m High Clear Ceiling', 'Private Changing Lounge'],
    hourlyRate: 5000,
    peakHourlyRate: 6000,
    isActive: true,
  },
];

/**
 * Standard operating schedule slots
 */
export const OPERATING_SLOTS_DEF = [
  { startTime: '08:00', endTime: '09:00', label: '08:00 AM - 09:00 AM', isPeak: false },
  { startTime: '09:00', endTime: '10:00', label: '09:00 AM - 10:00 AM', isPeak: false },
  { startTime: '10:00', endTime: '11:00', label: '10:00 AM - 11:00 AM', isPeak: false },
  { startTime: '11:00', endTime: '12:00', label: '11:00 AM - 12:00 PM', isPeak: false },
  { startTime: '12:00', endTime: '13:00', label: '12:00 PM - 01:00 PM', isPeak: false },
  { startTime: '13:00', endTime: '14:00', label: '01:00 PM - 02:00 PM', isPeak: false },
  { startTime: '14:00', endTime: '15:00', label: '02:00 PM - 03:00 PM', isPeak: false },
  { startTime: '15:00', endTime: '16:00', label: '03:00 PM - 04:00 PM', isPeak: false },
  { startTime: '16:00', endTime: '17:00', label: '04:00 PM - 05:00 PM', isPeak: false },
  { startTime: '17:00', endTime: '18:00', label: '05:00 PM - 06:00 PM', isPeak: true },
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
    // Generate deterministic demo status based on slot index for consistent UI demonstration
    let status: TimeSlot['status'] = 'available';
    if (idx === 10 || idx === 11) {
      status = 'booked';
    } else if (idx === 12) {
      status = 'held';
    } else if (idx === 13 && courtId === 'court-1') {
      status = 'booked';
    }

    const price = def.isPeak ? court.peakHourlyRate : court.hourlyRate;

    return {
      id: `${courtId}-${date}-${def.startTime}`,
      startTime: def.startTime,
      endTime: def.endTime,
      label: def.label,
      isPeak: def.isPeak,
      price,
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
    courtName: 'Court 1 - Panoramic Pro',
    date: '2026-10-20',
    startTime: '19:00',
    endTime: '20:00',
    durationMinutes: 60,
    totalAmount: 5000,
    advanceRequiredAmount: 2500,
    remainingAmount: 2500,
    status: 'payment_under_review',
    customerName: 'Hamza Tariq',
    customerPhone: '+92 300 8472910',
    customerEmail: 'hamza.tariq@example.com',
    paymentMethod: 'jazzcash',
    transactionRef: 'JC-902819204',
    receiptScreenshotUrl: '/demo/receipt-sample.png',
    createdAt: '2026-10-20T13:45:00Z',
    updatedAt: '2026-10-20T14:10:00Z',
    isDemo: true,
  },
  {
    id: 'b-002',
    referenceNumber: 'PADEL-PK-2026-8922',
    courtId: 'court-2',
    courtName: 'Court 2 - Center Court',
    date: '2026-10-20',
    startTime: '20:00',
    endTime: '21:00',
    durationMinutes: 60,
    totalAmount: 4500,
    advanceRequiredAmount: 2250,
    remainingAmount: 2250,
    status: 'awaiting_payment',
    customerName: 'Bilal Ahmed',
    customerPhone: '+92 321 4455667',
    createdAt: '2026-10-20T14:20:00Z',
    updatedAt: '2026-10-20T14:20:00Z',
    isDemo: true,
  },
  {
    id: 'b-003',
    referenceNumber: 'PADEL-PK-2026-8919',
    courtId: 'court-1',
    courtName: 'Court 1 - Panoramic Pro',
    date: '2026-10-20',
    startTime: '18:00',
    endTime: '19:00',
    durationMinutes: 60,
    totalAmount: 5000,
    advanceRequiredAmount: 2500,
    remainingAmount: 2500,
    status: 'confirmed',
    customerName: 'Zayd Khan',
    customerPhone: '+92 333 9876543',
    paymentMethod: 'bank_transfer',
    transactionRef: 'MEZN-TRX-8391002',
    createdAt: '2026-10-20T11:00:00Z',
    updatedAt: '2026-10-20T11:35:00Z',
    isDemo: true,
  },
  {
    id: 'b-004',
    referenceNumber: 'PADEL-PK-2026-8915',
    courtId: 'court-3',
    courtName: 'Court 3 - Indoor Climate Control',
    date: '2026-10-20',
    startTime: '17:00',
    endTime: '18:00',
    durationMinutes: 60,
    totalAmount: 6000,
    advanceRequiredAmount: 3000,
    remainingAmount: 3000,
    status: 'rejected',
    customerName: 'Usman Ali',
    customerPhone: '+92 345 1122334',
    paymentMethod: 'easypaisa',
    transactionRef: 'EP-00000000',
    rejectionReason: 'Invalid transaction receipt image provided. Bank reference not matched.',
    createdAt: '2026-10-20T09:15:00Z',
    updatedAt: '2026-10-20T09:40:00Z',
    isDemo: true,
  },
  {
    id: 'b-005',
    referenceNumber: 'PADEL-PK-2026-8910',
    courtId: 'court-2',
    courtName: 'Court 2 - Center Court',
    date: '2026-10-20',
    startTime: '21:00',
    endTime: '22:00',
    durationMinutes: 60,
    totalAmount: 4500,
    advanceRequiredAmount: 2250,
    remainingAmount: 2250,
    status: 'cancelled',
    customerName: 'Daniyal Raza',
    customerPhone: '+92 312 8899001',
    cancellationReason: 'Cancelled by customer due to rain / schedule conflict.',
    createdAt: '2026-10-19T18:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z',
    isDemo: true,
  },
  {
    id: 'b-006',
    referenceNumber: 'PADEL-PK-2026-8898',
    courtId: 'court-3',
    courtName: 'Court 3 - Indoor Climate Control',
    date: '2026-10-20',
    startTime: '15:00',
    endTime: '16:00',
    durationMinutes: 60,
    totalAmount: 5000,
    advanceRequiredAmount: 2500,
    remainingAmount: 2500,
    status: 'expired',
    customerName: 'Saad Malik',
    customerPhone: '+92 301 7766554',
    createdAt: '2026-10-20T12:00:00Z',
    updatedAt: '2026-10-20T12:35:00Z',
    isDemo: true,
  },
];
