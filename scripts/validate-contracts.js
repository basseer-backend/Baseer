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

const CONTRACT_VERSION = '1.0.0';
const rootDir = path.resolve(__dirname, '..');
const contractsDir = path.join(rootDir, 'contracts');
const fixturesDir = path.join(contractsDir, 'fixtures');
const errorFixturesDir = path.join(fixturesDir, 'error');
const successFixturesDir = path.join(fixturesDir, 'success');

let errors = [];

function assertEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    errors.push(`${message}\n  Expected: ${expectedStr}\n  Actual:   ${actualStr}`);
  }
}

async function validate() {
  console.log('Validating backend implementation against official Contracts v1.0.0...');

  // 1. Validate contract-version.txt
  const versionFile = path.join(contractsDir, 'contract-version.txt');
  if (!fs.existsSync(versionFile)) {
    errors.push('contracts/contract-version.txt is missing.');
  } else {
    const version = fs.readFileSync(versionFile, 'utf8').trim();
    assertEqual(version, CONTRACT_VERSION, 'Contract version mismatch');
  }

  // 2. Validate enums.json against backend enums
  const enumsFile = path.join(contractsDir, 'enums.json');
  if (!fs.existsSync(enumsFile)) {
    errors.push('contracts/enums.json is missing.');
  } else {
    const enumsData = JSON.parse(fs.readFileSync(enumsFile, 'utf8'));
    assertEqual(Object.values(VoiceIntent), enumsData.VoiceIntent, 'VoiceIntent enum mismatch');
    assertEqual(Object.values(MobileAction), enumsData.MobileAction, 'MobileAction enum mismatch');
    assertEqual(Object.values(FacialExpression), enumsData.FacialExpression, 'FacialExpression enum mismatch');
    assertEqual(Object.values(HapticPattern), enumsData.HapticPattern, 'HapticPattern enum mismatch');
  }

  // 3. Validate error-codes.json against backend error codes and metadata
  const errorCodesFile = path.join(contractsDir, 'error-codes.json');
  if (!fs.existsSync(errorCodesFile)) {
    errors.push('contracts/error-codes.json is missing.');
  } else {
    const errorCodesData = JSON.parse(fs.readFileSync(errorCodesFile, 'utf8'));
    assertEqual(errorCodesData.contractVersion, CONTRACT_VERSION, 'error-codes.json contractVersion mismatch');

    const expectedCodes = Object.values(AppErrorCode);
    assertEqual(errorCodesData.codes.length, expectedCodes.length, 'Number of error codes mismatch');

    for (const entry of errorCodesData.codes) {
      if (!expectedCodes.includes(entry.code)) {
        errors.push(`Rogue error code in contracts: ${entry.code}`);
        continue;
      }
      assertEqual(ERROR_HTTP_STATUS[entry.code], entry.http, `HTTP status mismatch for ${entry.code}`);
      const meta = ERROR_META[entry.code];
      if (!meta) {
        errors.push(`Missing ERROR_META entry for ${entry.code}`);
      } else {
        assertEqual(meta.owner, entry.owner, `Owner mismatch for ${entry.code}`);
        assertEqual(meta.retry, entry.retry, `Retry mismatch for ${entry.code}`);
        assertEqual(meta.messageKey, entry.messageKey, `MessageKey mismatch for ${entry.code}`);
        assertEqual(meta.fallbackMessage, entry.fallbackMessage, `FallbackMessage mismatch for ${entry.code}`);
      }
    }
  }

  // 4. Validate messages.ar.json against backend ERROR_MESSAGES
  const messagesFile = path.join(contractsDir, 'messages.ar.json');
  if (!fs.existsSync(messagesFile)) {
    errors.push('contracts/messages.ar.json is missing.');
  } else {
    const messagesData = JSON.parse(fs.readFileSync(messagesFile, 'utf8'));
    assertEqual(messagesData.contractVersion, CONTRACT_VERSION, 'messages.ar.json contractVersion mismatch');
    assertEqual(messagesData.locale, 'ar', 'messages.ar.json locale mismatch');

    for (const code of Object.values(AppErrorCode)) {
      assertEqual(ERROR_MESSAGES[code], messagesData.messages[code], `Arabic message mismatch for ${code}`);
    }
  }

  // 5. Validate error fixtures in fixtures/error/
  for (const code of Object.values(AppErrorCode)) {
    const fixturePath = path.join(errorFixturesDir, `${code}.json`);
    if (!fs.existsSync(fixturePath)) {
      errors.push(`Missing error fixture: fixtures/error/${code}.json`);
      continue;
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assertEqual(fixture.success, false, `Fixture success flag mismatch for ${code}`);
    assertEqual(fixture.statusCode, ERROR_HTTP_STATUS[code], `Fixture statusCode mismatch for ${code}`);
    assertEqual(fixture.errorCode, code, `Fixture errorCode mismatch for ${code}`);
    assertEqual(fixture.message, ERROR_MESSAGES[code], `Fixture message mismatch for ${code}`);
  }

  // 6. Validate controller outputs against success fixtures in fixtures/success/
  const vision = new VisionController();
  const ocr = new OcrController();
  const voiceService = new VoiceAssistantService(
    new MockAiVoiceAgentClient(),
    new VoiceActionMapperService(),
  );
  const voice = new VoiceController(voiceService);
  const nav = new NavigationController();

  const controllerPayloads = {
    'color_detection.json': vision.detectColor({ imageBase64: 'valid-image' }),
    'currency_recognition.json': vision.recognizeCurrency({ imageBase64: 'valid-image' }),
    'face_expression.json': vision.detectFaceExpression({ imageBase64: 'valid-image' }),
    'obstacle_detection.json': vision.detectObstacles({ imageBase64: 'valid-image' }),
    'ocr.json': ocr.readDocument({ imageBase64: 'valid-image' }),
    'scene_description.json': vision.describeScene({ imageBase64: 'valid-image' }),
    'traffic_sign_recognition.json': vision.recognizeTrafficSign({ imageBase64: 'valid-image' }),
    'voice_command.json': await voice.processCommand({ userSpeech: 'عايز أروح مكتب العميد' }),
    'navigation_destinations.json': nav.getDestinations(),
    'navigation_route.json': nav.calculateRoute({
      currentQrCode: 'QR_ENTRANCE_01',
      destinationId: 'dept-affairs',
    }),
  };

  for (const [filename, actualData] of Object.entries(controllerPayloads)) {
    const fixturePath = path.join(successFixturesDir, filename);
    if (!fs.existsSync(fixturePath)) {
      errors.push(`Missing success fixture: fixtures/success/${filename}`);
      continue;
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assertEqual(fixture.success, true, `Success fixture flag mismatch for ${filename}`);
    assertEqual(fixture.statusCode, 200, `Success fixture statusCode mismatch for ${filename}`);
    assertEqual(actualData, fixture.data, `Controller payload mismatch for fixtures/success/${filename}`);
  }

  if (errors.length > 0) {
    console.error(`\nValidation failed with ${errors.length} error(s):`);
    errors.forEach((err, idx) => console.error(`\n[${idx + 1}] ${err}`));
    process.exit(1);
  } else {
    console.log('\nSUCCESS: Backend implementation is 100% compliant with official Contracts v1.0.0.');
    console.log('No contract files were modified or overwritten.');
  }
}

validate().catch((err) => {
  console.error('Validation script encountered unexpected error:', err);
  process.exit(1);
});
