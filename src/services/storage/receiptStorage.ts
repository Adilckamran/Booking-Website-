/**
 * Private Storage Service Architecture for Payment Receipts
 * 
 * SECURITY ARCHITECTURE SPECIFICATION:
 * 1. Payment receipts contain sensitive financial evidence (bank account numbers,
 *    player full names, transaction balances).
 * 2. Receipts MUST NEVER be stored in public buckets or accessible via public URLs.
 * 3. In production, receipts are stored in a private Supabase bucket (`receipts-private`)
 *    with all public access policies DISABLED.
 * 4. Only authenticated administrators (e.g. thepowerpadel@gmail.com) can request
 *    temporary, time-limited signed URLs (TTL: 15 minutes) or retrieve images
 *    via authorized server routes.
 * 5. In Phase 1/Demo Mode, uploads are processed in client memory for visual verification,
 *    explicitly flagged as DEMO, and NOT treated as durable storage. LocalStorage is
 *    NEVER used as the authoritative booking database.
 */

export const RECEIPT_STORAGE_CONFIG = {
  bucketName: 'receipts-private',
  maxFileSizeBytes: 5 * 1024 * 1024, // 5 Megabytes
  maxFileSizeMB: 5,
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
  ],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.heic'],
  signedUrlExpirySeconds: 900, // 15 minutes
};

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedFileName?: string;
  fileSizeBytes?: number;
}

/**
 * Validates payment receipt files before upload or preview
 */
export function validateReceiptFile(file: File | null | undefined): FileValidationResult {
  if (!file) {
    return {
      valid: false,
      error: 'Please select a screenshot of your payment transfer.',
    };
  }

  // 1. Check file size
  if (file.size === 0) {
    return {
      valid: false,
      error: 'The selected file is empty (0 bytes). Please upload a valid image.',
    };
  }

  if (file.size > RECEIPT_STORAGE_CONFIG.maxFileSizeBytes) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${sizeInMB} MB) exceeds the ${RECEIPT_STORAGE_CONFIG.maxFileSizeMB} MB limit. Please take a smaller screenshot or compress it.`,
    };
  }

  // 2. Check MIME type & extension
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  const hasValidExtension = RECEIPT_STORAGE_CONFIG.allowedExtensions.some((ext) =>
    fileName.endsWith(ext)
  );

  const isMimeAllowed = RECEIPT_STORAGE_CONFIG.allowedMimeTypes.includes(mimeType);

  if (!isMimeAllowed && !hasValidExtension) {
    return {
      valid: false,
      error: 'Invalid file format. Only JPEG, PNG, WEBP, or HEIC image screenshots are accepted (PDFs or documents are not allowed).',
    };
  }

  // 3. Generate safe sanitized file name
  const extension = fileName.slice(fileName.lastIndexOf('.'));
  const safeBase = fileName
    .slice(0, fileName.lastIndexOf('.'))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 30);
  const sanitizedFileName = `receipt_${Date.now()}_${safeBase}${extension}`;

  return {
    valid: true,
    sanitizedFileName,
    fileSizeBytes: file.size,
  };
}

/**
 * Server-side helper to create time-limited signed URLs for private receipts.
 * (Only available on server; requires SUPABASE_SERVICE_ROLE_KEY).
 */
export async function createPrivateReceiptSignedUrl(
  storagePath: string
): Promise<{ signedUrl: string | null; isConfigured: boolean; message: string }> {
  if (typeof window !== 'undefined') {
    return {
      signedUrl: null,
      isConfigured: false,
      message: 'Private receipt signed URLs can only be generated on the server.',
    };
  }

  const { getSupabaseAdminClient, isSupabaseAdminConfigured } = await import(
    '@/services/database/supabaseClient'
  );

  if (!isSupabaseAdminConfigured()) {
    return {
      signedUrl: null,
      isConfigured: false,
      message: 'Supabase storage is not configured with service-role credentials yet.',
    };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return {
      signedUrl: null,
      isConfigured: false,
      message: 'Admin storage client unavailable.',
    };
  }

  try {
    const { data, error } = await admin.storage
      .from(RECEIPT_STORAGE_CONFIG.bucketName)
      .createSignedUrl(storagePath, RECEIPT_STORAGE_CONFIG.signedUrlExpirySeconds);

    if (error || !data?.signedUrl) {
      return {
        signedUrl: null,
        isConfigured: true,
        message: error?.message || 'Failed to generate signed URL for receipt.',
      };
    }

    return {
      signedUrl: data.signedUrl,
      isConfigured: true,
      message: 'Signed URL generated successfully.',
    };
  } catch (err) {
    return {
      signedUrl: null,
      isConfigured: true,
      message: err instanceof Error ? err.message : 'Error generating signed URL.',
    };
  }
}

// Backward-compatible alias
export const getPrivateReceiptSignedUrlPlaceholder = createPrivateReceiptSignedUrl;

/**
 * Server-side helper to upload a payment receipt image to the private bucket.
 * Stores files securely under receipts/${bookingRef}/${sanitizedFileName}.
 */
export async function uploadPrivateReceipt(params: {
  bookingRef: string;
  fileBuffer: Buffer;
  contentType: string;
  originalFileName: string;
}): Promise<{ success: boolean; storagePath?: string; error?: string }> {
  if (typeof window !== 'undefined') {
    return { success: false, error: 'Uploads must be processed on the server.' };
  }

  const { getSupabaseAdminClient, isSupabaseAdminConfigured } = await import(
    '@/services/database/supabaseClient'
  );

  const ext = params.originalFileName.includes('.')
    ? params.originalFileName.slice(params.originalFileName.lastIndexOf('.')).toLowerCase()
    : '.jpg';

  const sanitizedFileName = `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
  const storagePath = `receipts/${params.bookingRef}/${sanitizedFileName}`;

  if (!isSupabaseAdminConfigured()) {
    // In-memory / evaluation mode: store as data URL for preview in review modal
    const base64 = params.fileBuffer.toString('base64');
    return {
      success: true,
      storagePath: `data:${params.contentType};base64,${base64}`,
    };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { success: false, error: 'Database storage client unavailable.' };
  }

  try {
    const { error } = await admin.storage
      .from(RECEIPT_STORAGE_CONFIG.bucketName)
      .upload(storagePath, params.fileBuffer, {
        contentType: params.contentType,
        upsert: false,
      });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, storagePath };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Storage upload failure',
    };
  }
}
