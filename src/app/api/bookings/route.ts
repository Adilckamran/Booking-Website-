import { NextRequest, NextResponse } from 'next/server';
import { createPendingBooking } from '@/services/booking/bookingRepository';
import { isSupabaseConfigured } from '@/services/database/supabaseClient';
import { uploadPrivateReceipt, RECEIPT_STORAGE_CONFIG, validateReceiptFile } from '@/services/storage/receiptStorage';
import { validatePakistaniMobile } from '@/utils/phoneValidation';
import { getKarachiDateString } from '@/utils/timezone';
import { PaymentMethod } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let courtId: string = '';
    let date: string = '';
    let startTime: string = '';
    let durationMinutes: number = 60;
    let customerName: string = '';
    let customerPhone: string = '';
    let customerEmail: string | undefined = undefined;
    let paymentMethod: PaymentMethod | undefined = undefined;
    let transactionRef: string | undefined = undefined;
    let receiptScreenshotUrl: string | undefined = undefined;
    let rawSlotsInput: unknown = null;

    // Pre-generate definitive booking reference to keep storage and record synchronized
    const randomRefNum = Math.floor(1000 + Math.random() * 9000);
    const bookingRef = `PADEL-PK-2026-${randomRefNum}`;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      courtId = (formData.get('courtId') as string) || '';
      date = (formData.get('date') as string) || '';
      startTime = (formData.get('startTime') as string) || '';
      durationMinutes = formData.get('durationMinutes') ? parseInt(String(formData.get('durationMinutes')), 10) : 60;
      customerName = (formData.get('customerName') as string) || '';
      customerPhone = (formData.get('customerPhone') as string) || '';
      customerEmail = (formData.get('customerEmail') as string) || undefined;
      paymentMethod = (formData.get('paymentMethod') as PaymentMethod) || undefined;
      transactionRef = (formData.get('transactionRef') as string) || undefined;
      rawSlotsInput = formData.get('slots');

      const file = formData.get('receipt') as File | null;
      if (file && file.size > 0) {
        const validation = validateReceiptFile(file);
        if (!validation.valid) {
          return NextResponse.json(
            { success: false, error: validation.error || 'Invalid receipt image.' },
            { status: 400 }
          );
        }

        const arrayBuffer = await file.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuffer);

        const uploadRes = await uploadPrivateReceipt({
          bookingRef,
          fileBuffer,
          contentType: file.type,
          originalFileName: file.name,
        });

        if (!uploadRes.success || !uploadRes.storagePath) {
          return NextResponse.json(
            { success: false, error: uploadRes.error || 'Failed to upload receipt screenshot to secure storage.' },
            { status: 500 }
          );
        }

        receiptScreenshotUrl = uploadRes.storagePath;
      }
    } else {
      const body = await request.json();
      courtId = body.courtId;
      date = body.date;
      startTime = body.startTime;
      durationMinutes = body.durationMinutes ? parseInt(String(body.durationMinutes), 10) : 60;
      customerName = body.customerName;
      customerPhone = body.customerPhone;
      customerEmail = body.customerEmail;
      paymentMethod = body.paymentMethod;
      transactionRef = body.transactionRef;
      rawSlotsInput = body.slots;

      const rawScreenshot = body.receiptScreenshotUrl;
      if (rawScreenshot && typeof rawScreenshot === 'string') {
        if (rawScreenshot.startsWith('data:image/')) {
          const matches = rawScreenshot.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (matches) {
            const mime = matches[1].toLowerCase();
            const base64Data = matches[2];
            const fileBuffer = Buffer.from(base64Data, 'base64');

            if (fileBuffer.length > RECEIPT_STORAGE_CONFIG.maxFileSizeBytes) {
              return NextResponse.json(
                { success: false, error: `File size exceeds ${RECEIPT_STORAGE_CONFIG.maxFileSizeMB} MB limit.` },
                { status: 400 }
              );
            }

            const uploadRes = await uploadPrivateReceipt({
              bookingRef,
              fileBuffer,
              contentType: mime,
              originalFileName: `receipt_${bookingRef}.${mime.split('/')[1] || 'jpg'}`,
            });

            receiptScreenshotUrl = uploadRes.storagePath || rawScreenshot;
          } else {
            receiptScreenshotUrl = rawScreenshot;
          }
        } else {
          receiptScreenshotUrl = rawScreenshot;
        }
      }
    }

    // Parse and normalize slots array
    let parsedSlots: string[] = [];
    if (rawSlotsInput) {
      if (Array.isArray(rawSlotsInput)) {
        parsedSlots = rawSlotsInput.map(String).filter(Boolean);
      } else if (typeof rawSlotsInput === 'string') {
        try {
          const parsed = JSON.parse(rawSlotsInput);
          if (Array.isArray(parsed)) parsedSlots = parsed.map(String).filter(Boolean);
          else if (typeof parsed === 'string') parsedSlots = [parsed];
        } catch {
          parsedSlots = rawSlotsInput.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }
    }

    // Fallback to single startTime if no slots array was provided
    if (parsedSlots.length === 0 && startTime) {
      parsedSlots = [startTime];
    }

    // Required field validation
    if (!courtId || !date || parsedSlots.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Court, date, and at least one time slot are required.' },
        { status: 400 }
      );
    }

    // Court validation
    const validCourtIds = ['court-1', 'court-2', 'court-3'];
    if (!validCourtIds.includes(courtId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid court selected. Please choose Court 1, Court 2, or Court 3.' },
        { status: 400 }
      );
    }

    // Date validation strictly according to Pakistan Standard Time (Asia/Karachi)
    const todayStr = getKarachiDateString();
    if (date < todayStr) {
      return NextResponse.json(
        { success: false, error: 'Cannot book a date in the past.' },
        { status: 400 }
      );
    }

    // Match duration validation (strictly 60, 90, or 120 minutes)
    if (![60, 90, 120].includes(durationMinutes)) {
      return NextResponse.json(
        { success: false, error: 'Invalid match duration. Permitted durations are strictly 60, 90, or 120 minutes.' },
        { status: 400 }
      );
    }

    const parsedDuration = durationMinutes;
    const primaryStartTime = startTime || (parsedSlots.length > 0 ? parsedSlots[0] : '');

    // Validate 30-minute start time format (HH:00 or HH:30 across 24h)
    if (!primaryStartTime || !/^([01][0-9]|2[0-3]):(00|30)$/.test(primaryStartTime)) {
      return NextResponse.json(
        { success: false, error: `Invalid start time: ${primaryStartTime}. Must be in 30-minute intervals (e.g. 19:00, 19:30).` },
        { status: 400 }
      );
    }

    if (!customerName || !customerName.trim() || customerName.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'Customer full name must be at least 3 characters.' },
        { status: 400 }
      );
    }

    // Pakistani Mobile Number Validation (Strict 11 digits, e.g. 03162997913)
    const phoneVal = validatePakistaniMobile(customerPhone);
    if (!phoneVal.valid || !phoneVal.normalized) {
      return NextResponse.json(
        { success: false, error: phoneVal.error || 'A valid 11-digit Pakistani mobile number is required.' },
        { status: 400 }
      );
    }
    const normalizedPhone = phoneVal.normalized;

    const result = await createPendingBooking({
      courtId,
      date,
      startTime: primaryStartTime,
      slots: parsedSlots,
      durationMinutes: parsedDuration,
      customerName: customerName.trim(),
      customerPhone: normalizedPhone,
      customerEmail: customerEmail?.trim() || undefined,
      paymentMethod,
      transactionRef: transactionRef?.trim() || undefined,
      receiptScreenshotUrl,
      referenceNumber: bookingRef,
    });

    if (!result.success) {
      const isConflict =
        result.error.toLowerCase().includes('already') ||
        result.error.toLowerCase().includes('conflict') ||
        result.error.toLowerCase().includes('held');

      const isPermissionOrDb =
        result.error.toLowerCase().includes('permission denied') ||
        result.error.toLowerCase().includes('database') ||
        result.error.toLowerCase().includes('42501');

      return NextResponse.json(
        {
          success: false,
          error: result.error,
          isConflict,
          isPermissionOrDb,
        },
        { status: isConflict ? 409 : isPermissionOrDb ? 500 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      booking: result.booking,
      isDatabaseConnected: isSupabaseConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error creating booking';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
