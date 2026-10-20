import { BusinessConfig } from '@/types';

/**
 * Real Business Configuration for Power Padel Arena (Karachi)
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
  contactPhonePlaceholder: "+92 300 0000000",
  whatsappNumberPlaceholder: "923000000000",
  whatsappDisplayPlaceholder: "+92 300 0000000",
  currency: "PKR",
  slotDurationMinutes: 60,
  advancePercentage: 50, // 50% advance required to hold slot
  openingHour: "08:00",
  closingHour: "01:00", // 1 AM midnight
  bankAccount: {
    bankName: "Meezan Bank Limited [Power Padel Official Account]",
    accountTitle: "Power Padel Arena",
    accountNumber: "0101-000000000000",
    iban: "PK00 MEZN 0000 0000 0000 0000",
    branchName: "PECHS Branch, Karachi",
  },
  easypaisaAccount: {
    provider: "Easypaisa",
    accountTitle: "Power Padel Arena",
    accountNumber: "0300-0000000",
  },
  jazzcashAccount: {
    provider: "JazzCash",
    accountTitle: "Power Padel Arena",
    accountNumber: "0300-0000000",
  },
  termsSummary: [
    "A 50% advance payment via Bank Transfer, Easypaisa, or JazzCash is required within 30 minutes to hold the booking.",
    "Uploading a payment screenshot sets your booking status to 'Payment Under Review' for manual review by Power Padel Arena management.",
    "A screenshot upload is evidence for manual verification and does not automatically confirm payment.",
    "Slots will be released if payment verification is not completed before expiry.",
    "Non-marking athletic sports shoes are mandatory on court.",
  ],
};
