import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { ModelArtifactHashService } from './model-artifact-hash.service';

describe('ModelArtifactHashService', () => {
  let service: ModelArtifactHashService;
  let tempDir: string;

  beforeEach(() => {
    service = new ModelArtifactHashService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseer-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('SHA-256 Format Validation', () => {
    it('should accept valid 64-character lowercase hex strings', () => {
      const validHash =
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      expect(service.isValidSha256(validHash)).toBe(true);
      expect(service.assertValidSha256(validHash)).toBe(validHash);
    });

    it('should reject invalid hashes (non-hex, too short, too long, empty)', () => {
      expect(service.isValidSha256('')).toBe(false);
      expect(service.isValidSha256(null)).toBe(false);
      expect(service.isValidSha256(undefined)).toBe(false);
      expect(service.isValidSha256('not-a-hash')).toBe(false);
      expect(service.isValidSha256('e3b0c442')).toBe(false); // too short
      expect(
        service.isValidSha256(
          'g3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // invalid 'g'
        ),
      ).toBe(false);
    });

    it('should throw BadRequestException on assertValidSha256 for invalid hash', () => {
      expect(() => service.assertValidSha256('invalid-hash')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('Buffer Hash Calculation', () => {
    it('should correctly calculate SHA-256 of empty buffer', () => {
      const emptyHash = crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
      expect(service.calculateBufferHash(Buffer.alloc(0))).toBe(emptyHash);
    });

    it('should correctly calculate SHA-256 of known content', () => {
      const content = Buffer.from('Baseer Assistive AI Model Artifact Weight Package v1.0');
      const expected = crypto.createHash('sha256').update(content).digest('hex');
      expect(service.calculateBufferHash(content)).toBe(expected);
    });
  });

  describe('File Hash Calculation and Verification', () => {
    it('should stream-read a file and calculate the exact SHA-256 digest', async () => {
      const filePath = path.join(tempDir, 'model.onnx');
      const modelContent = Buffer.from('fake-onnx-neural-network-model-binary-data');
      fs.writeFileSync(filePath, modelContent);

      const expected = crypto.createHash('sha256').update(modelContent).digest('hex');
      const computed = await service.calculateFileHash(filePath);

      expect(computed).toBe(expected);
      expect(computed).toHaveLength(64);
    });

    it('should throw BadRequestException if file does not exist', async () => {
      const nonExistent = path.join(tempDir, 'does-not-exist.bin');
      await expect(service.calculateFileHash(nonExistent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should verify matching artifact file with constant-time equality', async () => {
      const filePath = path.join(tempDir, 'weights.bin');
      const data = Buffer.from('model-weights-v1');
      fs.writeFileSync(filePath, data);

      const validHash = crypto.createHash('sha256').update(data).digest('hex');
      const isValid = await service.verifyArtifactFile(filePath, validHash);

      expect(isValid).toBe(true);
    });

    it('should reject tampered artifact file', async () => {
      const filePath = path.join(tempDir, 'tampered.bin');
      fs.writeFileSync(filePath, Buffer.from('original-data'));

      const validHash = crypto.createHash('sha256').update(Buffer.from('original-data')).digest('hex');

      // Tamper file
      fs.writeFileSync(filePath, Buffer.from('tampered-data-injected'));

      const isValid = await service.verifyArtifactFile(filePath, validHash);
      expect(isValid).toBe(false);
    });
  });
});
