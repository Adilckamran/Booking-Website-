import { BusinessConfig } from '@/types';

/**
 * Real Business Configuration for Power Padel Arena (Karachi)
 * 
 * IMPORTANT:
 * - Bank and Easypaisa details below are OFFICIAL accounts provided for Kashif Ghani.
 * - Court hourly rates, advance percentage, and payment deadline are configurable placeholders
 *   awaiting confirmation of exact club figures.
 */
export const CLUB_CONFIG: BusinessConfig = {
  businessName: "Power Padel Arena",
  clubNamePlaceholder: "Power Padel Arena",
  tagline: "Karachi's Premier Padel Experience",
  businessEmail: "thepowerpadel@gmail.com",
  city: "Karachi",
  cityPlaceholder: "PECHS, Karachi, Pakistan",
  locationArea: "PECHS, Karachi, Pakistan",
  addressPlaceholder: "PECHS, Karachi, Sindh, Pakistan",
  googleMapsUrl: "https://maps.app.goo.gl/Gw2bwrz2HEGTKco3A?g_st=ic",
  instagramUrl: "https://www.instagram.com/powerpadelarena_pechs/?hl=en",
  facebookUrl: "https://www.facebook.com/powerpadelarena/",
  logoPath: "/logo.png",
  contactPhonePlaceholder: "+92 316 2997913",
  whatsappNumberPlaceholder: "923162997913",
  whatsappDisplayPlaceholder: "+92 316 2997913",
  currency: "PKR",
  slotDurationMinutes: 60,
  
  // CONFIRMED BUSINESS VALUES FOR POWER PADEL ARENA
  advanceType: 'fixed', // Confirmed: fixed deposit
  advanceFixedAmount: 500, // Confirmed: PKR 500 fixed advance deposit
  advancePercentage: 50, // Fallback percentage setting
  paymentDeadlineMinutes: 60, // Confirmed: 60-minute temporary hold window
  isPricingConfirmed: true, // Confirmed by club management

  openingHour: "00:00",
  closingHour: "24:00", // Open 24 Hours / 7 Days a Week
  
  // 1. FAYSAL BANK (Official details)
  bankAccount: {
    bankName: "Faysal Bank",
    accountTitle: "Kashif Ghani",
    accountNumber: "0127006000003034",
    iban: "PK16FAYS0127006000003034",
    branchName: "Karachi Branch",
  },
  
  // 2. EASYPAISA (Official details)
  easypaisaAccount: {
    provider: "Easypaisa",
    accountTitle: "Kashif Ghani",
    accountNumber: "03162997913",
  },
  
  termsSummary: [
    "A fixed advance deposit of PKR 500 via Easypaisa or Faysal Bank is required within 60 minutes to hold the court reservation.",
    "The remaining balance is payable at the venue counter upon arrival.",
    "Uploading a payment screenshot sets your booking status to 'Payment Under Review' for manual review by Power Padel Arena management.",
    "A screenshot upload is evidence for manual verification and does not automatically confirm payment.",
    "Slots will be automatically released if payment verification is not completed before the 60-minute hold window expires.",
    "Non-marking athletic sports shoes are mandatory on court.",
  ],
};
