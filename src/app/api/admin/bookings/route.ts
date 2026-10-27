import { NextRequest, NextResponse } from 'next/server';
import { getAdminBookings } from '@/services/booking/bookingRepository';
import { verifyAdminAuthorization } from '@/services/auth/adminAuth';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdminAuthorization(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Admin access required.' },
        { status: auth.statusCode || 401 }
      );
    }

    const bookings = await getAdminBookings();
    return NextResponse.json({ success: true, bookings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error fetching admin bookings';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
