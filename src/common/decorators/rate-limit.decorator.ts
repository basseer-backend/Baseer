import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA_KEY = 'RATE_LIMIT_METADATA_KEY';

export interface RateLimitOptions {
  /**
   * Maximum token capacity in the bucket.
   */
  capacity?: number;

  /**
   * Refill rate in tokens per second.
   */
  refillRate?: number;

  /**
   * Tokens consumed per accepted request (defaults to 1).
   */
  cost?: number;

  /**
   * Key prefix to namespace buckets across different endpoints.
   */
  keyPrefix?: string;
}

/**
 * Decorator to configure Token Bucket rate limiting on controllers or route handlers.
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, options);
