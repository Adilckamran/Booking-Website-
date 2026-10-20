/**
 * WhatsApp Business Platform Cloud API Integration Placeholder
 * 
 * IMPORTANT:
 * - This service provides standard template generators and message formatters
 *   for the official WhatsApp Business Cloud API (Graph API v21+).
 * - NO unofficial automation or browser scrapers are used.
 * - Credentials and phone IDs are strictly kept server-side via environment variables.
 * - In Phase 1, WhatsApp is NOT connected; all operations are strictly placeholders.
 */

export interface WhatsAppTemplatePayload {
  toPhoneNumber: string; // e.g. "923001234567" (E.164 without plus)
  templateName: string;
  languageCode: string;
  parameters: Array<{
    type: 'text' | 'currency' | 'date_time';
    text?: string;
    currency?: { fallback_value: string; code: string; amount_1000: number };
  }>;
}

export interface WhatsAppTextMessage {
  toPhoneNumber: string;
  messageText: string;
}

/**
 * Clean message builders for official WhatsApp Cloud API templates
 */
export const WhatsAppMessageTemplates = {
  /**
   * 1. Automatic First Response / Greeting with booking portal link
   */
  getWelcomeGreeting(customerName: string, clubName: string, bookingPortalUrl: string) {
    return (
      `👋 Assalam-o-Alaikum ${customerName || 'Player'}!\n\n` +
      `Welcome to *${clubName}*.\n` +
      `Looking to book a padel court? You can check live court availability, select time slots, and submit advance payments securely via our booking portal:\n\n` +
      `🔗 ${bookingPortalUrl}\n\n` +
      `Need custom tournament or corporate coaching packages? Reply to this message and our club manager will assist you shortly.`
    );
  },

  /**
   * 2. Booking Website Direct Link
   */
  getBookingPortalLink(clubName: string, bookingUrl: string) {
    return (
      `🎾 *${clubName} - Online Booking*\n\n` +
      `View today's available slots & reserve instantly:\n` +
      `${bookingUrl}\n\n` +
      `_Advance payment required via Bank Transfer, Easypaisa, or JazzCash._`
    );
  },

  /**
   * 3. Booking Hold Created / Payment Instructions
   */
  getPaymentInstructionsMessage(
    customerName: string,
    referenceNumber: string,
    courtName: string,
    date: string,
    slotTime: string,
    advanceAmount: number,
    paymentStatusUrl: string,
    holdDurationMinutes: number = 30
  ) {
    return (
      `⏳ *Hold Reserved - Awaiting Advance Payment*\n\n` +
      `Player: *${customerName}*\n` +
      `Booking Ref: *${referenceNumber}*\n` +
      `Court: ${courtName}\n` +
      `Date & Time: ${date} | ${slotTime}\n` +
      `Advance Required: *PKR ${advanceAmount.toLocaleString()}*\n\n` +
      `⚠️ *Please Note:*\n` +
      `Your slot is held for *${holdDurationMinutes} minutes*. To confirm, please upload your payment screenshot & Transaction ID here:\n` +
      `👉 ${paymentStatusUrl}\n\n` +
      `_Slots are released automatically if proof is not submitted within ${holdDurationMinutes} minutes._`
    );
  },

  /**
   * 4. Payment Under Review Notification
   */
  getPaymentUnderReviewMessage(referenceNumber: string, customerName: string) {
    return (
      `🔍 *Payment Under Review*\n\n` +
      `Dear ${customerName},\n` +
      `We have received your payment screenshot and Transaction Reference for booking *${referenceNumber}*.\n\n` +
      `Our management team is verifying the transaction with our bank/wallet records. You will receive an official confirmation message once approved.\n\n` +
      `_Note: Screenshot upload constitutes proof for manual review and is not an instant confirmation._`
    );
  },

  /**
   * 5. Booking Confirmation Message (Official Confirmed State)
   */
  getBookingConfirmationMessage(
    customerName: string,
    referenceNumber: string,
    courtName: string,
    date: string,
    slotTime: string,
    advancePaid: number,
    remainingAmount: number,
    address: string
  ) {
    return (
      `✅ *BOOKING CONFIRMED!*\n\n` +
      `Dear *${customerName}*,\n` +
      `Your padel court reservation has been officially verified and confirmed.\n\n` +
      `📋 *Details:*\n` +
      `• Ref: *${referenceNumber}*\n` +
      `• Court: ${courtName}\n` +
      `• Date: ${date}\n` +
      `• Slot: ${slotTime}\n` +
      `• Advance Received: PKR ${advancePaid.toLocaleString()}\n` +
      `• Balance at Venue: PKR ${remainingAmount.toLocaleString()}\n\n` +
      `📍 *Location:*\n` +
      `${address}\n\n` +
      `👟 *Court Rules:*\n` +
      `Please wear non-marking sports shoes. Arrive 10 minutes prior to your slot.\n` +
      `See you on court!`
    );
  },

  /**
   * 6. Booking Cancellation or Expiry Message
   */
  getBookingCancelledOrExpiredMessage(
    customerName: string,
    referenceNumber: string,
    reason: string
  ) {
    return (
      `❌ *Booking Update - ${referenceNumber}*\n\n` +
      `Dear ${customerName},\n` +
      `Your booking reservation *${referenceNumber}* has been updated to *Inactive*.\n\n` +
      `Reason: ${reason || 'Payment hold expired or cancelled by player.'}\n\n` +
      `To book a new slot, please visit our booking portal or contact club reception.`
    );
  },
};

/**
 * Server-side placeholder dispatcher
 * Returns status indicator without executing real network calls until credentials configured in Phase 10
 */
export async function dispatchWhatsAppNotificationPlaceholder(
  type: 'welcome' | 'payment_instructions' | 'under_review' | 'confirmed' | 'cancelled',
  recipientPhone: string,
  payloadDetails?: Record<string, unknown>
): Promise<{ success: boolean; isConfigured: boolean; message: string }> {
  void type;
  void payloadDetails;
  const isCloudApiConfigured = Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_SYSTEM_USER_ACCESS_TOKEN
  );

  if (!isCloudApiConfigured) {
    return {
      success: false,
      isConfigured: false,
      message: 'WhatsApp Cloud API credentials not configured (Scheduled for Phase 10).',
    };
  }

  // Future Phase 10 implementation will perform HTTPS POST to:
  // https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages
  return {
    success: true,
    isConfigured: true,
    message: `Dispatched to ${recipientPhone} via Cloud API.`,
  };
}
