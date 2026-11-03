import { NextRequest, NextResponse } from 'next/server';
import { createManualBooking } from '@/services/booking/bookingRepository';
import { verifyAdminAuthorization } from '@/services/auth/adminAuth';
import { validatePakistaniMobile } from '@/utils/phoneValidation';
import { PaymentMethod } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdminAuthorization(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Admin authentication required.' },
        { status: auth.statusCode || 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      courtId,
      date,
      startTime,
      durationMinutes = 60,
      customerName,
      customerPhone,
      customerEmail,
      paymentMethod = 'cash_at_venue',
      isPaid = true,
    } = body;

    // 1. Validation
    if (!courtId || !date || !startTime) {
      return NextResponse.json(
        { success: false, error: 'Court, date, and time slot are required.' },
        { status: 400 }
      );
    }

    if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'Player full name must be at least 3 characters.' },
        { status: 400 }
      );
    }

    const phoneVal = validatePakistaniMobile(customerPhone || '');
    if (!phoneVal.valid || !phoneVal.normalized) {
      return NextResponse.json(
        { success: false, error: phoneVal.error || 'A valid 11-digit Pakistani mobile number is required.' },
        { status: 400 }
      );
    }

    const parsedDuration = parseInt(String(durationMinutes), 10) || 60;
    if (![60, 90, 120].includes(parsedDuration)) {
      return NextResponse.json(
        { success: false, error: 'Duration must be strictly 60, 90, or 120 minutes.' },
        { status: 400 }
      );
    }

    if (!/^([01][0-9]|2[0-3]):(00|30)$/.test(startTime)) {
      return NextResponse.json(
        { success: false, error: 'Start time must be in 30-minute intervals (HH:00 or HH:30).' },
        { status: 400 }
      );
    }

    // 2. Execute atomic booking creation with double-booking prevention
    const result = await createManualBooking({
      courtId,
      date,
      startTime,
      durationMinutes: parsedDuration,
      customerName: customerName.trim(),
      customerPhone: phoneVal.normalized,
      customerEmail: customerEmail?.trim() || undefined,
      paymentMethod: paymentMethod as PaymentMethod,
      isPaid: Boolean(isPaid),
      adminEmail: auth.adminEmail || 'thepowerpadel@gmail.com',
    });

    if (!result.success) {
      const isConflict =
        result.error.toLowerCase().includes('already') ||
        result.error.toLowerCase().includes('conflict') ||
        result.error.toLowerCase().includes('reserved');

      return NextResponse.json(
        {
          success: false,
          error: result.error,
          isConflict,
        },
        { status: isConflict ? 409 : 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Manual booking created and slot locked.',
        booking: result.booking,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error creating manual booking';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
