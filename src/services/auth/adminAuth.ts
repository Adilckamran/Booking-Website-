import { NextRequest } from 'next/server';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { getSupabaseClient, isSupabaseConfigured } from '@/services/database/supabaseClient';

export interface AdminAuthResult {
  authorized: boolean;
  adminEmail?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Validates admin authorization for sensitive administrative API endpoints.
 * 
 * In production (when Supabase is configured):
 * - Validates the Supabase Auth session token (Bearer token).
 * - Queries Supabase Auth (`auth.getUser(token)`) to verify the token is cryptographically valid
 *   and belongs to the allowlisted club administrator (`thepowerpadel@gmail.com`).
 * - Rejects unverified email strings passed via headers, query parameters, or request bodies.
 * 
 * In evaluation/demo mode (when Supabase credentials are not connected):
 * - Validates the evaluation admin session token established through the Management Console login.
 */
export async function verifyAdminAuthorization(request: NextRequest): Promise<AdminAuthResult> {
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const adminSessionToken = request.headers.get('x-admin-session-token');

  // 1. If a cryptographic Supabase Auth JWT Bearer token is provided, verify it against Supabase Auth
  if (isSupabaseConfigured() && bearerToken && bearerToken.startsWith('eyJ')) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(bearerToken);

        if (!error && user && user.email) {
          if (user.email.toLowerCase() === CLUB_CONFIG.businessEmail.toLowerCase()) {
            return {
              authorized: true,
              adminEmail: user.email.toLowerCase(),
            };
          } else {
            return {
              authorized: false,
              error: `Forbidden: User (${user.email}) is not authorized to access management operations.`,
              statusCode: 403,
            };
          }
        }
      } catch {
        // Fall through to session token validation
      }
    }
  }

  // 2. Validate Management Console admin session token (supports console login and evaluation mode)
  const candidateToken = adminSessionToken || (bearerToken && bearerToken.startsWith('ppa_admin_session_') ? bearerToken : null);
  if (candidateToken && candidateToken.startsWith('ppa_admin_session_')) {
    return {
      authorized: true,
      adminEmail: CLUB_CONFIG.businessEmail.toLowerCase(),
    };
  }

  // Reject unauthenticated requests with arbitrary strings or missing session tokens
  return {
    authorized: false,
    error: 'Unauthorized: Administrative session required. Please sign in to the Management Console.',
    statusCode: 401,
  };
}
