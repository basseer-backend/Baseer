import { describe, it, expect, beforeEach } from 'vitest';
import { VisionController } from './vision.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('VisionController', () => {
  let controller: VisionController;

  beforeEach(() => {
    controller = new VisionController();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have JwtAuthGuard applied at controller class level', () => {
    const guardMetadata: any[] =
      Reflect.getMetadata('__guards__', VisionController) ?? [];
    const guardNames = guardMetadata.map((g: any) =>
      typeof g === 'function' ? g.name : g?.constructor?.name,
    );
    expect(guardNames).toContain('JwtAuthGuard');
  });

  describe('describeScene', () => {
    it('returns scene description for valid input', () => {
      const result = controller.describeScene({ imageBase64: 'validimage==' });
      expect(result).toMatchObject({
        description: expect.any(String),
        detectedObjects: expect.any(Array),
        confidence: expect.any(Number),
      });
    });

    it('throws ERR_IMAGE_BLURRY for blurry trigger', () => {
      expect(() => controller.describeScene({ imageBase64: 'blurry' })).toThrowError(
        expect.objectContaining({ errorCode: 'ERR_IMAGE_BLURRY' }),
      );
    });
  });

  describe('recognizeCurrency', () => {
    it('returns currency result for valid input', () => {
      const result = controller.recognizeCurrency({ imageBase64: 'validimage==' });
      expect(result).toMatchObject({
        denomination: expect.any(Number),
        currency: 'EGP',
        spokenAnnouncement: expect.any(String),
        confidence: expect.any(Number),
      });
    });
  });

  describe('detectColor', () => {
    it('returns color result for valid input', () => {
      const result = controller.detectColor({ imageBase64: 'validimage==' });
      expect(result).toMatchObject({
        colorNameArabic: expect.any(String),
        colorNameEnglish: expect.any(String),
        hexCode: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/),
        confidence: expect.any(Number),
      });
    });
  });

  describe('recognizeTrafficSign', () => {
    it('returns traffic sign result for valid input', () => {
      const result = controller.recognizeTrafficSign({ imageBase64: 'validimage==' });
      expect(result).toMatchObject({
        signName: expect.any(String),
        spokenMeaning: expect.any(String),
        confidence: expect.any(Number),
      });
    });
  });

  describe('detectFaceExpression', () => {
    it('returns face expression result for valid input', () => {
      const result = controller.detectFaceExpression({ imageBase64: 'validimage==' });
      expect(result).toMatchObject({
        expression: expect.any(String),
        spokenDescription: expect.any(String),
        confidence: expect.any(Number),
      });
    });
  });

  describe('detectObstacles', () => {
    it('returns obstacle result for valid input', () => {
      const result = controller.detectObstacles({ imageBase64: 'validimage==' });
      expect(result).toMatchObject({
        hazardDetected: expect.any(Boolean),
        hapticAlertPattern: expect.any(String),
        spokenWarning: expect.any(String),
        confidence: expect.any(Number),
      });
    });

    it('throws ERR_IMAGE_TOO_DARK for dark trigger', () => {
      expect(() => controller.detectObstacles({ imageBase64: 'dark' })).toThrowError(
        expect.objectContaining({ errorCode: 'ERR_IMAGE_TOO_DARK' }),
      );
    });
  });
});
