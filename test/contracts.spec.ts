import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  AppErrorCode,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
  ERROR_META,
} from '../src/common/constants/error-codes';
import {
  VoiceIntent,
  MobileAction,
  FacialExpression,
  HapticPattern,
} from '../src/common/enums';
import { VisionController } from '../src/modules/vision/vision.controller';
import { OcrController } from '../src/modules/ocr/ocr.controller';
import { VoiceController } from '../src/modules/voice/voice.controller';
import { VoiceAssistantService } from '../src/modules/voice/voice-assistant.service';
import { MockAiVoiceAgentClient } from '../src/modules/voice/clients/mock-ai-agent.client';
import { VoiceActionMapperService } from '../src/modules/voice/voice-action-mapper.service';
import { NavigationController } from '../src/modules/navigation/navigation.controller';

describe('Contracts Verification against Official Contracts v1.0.0', () => {
  const rootDir = path.resolve(__dirname, '..');
  const contractsDir = path.join(rootDir, 'contracts');
  const fixturesDir = path.join(contractsDir, 'fixtures');
  const errorFixturesDir = path.join(fixturesDir, 'error');
  const successFixturesDir = path.join(fixturesDir, 'success');

  it('contract-version.txt must match official version 1.0.0', () => {
    const versionFile = path.join(contractsDir, 'contract-version.txt');
    expect(fs.existsSync(versionFile)).toBe(true);
    const version = fs.readFileSync(versionFile, 'utf8').trim();
    expect(version).toBe('1.0.0');
  });

  it('enums.json is authoritative: backend enums in src/common/enums must match contracts/enums.json', () => {
    const enumsFile = path.join(contractsDir, 'enums.json');
    expect(fs.existsSync(enumsFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(enumsFile, 'utf8'));

    // Backend enums must match the official contract enums
    expect(Object.values(VoiceIntent)).toEqual(data.VoiceIntent);
    expect(Object.values(MobileAction)).toEqual(data.MobileAction);
    expect(Object.values(FacialExpression)).toEqual(data.FacialExpression);
    expect(Object.values(HapticPattern)).toEqual(data.HapticPattern);
  });

  it('error-codes.json is authoritative: backend AppErrorCode and metadata must match contracts/error-codes.json', () => {
    const errorCodesFile = path.join(contractsDir, 'error-codes.json');
    expect(fs.existsSync(errorCodesFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(errorCodesFile, 'utf8'));

    expect(data.contractVersion).toBe('1.0.0');
    expect(data.codes.length).toBe(20);

    const backendCodes = Object.values(AppErrorCode);
    expect(backendCodes.length).toBe(data.codes.length);

    for (const contractEntry of data.codes) {
      // Backend must define every code present in the contract
      expect(backendCodes).toContain(contractEntry.code);

      // Backend HTTP status must match the contract
      const backendStatus = ERROR_HTTP_STATUS[contractEntry.code as AppErrorCode];
      expect(backendStatus).toBe(contractEntry.http);

      // Backend metadata must match contract definitions
      const meta = ERROR_META[contractEntry.code as AppErrorCode];
      expect(meta).toBeDefined();
      expect(meta.owner).toEqual(contractEntry.owner);
      expect(meta.retry).toBe(contractEntry.retry);
      expect(meta.messageKey).toBe(contractEntry.messageKey);
      expect(meta.fallbackMessage).toBe(contractEntry.fallbackMessage);
    }
  });

  it('messages.ar.json is authoritative: backend ERROR_MESSAGES must match contracts/messages.ar.json', () => {
    const messagesFile = path.join(contractsDir, 'messages.ar.json');
    expect(fs.existsSync(messagesFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(messagesFile, 'utf8'));

    expect(data.contractVersion).toBe('1.0.0');
    expect(data.locale).toBe('ar');

    const expectedCodes = Object.values(AppErrorCode);
    expect(Object.keys(data.messages).length).toBe(expectedCodes.length);

    for (const code of expectedCodes) {
      expect(ERROR_MESSAGES[code]).toBe(data.messages[code]);
    }
  });

  it('error fixtures: all 20 error responses follow the standard error envelope', () => {
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

  it('success fixtures & controllers: all 10 controllers produce responses matching official success fixtures', async () => {
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

    const vision = new VisionController();
    const ocr = new OcrController();
    const voiceService = new VoiceAssistantService(
      new MockAiVoiceAgentClient(),
      new VoiceActionMapperService(),
    );
    const voice = new VoiceController(voiceService);
    const nav = new NavigationController();

    const controllerOutputs: Record<string, unknown> = {
      'color_detection.json': vision.detectColor({ imageBase64: 'valid-image' }),
      'currency_recognition.json': vision.recognizeCurrency({
        imageBase64: 'valid-image',
      }),
      'face_expression.json': vision.detectFaceExpression({
        imageBase64: 'valid-image',
      }),
      'obstacle_detection.json': vision.detectObstacles({
        imageBase64: 'valid-image',
      }),
      'ocr.json': ocr.readDocument({ imageBase64: 'valid-image' }),
      'scene_description.json': vision.describeScene({
        imageBase64: 'valid-image',
      }),
      'traffic_sign_recognition.json': vision.recognizeTrafficSign({
        imageBase64: 'valid-image',
      }),
      'voice_command.json': await voice.processCommand({
        userSpeech: 'عايز أروح مكتب العميد',
      }),
      'navigation_destinations.json': nav.getDestinations(),
      'navigation_route.json': nav.calculateRoute({
        currentQrCode: 'QR_ENTRANCE_01',
        destinationId: 'dept-affairs',
      }),
    };

    for (const file of expectedFiles) {
      const filePath = path.join(successFixturesDir, file);
      expect(fs.existsSync(filePath)).toBe(true);

      const fixture = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(fixture.success).toBe(true);
      expect(fixture.statusCode).toBe(200);
      expect(fixture.data).toBeDefined();
      expect(fixture.timestamp).toBe('2026-11-13T10:30:00.000Z');

      // Crucial: The actual controller response must match the official fixture data!
      const actualOutput = controllerOutputs[file];
      expect(actualOutput).toEqual(fixture.data);
    }
  });
});
