import { NextRequest, NextResponse } from 'next/server';
import { submitReceipt, getBookingByRef } from '@/services/booking/bookingRepository';
import { isSupabaseConfigured } from '@/services/database/supabaseClient';
import { uploadPrivateReceipt, RECEIPT_STORAGE_CONFIG } from '@/services/storage/receiptStorage';
import { PaymentMethod } from '@/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  try {
    const { ref } = await params;
    const contentType = request.headers.get('content-type') || '';

    let paymentMethod: string = '';
    let transactionRef: string = '';
    let receiptUrlToStore: string | undefined = undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      paymentMethod = (formData.get('paymentMethod') as string) || '';
      transactionRef = (formData.get('transactionRef') as string) || '';
      const file = formData.get('receipt') as File | null;

      if (!file || file.size === 0) {
        return NextResponse.json(
          { success: false, error: 'A payment receipt image screenshot is required.' },
          { status: 400 }
        );
      }

      if (file.size > RECEIPT_STORAGE_CONFIG.maxFileSizeBytes) {
        return NextResponse.json(
          {
            success: false,
            error: `File size exceeds the ${RECEIPT_STORAGE_CONFIG.maxFileSizeMB} MB limit. Please compress your screenshot.`,
          },
          { status: 400 }
        );
      }

      const fileMime = file.type.toLowerCase();
      if (!RECEIPT_STORAGE_CONFIG.allowedMimeTypes.includes(fileMime)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid file format. Only JPEG, PNG, WEBP, or HEIC image screenshots are accepted.',
          },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      const uploadResult = await uploadPrivateReceipt({
        bookingRef: ref,
        fileBuffer,
        contentType: file.type,
        originalFileName: file.name,
      });

      if (!uploadResult.success || !uploadResult.storagePath) {
        return NextResponse.json(
          { success: false, error: uploadResult.error || 'Failed to securely store receipt.' },
          { status: 500 }
        );
      }

      receiptUrlToStore = uploadResult.storagePath;
    } else {
      const body = await request.json();
      paymentMethod = body.paymentMethod;
      transactionRef = body.transactionRef;
      const rawScreenshot = body.receiptScreenshotUrl;

      if (rawScreenshot && typeof rawScreenshot === 'string') {
        if (rawScreenshot.startsWith('data:image/')) {
          // Parse base64 data URL
          const matches = rawScreenshot.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (matches) {
            const mime = matches[1].toLowerCase();
            const base64Data = matches[2];
            const fileBuffer = Buffer.from(base64Data, 'base64');

            if (fileBuffer.length > RECEIPT_STORAGE_CONFIG.maxFileSizeBytes) {
              return NextResponse.json(
                {
                  success: false,
                  error: `File size exceeds ${RECEIPT_STORAGE_CONFIG.maxFileSizeMB} MB limit.`,
                },
                { status: 400 }
              );
            }

            if (!RECEIPT_STORAGE_CONFIG.allowedMimeTypes.includes(mime)) {
              return NextResponse.json(
                {
                  success: false,
                  error: 'Invalid file format. Only JPG, PNG, WEBP screenshots are accepted.',
                },
                { status: 400 }
              );
            }

            const uploadResult = await uploadPrivateReceipt({
              bookingRef: ref,
              fileBuffer,
              contentType: mime,
              originalFileName: `receipt_${ref}.${mime.split('/')[1] || 'jpg'}`,
            });

            receiptUrlToStore = uploadResult.storagePath || rawScreenshot;
          } else {
            receiptUrlToStore = rawScreenshot;
          }
        } else {
          receiptUrlToStore = rawScreenshot;
        }
      }
    }

    if (!paymentMethod || !['easypaisa', 'bank_transfer'].includes(paymentMethod)) {
      return NextResponse.json(
        { success: false, error: 'Payment method must be Easypaisa or Faysal Bank.' },
        { status: 400 }
      );
    }

    if (!receiptUrlToStore) {
      return NextResponse.json(
        { success: false, error: 'A payment receipt image screenshot is required.' },
        { status: 400 }
      );
    }

    const existingBooking = await getBookingByRef(ref);
    if (!existingBooking) {
      return NextResponse.json({ success: false, error: 'Booking reference not found.' }, { status: 404 });
    }

    // Customer CANNOT approve or alter to confirmed
    if (existingBooking.status === 'confirmed') {
      return NextResponse.json(
        { success: false, error: 'This booking has already been verified and confirmed by management.' },
        { status: 400 }
      );
    }

    if (existingBooking.status === 'rejected') {
      return NextResponse.json(
        { success: false, error: 'This booking was rejected. Please make a new reservation.' },
        { status: 400 }
      );
    }

    // Submit receipt and transition strictly to PAYMENT_UNDER_REVIEW
    const result = await submitReceipt({
      referenceNumber: ref,
      paymentMethod: paymentMethod as PaymentMethod,
      transactionRef: transactionRef?.trim() || undefined,
      receiptScreenshotUrl: receiptUrlToStore,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Receipt submitted successfully. Booking status is now PAYMENT_UNDER_REVIEW.',
      booking: result.booking,
      isDatabaseConnected: isSupabaseConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error submitting receipt';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
