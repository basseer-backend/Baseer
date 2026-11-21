#!/usr/bin/env node

/**
 * Utility script to generate a signed JWT for testing the Baseer API.
 * Uses the same zero-dependency Node.js crypto HS256 logic as JwtHelper.
 *
 * Usage:
 *   node scripts/generate-jwt.js [userId] [secret]
 *
 * Examples:
 *   node scripts/generate-jwt.js
 *   node scripts/generate-jwt.js 11111111-1111-1111-1111-111111111111
 *   node scripts/generate-jwt.js 11111111-1111-1111-1111-111111111111 custom-secret
 */

const crypto = require('crypto');

const userId = process.argv[2] || process.env.USER_ID || '11111111-1111-1111-1111-111111111111';
const secret = process.argv[3] || process.env.JWT_SECRET || 'baseer-assistive-ai-default-secret-key-32-chars-long';
const expiresInSeconds = 7 * 24 * 60 * 60; // 7 days

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const header = {
  alg: 'HS256',
  typ: 'JWT',
};

const now = Math.floor(Date.now() / 1000);
const payload = {
  sub: userId,
  iat: now,
  exp: now + expiresInSeconds,
};

const headerEncoded = base64UrlEncode(JSON.stringify(header));
const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
const data = `${headerEncoded}.${payloadEncoded}`;

const signature = crypto
  .createHmac('sha256', secret)
  .update(data)
  .digest('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const token = `${data}.${signature}`;

console.log('----------------------------------------------------');
console.log('Baseer Test JWT Generated Successfully:');
console.log('----------------------------------------------------');
console.log(`User ID : ${userId}`);
console.log(`Secret  : ${secret.length > 8 ? secret.slice(0, 4) + '...' + secret.slice(-4) : secret}`);
console.log(`Expires : ${new Date((now + expiresInSeconds) * 1000).toISOString()}`);
console.log('----------------------------------------------------');
console.log(`Bearer Token:\n${token}\n`);
console.log('----------------------------------------------------');
console.log('Curl Authorization Header:');
console.log(`Authorization: Bearer ${token}`);
console.log('----------------------------------------------------');
