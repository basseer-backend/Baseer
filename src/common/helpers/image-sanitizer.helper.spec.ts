import sharp from 'sharp';
import { AppErrorCode } from '../constants/error-codes';
import {
  assertImageSizeFitsJsonLimit,
  DetectedImageFormat,
  IMAGE_MAX_BYTES,
} from '../constants/image.constants';
import {
  detectImageFormatFromMagicBytes,
  estimateBase64DecodedSize,
  sanitizeImage,
} from './image-sanitizer.helper';

describe('ImageSanitizerHelper', () => {
  let jpegBase64: string;
  let pngBase64: string;
  let pngWithAlphaBase64: string;
  let webpBase64: string;
  let avifBase64: string;

  beforeAll(async () => {
    // Generate minimal valid images dynamically using Sharp at test time (no committed binary files)
    const jpegBuffer = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 200, g: 50, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();
    jpegBase64 = jpegBuffer.toString('base64');

    const pngBuffer = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 50, g: 200, b: 50 },
      },
    })
      .png()
      .toBuffer();
    pngBase64 = pngBuffer.toString('base64');

    // Transparent PNG (alpha = 0)
    const transparentPngBuffer = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    pngWithAlphaBase64 = transparentPngBuffer.toString('base64');

    const webpBuffer = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 50, g: 50, b: 200 },
      },
    })
      .webp()
      .toBuffer();
    webpBase64 = webpBuffer.toString('base64');

    const avifBuffer = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 100, g: 100, b: 100 },
      },
    })
      .avif()
      .toBuffer();
    avifBase64 = avifBuffer.toString('base64');
  });

  describe('assertImageSizeFitsJsonLimit', () => {
    it('should return true for the default IMAGE_MAX_BYTES', () => {
      expect(assertImageSizeFitsJsonLimit()).toBe(true);
    });

    it('should return false if maxBytes exceeds the 10MB JSON body limit when base64 encoded', () => {
      const hugeBytes = 12 * 1024 * 1024;
      expect(assertImageSizeFitsJsonLimit(hugeBytes)).toBe(false);
    });
  });

  describe('estimateBase64DecodedSize', () => {
    it('should calculate accurate byte size for base64 without padding', () => {
      const raw = 'abc'; // 3 bytes -> 4 chars in base64: 'YWJj'
      const b64 = Buffer.from(raw).toString('base64');
      expect(estimateBase64DecodedSize(b64)).toBe(3);
    });

    it('should correctly account for 1 or 2 padding characters', () => {
      const b64Pad1 = Buffer.from('ab').toString('base64'); // 2 bytes -> 'YWI='
      expect(estimateBase64DecodedSize(b64Pad1)).toBe(2);

      const b64Pad2 = Buffer.from('a').toString('base64'); // 1 byte -> 'YQ=='
      expect(estimateBase64DecodedSize(b64Pad2)).toBe(1);
    });

    it('should handle data-URI prefixes gracefully', () => {
      const b64 = 'data:image/jpeg;base64,' + Buffer.from('test').toString('base64');
      expect(estimateBase64DecodedSize(b64)).toBe(4);
    });

    it('should ignore internal whitespace and newlines when estimating size', () => {
      const b64WithNewlines = 'YW\r\nJj'; // 'abc' with \r\n
      expect(estimateBase64DecodedSize(b64WithNewlines)).toBe(3);
    });

    it('should return 0 for empty string or non-string input', () => {
      expect(estimateBase64DecodedSize('')).toBe(0);
      expect(estimateBase64DecodedSize(null as any)).toBe(0);
    });
  });

  describe('detectImageFormatFromMagicBytes', () => {
    it('should detect JPEG magic bytes (FF D8 FF)', () => {
      const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(detectImageFormatFromMagicBytes(buf)).toBe(DetectedImageFormat.JPEG);
    });

    it('should detect PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)', () => {
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(detectImageFormatFromMagicBytes(buf)).toBe(DetectedImageFormat.PNG);
    });

    it('should detect WebP magic bytes (RIFF .... WEBP)', () => {
      const buf = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
        Buffer.from('WEBP'),
      ]);
      expect(detectImageFormatFromMagicBytes(buf)).toBe(DetectedImageFormat.WEBP);
    });

    it('should detect AVIF magic bytes via ftyp box', () => {
      const buf = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x1c]),
        Buffer.from('ftyp'),
        Buffer.from('avif'),
      ]);
      expect(detectImageFormatFromMagicBytes(buf)).toBe(DetectedImageFormat.AVIF);
    });

    it('should detect HEIC magic bytes via ftyp box major brand', () => {
      const buf = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from('ftyp'),
        Buffer.from('heic'),
      ]);
      expect(detectImageFormatFromMagicBytes(buf)).toBe(DetectedImageFormat.HEIC);
    });

    it('should detect HEIC via compatible brands', () => {
      const buf = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x20]),
        Buffer.from('ftyp'),
        Buffer.from('isom'),
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
        Buffer.from('mif1'),
      ]);
      expect(detectImageFormatFromMagicBytes(buf)).toBe(DetectedImageFormat.HEIC);
    });

    it('should return UNSUPPORTED for GIF, BMP, TIFF, SVG, text, or truncated buffer', () => {
      expect(detectImageFormatFromMagicBytes(Buffer.from('GIF89a'))).toBe(
        DetectedImageFormat.UNSUPPORTED,
      );
      expect(detectImageFormatFromMagicBytes(Buffer.from('BM1234'))).toBe(
        DetectedImageFormat.UNSUPPORTED,
      );
      expect(
        detectImageFormatFromMagicBytes(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')),
      ).toBe(DetectedImageFormat.UNSUPPORTED);
      expect(detectImageFormatFromMagicBytes(Buffer.from('plain text'))).toBe(
        DetectedImageFormat.UNSUPPORTED,
      );
      expect(detectImageFormatFromMagicBytes(Buffer.from([0xff]))).toBe(
        DetectedImageFormat.UNSUPPORTED,
      );
    });
  });

  describe('sanitizeImage - Metadata Stripping, Orientation, ICC, & Polyglot', () => {
    it('1.a. JPEG with EXIF: strips EXIF/GPS/Make/Model, physically rotates (orientation 6), removes orientation tag', async () => {
      // Create a 20x10 JPEG with Orientation=6 (Rotated 90 deg CW), Make/Model, and GPS tags
      const exifJpegBuffer = await sharp({
        create: {
          width: 20,
          height: 10,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .withMetadata({
          orientation: 6,
          exif: {
            IFD0: {
              Make: 'Canon',
              Model: 'Canon EOS 5D',
              Software: 'GPS Map Tracker 1.0',
            },
            GPSInfo: {
              GPSVersionID: '2 2 0 0',
              GPSLatitudeRef: 'N',
              GPSLatitude: '48/1 51/1 24/1',
              GPSLongitudeRef: 'E',
              GPSLongitude: '2/1 21/1 7/1',
            },
          },
        })
        .toBuffer();

      // Verify input has EXIF and strings before sanitization
      const inRawStr = exifJpegBuffer.toString('binary');
      expect(inRawStr.includes('Exif')).toBe(true);
      expect(inRawStr.includes('GPS')).toBe(true);
      expect(inRawStr.includes('Canon')).toBe(true);
      expect(inRawStr.includes('EOS 5D')).toBe(true);

      const inMeta = await sharp(exifJpegBuffer).metadata();
      expect(inMeta.width).toBe(20);
      expect(inMeta.height).toBe(10);
      expect(inMeta.orientation).toBe(6);

      // Run through sanitizeImage
      const sanitized = await sanitizeImage(exifJpegBuffer.toString('base64'));

      // 1. Assert sharp metadata on output confirms no exif, xmp, or iptc
      const outMeta = await sharp(sanitized.buffer).metadata();
      expect(outMeta.exif).toBeUndefined();
      expect(outMeta.xmp).toBeUndefined();
      expect(outMeta.iptc).toBeUndefined();

      // 2. Assert orientation tag is gone/undefined
      expect(outMeta.orientation).toBeUndefined();

      // 3. Assert output is physically rotated: width & height swapped (was 20x10, now 10x20)
      expect(outMeta.width).toBe(10);
      expect(outMeta.height).toBe(20);
      expect(sanitized.width).toBe(20); // original width reported in result
      expect(sanitized.height).toBe(10);

      // 4. Assert scanning raw output bytes finds none of: 'Exif', 'GPS', 'Canon', 'EOS 5D'
      const outRawStr = sanitized.buffer.toString('binary');
      expect(outRawStr.includes('Exif')).toBe(false);
      expect(outRawStr.includes('GPS')).toBe(false);
      expect(outRawStr.includes('Canon')).toBe(false);
      expect(outRawStr.includes('EOS 5D')).toBe(false);
    });

    it('1.b. PNG carrying text/XMP metadata: output is JPEG with all metadata stripped and raw text eliminated', async () => {
      const secretText = 'CONFIDENTIAL_MEDICAL_XMP_DATA_SECRET';
      const pngWithMeta = await sharp({
        create: {
          width: 12,
          height: 12,
          channels: 3,
          background: { r: 0, g: 128, b: 0 },
        },
      })
        .png()
        .withMetadata({
          exif: {
            IFD0: {
              ImageDescription: secretText,
            },
          },
        })
        .toBuffer();

      expect(pngWithMeta.toString('binary').includes(secretText)).toBe(true);

      const sanitized = await sanitizeImage(pngWithMeta.toString('base64'));

      // Output must be canonical JPEG
      expect(sanitized.mimeType).toBe('image/jpeg');
      expect(sanitized.originalFormat).toBe(DetectedImageFormat.PNG);
      expect(sanitized.buffer[0]).toBe(0xff);
      expect(sanitized.buffer[1]).toBe(0xd8);
      expect(sanitized.buffer[2]).toBe(0xff);

      const outMeta = await sharp(sanitized.buffer).metadata();
      expect(outMeta.format).toBe('jpeg');
      expect(outMeta.exif).toBeUndefined();
      expect(outMeta.xmp).toBeUndefined();

      // Raw output bytes must not contain the secret text
      expect(sanitized.buffer.toString('binary').includes(secretText)).toBe(false);
    });

    it('1.c. Image tagged with non-sRGB ICC profile (p3): output colourspace is sRGB and embedded ICC profile is stripped', async () => {
      const p3Buffer = await sharp({
        create: {
          width: 14,
          height: 14,
          channels: 3,
          background: { r: 255, g: 128, b: 0 },
        },
      })
        .withIccProfile('p3')
        .jpeg()
        .toBuffer();

      const inMeta = await sharp(p3Buffer).metadata();
      expect(inMeta.icc).toBeDefined(); // Contains embedded P3 profile buffer

      const sanitized = await sanitizeImage(p3Buffer.toString('base64'));
      const outMeta = await sharp(sanitized.buffer).metadata();

      // Output colourspace is sRGB and embedded profile is stripped (untagged sRGB)
      expect(outMeta.space).toBe('srgb');
      expect(outMeta.icc).toBeUndefined();
    });

    it('1.d. Pixel cap: explicitly rejects image exceeding overridden maxPixels or default 50 MP (huge-dimension tiny-bytes PNG)', async () => {
      // 1. Parameter override check: 16x16 image has 256 pixels. Setting maxPixels: 100 must fail explicitly before decoding.
      await expect(
        sanitizeImage(jpegBase64, { maxPixels: 100 }),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.FILE_TOO_LARGE,
      });

      // 2. Huge-dimension tiny-bytes PNG: 8000x8000 = 64 MP (exceeds default IMAGE_MAX_PIXELS=50 MP), compressed to ~186 KB (well below 7 MiB bytes limit)
      const hugeDimPng = await sharp({
        create: {
          width: 8000,
          height: 8000,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .png({ compressionLevel: 9 })
        .toBuffer();

      expect(hugeDimPng.length).toBeLessThan(1024 * 1024); // Under 1 MB raw bytes

      await expect(
        sanitizeImage(hugeDimPng.toString('base64')),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.FILE_TOO_LARGE,
      });
    });

    it('1.e. Polyglot: valid JPEG with appended text payload has the payload stripped in the output bytes', async () => {
      const baseJpegBuffer = Buffer.from(jpegBase64, 'base64');
      const maliciousPayload = '<!-- MALICIOUS_INJECTED_POLYGLOT_SCRIPT_OR_KEY -->';
      const polyglotBuffer = Buffer.concat([baseJpegBuffer, Buffer.from(maliciousPayload)]);

      expect(polyglotBuffer.toString('binary').includes(maliciousPayload)).toBe(true);

      const sanitized = await sanitizeImage(polyglotBuffer.toString('base64'));

      // Output JPEG must not contain the injected payload
      expect(sanitized.buffer.toString('binary').includes(maliciousPayload)).toBe(false);
      expect(sanitized.mimeType).toBe('image/jpeg');
    });

    it('1.f. Base64 containing newlines and whitespace is accepted and sanitized', async () => {
      // Wrap base64 with newlines and spaces (e.g. PEM style line wrapping)
      const wrappedBase64 = `\n  ${jpegBase64.slice(0, 32)}\r\n  ${jpegBase64.slice(32, 64)}\n  ${jpegBase64.slice(64)}  \n`;

      const sanitized = await sanitizeImage(wrappedBase64);
      expect(sanitized.mimeType).toBe('image/jpeg');
      expect(sanitized.buffer[0]).toBe(0xff);
      expect(sanitized.buffer[1]).toBe(0xd8);
      expect(sanitized.buffer[2]).toBe(0xff);
    });

    it('6. Truncated JPEG with valid magic bytes is rejected with ERR_UNSUPPORTED_IMAGE_FORMAT (sharp default failOn)', async () => {
      const baseJpegBuffer = Buffer.from(jpegBase64, 'base64');
      // Truncate after 25 bytes: has valid FF D8 FF magic bytes, but truncated stream
      const truncated = baseJpegBuffer.subarray(0, 25);
      expect(truncated[0]).toBe(0xff);
      expect(truncated[1]).toBe(0xd8);
      expect(truncated[2]).toBe(0xff);

      await expect(
        sanitizeImage(truncated.toString('base64')),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
      });
    });
  });

  describe('sanitizeImage - Format Normalization & Validation', () => {
    it('should accept and normalize valid JPEG to canonical JPEG', async () => {
      const result = await sanitizeImage(jpegBase64);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.originalFormat).toBe(DetectedImageFormat.JPEG);
      expect(result.buffer[0]).toBe(0xff);
      expect(result.buffer[1]).toBe(0xd8);
      expect(result.buffer[2]).toBe(0xff);
      expect(result.base64).toBe(result.buffer.toString('base64'));
      expect(result.base64.startsWith('data:')).toBe(false);
    });

    it('should accept and normalize valid PNG to canonical JPEG', async () => {
      const result = await sanitizeImage(pngBase64);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.originalFormat).toBe(DetectedImageFormat.PNG);
      expect(result.buffer[0]).toBe(0xff);
      expect(result.buffer[1]).toBe(0xd8);
      expect(result.buffer[2]).toBe(0xff);
    });

    it('should accept and normalize valid WebP to canonical JPEG', async () => {
      const result = await sanitizeImage(webpBase64);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.originalFormat).toBe(DetectedImageFormat.WEBP);
      expect(result.buffer[0]).toBe(0xff);
      expect(result.buffer[1]).toBe(0xd8);
    });

    it('should accept and normalize valid AVIF to canonical JPEG', async () => {
      const result = await sanitizeImage(avifBase64);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.originalFormat).toBe(DetectedImageFormat.AVIF);
      expect(result.buffer[0]).toBe(0xff);
      expect(result.buffer[1]).toBe(0xd8);
    });

    it('should flatten transparent PNG onto solid white (#ffffff)', async () => {
      const result = await sanitizeImage(pngWithAlphaBase64);
      expect(result.mimeType).toBe('image/jpeg');

      // Decode the output JPEG raw pixels to verify background color
      const rawPixels = await sharp(result.buffer).raw().toBuffer();
      // Inspect first pixel RGB channels: all should be 255 (white)
      expect(rawPixels[0]).toBe(255);
      expect(rawPixels[1]).toBe(255);
      expect(rawPixels[2]).toBe(255);
    });

    it('should ignore deceptive data-URI scheme and trust magic bytes (e.g. data:image/png with WebP content)', async () => {
      const lyingDataUri = `data:image/png;base64,${webpBase64}`;
      const result = await sanitizeImage(lyingDataUri);
      expect(result.originalFormat).toBe(DetectedImageFormat.WEBP);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.buffer[0]).toBe(0xff);
      expect(result.buffer[1]).toBe(0xd8);
    });

    it('should reject SVG/XML payloads disguised under data:image/jpeg with ERR_UNSUPPORTED_IMAGE_FORMAT', async () => {
      const svgBase64 = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect fill="red"/></svg>',
      ).toString('base64');
      const lyingSvg = `data:image/jpeg;base64,${svgBase64}`;

      await expect(sanitizeImage(lyingSvg)).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
      });
    });

    it('should reject GIF image with ERR_UNSUPPORTED_IMAGE_FORMAT', async () => {
      const gifBuffer = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      );
      await expect(sanitizeImage(gifBuffer.toString('base64'))).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
      });
    });

    it('should reject HEIC image with ERR_UNSUPPORTED_IMAGE_FORMAT and internal log', async () => {
      const heicBuf = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from('ftyp'),
        Buffer.from('heic'),
        Buffer.alloc(32),
      ]);
      await expect(sanitizeImage(heicBuf.toString('base64'))).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
      });
    });

    it('should reject corrupted image buffer with ERR_UNSUPPORTED_IMAGE_FORMAT', async () => {
      const corruptJpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        Buffer.from('not real jpeg data'),
      ]).toString('base64');

      await expect(sanitizeImage(corruptJpeg)).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
      });
    });
  });

  describe('sanitizeImage - Strict Error Codes (Item 1.g)', () => {
    it('should reject empty string with ERR_VALIDATION_FAILED', async () => {
      await expect(sanitizeImage('')).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
    });

    it('should reject whitespace-only string with ERR_VALIDATION_FAILED', async () => {
      await expect(sanitizeImage('   \n\r\t   ')).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
    });

    it('should reject non-string inputs with ERR_VALIDATION_FAILED', async () => {
      await expect(sanitizeImage(null as any)).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
      await expect(sanitizeImage(12345 as any)).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
      await expect(sanitizeImage({} as any)).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
    });

    it('should reject non-base64 invalid characters with ERR_VALIDATION_FAILED', async () => {
      await expect(sanitizeImage('!!!###$$$%%%')).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
    });

    it('should reject invalid base64 length (e.g. "hello") with ERR_VALIDATION_FAILED', async () => {
      await expect(sanitizeImage('hello')).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
    });

    it('should reject valid base64 encoding of non-image plain text with ERR_UNSUPPORTED_IMAGE_FORMAT', async () => {
      const textBase64 = Buffer.from('Just plain text content without image magic bytes').toString(
        'base64',
      );
      await expect(sanitizeImage(textBase64)).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
      });
    });

    it('should reject payload exceeding pre-decode estimated size with ERR_FILE_TOO_LARGE', async () => {
      const hugeLen = Math.ceil(((IMAGE_MAX_BYTES + 1024) * 4) / 3);
      const hugeB64 = 'A'.repeat(hugeLen);

      await expect(sanitizeImage(hugeB64)).rejects.toMatchObject({
        errorCode: AppErrorCode.FILE_TOO_LARGE,
      });
    });

    it('should handle fake test triggers properly', async () => {
      await expect(sanitizeImage('blurry')).rejects.toMatchObject({
        errorCode: AppErrorCode.IMAGE_BLURRY,
      });
      await expect(sanitizeImage('dark')).rejects.toMatchObject({
        errorCode: AppErrorCode.IMAGE_TOO_DARK,
      });
      await expect(sanitizeImage('unsupported')).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
      });
      await expect(sanitizeImage('toolarge')).rejects.toMatchObject({
        errorCode: AppErrorCode.FILE_TOO_LARGE,
      });
      await expect(sanitizeImage('lowconfidence')).rejects.toMatchObject({
        errorCode: AppErrorCode.LOW_CONFIDENCE,
      });
      await expect(sanitizeImage('timeout')).rejects.toMatchObject({
        errorCode: AppErrorCode.REQUEST_TIMEOUT,
      });

      // notext without allowNoTextTrigger is not a trigger, fails base64 validation with ERR_VALIDATION_FAILED
      await expect(sanitizeImage('notext')).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });

      // notext with allowNoTextTrigger = true triggers ERR_NO_TEXT_DETECTED
      await expect(sanitizeImage('notext', { allowNoTextTrigger: true })).rejects.toMatchObject({
        errorCode: AppErrorCode.NO_TEXT_DETECTED,
      });

      // valid-image test trigger returns stub
      const stub = await sanitizeImage('valid-image');
      expect(stub.base64).toBe('valid-image');
    });
  });
});
