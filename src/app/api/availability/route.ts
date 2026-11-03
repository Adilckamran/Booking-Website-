import { NextRequest, NextResponse } from 'next/server';
import { getSlotAvailability } from '@/services/booking/bookingRepository';
import { isSupabaseConfigured } from '@/services/database/supabaseClient';
import { getKarachiDateString } from '@/utils/timezone';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courtId = searchParams.get('courtId') || 'court-1';
    const date = searchParams.get('date') || getKarachiDateString();
    const durationParam = parseInt(searchParams.get('duration') || '60', 10);
    const duration = [60, 90, 120].includes(durationParam) ? durationParam : 60;

    const slots = await getSlotAvailability(courtId, date, duration);

    return NextResponse.json(
      {
        success: true,
        courtId,
        date,
        duration,
        slots,
        isDatabaseConnected: isSupabaseConfigured(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch slot availability';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
