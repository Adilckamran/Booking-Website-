import { NextRequest, NextResponse } from 'next/server';
import { adminApproveBooking } from '@/services/booking/bookingRepository';
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
    const adminEmail = auth.adminEmail!;

    const result = await adminApproveBooking({
      referenceNumber: ref,
      adminEmail,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Booking confirmed and slot officially locked.',
      booking: result.booking,
      notifications: result.notifications,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error approving booking';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
