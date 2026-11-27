import { describe, it, expect } from 'vitest';
import {
  AudioValidatorHelper,
  MAX_AUDIO_SIZE_BYTES,
} from './audio-validator.helper';
import { AppException } from '../../../common/exceptions/app.exception';
import { AppErrorCode } from '../../../common/constants/error-codes';

describe('AudioValidatorHelper', () => {
  /**
   * Helper to build a valid synthetic Ogg Opus buffer for testing.
   */
  function buildSyntheticOggOpusBuffer(options: {
    channels?: number;
    sampleRateHz?: number;
    durationSeconds?: number;
  } = {}): Buffer {
    const channels = options.channels ?? 1;
    const sampleRateHz = options.sampleRateHz ?? 16000;
    const durationSeconds = options.durationSeconds ?? 3; // 3 seconds by default

    // Page 0: OpusHead identification header
    // 27 bytes Ogg header + 1 byte segment table + 19 bytes OpusHead = 47 bytes
    const page0 = Buffer.alloc(47);
    page0.write('OggS', 0, 'ascii'); // 0..3: magic
    page0.writeUInt8(0, 4); // 4: version
    page0.writeUInt8(0x02, 5); // 5: header type (BOS)
    page0.writeBigUInt64LE(0n, 6); // 6..13: granule position (0 on BOS)
    page0.writeUInt32LE(12345, 14); // 14..17: bitstream serial
    page0.writeUInt32LE(0, 18); // 18..21: page sequence
    page0.writeUInt32LE(0, 22); // 22..25: crc
    page0.writeUInt8(1, 26); // 26: 1 segment
    page0.writeUInt8(19, 27); // 27: segment size = 19 bytes

    // OpusHead payload starting at offset 28
    page0.write('OpusHead', 28, 'ascii'); // 28..35: magic
    page0.writeUInt8(1, 36); // 36: version 1
    page0.writeUInt8(channels, 37); // 37: channels
    page0.writeUInt16LE(312, 38); // 38..39: pre-skip
    page0.writeUInt32LE(sampleRateHz, 40); // 40..43: sample rate in Hz
    page0.writeInt16LE(0, 44); // 44..45: output gain
    page0.writeUInt8(0, 46); // 46: mapping family

    // Page 1: Audio data with EOS granule position
    // Granule in Opus is always calculated at 48 kHz
    const finalGranule = BigInt(Math.floor(durationSeconds * 48000));
    const page1 = Buffer.alloc(38);
    page1.write('OggS', 0, 'ascii');
    page1.writeUInt8(0, 4);
    page1.writeUInt8(0x04, 5); // EOS flag
    page1.writeBigUInt64LE(finalGranule, 6); // granule position
    page1.writeUInt32LE(12345, 14);
    page1.writeUInt32LE(1, 18);
    page1.writeUInt32LE(0, 22);
    page1.writeUInt8(1, 26);
    page1.writeUInt8(10, 27); // 10 bytes audio data
    page1.fill(0xaa, 28, 38);

    return Buffer.concat([page0, page1]);
  }

  describe('Base64 Pre-validation', () => {
    it('rejects empty Base64 payload', () => {
      expect(() =>
        AudioValidatorHelper.validate({ audioBase64: '' }),
      ).toThrow(AppException);

      try {
        AudioValidatorHelper.validate({ audioBase64: '   ' });
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.VALIDATION_FAILED);
      }
    });

    it('rejects malformed Base64 length not multiple of 4', () => {
      expect(() =>
        AudioValidatorHelper.validate({ audioBase64: 'abc' }),
      ).toThrow(AppException);
    });

    it('rejects Base64 with illegal characters', () => {
      expect(() =>
        AudioValidatorHelper.validate({ audioBase64: 'abcd!@#$' }),
      ).toThrow(AppException);
    });

    it('rejects oversized Base64 before decoding without allocating huge buffer', () => {
      // 5 MB = 5,242,880 bytes. In Base64, 5 MB is ~6,990,508 characters.
      // 7,000,000 chars of Base64 represents > 5.24 MB
      const oversizedBase64 = 'AAAA'.repeat(1750000); // 7,000,000 chars (~5.25 MB)

      try {
        AudioValidatorHelper.validate({ audioBase64: oversizedBase64 });
        expect.unreachable('Should have thrown AUDIO_TOO_LARGE');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect(err.errorCode).toBe(AppErrorCode.AUDIO_TOO_LARGE);
        expect(err.getStatus()).toBe(413);
      }
    });

    it('strips Data URI scheme prefix and decodes successfully', () => {
      const validBuffer = buildSyntheticOggOpusBuffer();
      const base64Data = `data:audio/ogg;base64,${validBuffer.toString('base64')}`;

      const result = AudioValidatorHelper.validate({ audioBase64: base64Data });
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.metadata.format).toBe('ogg/opus');
      expect(result.metadata.channels).toBe(1);
      expect(result.metadata.sampleRateHz).toBe(16000);
    });
  });

  describe('Buffer Validation & Opus Format Inspection', () => {
    it('accepts valid 16kHz mono Opus audio within 10 seconds', () => {
      const validBuffer = buildSyntheticOggOpusBuffer({
        channels: 1,
        sampleRateHz: 16000,
        durationSeconds: 4.5,
      });

      const result = AudioValidatorHelper.validate({ audioBuffer: validBuffer });
      expect(result.metadata.format).toBe('ogg/opus');
      expect(result.metadata.channels).toBe(1);
      expect(result.metadata.sampleRateHz).toBe(16000);
      expect(result.metadata.durationSeconds).toBeCloseTo(4.5, 1);
    });

    it('rejects stereo Opus audio (channels = 2)', () => {
      const stereoBuffer = buildSyntheticOggOpusBuffer({ channels: 2 });

      try {
        AudioValidatorHelper.validate({ audioBuffer: stereoBuffer });
        expect.unreachable('Should have thrown UNSUPPORTED_AUDIO_FORMAT for stereo');
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.UNSUPPORTED_AUDIO_FORMAT);
        expect(err.message).toContain('mono');
      }
    });

    it('rejects Opus audio with non-16kHz sample rate (e.g. 48000 Hz)', () => {
      const highRateBuffer = buildSyntheticOggOpusBuffer({ sampleRateHz: 48000 });

      try {
        AudioValidatorHelper.validate({ audioBuffer: highRateBuffer });
        expect.unreachable('Should have thrown UNSUPPORTED_AUDIO_FORMAT for sample rate');
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.UNSUPPORTED_AUDIO_FORMAT);
        expect(err.message).toContain('16 kHz');
      }
    });

    it('rejects Opus audio exceeding 10 seconds duration', () => {
      const longBuffer = buildSyntheticOggOpusBuffer({ durationSeconds: 12.5 });

      try {
        AudioValidatorHelper.validate({ audioBuffer: longBuffer });
        expect.unreachable('Should have thrown UNSUPPORTED_AUDIO_FORMAT for duration');
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.UNSUPPORTED_AUDIO_FORMAT);
        expect(err.message).toContain('10 seconds');
      }
    });

    it('rejects oversized raw buffer (> 5 MB)', () => {
      const oversizedBuffer = Buffer.alloc(MAX_AUDIO_SIZE_BYTES + 1024);

      try {
        AudioValidatorHelper.validate({ audioBuffer: oversizedBuffer });
        expect.unreachable('Should have thrown AUDIO_TOO_LARGE');
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.AUDIO_TOO_LARGE);
        expect(err.getStatus()).toBe(413);
      }
    });

    it('rejects non-Opus containers (e.g. WAV RIFF)', () => {
      const wavHeader = Buffer.from('RIFF....WAVEfmt ', 'ascii');

      try {
        AudioValidatorHelper.validate({ audioBuffer: wavHeader });
        expect.unreachable('Should have thrown for non-Opus');
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.UNSUPPORTED_AUDIO_FORMAT);
        expect(err.message).toContain('Opus');
      }
    });

    it('accepts WebM container with Opus codec signature', () => {
      // EBML header + TrackEntry with A_OPUS
      const webmBuffer = Buffer.alloc(128);
      webmBuffer[0] = 0x1a;
      webmBuffer[1] = 0x45;
      webmBuffer[2] = 0xdf;
      webmBuffer[3] = 0xa3;
      webmBuffer.write('...A_OPUS...', 16, 'ascii');

      const result = AudioValidatorHelper.validate({ audioBuffer: webmBuffer });
      expect(result.metadata.format).toBe('webm/opus');
    });
  });
});
