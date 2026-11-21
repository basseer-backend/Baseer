import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';

@Injectable()
export class ModelArtifactHashService {
  private static readonly SHA256_REGEX = /^[0-9a-f]{64}$/;

  /**
   * Validates whether a string adheres to standard lowercase 64-character SHA-256 hexadecimal format.
   */
  isValidSha256(hash: string | null | undefined): boolean {
    if (!hash || typeof hash !== 'string') {
      return false;
    }
    return ModelArtifactHashService.SHA256_REGEX.test(hash.trim().toLowerCase());
  }

  /**
   * Enforces that a hash string is valid SHA-256, throwing BadRequestException if invalid.
   */
  assertValidSha256(hash: string): string {
    const normalized = hash.trim().toLowerCase();
    if (!ModelArtifactHashService.SHA256_REGEX.test(normalized)) {
      throw new BadRequestException(
        `Invalid SHA-256 hash format. Must be a 64-character lowercase hexadecimal string, received: '${hash}'`,
      );
    }
    return normalized;
  }

  /**
   * Calculates SHA-256 digest directly from an in-memory Buffer.
   * Useful for uploaded artifact packages or small model weights.
   */
  calculateBufferHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Calculates SHA-256 digest from a file path using streams.
   * Memory-safe for multi-gigabyte neural network artifacts (ONNX, PyTorch, TFLite).
   */
  async calculateFileHash(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException(`Model artifact file not found at: '${filePath}'`);
    }

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) =>
        reject(
          new BadRequestException(
            `Failed to calculate artifact hash from file '${filePath}': ${err.message}`,
          ),
        ),
      );
    });
  }

  /**
   * Verifies an artifact file on disk against an expected SHA-256 hash
   * using a constant-time comparison to prevent timing side-channels.
   */
  async verifyArtifactFile(
    filePath: string,
    expectedHash: string,
  ): Promise<boolean> {
    const normalizedExpected = this.assertValidSha256(expectedHash);
    const calculatedHash = await this.calculateFileHash(filePath);

    return this.timingSafeCompare(calculatedHash, normalizedExpected);
  }

  /**
   * Verifies an in-memory buffer against an expected SHA-256 hash.
   */
  verifyArtifactBuffer(buffer: Buffer, expectedHash: string): boolean {
    const normalizedExpected = this.assertValidSha256(expectedHash);
    const calculatedHash = this.calculateBufferHash(buffer);

    return this.timingSafeCompare(calculatedHash, normalizedExpected);
  }

  private timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');

    if (bufA.length !== bufB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  }
}
