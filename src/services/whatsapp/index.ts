/**
 * WhatsApp Business Platform Cloud API Service
 * 
 * Complies strictly with Meta Graph API v21+ specifications:
 * - Direct HTTPS requests to https://graph.facebook.com/v21.0/{phone_number_id}/messages
 * - Bearer authorization using Meta System User Access Token
 * - Zero unofficial automation, browser scrapers, or reverse-engineered clients
 * - Safe error handling: notification failures never reverse database transactions
 */

import { Booking } from '@/types';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { validatePakistaniMobile } from '@/utils/phoneValidation';

export interface WhatsAppDispatchResult {
  attempted: boolean;
  sent: boolean;
  isConfigured: boolean;
  recipientPhone?: string;
  message: string;
  error?: string;
  metaMessageId?: string;
}

export interface WhatsAppSetupStep {
  step: number;
  title: string;
  description: string;
  envVariable?: string;
}

/**
 * Detailed setup checklist for configuring the official Meta WhatsApp Business Cloud API.
 */
export const WHATSAPP_SETUP_CHECKLIST: WhatsAppSetupStep[] = [
  {
    step: 1,
    title: 'Meta Developer Account & WhatsApp Business App',
    description: 'Create a Meta Developer account at developers.facebook.com and register a Business App with the WhatsApp product added.',
  },
  {
    step: 2,
    title: 'Meta WhatsApp Phone Number ID',
    description: 'Navigate to WhatsApp > API Setup in the Meta Developer Dashboard to retrieve your 15-digit Phone Number ID.',
    envVariable: 'WHATSAPP_PHONE_NUMBER_ID',
  },
  {
    step: 3,
    title: 'System User Permanent Access Token',
    description: 'Generate a permanent System User Token in Meta Business Manager with "whatsapp_business_messaging" and "whatsapp_business_management" permissions.',
    envVariable: 'WHATSAPP_ACCESS_TOKEN',
  },
  {
    step: 4,
    title: 'Approved Meta Message Templates',
    description: 'Submit and approve message templates in WhatsApp Message Template Manager (e.g. "booking_confirmation" and "booking_rejection") with language code "en_US" or "ur".',
    envVariable: 'WHATSAPP_CONFIRMATION_TEMPLATE',
  },
];

/**
 * Checks whether WhatsApp Cloud API credentials are configured in server environment variables.
 */
export function isWhatsAppConfigured(): boolean {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = (
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.WHATSAPP_SYSTEM_USER_ACCESS_TOKEN
  )?.trim();

  return Boolean(phoneId && token && !phoneId.includes('your-') && !token.includes('your-'));
}

/**
 * Normalizes a Pakistani phone number to WhatsApp international format (e.g., 923272834501).
 */
export function formatPhoneForWhatsApp(phone: string): string | null {
  const res = validatePakistaniMobile(phone);
  if (!res.valid || !res.normalized) return null;
  const normalized = res.normalized;
  // Normalized format from phoneValidation is 11 digits: "03272834501"
  // Convert to international E.164 without plus: "923272834501"
  if (normalized.startsWith('0')) {
    return `92${normalized.slice(1)}`;
  }
  if (normalized.startsWith('92')) {
    return normalized;
  }
  return normalized;
}

/**
 * Message templates generator adhering to Meta standards.
 */
export const WhatsAppMessageTemplates = {
  getBookingConfirmationMessage(
    customerName: string,
    referenceNumber: string,
    courtName: string,
    date: string,
    slotTime: string,
    advancePaid: number,
    remainingAmount: number,
    address: string
  ): string {
    return (
      `✅ *BOOKING CONFIRMED — POWER PADEL ARENA*\n\n` +
      `Assalam-o-Alaikum *${customerName}*,\n` +
      `Your court booking is officially verified and confirmed.\n\n` +
      `📋 *Match Details:*\n` +
      `• Ref: *${referenceNumber}*\n` +
      `• Court: ${courtName}\n` +
      `• Date: ${date}\n` +
      `• Time: ${slotTime}\n` +
      `• Advance Received: PKR ${advancePaid.toLocaleString()}\n` +
      `• Remaining Balance: PKR ${remainingAmount.toLocaleString()}\n\n` +
      `📍 *Location:*\n` +
      `${address}\n\n` +
      `👟 *Court Guidelines:*\n` +
      `Non-marking sports shoes only. Please arrive 10 minutes prior to your slot.\n\n` +
      `See you on the court!`
    );
  },

  getBookingRejectionMessage(
    customerName: string,
    referenceNumber: string,
    courtName: string,
    date: string,
    slotTime: string,
    rejectionReason: string
  ): string {
    return (
      `❌ *BOOKING UPDATE — POWER PADEL ARENA*\n\n` +
      `Dear *${customerName}*,\n` +
      `Your booking request *${referenceNumber}* could not be approved by management.\n\n` +
      `Court: ${courtName}\n` +
      `Date & Slot: ${date} (${slotTime})\n\n` +
      `⚠️ *Reason:* ${rejectionReason || 'Transaction ID not matched in statement'}\n\n` +
      `The slot hold has been released. If you have questions or completed payment, please contact club reception at ${CLUB_CONFIG.businessEmail}.`
    );
  },

  getPaymentInstructionsMessage(
    customerName: string,
    referenceNumber: string,
    courtName: string,
    date: string,
    slotTime: string,
    advanceAmount: number,
    paymentStatusUrl: string,
    holdDurationMinutes: number = 30
  ): string {
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
};

/**
 * Dispatches an official WhatsApp Cloud API message for a confirmed booking.
 */
export async function sendWhatsAppBookingConfirmation(
  booking: Booking
): Promise<WhatsAppDispatchResult> {
  const recipient = formatPhoneForWhatsApp(booking.customerPhone);

  if (!recipient) {
    return {
      attempted: false,
      sent: false,
      isConfigured: isWhatsAppConfigured(),
      recipientPhone: booking.customerPhone,
      message: 'Invalid Pakistani mobile number format for WhatsApp delivery.',
    };
  }

  if (!isWhatsAppConfigured()) {
    return {
      attempted: false,
      sent: false,
      isConfigured: false,
      recipientPhone: recipient,
      message: 'WhatsApp Business Cloud API is not configured (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not set).',
    };
  }

  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!.trim();
  const token = (
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.WHATSAPP_SYSTEM_USER_ACCESS_TOKEN
  )!.trim();
  const templateName = process.env.WHATSAPP_CONFIRMATION_TEMPLATE?.trim();

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;

  // Construct payload: template if configured, otherwise text message
  let body: Record<string, unknown>;
  if (templateName) {
    body = {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: booking.customerName },
              { type: 'text', text: booking.referenceNumber },
              { type: 'text', text: booking.courtName },
              { type: 'text', text: booking.date },
              { type: 'text', text: `${booking.startTime} - ${booking.endTime}` },
              { type: 'text', text: booking.advanceRequiredAmount.toString() },
            ],
          },
        ],
      },
    };
  } else {
    body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: WhatsAppMessageTemplates.getBookingConfirmationMessage(
          booking.customerName,
          booking.referenceNumber,
          booking.courtName,
          booking.date,
          booking.slots && booking.slots.length > 1
            ? booking.slots.map((s) => `${s.startTime} - ${s.endTime}`).join(', ')
            : `${booking.startTime} - ${booking.endTime}`,
          booking.advanceRequiredAmount,
          booking.remainingAmount,
          CLUB_CONFIG.locationArea
        ),
      },
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      const errMsg = data.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      console.error(`[WhatsAppService] Meta API error for ${recipient}:`, errMsg);
      return {
        attempted: true,
        sent: false,
        isConfigured: true,
        recipientPhone: recipient,
        message: 'WhatsApp delivery rejected by Meta Cloud API.',
        error: errMsg,
      };
    }

    const messageId = data.messages?.[0]?.id;
    return {
      attempted: true,
      sent: true,
      isConfigured: true,
      recipientPhone: recipient,
      message: `WhatsApp message dispatched via Cloud API (ID: ${messageId || 'OK'}).`,
      metaMessageId: messageId,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown WhatsApp dispatch error';
    console.error(`[WhatsAppService] Network failure for ${recipient}:`, errMsg);
    return {
      attempted: true,
      sent: false,
      isConfigured: true,
      recipientPhone: recipient,
      message: 'WhatsApp dispatch network error.',
      error: errMsg,
    };
  }
}

/**
 * Dispatches an official WhatsApp Cloud API message for a rejected booking.
 */
export async function sendWhatsAppBookingRejection(
  booking: Booking,
  rejectionReason: string
): Promise<WhatsAppDispatchResult> {
  const recipient = formatPhoneForWhatsApp(booking.customerPhone);

  if (!recipient) {
    return {
      attempted: false,
      sent: false,
      isConfigured: isWhatsAppConfigured(),
      recipientPhone: booking.customerPhone,
      message: 'Invalid Pakistani mobile number format for WhatsApp delivery.',
    };
  }

  if (!isWhatsAppConfigured()) {
    return {
      attempted: false,
      sent: false,
      isConfigured: false,
      recipientPhone: recipient,
      message: 'WhatsApp Business Cloud API is not configured (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not set).',
    };
  }

  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!.trim();
  const token = (
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.WHATSAPP_SYSTEM_USER_ACCESS_TOKEN
  )!.trim();
  const templateName = process.env.WHATSAPP_REJECTION_TEMPLATE?.trim();

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;

  let body: Record<string, unknown>;
  if (templateName) {
    body = {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: booking.customerName },
              { type: 'text', text: booking.referenceNumber },
              { type: 'text', text: rejectionReason },
            ],
          },
        ],
      },
    };
  } else {
    body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: WhatsAppMessageTemplates.getBookingRejectionMessage(
          booking.customerName,
          booking.referenceNumber,
          booking.courtName,
          booking.date,
          booking.slots && booking.slots.length > 1
            ? booking.slots.map((s) => `${s.startTime} - ${s.endTime}`).join(', ')
            : `${booking.startTime} - ${booking.endTime}`,
          rejectionReason
        ),
      },
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      const errMsg = data.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      console.error(`[WhatsAppService] Meta API error for ${recipient}:`, errMsg);
      return {
        attempted: true,
        sent: false,
        isConfigured: true,
        recipientPhone: recipient,
        message: 'WhatsApp delivery rejected by Meta Cloud API.',
        error: errMsg,
      };
    }

    const messageId = data.messages?.[0]?.id;
    return {
      attempted: true,
      sent: true,
      isConfigured: true,
      recipientPhone: recipient,
      message: `WhatsApp rejection notice dispatched via Cloud API (ID: ${messageId || 'OK'}).`,
      metaMessageId: messageId,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown WhatsApp dispatch error';
    console.error(`[WhatsAppService] Network failure for ${recipient}:`, errMsg);
    return {
      attempted: true,
      sent: false,
      isConfigured: true,
      recipientPhone: recipient,
      message: 'WhatsApp dispatch network error.',
      error: errMsg,
    };
  }
}
