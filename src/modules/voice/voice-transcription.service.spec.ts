import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceTranscriptionService } from './voice-transcription.service';
import { IAiVoiceAgentClient } from './clients/ai-agent.interface';
import { UserPreferenceRepository } from '../../database/repositories/user-preference.repository';
import { AppException } from '../../common/exceptions/app.exception';
import { AppErrorCode } from '../../common/constants/error-codes';
import { UploadedAudioFile, VOICE_AUDIO_MAX_BYTES } from './voice.constants';

describe('VoiceTranscriptionService', () => {
  let service: VoiceTranscriptionService;
  let mockAiClient: {
    transcribeAudio: ReturnType<typeof vi.fn>;
    classifyIntent: ReturnType<typeof vi.fn>;
  };
  let mockPreferenceRepo: {
    findByUserId: ReturnType<typeof vi.fn>;
  };

  const validAudioFile: UploadedAudioFile = {
    fieldname: 'audio',
    originalname: 'command.wav',
    encoding: '7bit',
    mimetype: 'audio/wav',
    size: 1024,
    buffer: Buffer.from('mock audio content data'),
  };

  beforeEach(() => {
    mockAiClient = {
      transcribeAudio: vi.fn(),
      classifyIntent: vi.fn(),
    };
    mockPreferenceRepo = {
      findByUserId: vi.fn(),
    };

    service = new VoiceTranscriptionService(
      mockAiClient as unknown as IAiVoiceAgentClient,
      mockPreferenceRepo as unknown as UserPreferenceRepository,
    );
  });

  describe('Success Path', () => {
    it('should successfully transcribe audio when consent is granted and file is valid', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: true,
      });

      mockAiClient.transcribeAudio.mockResolvedValue({
        transcript: 'عايز أروح مكتب العميد',
        language: 'ar-EG',
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
      expect(mockAiClient.transcribeAudio).toHaveBeenCalledTimes(1);
      expect(mockAiClient.transcribeAudio).toHaveBeenCalledWith(
        {
          buffer: validAudioFile.buffer,
          mimeType: 'audio/wav',
          fileName: 'command.wav',
        },
        'ar-EG',
        'corr-id-123',
      );
    });

    it('should preserve null confidence without fabricating a score', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: true,
      });

      mockAiClient.transcribeAudio.mockResolvedValue({
        transcript: 'أمر صوتي تجريبي',
        language: 'ar-EG',
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

  describe('File Validation', () => {
    it('should throw ERR_VALIDATION_FAILED when file is undefined', async () => {
      await expect(
        service.transcribeAudio(undefined, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
      expect(mockAiClient.transcribeAudio).not.toHaveBeenCalled();
    });

    it('should throw ERR_VALIDATION_FAILED when file buffer is empty (size 0)', async () => {
      const emptyFile: UploadedAudioFile = {
        originalname: 'empty.wav',
        mimetype: 'audio/wav',
        size: 0,
        buffer: Buffer.alloc(0),
      };

      await expect(
        service.transcribeAudio(emptyFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.VALIDATION_FAILED,
      });
      expect(mockAiClient.transcribeAudio).not.toHaveBeenCalled();
    });

    it('should throw ERR_AUDIO_TOO_LARGE when file exceeds VOICE_AUDIO_MAX_BYTES', async () => {
      const oversizedFile: UploadedAudioFile = {
        originalname: 'large.wav',
        mimetype: 'audio/wav',
        size: VOICE_AUDIO_MAX_BYTES + 10,
        buffer: Buffer.alloc(VOICE_AUDIO_MAX_BYTES + 10),
      };

      await expect(
        service.transcribeAudio(oversizedFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.AUDIO_TOO_LARGE,
      });
      expect(mockAiClient.transcribeAudio).not.toHaveBeenCalled();
    });

    it('should throw ERR_UNSUPPORTED_AUDIO_FORMAT for non-audio or unsupported MIME types', async () => {
      const invalidMimeFile: UploadedAudioFile = {
        originalname: 'image.png',
        mimetype: 'image/png',
        size: 500,
        buffer: Buffer.from('fake data'),
      };

      await expect(
        service.transcribeAudio(invalidMimeFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
      });
      expect(mockAiClient.transcribeAudio).not.toHaveBeenCalled();
    });
  });

  describe('User Cloud AI Consent Check (Point 4)', () => {
    it('should throw ERR_CONSENT_REQUIRED when user preference record is not found and NEVER call AI service', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue(null);

      await expect(
        service.transcribeAudio(validAudioFile, { language: 'ar-EG' }, 'user-uuid-no-pref'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.CONSENT_REQUIRED,
      });

      expect(mockPreferenceRepo.findByUserId).toHaveBeenCalledWith('user-uuid-no-pref');
      expect(mockAiClient.transcribeAudio).not.toHaveBeenCalled();
    });

    it('should throw ERR_CONSENT_REQUIRED when cloudAiConsent is false and NEVER call AI service', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: false,
      });

      await expect(
        service.transcribeAudio(validAudioFile, { language: 'ar-EG' }, 'user-uuid-refused'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.CONSENT_REQUIRED,
      });

      expect(mockPreferenceRepo.findByUserId).toHaveBeenCalledWith('user-uuid-refused');
      expect(mockAiClient.transcribeAudio).not.toHaveBeenCalled();
    });
  });

  describe('AI Output Validation', () => {
    it('should throw ERR_NO_SPEECH_DETECTED when AI returns an empty transcript', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: true,
      });

      mockAiClient.transcribeAudio.mockResolvedValue({
        transcript: '',
        language: 'ar-EG',
        confidence: null,
      });

      await expect(
        service.transcribeAudio(validAudioFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.NO_SPEECH_DETECTED,
      });
    });

    it('should throw ERR_NO_SPEECH_DETECTED when AI returns whitespace-only transcript', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: true,
      });

      mockAiClient.transcribeAudio.mockResolvedValue({
        transcript: '   \n  \t ',
        language: 'ar-EG',
        confidence: null,
      });

      await expect(
        service.transcribeAudio(validAudioFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.NO_SPEECH_DETECTED,
      });
    });

    it('should propagate AI client errors (e.g. REQUEST_TIMEOUT, SERVICE_UNAVAILABLE) unchanged', async () => {
      mockPreferenceRepo.findByUserId.mockResolvedValue({
        cloudAiConsent: true,
      });

      mockAiClient.transcribeAudio.mockRejectedValue(
        new AppException(AppErrorCode.REQUEST_TIMEOUT),
      );

      await expect(
        service.transcribeAudio(validAudioFile, { language: 'ar-EG' }, 'user-uuid-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.REQUEST_TIMEOUT,
      });
    });
  });
});
