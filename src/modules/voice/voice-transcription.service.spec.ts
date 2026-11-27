import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceTranscriptionService } from './voice-transcription.service';
import { ISpeechServiceClient } from './interfaces/speech-service-client.interface';
import { UserPreferenceRepository } from '../../database/repositories/user-preference.repository';
import { AppException } from '../../common/exceptions/app.exception';
import { AppErrorCode } from '../../common/constants/error-codes';
import { UploadedAudioFile, VOICE_AUDIO_MAX_BYTES } from './voice.constants';

describe('VoiceTranscriptionService', () => {
  let service: VoiceTranscriptionService;
  let mockSpeechClient: {
    transcribe: ReturnType<typeof vi.fn>;
  };
  let mockPreferenceRepo: {
    findByUserId: ReturnType<typeof vi.fn>;
  };

  function buildSyntheticOggOpusBuffer(options: {
    channels?: number;
    sampleRateHz?: number;
    durationSeconds?: number;
  } = {}): Buffer {
    const channels = options.channels ?? 1;
    const sampleRateHz = options.sampleRateHz ?? 16000;
    const durationSeconds = options.durationSeconds ?? 3;

    const page0 = Buffer.alloc(47);
    page0.write('OggS', 0, 'ascii');
    page0.writeUInt8(0, 4);
    page0.writeUInt8(0x02, 5);
    page0.writeBigUInt64LE(0n, 6);
    page0.writeUInt32LE(12345, 14);
    page0.writeUInt32LE(0, 18);
    page0.writeUInt32LE(0, 22);
    page0.writeUInt8(1, 26);
    page0.writeUInt8(19, 27);

    page0.write('OpusHead', 28, 'ascii');
    page0.writeUInt8(1, 36);
    page0.writeUInt8(channels, 37);
    page0.writeUInt16LE(312, 38);
    page0.writeUInt32LE(sampleRateHz, 40);
    page0.writeInt16LE(0, 44);
    page0.writeUInt8(0, 46);

    const finalGranule = BigInt(Math.floor(durationSeconds * 48000));
    const page1 = Buffer.alloc(38);
    page1.write('OggS', 0, 'ascii');
    page1.writeUInt8(0, 4);
    page1.writeUInt8(0x04, 5);
    page1.writeBigUInt64LE(finalGranule, 6);
    page1.writeUInt32LE(12345, 14);
    page1.writeUInt32LE(1, 18);
    page1.writeUInt32LE(0, 22);
    page1.writeUInt8(1, 26);
    page1.writeUInt8(10, 27);
    page1.fill(0xaa, 28, 38);

    return Buffer.concat([page0, page1]);
  }

  const validAudioBuffer = buildSyntheticOggOpusBuffer({
    channels: 1,
    sampleRateHz: 16000,
    durationSeconds: 3.2,
  });

  const validAudioFile: UploadedAudioFile = {
    fieldname: 'audio',
    originalname: 'command.ogg',
    encoding: '7bit',
    mimetype: 'audio/ogg',
    size: validAudioBuffer.length,
    buffer: validAudioBuffer,
  };

  beforeEach(() => {
    mockSpeechClient = {
      transcribe: vi.fn(),
    };
    mockPreferenceRepo = {
      findByUserId: vi.fn().mockResolvedValue({ cloudAiConsent: true }),
    };

    service = new VoiceTranscriptionService(
      mockSpeechClient as unknown as ISpeechServiceClient,
      mockPreferenceRepo as unknown as UserPreferenceRepository,
    );
  });

  describe('Success Path', () => {
    it('should successfully transcribe audio when consent is granted and file is valid Opus', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: true,
      });

      mockSpeechClient.transcribe.mockResolvedValue({
        transcript: 'عايز أروح مكتب العميد',
        detectedLanguage: 'ar-EG',
        confidence: 0.96,
      });

      const result = await service.transcribeAudio(
        validAudioFile,
        { language: 'ar-EG' },
        'user-uuid-1',
        'corr-id-123',
      );

      expect(result).toEqual({
        transcript: 'عايز أروح مكتب العميد',
        language: 'ar-EG',
        confidence: 0.96,
      });
      expect(mockPreferenceRepo.findByUserId).toHaveBeenCalledWith('user-uuid-1');
      expect(mockSpeechClient.transcribe).toHaveBeenCalledTimes(1);
      expect(mockSpeechClient.transcribe).toHaveBeenCalledWith({
        audioBuffer: validAudioFile.buffer,
        mimeType: 'audio/ogg',
        language: 'ar-EG',
        durationSeconds: expect.any(Number),
        correlationId: 'corr-id-123',
      });
    });

    it('should preserve null confidence without fabricating a score', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: true,
      });

      mockSpeechClient.transcribe.mockResolvedValue({
        transcript: 'أمر صوتي تجريبي',
        detectedLanguage: 'ar-EG',
        confidence: null,
      });

      const result = await service.transcribeAudio(
        validAudioFile,
        { language: 'ar-EG' },
        'user-uuid-1',
      );

      expect(result.confidence).toBeNull();
      expect(result.transcript).toBe('أمر صوتي تجريبي');
    });
  });

  describe('File Validation & Constraints', () => {
    it('should throw ERR_VALIDATION_FAILED when file is undefined', async () => {
      await expect(
        service.transcribeAudio(undefined, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
      expect(mockSpeechClient.transcribe).not.toHaveBeenCalled();
    });

    it('should throw ERR_VALIDATION_FAILED when file buffer is empty (size 0)', async () => {
      const emptyFile: UploadedAudioFile = {
        originalname: 'empty.ogg',
        mimetype: 'audio/ogg',
        size: 0,
        buffer: Buffer.alloc(0),
      };

      await expect(
        service.transcribeAudio(emptyFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
      expect(mockSpeechClient.transcribe).not.toHaveBeenCalled();
    });

    it('should throw ERR_AUDIO_TOO_LARGE when file exceeds VOICE_AUDIO_MAX_BYTES (5 MB)', async () => {
      const oversizedFile: UploadedAudioFile = {
        originalname: 'large.ogg',
        mimetype: 'audio/ogg',
        size: VOICE_AUDIO_MAX_BYTES + 10,
        buffer: Buffer.alloc(VOICE_AUDIO_MAX_BYTES + 10),
      };

      await expect(
        service.transcribeAudio(oversizedFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.AUDIO_TOO_LARGE,
      });
      expect(mockSpeechClient.transcribe).not.toHaveBeenCalled();
    });

    it('should throw ERR_UNSUPPORTED_AUDIO_FORMAT for non-Opus containers', async () => {
      const invalidContainerFile: UploadedAudioFile = {
        originalname: 'image.png',
        mimetype: 'image/png',
        size: 500,
        buffer: Buffer.from('fake data not opus'),
      };

      await expect(
        service.transcribeAudio(invalidContainerFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
      });
      expect(mockSpeechClient.transcribe).not.toHaveBeenCalled();
    });

    it('should throw ERR_UNSUPPORTED_AUDIO_FORMAT for stereo Opus audio', async () => {
      const stereoBuffer = buildSyntheticOggOpusBuffer({ channels: 2 });
      const stereoFile: UploadedAudioFile = {
        originalname: 'stereo.ogg',
        mimetype: 'audio/ogg',
        size: stereoBuffer.length,
        buffer: stereoBuffer,
      };

      await expect(
        service.transcribeAudio(stereoFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
      });
      expect(mockSpeechClient.transcribe).not.toHaveBeenCalled();
    });

    it('should throw ERR_UNSUPPORTED_AUDIO_FORMAT for Opus audio exceeding 10 seconds duration', async () => {
      const longBuffer = buildSyntheticOggOpusBuffer({ durationSeconds: 15 });
      const longFile: UploadedAudioFile = {
        originalname: 'long.ogg',
        mimetype: 'audio/ogg',
        size: longBuffer.length,
        buffer: longBuffer,
      };

      await expect(
        service.transcribeAudio(longFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
      });
      expect(mockSpeechClient.transcribe).not.toHaveBeenCalled();
    });
  });

  describe('User Cloud AI Consent Check', () => {
    it('should throw ERR_CONSENT_REQUIRED when user preference record is not found and NEVER call speech service', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue(null);

      await expect(
        service.transcribeAudio(validAudioFile, { language: 'ar-EG' }, 'user-uuid-no-pref'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.CONSENT_REQUIRED,
      });

      expect(mockPreferenceRepo.findByUserId).toHaveBeenCalledWith('user-uuid-no-pref');
      expect(mockSpeechClient.transcribe).not.toHaveBeenCalled();
    });

    it('should throw ERR_CONSENT_REQUIRED when cloudAiConsent is false and NEVER call speech service', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: false,
      });

      await expect(
        service.transcribeAudio(validAudioFile, { language: 'ar-EG' }, 'user-uuid-refused'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.CONSENT_REQUIRED,
      });

      expect(mockPreferenceRepo.findByUserId).toHaveBeenCalledWith('user-uuid-refused');
      expect(mockSpeechClient.transcribe).not.toHaveBeenCalled();
    });
  });

  describe('Speech Service Output Validation', () => {
    it('should throw ERR_NO_SPEECH_DETECTED when speech service returns an empty transcript', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: true,
      });

      mockSpeechClient.transcribe.mockResolvedValue({
        transcript: '',
        detectedLanguage: 'ar-EG',
        confidence: null,
      });

      await expect(
        service.transcribeAudio(validAudioFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.NO_SPEECH_DETECTED,
      });
    });

    it('should throw ERR_NO_SPEECH_DETECTED when speech service returns whitespace-only transcript', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: true,
      });

      mockSpeechClient.transcribe.mockResolvedValue({
        transcript: '   \n  \t ',
        detectedLanguage: 'ar-EG',
        confidence: null,
      });

      await expect(
        service.transcribeAudio(validAudioFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.NO_SPEECH_DETECTED,
      });
    });

    it('should propagate speech client errors (e.g. REQUEST_TIMEOUT, SERVICE_UNAVAILABLE) unchanged', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: true,
      });

      mockSpeechClient.transcribe.mockRejectedValue(
        new AppException(AppErrorCode.REQUEST_TIMEOUT),
      );

      await expect(
        service.transcribeAudio(validAudioFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.REQUEST_TIMEOUT,
      });
    });
  });

  describe('AudioProcessorService (FFmpeg / FFprobe) Integration', () => {
    let mockAudioProcessor: {
      processAndNormalizeAudio: ReturnType<typeof vi.fn>;
    };
    let serviceWithProcessor: VoiceTranscriptionService;

    beforeEach(() => {
      mockAudioProcessor = {
        processAndNormalizeAudio: vi.fn(),
      };
      serviceWithProcessor = new VoiceTranscriptionService(
        mockSpeechClient as unknown as ISpeechServiceClient,
        mockPreferenceRepo as unknown as UserPreferenceRepository,
        mockAudioProcessor as unknown as any,
      );
    });

    it('should invoke AudioProcessorService and pass normalized buffer to speech client', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: true,
      });

      const normalizedOggBuffer = Buffer.from('normalized-opus-buffer');
      mockAudioProcessor.processAndNormalizeAudio.mockResolvedValue({
        buffer: normalizedOggBuffer,
        mimeType: 'audio/ogg',
        format: 'ogg/opus',
        durationSeconds: 2.5,
        sampleRateHz: 16000,
        channels: 1,
        codec: 'opus',
      });

      mockSpeechClient.transcribe.mockResolvedValue({
        transcript: 'أمر صوتي تم تحويله',
        detectedLanguage: 'ar-EG',
        confidence: 0.98,
      });

      const wavFile: UploadedAudioFile = {
        originalname: 'recording.wav',
        mimetype: 'audio/wav',
        size: 5000,
        buffer: Buffer.from('raw-wav-data'),
      };

      const result = await serviceWithProcessor.transcribeAudio(
        wavFile,
        { language: 'ar-EG' },
        'user-uuid-1',
        'corr-id-456',
      );

      expect(mockAudioProcessor.processAndNormalizeAudio).toHaveBeenCalledWith(
        wavFile.buffer,
        'recording.wav',
        'audio/wav',
      );

      expect(mockSpeechClient.transcribe).toHaveBeenCalledWith({
        audioBuffer: normalizedOggBuffer,
        mimeType: 'audio/ogg',
        language: 'ar-EG',
        durationSeconds: 2.5,
        correlationId: 'corr-id-456',
      });

      expect(result.transcript).toBe('أمر صوتي تم تحويله');
    });

    it('should NEVER invoke AudioProcessorService if user consent is not granted', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: false,
      });

      const wavFile: UploadedAudioFile = {
        originalname: 'recording.wav',
        mimetype: 'audio/wav',
        size: 5000,
        buffer: Buffer.from('raw-wav-data'),
      };

      await expect(
        serviceWithProcessor.transcribeAudio(wavFile, { language: 'ar-EG' }, 'user-uuid-no-consent'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.CONSENT_REQUIRED,
      });

      // Verify FFmpeg / AudioProcessor is never invoked
      expect(mockAudioProcessor.processAndNormalizeAudio).not.toHaveBeenCalled();
      expect(mockSpeechClient.transcribe).not.toHaveBeenCalled();
    });

    it('should propagate AudioProcessorService exceptions (e.g. UNSUPPORTED_AUDIO_FORMAT) cleanly', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: true,
      });

      mockAudioProcessor.processAndNormalizeAudio.mockRejectedValue(
        new AppException(AppErrorCode.UNSUPPORTED_AUDIO_FORMAT, 'Corrupted media file'),
      );

      const invalidFile: UploadedAudioFile = {
        originalname: 'corrupt.mp3',
        mimetype: 'audio/mpeg',
        size: 1000,
        buffer: Buffer.from('corrupt-mp3'),
      };

      await expect(
        serviceWithProcessor.transcribeAudio(invalidFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
      });

      expect(mockSpeechClient.transcribe).not.toHaveBeenCalled();
    });
  });
});
