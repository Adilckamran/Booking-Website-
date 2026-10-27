import { NextRequest, NextResponse } from 'next/server';
import { getAdminNotifications, markNotificationAsRead } from '@/services/booking/bookingRepository';
import { verifyAdminAuthorization } from '@/services/auth/adminAuth';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdminAuthorization(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: auth.statusCode || 401 }
      );
    }

    const notifications = await getAdminNotifications();
    return NextResponse.json({ success: true, notifications });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error fetching notifications';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyAdminAuthorization(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: auth.statusCode || 401 }
      );
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Notification ID required' }, { status: 400 });
    }

    const updated = await markNotificationAsRead(id);
    return NextResponse.json({ success: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error updating notification';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
