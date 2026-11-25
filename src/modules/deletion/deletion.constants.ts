export const DELETION_CAPABILITY_HEADER = 'x-deletion-capability';
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

export const DELETION_METHOD_ONLINE = 'online';
export const DELETION_METHOD_OFFLINE = 'offline_tombstone';

export enum DeletionStatus {
  ACCEPTED = 'ACCEPTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export const DEFAULT_LEASE_DURATION_SECONDS = 300; // 5 minutes
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_POLL_INTERVAL_MS = 5000;
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

export const MIN_HMAC_SECRET_LENGTH = 16;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
export const MIN_IDEMPOTENCY_KEY_LENGTH = 1;
