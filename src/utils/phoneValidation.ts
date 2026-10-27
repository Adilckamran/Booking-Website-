/**
 * Pakistani Mobile Number Validation and Normalization Utility
 *
 * Rules:
 * - Requires exactly 11 digits for a Pakistani local mobile number.
 * - Accepts formats such as 03162997913, 0316-2997913, +92 316 2997913.
 * - Safely normalizes spaces, hyphens, and +92 prefixes.
 * - Rejects letters, symbols, invalid lengths, and incomplete numbers.
 * - Must start with 03 (standard Pakistani cellular operator network prefix).
 */

export interface PhoneValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

export function validatePakistaniMobile(input: string | null | undefined): PhoneValidationResult {
  if (!input || !input.trim()) {
    return {
      valid: false,
      error: 'Pakistani mobile number is required.',
    };
  }

  const raw = input.trim();

  // Normalize common separators: spaces, hyphens, parentheses, plus
  let cleaned = raw.replace(/[\s\-\(\)\+]/g, '');

  // Reject any remaining non-digit characters (letters, special symbols)
  if (/[^\d]/.test(cleaned)) {
    return {
      valid: false,
      error: 'Mobile number must only contain digits (no letters or symbols allowed).',
    };
  }

  // Convert international prefixes to standard 11-digit local format:
  // e.g. 923162997913 (12 digits) -> 03162997913
  // e.g. 00923162997913 (14 digits) -> 03162997913
  if (cleaned.startsWith('92') && cleaned.length === 12) {
    cleaned = '0' + cleaned.slice(2);
  } else if (cleaned.startsWith('0092') && cleaned.length === 14) {
    cleaned = '0' + cleaned.slice(4);
  }

  // Exact 11-digit rule
  if (cleaned.length !== 11) {
    return {
      valid: false,
      error: `Mobile number must be exactly 11 digits (e.g. 03162997913). You entered ${cleaned.length} digit${cleaned.length === 1 ? '' : 's'}.`,
    };
  }

  // Must begin with 03 (Pakistani mobile operator allocation)
  if (!cleaned.startsWith('03')) {
    return {
      valid: false,
      error: 'Pakistani mobile number must start with 03 (e.g. 03162997913).',
    };
  }

  return {
    valid: true,
    normalized: cleaned,
  };
}
