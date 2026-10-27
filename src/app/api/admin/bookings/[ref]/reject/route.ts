import { NextRequest, NextResponse } from 'next/server';
import { adminRejectBooking } from '@/services/booking/bookingRepository';
import { verifyAdminAuthorization } from '@/services/auth/adminAuth';

export async function POST(
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
    const body = await request.json().catch(() => ({}));
    const rejectionReason = body.rejectionReason;
    const adminEmail = auth.adminEmail!;

    if (!rejectionReason || !rejectionReason.trim()) {
      return NextResponse.json(
        { success: false, error: 'Rejection reason is required.' },
        { status: 400 }
      );
    }

    const result = await adminRejectBooking({
      referenceNumber: ref,
      rejectionReason: rejectionReason.trim(),
      adminEmail,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Payment rejected and court slot released atomically.',
      booking: result.booking,
      notifications: result.notifications,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error rejecting booking';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
