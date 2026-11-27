import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('OcrController', () => {
  let controller: OcrController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OcrController],
      providers: [OcrService, JwtAuthGuard],
    }).compile();

    controller = module.get<OcrController>(OcrController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have JwtAuthGuard applied at controller class level', () => {
    const guardMetadata: any[] =
      Reflect.getMetadata('__guards__', OcrController) ?? [];
    const guardNames = guardMetadata.map((g: any) =>
      typeof g === 'function' ? g.name : g?.constructor?.name,
    );
    expect(guardNames).toContain('JwtAuthGuard');
  });

  describe('readDocument', () => {
    it('returns OCR result for a valid image input', () => {
      const result = controller.readDocument({ imageBase64: 'validimage==' });
      expect(result).toMatchObject({
        detectedLanguage: expect.any(String),
        extractedText: expect.any(String),
        arabicSimplifiedText: expect.any(String),
        confidence: expect.any(Number),
      });
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('throws ERR_IMAGE_BLURRY for blurry trigger', () => {
      expect(() => controller.readDocument({ imageBase64: 'blurry' })).toThrowError(
        expect.objectContaining({ errorCode: 'ERR_IMAGE_BLURRY' }),
      );
    });

    it('throws ERR_FILE_TOO_LARGE for toolarge trigger', () => {
      expect(() => controller.readDocument({ imageBase64: 'toolarge' })).toThrowError(
        expect.objectContaining({ errorCode: 'ERR_FILE_TOO_LARGE' }),
      );
    });
  });
});
