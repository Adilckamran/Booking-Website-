import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variable getters (evaluated dynamically to ensure Next.js environment updates are respected)
export const getSupabaseUrl = (): string =>
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';

export const getSupabasePublicKey = (): string =>
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  '';

export const getSupabaseServiceRoleKey = (): string =>
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SECRET_KEY?.trim() ||
  '';

export type SupabaseSecretKeyFormat = 'legacy_jwt' | 'sb_secret' | 'unknown' | 'none';

/**
 * Safely inspects the server-side secret key format without printing or logging its value.
 * - 'legacy_jwt': Classic service_role JWT key (starts with 'eyJ...')
 * - 'sb_secret': Modern Supabase secret key (starts with 'sb_secret_' or 'sb_sec_')
 * - 'unknown': Non-empty key string that does not match standard Supabase prefixes
 * - 'none': Key is empty or unset
 */
export function getSecretKeyFormat(): SupabaseSecretKeyFormat {
  const key = getSupabaseServiceRoleKey();
  if (!key) return 'none';
  if (key.startsWith('sb_secret_') || key.startsWith('sb_sec_')) return 'sb_secret';
  if (key.startsWith('eyJ')) return 'legacy_jwt';
  return 'unknown';
}

/**
 * Checks if Supabase client credentials have been configured with non-placeholder values.
 */
export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) return false;
  if (url.includes('your-project.supabase.co')) return false;
  if (
    key.includes('your-anon-key-placeholder') ||
    key.includes('your-publishable-key-placeholder') ||
    key.includes('your-anon-key')
  ) {
    return false;
  }
  return true;
}

/**
 * Checks if Supabase service role key is available for server-side admin operations.
 * Note: Service role key is STRICTLY server-side and never exposed via NEXT_PUBLIC_.
 */
export function isSupabaseAdminConfigured(): boolean {
  if (!isSupabaseConfigured()) return false;
  const roleKey = getSupabaseServiceRoleKey();
  if (
    !roleKey ||
    roleKey.includes('your-supabase-service-role-key-placeholder') ||
    roleKey.includes('your-supabase-secret-key-placeholder') ||
    roleKey.includes('your-service-role-key')
  ) {
    return false;
  }
  return true;
}

let browserClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

/**
 * Public browser-safe Supabase client (respects Row Level Security).
 * Safe to use in client components or server routes.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!browserClient) {
    browserClient = createClient(url, key);
  }
  return browserClient;
}

/**
 * Server-side Admin Supabase client (bypasses RLS).
 * CRITICAL SECURITY: NEVER expose this client or call it in browser code.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (typeof window !== 'undefined') {
    throw new Error('SECURITY VIOLATION: getSupabaseAdminClient cannot be invoked on the client side.');
  }
  if (!isSupabaseAdminConfigured()) return null;
  const url = getSupabaseUrl();
  const roleKey = getSupabaseServiceRoleKey();
  if (!adminClient) {
    adminClient = createClient(url, roleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}

export interface SupabaseConnectionStatus {
  isConfigured: boolean;
  isAdminConfigured: boolean;
  canConnect: boolean;
  secretKeyFormat?: SupabaseSecretKeyFormat;
  error?: string;
  tablesFound?: string[];
  bucketFound?: boolean;
}

/**
 * Performs a live connectivity check against Supabase.
 * Does NOT claim Supabase is connected unless a real database query succeeds.
 */
export async function testSupabaseConnection(): Promise<SupabaseConnectionStatus> {
  const secretKeyFormat = getSecretKeyFormat();

  if (!isSupabaseConfigured()) {
    return {
      isConfigured: false,
      isAdminConfigured: false,
      canConnect: false,
      secretKeyFormat,
      error: 'Supabase credentials are not configured in environment variables or are placeholders.',
    };
  }

  // Use admin client if available, else public client
  const adminClient = getSupabaseAdminClient();
  const clientToTest = adminClient || getSupabaseClient();

  if (!clientToTest) {
    return {
      isConfigured: true,
      isAdminConfigured: isSupabaseAdminConfigured(),
      canConnect: false,
      secretKeyFormat,
      error: 'Failed to initialize Supabase client instance.',
    };
  }

  try {
    // 1. Test database table connectivity by querying courts
    const { error: courtsError } = await clientToTest
      .from('courts')
      .select('id')
      .limit(1);

    if (courtsError) {
      return {
        isConfigured: true,
        isAdminConfigured: isSupabaseAdminConfigured(),
        canConnect: false,
        secretKeyFormat,
        error: `Database connection error: ${courtsError.message}. Make sure migration '20261023_booking_schema.sql' has been run in your Supabase SQL Editor.`,
      };
    }

    const tablesFound = ['courts'];

    // 2. Check bookings table
    const { error: bookingsError } = await clientToTest
      .from('bookings')
      .select('id')
      .limit(1);

    if (!bookingsError) {
      tablesFound.push('bookings');
    }

    // 3. Check notifications table
    const { error: notifsError } = await clientToTest
      .from('admin_notifications')
      .select('id')
      .limit(1);

    if (!notifsError) {
      tablesFound.push('admin_notifications');
    }

    // 4. Check private storage bucket if admin key is configured
    let bucketFound = false;
    if (adminClient) {
      try {
        const { data: buckets } = await adminClient.storage.listBuckets();
        if (buckets && buckets.some((b) => b.name === 'receipts-private')) {
          bucketFound = true;
        }
      } catch {
        // Storage check optional
      }
    }

    return {
      isConfigured: true,
      isAdminConfigured: isSupabaseAdminConfigured(),
      canConnect: true,
      secretKeyFormat,
      tablesFound,
      bucketFound,
    };
  } catch (err) {
    return {
      isConfigured: true,
      isAdminConfigured: isSupabaseAdminConfigured(),
      canConnect: false,
      secretKeyFormat,
      error: err instanceof Error ? err.message : 'Unknown network connection failure',
    };
  }
}
