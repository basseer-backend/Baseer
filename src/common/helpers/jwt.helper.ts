import * as crypto from 'crypto';

export interface JwtPayload {
  sub?: string;
  userId?: string;
  isGuest?: boolean;
  type?: 'access' | 'refresh';
  familyId?: string;
  iat?: number;
  exp?: number;
  [key: string]: any;
}

export function getJwtSecret(): string {
  return (
    process.env.JWT_SECRET?.trim() ||
    process.env.JWT_ACCESS_SECRET?.trim() ||
    'baseer-assistive-ai-default-secret-key-32-chars-long'
  );
}

export function getJwtAccessSecret(): string {
  return (
    process.env.JWT_ACCESS_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'baseer-assistive-ai-default-secret-key-32-chars-long'
  );
}

export function getJwtRefreshSecret(): string {
  return (
    process.env.JWT_REFRESH_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() + '-refresh-salt-key-99' ||
    'baseer-assistive-ai-default-refresh-secret-key-32-chars-long'
  );
}

export function getJwtAccessExpiresIn(): number {
  const val = process.env.JWT_ACCESS_EXPIRES_IN?.trim() || process.env.JWT_EXPIRES_IN?.trim();
  if (val) {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 900; // 15 minutes default for access tokens
}

export function getJwtRefreshExpiresIn(): number {
  const val = process.env.JWT_REFRESH_EXPIRES_IN?.trim();
  if (val) {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 7 * 24 * 60 * 60; // 7 days default for refresh tokens
}

/**
 * Computes a standard SHA-256 hex digest of a token string.
 * Output is guaranteed to be a 64-character lowercase hex string matching ck_auth_sessions_hash_format.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex').toLowerCase();
}

/**
 * Signs a payload into a standard HMAC-SHA256 (HS256) JSON Web Token.
 * Pure Node.js crypto implementation with zero external dependencies.
 */
export function signJwt(
  payload: JwtPayload,
  secret: string = getJwtSecret(),
  expiresInSeconds: number = 86400,
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    sub: payload.sub || payload.userId || '',
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + expiresInSeconds,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');

  return `${data}.${signature}`;
}

/**
 * Verifies a JWT's structure, HMAC-SHA256 signature, and expiration timestamp.
 * Returns the decoded payload or throws an Error.
 */
export function verifyJwt(
  token: string,
  secret: string = getJwtSecret(),
): JwtPayload {
  if (!token || typeof token !== 'string') {
    throw new Error('Token is missing or empty');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT: must consist of 3 segments');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expBuffer)
  ) {
    throw new Error('Invalid JWT signature');
  }

  const jsonString = Buffer.from(encodedPayload, 'base64url').toString('utf-8');
  const payload: JwtPayload = JSON.parse(jsonString);

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined && payload.exp < now) {
    throw new Error('JWT token has expired');
  }

  return payload;
}

/**
 * Helper to issue an Access Token.
 */
export function signAccessToken(
  payload: Omit<JwtPayload, 'type'>,
  expiresInSeconds: number = getJwtAccessExpiresIn(),
): string {
  return signJwt(
    { ...payload, type: 'access' },
    getJwtAccessSecret(),
    expiresInSeconds,
  );
}

/**
 * Helper to issue a Refresh Token.
 */
export function signRefreshToken(
  payload: Omit<JwtPayload, 'type'>,
  expiresInSeconds: number = getJwtRefreshExpiresIn(),
): string {
  return signJwt(
    { ...payload, type: 'refresh' },
    getJwtRefreshSecret(),
    expiresInSeconds,
  );
}

/**
 * Helper to verify an Access Token.
 */
export function verifyAccessToken(token: string): JwtPayload {
  const payload = verifyJwt(token, getJwtAccessSecret());
  if (payload.type && payload.type !== 'access') {
    throw new Error('Token is not an access token');
  }
  return payload;
}

/**
 * Helper to verify a Refresh Token.
 */
export function verifyRefreshToken(token: string): JwtPayload {
  const payload = verifyJwt(token, getJwtRefreshSecret());
  if (payload.type !== 'refresh') {
    throw new Error('Token is not a refresh token');
  }
  return payload;
}
