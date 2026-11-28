/**
 * Image Processing & Security Pipeline Constants
 */

export const IMAGE_MAX_BYTES =
  parseInt(process.env.IMAGE_MAX_BYTES || '', 10) || 7340032; // 7 MiB (7,340,032 bytes)

export const IMAGE_MAX_PIXELS =
  parseInt(process.env.IMAGE_MAX_PIXELS || '', 10) || 50000000; // 50 MP

export const IMAGE_JPEG_QUALITY =
  parseInt(process.env.IMAGE_JPEG_QUALITY || '', 10) || 90;

export const JSON_BODY_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB limit configured in main.ts

/**
 * Validates that maximum decoded bytes fit within the HTTP JSON payload limit when Base64-encoded.
 * Base64 encoding expands raw data by a 4/3 ratio.
 */
export function assertImageSizeFitsJsonLimit(maxBytes = IMAGE_MAX_BYTES): boolean {
  const estimatedBase64Len = Math.ceil((maxBytes * 4) / 3);
  return estimatedBase64Len <= JSON_BODY_LIMIT_BYTES;
}

export enum DetectedImageFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
  AVIF = 'avif',
  HEIC = 'heic',
  UNSUPPORTED = 'unsupported',
}

export interface SanitizedImageResult {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  base64: string;
  originalFormat: DetectedImageFormat;
  width: number;
  height: number;
}
