import { AppException } from '../../../common/exceptions/app.exception';
import { AppErrorCode } from '../../../common/constants/error-codes';

export const MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (5,242,880 bytes)
export const MAX_AUDIO_DURATION_SECONDS = 10; // 10 seconds
export const APPROVED_AUDIO_FORMAT = 'Opus';
export const APPROVED_SAMPLE_RATE_HZ = 16000; // 16 kHz
export const APPROVED_CHANNEL_COUNT = 1; // Mono

export interface AudioMetadata {
  format: 'ogg/opus' | 'webm/opus' | 'unknown';
  channels?: number;
  sampleRateHz?: number;
  durationSeconds?: number;
  byteLength: number;
}

export interface AudioValidationInput {
  audioBuffer?: Buffer;
  audioBase64?: string;
  mimeType?: string;
}

export interface ValidatedAudioResult {
  buffer: Buffer;
  metadata: AudioMetadata;
}

/**
 * Reusable audio validator enforcing the approved Baseer Phase 3 specifications:
 * - Format: Opus (in Ogg or WebM container)
 * - Sample Rate: 16 kHz
 * - Channels: Mono (1 channel)
 * - Maximum Duration: 10 seconds
 * - Maximum Size: 5 MB
 *
 * Implements pre-decode size verification for Base64 inputs to prevent memory allocation denial-of-service.
 */
export class AudioValidatorHelper {
  /**
   * Validates and decodes input audio, extracting container metadata and enforcing constraints.
   */
  public static validate(input: AudioValidationInput): ValidatedAudioResult {
    let buffer: Buffer;

    if (input.audioBase64 !== undefined) {
      buffer = this.validateAndDecodeBase64(input.audioBase64);
    } else if (input.audioBuffer !== undefined) {
      buffer = input.audioBuffer;
      this.validateBufferRaw(buffer);
    } else {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'Audio payload is required (either audioBase64 or audioBuffer)',
      );
    }

    const metadata = this.inspectOpusMetadata(buffer);

    // Enforce channel count (Mono)
    if (metadata.channels !== undefined && metadata.channels !== APPROVED_CHANNEL_COUNT) {
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        `Audio channels must be mono (${APPROVED_CHANNEL_COUNT} channel), detected: ${metadata.channels}`,
      );
    }

    // Enforce sample rate (16 kHz)
    if (
      metadata.sampleRateHz !== undefined &&
      metadata.sampleRateHz !== 0 &&
      metadata.sampleRateHz !== APPROVED_SAMPLE_RATE_HZ
    ) {
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        `Audio sample rate must be 16 kHz (${APPROVED_SAMPLE_RATE_HZ} Hz), detected: ${metadata.sampleRateHz} Hz`,
      );
    }

    // Enforce duration (max 10 seconds)
    if (
      metadata.durationSeconds !== undefined &&
      metadata.durationSeconds > MAX_AUDIO_DURATION_SECONDS
    ) {
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        `Audio duration exceeds maximum limit of ${MAX_AUDIO_DURATION_SECONDS} seconds (detected: ${metadata.durationSeconds.toFixed(1)}s)`,
      );
    }

    return { buffer, metadata };
  }

  /**
   * Pre-validates Base64 string length and character set before allocating a Buffer.
   * Throws ERR_FILE_TOO_LARGE before decoding if payload exceeds 5 MB.
   */
  public static validateAndDecodeBase64(rawBase64: string): Buffer {
    if (!rawBase64 || typeof rawBase64 !== 'string') {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'Audio Base64 payload cannot be empty',
      );
    }

    const trimmed = rawBase64.trim();
    if (trimmed.length === 0) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'Audio Base64 payload cannot be empty',
      );
    }

    // Strip Data URI scheme if present (e.g. "data:audio/ogg;base64,...")
    const base64Content = trimmed.replace(/^data:audio\/[^;]+;base64,/i, '').trim();

    if (base64Content.length === 0) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'Audio Base64 data is empty',
      );
    }

    // Standard Base64 length must be a multiple of 4
    if (base64Content.length % 4 !== 0) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'Malformed Base64 string: length must be a multiple of 4',
      );
    }

    // Strict Base64 character set validation (rejects invalid characters that Buffer.from permits)
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    if (!base64Regex.test(base64Content)) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'Invalid Base64 string: contains illegal characters',
      );
    }

    // Calculate decoded byte length BEFORE decoding to avoid memory allocation for oversized payloads
    let paddingCount = 0;
    if (base64Content.endsWith('==')) {
      paddingCount = 2;
    } else if (base64Content.endsWith('=')) {
      paddingCount = 1;
    }

    const estimatedBytes = Math.floor((base64Content.length * 3) / 4) - paddingCount;
    if (estimatedBytes > MAX_AUDIO_SIZE_BYTES) {
      throw new AppException(
        AppErrorCode.AUDIO_TOO_LARGE,
        `Audio file exceeds maximum size limit of 5 MB (estimated: ${(estimatedBytes / (1024 * 1024)).toFixed(2)} MB)`,
      );
    }

    if (estimatedBytes === 0) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'Decoded audio buffer is empty (0 bytes)',
      );
    }

    // Safe to decode now that size and structure are verified
    const buffer = Buffer.from(base64Content, 'base64');

    if (buffer.length === 0) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'Decoded audio buffer is empty',
      );
    }

    if (buffer.length > MAX_AUDIO_SIZE_BYTES) {
      throw new AppException(AppErrorCode.AUDIO_TOO_LARGE);
    }

    return buffer;
  }

  /**
   * Validates raw binary Buffer size boundaries.
   */
  public static validateBufferRaw(buffer: Buffer): void {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'Audio buffer is required and cannot be empty',
      );
    }

    if (buffer.length > MAX_AUDIO_SIZE_BYTES) {
      throw new AppException(
        AppErrorCode.AUDIO_TOO_LARGE,
        `Audio file exceeds maximum size limit of 5 MB (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`,
      );
    }
  }

  /**
   * Inspects buffer headers to verify Opus format (Ogg Opus or WebM Opus),
   * extracting channels, sample rate, and duration where container headers permit.
   */
  public static inspectOpusMetadata(buffer: Buffer): AudioMetadata {
    // 1. Check for Ogg container: magic bytes "OggS" (0x4F 0x67 0x67 0x53)
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x4f &&
      buffer[1] === 0x67 &&
      buffer[2] === 0x67 &&
      buffer[3] === 0x53
    ) {
      return this.parseOggOpusMetadata(buffer);
    }

    // 2. Check for WebM container: EBML magic bytes (0x1A 0x45 0xDF 0xA3)
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    ) {
      return this.parseWebmOpusMetadata(buffer);
    }

    // Unsupported container / format
    throw new AppException(
      AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
      'Unsupported audio format. Audio must be Opus encoded in an Ogg or WebM container.',
    );
  }

  /**
   * Parses RFC 7845 Ogg Opus bitstream to verify OpusHead and extract metadata.
   */
  private static parseOggOpusMetadata(buffer: Buffer): AudioMetadata {
    const metadata: AudioMetadata = {
      format: 'ogg/opus',
      byteLength: buffer.length,
    };

    // An Ogg page header is at least 27 bytes
    if (buffer.length < 27) {
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        'Corrupted Ogg container: buffer too small for Ogg header',
      );
    }

    const segmentCount = buffer[26];
    const segmentTableOffset = 27;
    const packetDataOffset = segmentTableOffset + segmentCount;

    if (buffer.length < packetDataOffset + 8) {
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        'Corrupted Ogg container: buffer too small for first packet',
      );
    }

    // First packet in Ogg Opus must begin with "OpusHead" magic signature (RFC 7845 Section 5.1)
    const opusHeadMagic = buffer.toString('ascii', packetDataOffset, packetDataOffset + 8);
    if (opusHeadMagic !== 'OpusHead') {
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        'Invalid Ogg stream: expected OpusHead identification header for Opus audio',
      );
    }

    // OpusHead layout:
    // Offset 8: Version (uint8)
    // Offset 9: Output Channel Count (uint8)
    // Offset 10..11: Pre-skip (uint16 LE)
    // Offset 12..15: Input Sample Rate in Hz (uint32 LE)
    if (buffer.length >= packetDataOffset + 16) {
      metadata.channels = buffer.readUInt8(packetDataOffset + 9);
      metadata.sampleRateHz = buffer.readUInt32LE(packetDataOffset + 12);
    }

    // Calculate duration from the final Ogg page granule position
    // Granule position in Opus represents audio samples at 48,000 Hz (RFC 7845 Section 4)
    const finalGranule = this.findLastOggGranulePosition(buffer);
    if (finalGranule !== null && finalGranule > 0) {
      metadata.durationSeconds = finalGranule / 48000;
    }

    return metadata;
  }

  /**
   * Scans backwards from the end of the buffer to locate the last "OggS" page
   * and read its 64-bit granule position.
   */
  private static findLastOggGranulePosition(buffer: Buffer): number | null {
    const minPageSize = 27;
    const startScan = Math.max(0, buffer.length - 65536); // Scan last 64 KB

    for (let i = buffer.length - minPageSize; i >= startScan; i--) {
      if (
        buffer[i] === 0x4f &&
        buffer[i + 1] === 0x67 &&
        buffer[i + 2] === 0x67 &&
        buffer[i + 3] === 0x53
      ) {
        // Read 64-bit Little Endian granule position at offset 6..13
        const low = buffer.readUInt32LE(i + 6);
        const high = buffer.readUInt32LE(i + 10);
        // Combine low and high 32-bit into integer
        const granule = high * 4294967296 + low;
        if (granule > 0 && granule < Number.MAX_SAFE_INTEGER) {
          return granule;
        }
      }
    }

    return null;
  }

  /**
   * Validates WebM container and verifies Opus codec signature.
   */
  private static parseWebmOpusMetadata(buffer: Buffer): AudioMetadata {
    // Check if buffer contains the Opus CodecID ("A_OPUS") within the initial header (first 4KB)
    const searchHeaderLength = Math.min(buffer.length, 4096);
    const headerString = buffer.toString('binary', 0, searchHeaderLength);

    if (!headerString.includes('A_OPUS') && !headerString.includes('Opus')) {
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        'Invalid WebM audio: CodecID does not indicate Opus (expected A_OPUS)',
      );
    }

    return {
      format: 'webm/opus',
      byteLength: buffer.length,
      // WebM metadata fields (channels/duration) are encoded as variable-length EBML elements.
      // Limitations: full EBML tree demuxing without an external library (like music-metadata)
      // cannot safely parse every dynamic EBML track element. The container signature and codec ID
      // are verified here.
    };
  }
}
