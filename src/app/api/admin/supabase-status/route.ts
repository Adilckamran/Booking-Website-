import { NextRequest, NextResponse } from 'next/server';
import { testSupabaseConnection } from '@/services/database/supabaseClient';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { verifyAdminAuthorization } from '@/services/auth/adminAuth';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdminAuthorization(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Admin authentication required.' },
        { status: auth.statusCode || 401 }
      );
    }

    const status = await testSupabaseConnection();

    return NextResponse.json({
      success: true,
      canConnect: status.canConnect,
      hasCredentials: status.isConfigured,
      hasServiceKey: status.isAdminConfigured,
      secretKeyFormat: status.secretKeyFormat,
      message: status.canConnect
        ? `Connected to Supabase (${status.tablesFound?.join(', ') || 'Ready'})`
        : (status.error || 'Operating in Server Memory (Demo Mode)'),
      status,
      businessEmail: CLUB_CONFIG.businessEmail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error testing connection';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
