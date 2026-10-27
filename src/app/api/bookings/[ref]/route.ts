import { NextRequest, NextResponse } from 'next/server';
import { getBookingByRef } from '@/services/booking/bookingRepository';
import { isSupabaseConfigured } from '@/services/database/supabaseClient';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  try {
    const { ref } = await params;

    if (!ref) {
      return NextResponse.json({ success: false, error: 'Reference number is required.' }, { status: 400 });
    }

    const booking = await getBookingByRef(ref);

    if (!booking) {
      return NextResponse.json({ success: false, error: 'Booking not found.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      booking,
      isDatabaseConnected: isSupabaseConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error fetching booking';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
