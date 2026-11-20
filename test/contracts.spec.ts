import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  AppErrorCode,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
} from '../src/common/constants/error-codes';
import {
  VoiceIntent,
  MobileAction,
  FacialExpression,
  HapticPattern,
} from '../src/common/enums';

describe('Contracts Verification', () => {
  const rootDir = path.resolve(__dirname, '..');
  const contractsDir = path.join(rootDir, 'contracts');
  const fixturesDir = path.join(contractsDir, 'fixtures');
  const errorFixturesDir = path.join(fixturesDir, 'error');
  const successFixturesDir = path.join(fixturesDir, 'success');

  it('contract-version.txt matches version 1.0.0', () => {
    const versionFile = path.join(contractsDir, 'contract-version.txt');
    expect(fs.existsSync(versionFile)).toBe(true);
    const version = fs.readFileSync(versionFile, 'utf8').trim();
    expect(version).toBe('1.0.0');
  });

  it('error-codes.json has the exact number of codes and matches AppErrorCode and ERROR_HTTP_STATUS', () => {
    const errorCodesFile = path.join(contractsDir, 'error-codes.json');
    expect(fs.existsSync(errorCodesFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(errorCodesFile, 'utf8'));

    const expectedCodes = Object.values(AppErrorCode);
    expect(data.codes.length).toBe(expectedCodes.length);
    expect(data.codes.length).toBe(20);

    for (const entry of data.codes) {
      expect(expectedCodes).toContain(entry.code);
      const expectedStatus = ERROR_HTTP_STATUS[entry.code as AppErrorCode];
      expect(entry.http).toBe(expectedStatus);
      expect(entry.owner).toBeDefined();
      expect(entry.retry).toBeDefined();
      expect(entry.messageKey).toBeDefined();
      expect(entry.fallbackMessage).toBeDefined();
    }
  });

  it('enums.json matches the enums in src/common/enums', () => {
    const enumsFile = path.join(contractsDir, 'enums.json');
    expect(fs.existsSync(enumsFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(enumsFile, 'utf8'));

    expect(data.VoiceIntent).toEqual(Object.values(VoiceIntent));
    expect(data.MobileAction).toEqual(Object.values(MobileAction));
    expect(data.FacialExpression).toEqual(Object.values(FacialExpression));
    expect(data.HapticPattern).toEqual(Object.values(HapticPattern));
  });

  it('messages.ar.json matches ERROR_MESSAGES', () => {
    const messagesFile = path.join(contractsDir, 'messages.ar.json');
    expect(fs.existsSync(messagesFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(messagesFile, 'utf8'));

    expect(data.contractVersion).toBe('1.0.0');
    expect(data.locale).toBe('ar');

    const expectedCodes = Object.values(AppErrorCode);
    expect(Object.keys(data.messages).length).toBe(expectedCodes.length);

    for (const code of expectedCodes) {
      expect(data.messages[code]).toBe(ERROR_MESSAGES[code]);
    }
  });

  it('error fixtures exist for all AppErrorCode and statusCode/errorCode match', () => {
    const expectedCodes = Object.values(AppErrorCode);

    for (const code of expectedCodes) {
      const fixtureFile = path.join(errorFixturesDir, `${code}.json`);
      expect(fs.existsSync(fixtureFile)).toBe(true);

      const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
      expect(fixture.success).toBe(false);
      expect(fixture.errorCode).toBe(code);
      expect(fixture.statusCode).toBe(ERROR_HTTP_STATUS[code]);
      expect(fixture.message).toBe(ERROR_MESSAGES[code]);
      expect(fixture.timestamp).toBe('2026-11-13T10:30:00.000Z');

      if (code === 'ERR_VALIDATION_FAILED') {
        expect(fixture.details).toEqual(['imageBase64 is required and cannot be empty']);
      } else {
        expect(fixture.details).toBeUndefined();
      }
    }
  });

  it('all 10 success fixtures exist with valid envelope and data', () => {
    const expectedFiles = [
      'color_detection.json',
      'currency_recognition.json',
      'face_expression.json',
      'obstacle_detection.json',
      'ocr.json',
      'scene_description.json',
      'traffic_sign_recognition.json',
      'voice_command.json',
      'navigation_destinations.json',
      'navigation_route.json',
    ];

    const actualFiles = fs.readdirSync(successFixturesDir);
    expect(actualFiles.sort()).toEqual(expectedFiles.sort());

    for (const file of expectedFiles) {
      const filePath = path.join(successFixturesDir, file);
      expect(fs.existsSync(filePath)).toBe(true);

      const fixture = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(fixture.success).toBe(true);
      expect(fixture.statusCode).toBe(200);
      expect(fixture.data).toBeDefined();
      expect(fixture.data).not.toBeNull();
      expect(fixture.timestamp).toBe('2026-11-13T10:30:00.000Z');
    }
  });
});
