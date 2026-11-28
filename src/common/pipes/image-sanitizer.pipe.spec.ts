import sharp from 'sharp';
import { AppErrorCode } from '../constants/error-codes';
import { ImageInputDto } from '../dto/image-input.dto';
import { ImageSanitizerPipe } from './image-sanitizer.pipe';

describe('ImageSanitizerPipe', () => {
  let pipe: ImageSanitizerPipe;
  let ocrPipe: ImageSanitizerPipe;
  let samplePngBase64: string;

  beforeAll(async () => {
    pipe = new ImageSanitizerPipe();
    ocrPipe = new ImageSanitizerPipe({ allowNoTextTrigger: true });

    const pngBuffer = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 100, b: 50 },
      },
    })
      .png()
      .toBuffer();
    samplePngBase64 = pngBuffer.toString('base64');
  });

  it('should be defined and instantiate with or without options', () => {
    expect(pipe).toBeDefined();
    expect(ocrPipe).toBeDefined();
  });

  it('should transform ImageInputDto by sanitizing imageBase64 to canonical JPEG base64', async () => {
    const input: ImageInputDto = {
      imageBase64: samplePngBase64,
    };

    const result = await pipe.transform(input, {
      type: 'body',
      metatype: ImageInputDto,
    });

    expect(result).toBeDefined();
    expect(result.imageBase64).toBeDefined();
    expect(typeof result.imageBase64).toBe('string');
    expect(result.imageBase64.startsWith('data:')).toBe(false);

    // Verify resulting base64 decodes to valid JPEG magic bytes
    const buf = Buffer.from(result.imageBase64, 'base64');
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
    expect(buf[2]).toBe(0xff);
  });

  it('should return non-object or missing imageBase64 values untouched', async () => {
    expect(
      await pipe.transform(null as any, {
        type: 'body',
      }),
    ).toBeNull();

    const noImageDto = {} as any;
    expect(
      await pipe.transform(noImageDto, {
        type: 'body',
      }),
    ).toEqual({});
  });

  it('should throw fake trigger errors during transformation', async () => {
    await expect(
      pipe.transform(
        { imageBase64: 'blurry' },
        { type: 'body', metatype: ImageInputDto },
      ),
    ).rejects.toMatchObject({
      errorCode: AppErrorCode.IMAGE_BLURRY,
    });

    await expect(
      pipe.transform(
        { imageBase64: 'unsupported' },
        { type: 'body', metatype: ImageInputDto },
      ),
    ).rejects.toMatchObject({
      errorCode: AppErrorCode.UNSUPPORTED_IMAGE_FORMAT,
    });
  });

  it('should respect allowNoTextTrigger in OCR pipe configuration', async () => {
    await expect(
      ocrPipe.transform(
        { imageBase64: 'notext' },
        { type: 'body', metatype: ImageInputDto },
      ),
    ).rejects.toMatchObject({
      errorCode: AppErrorCode.NO_TEXT_DETECTED,
    });
  });
});
