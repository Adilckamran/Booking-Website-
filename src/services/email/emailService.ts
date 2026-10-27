import nodemailer from 'nodemailer';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { Booking } from '@/types';

export interface EmailDispatchResult {
  attempted: boolean;
  sent: boolean;
  isConfigured: boolean;
  recipient?: string;
  message: string;
  error?: string;
}

/**
 * Checks whether server-side email credentials (e.g. Gmail App Password) are configured.
 */
export function isEmailServiceConfigured(): boolean {
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
  return Boolean(pass && pass.trim().length > 0);
}

/**
 * Helper to build an authorized nodemailer transporter.
 */
function createEmailTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.GMAIL_USER || process.env.SMTP_USER || CLUB_CONFIG.businessEmail;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '';
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: true,
    },
  });
}

/**
 * Validates whether an email string has a reasonable format.
 */
export function isValidEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Sends a booking confirmation email to the customer.
 */
export async function sendBookingConfirmationEmail(
  booking: Booking
): Promise<EmailDispatchResult> {
  const recipient = booking.customerEmail?.trim();

  if (!isValidEmail(recipient)) {
    return {
      attempted: false,
      sent: false,
      isConfigured: isEmailServiceConfigured(),
      recipient: recipient || undefined,
      message: 'No valid customer email address provided for this booking.',
    };
  }

  if (!isEmailServiceConfigured()) {
    return {
      attempted: false,
      sent: false,
      isConfigured: false,
      recipient,
      message: 'Email service is not configured (GMAIL_APP_PASSWORD is not set in server environment).',
    };
  }

  try {
    const transporter = createEmailTransporter();
    const sender = process.env.GMAIL_USER || process.env.SMTP_USER || CLUB_CONFIG.businessEmail;

    const timeDisplay = booking.slots && booking.slots.length > 1
      ? `${booking.slots.map((s) => `${s.startTime} - ${s.endTime}`).join(', ')} (${booking.durationMinutes} mins)`
      : `${booking.startTime} - ${booking.endTime} (${booking.durationMinutes} mins)`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
    .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0A2540; padding: 28px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0; font-size: 13px; color: #f97316; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    .body { padding: 24px; }
    .badge { display: inline-block; padding: 6px 14px; background: #ecfdf5; color: #047857; font-weight: 700; border-radius: 9999px; font-size: 12px; border: 1px solid #a7f3d0; margin-bottom: 16px; }
    .detail-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .detail-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .detail-table td:first-child { color: #64748b; font-weight: 600; width: 40%; }
    .detail-table td:last-child { color: #0f172a; font-weight: 700; text-align: right; }
    .total-box { background: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-top: 16px; }
    .rules { background: #fff7ed; border-left: 4px solid #f97316; padding: 14px; font-size: 12px; color: #9a3412; margin-top: 20px; border-radius: 0 8px 8px 0; }
    .footer { text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${CLUB_CONFIG.businessName}</h1>
      <p>Booking Confirmed</p>
    </div>
    <div class="body">
      <div style="text-align: center;">
        <span class="badge">Official Confirmation</span>
      </div>
      <p style="font-size: 14px; line-height: 1.5;">Dear <strong>${booking.customerName}</strong>,</p>
      <p style="font-size: 13px; color: #475569; line-height: 1.5;">
        Your advance payment for booking <strong>${booking.referenceNumber}</strong> has been verified by our management. Your match slot is officially locked.
      </p>

      <table class="detail-table">
        <tr>
          <td>Booking Reference</td>
          <td style="font-family: monospace; color: #f97316;">${booking.referenceNumber}</td>
        </tr>
        <tr>
          <td>Court</td>
          <td>${booking.courtName}</td>
        </tr>
        <tr>
          <td>Date</td>
          <td>${booking.date}</td>
        </tr>
        <tr>
          <td>Time Slot</td>
          <td>${timeDisplay}</td>
        </tr>
        <tr>
          <td>Status</td>
          <td style="color: #047857;">CONFIRMED</td>
        </tr>
      </table>

      <div class="total-box">
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
          <span style="color: #64748b;">Advance Received:</span>
          <strong style="color: #047857;">PKR ${booking.advanceRequiredAmount.toLocaleString()}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
          <span style="color: #64748b;">Balance Due at Venue:</span>
          <strong style="color: #0f172a;">PKR ${booking.remainingAmount.toLocaleString()}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: 800; border-top: 1px dashed #cbd5e1; padding-top: 8px; margin-top: 6px;">
          <span style="color: #0f172a;">Total Court Fee:</span>
          <span style="color: #0A2540;">PKR ${booking.totalAmount.toLocaleString()}</span>
        </div>
      </div>

      <div class="rules">
        <strong>Court Instructions:</strong><br>
        • Please arrive 10 minutes before your scheduled slot.<br>
        • Non-marking sports/padel shoes are mandatory on all courts.<br>
        • Venue: ${CLUB_CONFIG.locationArea}, Karachi.
      </div>
    </div>
    <div class="footer">
      ${CLUB_CONFIG.businessName} • PECHS, Karachi • ${CLUB_CONFIG.businessEmail}<br>
      This is an automated notification from our reservation system.
    </div>
  </div>
</body>
</html>
    `;

    await transporter.sendMail({
      from: `"${CLUB_CONFIG.businessName}" <${sender}>`,
      to: recipient,
      subject: `Booking Confirmed: ${booking.referenceNumber} — ${CLUB_CONFIG.businessName}`,
      html: htmlContent,
      text: `Dear ${booking.customerName},\n\nYour padel court reservation ${booking.referenceNumber} is officially CONFIRMED.\n\nCourt: ${booking.courtName}\nDate: ${booking.date}\nTime: ${timeDisplay}\nAdvance Paid: PKR ${booking.advanceRequiredAmount.toLocaleString()}\nBalance at Venue: PKR ${booking.remainingAmount.toLocaleString()}\nTotal: PKR ${booking.totalAmount.toLocaleString()}\n\nVenue: ${CLUB_CONFIG.locationArea}, Karachi.\n\nThank you for choosing ${CLUB_CONFIG.businessName}!`,
    });

    return {
      attempted: true,
      sent: true,
      isConfigured: true,
      recipient,
      message: `Confirmation email delivered to ${recipient}.`,
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown email delivery failure';
    console.error(`[EmailService] Failed to send confirmation to ${recipient}:`, errMessage);
    return {
      attempted: true,
      sent: false,
      isConfigured: true,
      recipient,
      message: 'Email delivery failed due to provider/network error.',
      error: errMessage,
    };
  }
}

/**
 * Sends a booking rejection email to the customer with the admin's explanation.
 */
export async function sendBookingRejectionEmail(
  booking: Booking,
  rejectionReason: string
): Promise<EmailDispatchResult> {
  const recipient = booking.customerEmail?.trim();

  if (!isValidEmail(recipient)) {
    return {
      attempted: false,
      sent: false,
      isConfigured: isEmailServiceConfigured(),
      recipient: recipient || undefined,
      message: 'No valid customer email address provided for this booking.',
    };
  }

  if (!isEmailServiceConfigured()) {
    return {
      attempted: false,
      sent: false,
      isConfigured: false,
      recipient,
      message: 'Email service is not configured (GMAIL_APP_PASSWORD is not set in server environment).',
    };
  }

  try {
    const transporter = createEmailTransporter();
    const sender = process.env.GMAIL_USER || process.env.SMTP_USER || CLUB_CONFIG.businessEmail;

    const timeDisplay = booking.slots && booking.slots.length > 1
      ? `${booking.slots.map((s) => `${s.startTime} - ${s.endTime}`).join(', ')} (${booking.durationMinutes} mins)`
      : `${booking.startTime} - ${booking.endTime} (${booking.durationMinutes} mins)`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
    .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0A2540; padding: 28px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0; font-size: 13px; color: #f43f5e; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    .body { padding: 24px; }
    .badge { display: inline-block; padding: 6px 14px; background: #fff1f2; color: #e11d48; font-weight: 700; border-radius: 9999px; font-size: 12px; border: 1px solid #fecdd3; margin-bottom: 16px; }
    .detail-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .detail-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .detail-table td:first-child { color: #64748b; font-weight: 600; width: 40%; }
    .detail-table td:last-child { color: #0f172a; font-weight: 700; text-align: right; }
    .reason-box { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; padding: 16px; margin: 16px 0; }
    .reason-title { font-size: 11px; text-transform: uppercase; font-weight: 800; color: #be123c; letter-spacing: 0.5px; }
    .reason-text { font-size: 13px; color: #881337; margin-top: 6px; font-weight: 600; }
    .cta-box { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
    .footer { text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${CLUB_CONFIG.businessName}</h1>
      <p>Booking Update</p>
    </div>
    <div class="body">
      <div style="text-align: center;">
        <span class="badge">Payment Not Verified</span>
      </div>
      <p style="font-size: 14px; line-height: 1.5;">Dear <strong>${booking.customerName}</strong>,</p>
      <p style="font-size: 13px; color: #475569; line-height: 1.5;">
        We regret to inform you that your booking request <strong>${booking.referenceNumber}</strong> could not be approved by management. The temporary slot hold has been released.
      </p>

      <div class="reason-box">
        <div class="reason-title">Reason Provided by Management:</div>
        <div class="reason-text">${rejectionReason || 'Payment verification could not be completed.'}</div>
      </div>

      <table class="detail-table">
        <tr>
          <td>Booking Reference</td>
          <td style="font-family: monospace;">${booking.referenceNumber}</td>
        </tr>
        <tr>
          <td>Court</td>
          <td>${booking.courtName}</td>
        </tr>
        <tr>
          <td>Date & Slot</td>
          <td>${booking.date} | ${timeDisplay}</td>
        </tr>
        <tr>
          <td>Current Status</td>
          <td style="color: #e11d48;">REJECTED</td>
        </tr>
      </table>

      <div class="cta-box">
        <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
          If you believe this was an error or already completed the payment transfer, please contact our management team directly at <a href="mailto:${CLUB_CONFIG.businessEmail}" style="color: #f97316;">${CLUB_CONFIG.businessEmail}</a>.
        </p>
      </div>
    </div>
    <div class="footer">
      ${CLUB_CONFIG.businessName} • PECHS, Karachi • ${CLUB_CONFIG.businessEmail}<br>
      This is an automated notification from our reservation system.
    </div>
  </div>
</body>
</html>
    `;

    await transporter.sendMail({
      from: `"${CLUB_CONFIG.businessName}" <${sender}>`,
      to: recipient,
      subject: `Booking Update: ${booking.referenceNumber} (Rejected) — ${CLUB_CONFIG.businessName}`,
      html: htmlContent,
      text: `Dear ${booking.customerName},\n\nYour booking request ${booking.referenceNumber} for ${booking.courtName} on ${booking.date} (${timeDisplay}) could not be confirmed.\n\nReason: ${rejectionReason}\n\nIf you have questions, please reach out to us at ${CLUB_CONFIG.businessEmail}.\n\n${CLUB_CONFIG.businessName}`,
    });

    return {
      attempted: true,
      sent: true,
      isConfigured: true,
      recipient,
      message: `Rejection notice delivered to ${recipient}.`,
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown email delivery failure';
    console.error(`[EmailService] Failed to send rejection notice to ${recipient}:`, errMessage);
    return {
      attempted: true,
      sent: false,
      isConfigured: true,
      recipient,
      message: 'Email delivery failed due to provider/network error.',
      error: errMessage,
    };
  }
}
