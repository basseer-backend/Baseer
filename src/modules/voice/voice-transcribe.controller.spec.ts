import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceTranscribeController } from './voice-transcribe.controller';
import { VoiceTranscriptionService } from './voice-transcription.service';
import { UploadedAudioFile } from './voice.constants';

describe('VoiceTranscribeController', () => {
  let controller: VoiceTranscribeController;
  let mockService: {
    transcribeAudio: ReturnType<typeof vi.fn>;
  };

  const mockFile: UploadedAudioFile = {
    fieldname: 'audio',
    originalname: 'recording.wav',
    encoding: '7bit',
    mimetype: 'audio/wav',
    size: 2048,
    buffer: Buffer.from('audio-content'),
  };

  beforeEach(() => {
    mockService = {
      transcribeAudio: vi.fn(),
    };
    controller = new VoiceTranscribeController(
      mockService as unknown as VoiceTranscriptionService,
    );
  });

  it('should delegate to VoiceTranscriptionService with file, dto, userId, and correlationId', async () => {
    const expectedResult = {
      transcript: 'عايز أروح مكتب العميد',
      language: 'ar-EG',
      confidence: 0.95,
    };
    mockService.transcribeAudio.mockResolvedValue(expectedResult);

    const result = await controller.transcribe(
      mockFile,
      { language: 'ar-EG' },
      'corr-test-123',
      'user-uuid-999',
    );

    expect(result).toEqual(expectedResult);
    expect(mockService.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(mockService.transcribeAudio).toHaveBeenCalledWith(
      mockFile,
      { language: 'ar-EG' },
      'user-uuid-999',
      'corr-test-123',
    );
  });

  it('should have JwtAuthGuard and TokenBucketRateLimitGuard applied at the controller class level', () => {
    const guardMetadata: any[] =
      Reflect.getMetadata('__guards__', VoiceTranscribeController) ?? [];
    const guardNames = guardMetadata.map((g: any) =>
      typeof g === 'function' ? g.name : g?.constructor?.name,
    );
    expect(guardNames).toContain('JwtAuthGuard');
    expect(guardNames).toContain('TokenBucketRateLimitGuard');
  });
});
