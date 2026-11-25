import * as crypto from 'crypto';
import { MIN_HMAC_SECRET_LENGTH } from './deletion.constants';

/**
 * Computes a user-scoped SHA-256 hash of an idempotency key.
 * Guarantees lowercase 64-hex character string matching ck_deletion_requests_idempotency_format
 * and prevents cross-user idempotency collisions.
 */
export function computeIdempotencyKeyHash(
  userId: string,
  rawKey: string,
): string {
  const scopedInput = `${userId}:${rawKey.trim()}`;
  return crypto.createHash('sha256').update(scopedInput).digest('hex').toLowerCase();
}

/**
 * Generates a cryptographically secure, high-entropy 256-bit capability token
 * and its corresponding SHA-256 hash for storage.
 */
export function generateCapability(): {
  rawCapability: string;
  capabilityHash: string;
} {
  const rawCapability = crypto.randomBytes(32).toString('hex').toLowerCase();
  const capabilityHash = crypto
    .createHash('sha256')
    .update(rawCapability)
    .digest('hex')
    .toLowerCase();
  return { rawCapability, capabilityHash };
}

/**
 * Performs a constant-time comparison of a client-supplied raw capability
 * against the stored SHA-256 capability hash.
 */
export function verifyCapability(
  rawCapability: string,
  storedCapabilityHash: string,
): boolean {
  if (!rawCapability || !storedCapabilityHash) {
    return false;
  }

  const computedHash = crypto
    .createHash('sha256')
    .update(rawCapability.trim())
    .digest('hex')
    .toLowerCase();

  const computedBuffer = Buffer.from(computedHash, 'utf-8');
  const storedBuffer = Buffer.from(storedCapabilityHash.trim(), 'utf-8');

  if (computedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, storedBuffer);
}

/**
 * Resolves and validates the HMAC secret for audit hashing.
 * Reads strictly from DELETION_HMAC_SECRET (or providedSecret for testing).
 * Fails clearly without exposing secret content if unconfigured or too short.
 */
export function getHmacSecret(providedSecret?: string): string {
  const secret = (
    providedSecret ||
    process.env.DELETION_HMAC_SECRET ||
    ''
  ).trim();

  if (!secret) {
    throw new Error(
      'HMAC secret is not configured. Set DELETION_HMAC_SECRET.',
    );
  }

  if (secret.length < MIN_HMAC_SECRET_LENGTH) {
    throw new Error(
      `Configured HMAC secret is invalid: secret length must be at least ${MIN_HMAC_SECRET_LENGTH} characters.`,
    );
  }

  return secret;
}

/**
 * Resolves and strictly validates the active HMAC key version.
 * Requires a positive PostgreSQL SMALLINT (1–32767).
 * Rejects partial or malformed values (e.g. '1abc', '1.5', '0', '-5').
 */
export function getHmacKeyVersion(override?: string | number): number {
  const raw =
    override !== undefined
      ? String(override)
      : process.env.DELETION_HMAC_KEY_VERSION;

  if (raw === undefined || raw === null || raw.trim() === '') {
    return 1;
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `Invalid DELETION_HMAC_KEY_VERSION: "${trimmed}" is not a valid positive integer.`,
    );
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 32767) {
    throw new Error(
      `Invalid DELETION_HMAC_KEY_VERSION: value ${parsed} is out of PostgreSQL SMALLINT range (1-32767).`,
    );
  }

  return parsed;
}

/**
 * Computes an HMAC-SHA256 hash of the user ID using a validated versioned secret key.
 * Guarantees lowercase 64-hex characters matching ck_deletion_audit_events_hash_format.
 */
export function computeAnonymizedUserHash(
  userId: string,
  secretKey?: string,
): string {
  if (!userId || !userId.trim()) {
    throw new Error('userId is required for computeAnonymizedUserHash');
  }

  const secret = getHmacSecret(secretKey);

  return crypto
    .createHmac('sha256', secret)
    .update(userId.trim())
    .digest('hex')
    .toLowerCase();
}
