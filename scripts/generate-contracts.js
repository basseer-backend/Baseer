/**
 * CONTRACT GENERATION TOOL
 * Generates authoritative API contract files and fixtures from TypeScript definitions.
 * Published contract tags (e.g. contracts-v1.0.0) are immutable references;
 * this generator produces contract artifacts for the active/development version.
 */

require('reflect-metadata');
const fs = require('fs');
const path = require('path');

const {
  AppErrorCode,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
  ERROR_META,
} = require('../dist/common/constants/error-codes');
const {
  VoiceIntent,
  MobileAction,
  FacialExpression,
  HapticPattern,
} = require('../dist/common/enums');
const { VisionController } = require('../dist/modules/vision/vision.controller');
const { OcrController } = require('../dist/modules/ocr/ocr.controller');
const { VoiceController } = require('../dist/modules/voice/voice.controller');
const { VoiceAssistantService } = require('../dist/modules/voice/voice-assistant.service');
const { MockAiVoiceAgentClient } = require('../dist/modules/voice/clients/mock-ai-agent.client');
const { VoiceActionMapperService } = require('../dist/modules/voice/voice-action-mapper.service');
const {
  NavigationController,
} = require('../dist/modules/navigation/navigation.controller');

const FIXED_TIMESTAMP = '2026-11-13T10:30:00.000Z';

const rootDir = path.resolve(__dirname, '..');
const contractsDir = path.join(rootDir, 'contracts');
const fixturesDir = path.join(contractsDir, 'fixtures');
const errorFixturesDir = path.join(fixturesDir, 'error');
const successFixturesDir = path.join(fixturesDir, 'success');

// Read contract version dynamically from contracts/contract-version.txt
const versionFile = path.join(contractsDir, 'contract-version.txt');
const CONTRACT_VERSION = fs.existsSync(versionFile)
  ? fs.readFileSync(versionFile, 'utf8').trim()
  : '1.0.0';

// Ensure directories exist
fs.mkdirSync(errorFixturesDir, { recursive: true });
fs.mkdirSync(successFixturesDir, { recursive: true });

function writeJson(filePath, data) {
  let eol = '\n';
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing.includes('\r\n')) {
      eol = '\r\n';
    }
  } else if (process.platform === 'win32') {
    eol = '\r\n';
  }
  const content = JSON.stringify(data, null, 2).replace(/\n/g, eol) + eol;
  fs.writeFileSync(filePath, content, 'utf8');
}

async function generate() {
  // 1. contract-version.txt
  const versionEol =
    (fs.existsSync(versionFile) &&
      fs.readFileSync(versionFile, 'utf8').includes('\r\n')) ||
    process.platform === 'win32'
      ? '\r\n'
      : '\n';
  fs.writeFileSync(versionFile, `${CONTRACT_VERSION}${versionEol}`, 'utf8');

  // 2. enums.json
  const enumsData = {
    VoiceIntent: Object.values(VoiceIntent),
    MobileAction: Object.values(MobileAction),
    FacialExpression: Object.values(FacialExpression),
    HapticPattern: Object.values(HapticPattern),
  };
  writeJson(path.join(contractsDir, 'enums.json'), enumsData);

  // 3. error-codes.json
  const errorCodesData = {
    contractVersion: CONTRACT_VERSION,
    codes: Object.keys(ERROR_META).map((key) => {
      const meta = ERROR_META[key];
      return {
        code: key,
        http: ERROR_HTTP_STATUS[key],
        owner: meta.owner,
        retry: meta.retry,
        messageKey: meta.messageKey,
        fallbackMessage: meta.fallbackMessage,
      };
    }),
  };
  writeJson(path.join(contractsDir, 'error-codes.json'), errorCodesData);

  // 4. messages.ar.json
  const messagesData = {
    contractVersion: CONTRACT_VERSION,
    locale: 'ar',
    messages: {},
  };
  for (const key of Object.keys(ERROR_META)) {
    messagesData.messages[key] = ERROR_MESSAGES[key];
  }
  writeJson(path.join(contractsDir, 'messages.ar.json'), messagesData);

  // 5. fixtures/error/<ERR_CODE>.json
  for (const key of Object.keys(ERROR_META)) {
    const errorFixture = {
      success: false,
      statusCode: ERROR_HTTP_STATUS[key],
      errorCode: key,
      message: ERROR_MESSAGES[key],
      ...(key === 'ERR_VALIDATION_FAILED'
        ? { details: ['imageBase64 is required and cannot be empty'] }
        : {}),
      timestamp: FIXED_TIMESTAMP,
    };
    writeJson(path.join(errorFixturesDir, `${key}.json`), errorFixture);
  }

  // 6. fixtures/success/*.json
  const vision = new VisionController();
  const ocr = new OcrController();
  const voiceService = new VoiceAssistantService(
    new MockAiVoiceAgentClient(),
    new VoiceActionMapperService(),
  );
  const voice = new VoiceController(voiceService);
  const nav = new NavigationController();

  const successPayloads = {
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

  // If VoiceTranscribeController exists, include voice_transcribe.json
  try {
    const { VoiceTranscribeController } = require('../dist/modules/voice/voice-transcribe.controller');
    const { VoiceTranscriptionService } = require('../dist/modules/voice/voice-transcription.service');
    if (VoiceTranscribeController && VoiceTranscriptionService) {
      const mockAiClient = new MockAiVoiceAgentClient();
      const mockPreferenceRepo = {
        findByUserId: async () => ({ cloudAiConsent: true }),
      };
      const transcribeService = new VoiceTranscriptionService(
        mockAiClient,
        mockPreferenceRepo,
      );
      const transcribeController = new VoiceTranscribeController(transcribeService);
      successPayloads['voice_transcribe.json'] = await transcribeController.transcribe(
        {
          buffer: Buffer.from('mock audio'),
          mimetype: 'audio/wav',
          originalname: 'voice_command.wav',
          size: 10,
        },
        { language: 'ar-EG' },
        undefined,
        'mock-user-id',
      );
    }
  } catch {
    // VoiceTranscribeController not implemented yet in step 1
  }

  for (const [filename, data] of Object.entries(successPayloads)) {
    const successFixture = {
      success: true,
      statusCode: 200,
      data,
      timestamp: FIXED_TIMESTAMP,
    };
    writeJson(path.join(successFixturesDir, filename), successFixture);
  }

  console.log('Contracts generation completed successfully.');
}

generate().catch((err) => {
  console.error('Contracts generation failed:', err);
  process.exit(1);
});
