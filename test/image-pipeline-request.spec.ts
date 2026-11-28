import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { AppErrorCode } from '../src/common/constants/error-codes';
import { AppException } from '../src/common/exceptions/app.exception';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ImageInputDto } from '../src/common/dto/image-input.dto';
import { ImageSanitizerPipe } from '../src/common/pipes/image-sanitizer.pipe';
import { OcrController } from '../src/modules/ocr/ocr.controller';
import { VisionController } from '../src/modules/vision/vision.controller';

describe('Real Request Path - Image Sanitizer Pipe & NestJS HTTP Pipeline', () => {
  let app: INestApplication;
  let exifJpegBase64: string;
  let lastOcrBody: ImageInputDto | null = null;
  let lastVisionBody: ImageInputDto | null = null;

  beforeAll(async () => {
    // Generate a valid JPEG with GPS EXIF metadata at test time
    const exifJpegBuffer = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 220, g: 40, b: 40 },
      },
    })
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: {
          IFD0: {
            Make: 'Nikon',
            Model: 'D850',
            Software: 'GPS Map Tracker 1.0',
          },
          GPSInfo: {
            GPSVersionID: '2 2 0 0',
            GPSLatitudeRef: 'N',
            GPSLatitude: '30/1 2/1 40/1',
            GPSLongitudeRef: 'E',
            GPSLongitude: '31/1 14/1 10/1',
          },
        },
      })
      .toBuffer();

    expect(exifJpegBuffer.toString('binary').includes('GPS')).toBe(true);
    expect(exifJpegBuffer.toString('binary').includes('Nikon')).toBe(true);
    exifJpegBase64 = exifJpegBuffer.toString('base64');

    // Wrap controller methods preserving all NestJS decorator metadata (HTTP code, routing, pipes)
    const origRead = OcrController.prototype.readDocument;
    function wrappedRead(this: any, body: ImageInputDto) {
      lastOcrBody = body;
      return origRead.apply(this, arguments as any);
    }
    Reflect.getMetadataKeys(origRead).forEach((k) => {
      Reflect.defineMetadata(k, Reflect.getMetadata(k, origRead), wrappedRead);
    });
    OcrController.prototype.readDocument = wrappedRead as any;

    const origDescribe = VisionController.prototype.describeScene;
    function wrappedDescribe(this: any, body: ImageInputDto) {
      lastVisionBody = body;
      return origDescribe.apply(this, arguments as any);
    }
    Reflect.getMetadataKeys(origDescribe).forEach((k) => {
      Reflect.defineMetadata(k, Reflect.getMetadata(k, origDescribe), wrappedDescribe);
    });
    VisionController.prototype.describeScene = wrappedDescribe as any;

    // Create minimal Nest testing module matching main.ts configuration
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OcrController, VisionController],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors) => {
          const messages = errors.flatMap((err) =>
            err.constraints ? Object.values(err.constraints) : [],
          );
          return new AppException(
            AppErrorCode.VALIDATION_FAILED,
            undefined,
            messages,
          );
        },
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Decorator Wiring Verification', () => {
    it('verifies method-level ImageSanitizerPipe is attached to OcrController.prototype.readDocument', () => {
      const pipes = Reflect.getMetadata('__pipes__', OcrController.prototype.readDocument) ?? [];
      const hasSanitizerPipe = pipes.some(
        (p: any) => p instanceof ImageSanitizerPipe || p === ImageSanitizerPipe,
      );
      expect(hasSanitizerPipe).toBe(true);
    });

    it('verifies class-level ImageSanitizerPipe is attached to VisionController', () => {
      const pipes = Reflect.getMetadata('__pipes__', VisionController) ?? [];
      const hasSanitizerPipe = pipes.some(
        (p: any) => p instanceof ImageSanitizerPipe || p === ImageSanitizerPipe,
      );
      expect(hasSanitizerPipe).toBe(true);
    });
  });

  describe('OCR Route (POST /api/v1/ocr/read) with method-level ImageSanitizerPipe', () => {
    it('valid JPEG with GPS EXIF -> 200 and controller receives sanitized JPEG with GPS stripped', async () => {
      lastOcrBody = null;

      const res = await request(app.getHttpServer())
        .post('/api/v1/ocr/read')
        .send({ imageBase64: exifJpegBase64 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(lastOcrBody).toBeDefined();
      expect(lastOcrBody?.imageBase64).toBeDefined();

      // Verify the received base64 is sanitized: no GPS / Nikon / Exif strings, valid JPEG magic bytes
      const receivedBuffer = Buffer.from(lastOcrBody!.imageBase64, 'base64');
      expect(receivedBuffer[0]).toBe(0xff);
      expect(receivedBuffer[1]).toBe(0xd8);
      expect(receivedBuffer[2]).toBe(0xff);

      const receivedRaw = receivedBuffer.toString('binary');
      expect(receivedRaw.includes('GPS')).toBe(false);
      expect(receivedRaw.includes('Nikon')).toBe(false);
      expect(receivedRaw.includes('Exif')).toBe(false);
    });

    it('"hello" -> 400 with ERR_VALIDATION_FAILED (invalid Base64 encoding)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ocr/read')
        .send({ imageBase64: 'hello' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe(AppErrorCode.VALIDATION_FAILED);
    });

    it('"blurry" -> 422 with ERR_IMAGE_BLURRY', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ocr/read')
        .send({ imageBase64: 'blurry' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe(AppErrorCode.IMAGE_BLURRY);
    });

    it('for OCR: "notext" -> 422 with ERR_NO_TEXT_DETECTED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ocr/read')
        .send({ imageBase64: 'notext' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe(AppErrorCode.NO_TEXT_DETECTED);
    });
  });

  describe('Vision Route (POST /api/v1/vision/describe) with class-level ImageSanitizerPipe', () => {
    it('valid JPEG with GPS EXIF -> 200 and controller receives sanitized JPEG with GPS stripped', async () => {
      lastVisionBody = null;

      const res = await request(app.getHttpServer())
        .post('/api/v1/vision/describe')
        .send({ imageBase64: exifJpegBase64 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(lastVisionBody).toBeDefined();
      expect(lastVisionBody?.imageBase64).toBeDefined();

      const receivedBuffer = Buffer.from(lastVisionBody!.imageBase64, 'base64');
      expect(receivedBuffer[0]).toBe(0xff);
      expect(receivedBuffer[1]).toBe(0xd8);
      expect(receivedBuffer[2]).toBe(0xff);

      const receivedRaw = receivedBuffer.toString('binary');
      expect(receivedRaw.includes('GPS')).toBe(false);
      expect(receivedRaw.includes('Nikon')).toBe(false);
      expect(receivedRaw.includes('Exif')).toBe(false);
    });

    it('"hello" -> 400 with ERR_VALIDATION_FAILED (invalid Base64 encoding)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/vision/describe')
        .send({ imageBase64: 'hello' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe(AppErrorCode.VALIDATION_FAILED);
    });

    it('"blurry" -> 422 with ERR_IMAGE_BLURRY', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/vision/describe')
        .send({ imageBase64: 'blurry' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe(AppErrorCode.IMAGE_BLURRY);
    });

    it('on vision route: "notext" is NOT treated as a trigger and does not return ERR_NO_TEXT_DETECTED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/vision/describe')
        .send({ imageBase64: 'notext' });

      // Because "notext" is not a trigger for vision routes, it fails validation with 400 (not 422 ERR_NO_TEXT_DETECTED)
      expect(res.status).toBe(400);
      expect(res.body.errorCode).not.toBe(AppErrorCode.NO_TEXT_DETECTED);
      expect(res.body.errorCode).toBe(AppErrorCode.VALIDATION_FAILED);
    });
  });
});
