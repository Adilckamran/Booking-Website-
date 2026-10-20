import { BusinessConfig } from '@/types';

/**
 * Central Configuration for Padel Club
 * 
 * IMPORTANT NOTE:
 * All business details, account numbers, and phone numbers below are
 * clearly labeled CONFIGURABLE DEMO PLACEHOLDERS.
 * In production, these should be loaded from environment variables
 * or managed via the admin settings panel backed by Supabase.
 */
export const CLUB_CONFIG: BusinessConfig = {
  clubNamePlaceholder: "[PADEL CLUB NAME PLACEHOLDER]",
  tagline: "Premier Padel Courts & Athletic Club",
  cityPlaceholder: "Lahore / Karachi / Islamabad [Configurable City]",
  addressPlaceholder: "[Configurable Facility Address, Sector / Phase / Area, City, Pakistan]",
  contactPhonePlaceholder: "+92 300 0000000 [Configurable Phone]",
  whatsappNumberPlaceholder: "923000000000",
  whatsappDisplayPlaceholder: "+92 300 0000000",
  currency: "PKR",
  slotDurationMinutes: 60,
  advancePercentage: 50, // 50% advance required to hold slot
  openingHour: "08:00",
  closingHour: "01:00", // 1 AM next day
  bankAccount: {
    bankName: "Meezan Bank Limited [Configurable Bank]",
    accountTitle: "[Padel Club Official Account Title]",
    accountNumber: "0101-000000000000",
    iban: "PK00 MEZN 0000 0000 0000 0000",
    branchName: "[Configurable Branch, City]",
  },
  easypaisaAccount: {
    provider: "Easypaisa",
    accountTitle: "[Easypaisa Registered Title]",
    accountNumber: "0300-0000000",
  },
  jazzcashAccount: {
    provider: "JazzCash",
    accountTitle: "[JazzCash Registered Title]",
    accountNumber: "0300-0000000",
  },
  termsSummary: [
    "A 50% advance payment via Bank Transfer, Easypaisa, or JazzCash is required within 30 minutes to secure the booking.",
    "Uploading a payment screenshot sends your booking to 'Payment Under Review' for admin verification.",
    "A screenshot upload is evidence for manual verification and does not automatically confirm the booking.",
    "Slots will be released if payment proof is not received or cannot be verified before expiry.",
    "Proper non-marking athletic shoes are mandatory on all court surfaces.",
  ],
};
