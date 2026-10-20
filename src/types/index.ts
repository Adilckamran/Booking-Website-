export type CourtType = 'panoramic' | 'indoor' | 'outdoor' | 'standard';

export interface Court {
  id: string;
  name: string;
  type: CourtType;
  surface: string;
  description: string;
  features: string[];
  hourlyRate: number; // in PKR
  peakHourlyRate: number; // in PKR
  isActive: boolean;
  courtNumber: number;
}

export type SlotStatus = 'available' | 'held' | 'booked';

export interface TimeSlot {
  id: string;
  startTime: string; // e.g. "17:00"
  endTime: string;   // e.g. "18:00"
  label: string;     // e.g. "05:00 PM - 06:00 PM"
  isPeak: boolean;
  price: number;
  status: SlotStatus;
  heldUntil?: string; // ISO timestamp
}

export type BookingStatus =
  | 'awaiting_payment'
  | 'payment_under_review'
  | 'confirmed'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export type PaymentMethod = 'bank_transfer' | 'easypaisa' | 'jazzcash' | 'cash_at_venue';

export interface PaymentSubmission {
  method: PaymentMethod;
  transactionRef: string;
  screenshotFile?: File;
  screenshotPreviewUrl?: string;
  submittedAt: string;
  notes?: string;
}

export interface Booking {
  id: string;
  referenceNumber: string; // e.g. "PADEL-PK-2026-4892"
  courtId: string;
  courtName: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "18:00"
  endTime: string; // "19:00"
  durationMinutes: number;
  totalAmount: number; // PKR
  advanceRequiredAmount: number; // PKR
  remainingAmount: number; // PKR
  status: BookingStatus;
  customerName: string;
  customerPhone: string; // e.g. "+92 300 1234567"
  customerEmail?: string;
  paymentMethod?: PaymentMethod;
  transactionRef?: string;
  receiptScreenshotUrl?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface BankAccountDetails {
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban: string;
  branchName?: string;
}

export interface MobileWalletDetails {
  provider: 'Easypaisa' | 'JazzCash';
  accountTitle: string;
  accountNumber: string;
}

export interface BusinessConfig {
  businessName: string;
  clubNamePlaceholder: string; // for backward compatibility
  tagline: string;
  businessEmail: string;
  city: string;
  cityPlaceholder: string;
  locationArea: string;
  addressPlaceholder: string;
  googleMapsUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  logoPath: string;
  contactPhonePlaceholder: string;
  whatsappNumberPlaceholder: string;
  whatsappDisplayPlaceholder: string;
  currency: string;
  slotDurationMinutes: number;
  advancePercentage: number; // e.g. 50%
  openingHour: string; // "08:00"
  closingHour: string; // "01:00" (next day)
  bankAccount: BankAccountDetails;
  easypaisaAccount: MobileWalletDetails;
  jazzcashAccount: MobileWalletDetails;
  termsSummary: string[];
}
