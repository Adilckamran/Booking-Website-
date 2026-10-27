import { NextRequest, NextResponse } from 'next/server';
import { getBookingByRef } from '@/services/booking/bookingRepository';
import { createPrivateReceiptSignedUrl } from '@/services/storage/receiptStorage';
import { verifyAdminAuthorization } from '@/services/auth/adminAuth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  try {
    const auth = await verifyAdminAuthorization(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Admin authentication required.' },
        { status: auth.statusCode || 401 }
      );
    }

    const { ref } = await params;

    const booking = await getBookingByRef(ref);
    if (!booking) {
      return NextResponse.json({ success: false, error: 'Booking not found.' }, { status: 404 });
    }

    const receiptUrl = booking.receiptScreenshotUrl;
    if (!receiptUrl) {
      return NextResponse.json({ success: false, error: 'No receipt uploaded for this booking.' }, { status: 404 });
    }

    // If it's a data URL, return directly
    if (receiptUrl.startsWith('data:')) {
      return NextResponse.json({
        success: true,
        url: receiptUrl,
        type: 'data_url',
      });
    }

    // If it's a private storage path (receipts/...)
    if (receiptUrl.startsWith('receipts/') || !receiptUrl.startsWith('http')) {
      const signedRes = await createPrivateReceiptSignedUrl(receiptUrl);
      if (signedRes.signedUrl) {
        return NextResponse.json({
          success: true,
          url: signedRes.signedUrl,
          type: 'signed_url',
        });
      }
    }

    return NextResponse.json({
      success: true,
      url: receiptUrl,
      type: 'direct_url',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve receipt';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
