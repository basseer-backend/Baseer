import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { AppErrorCode } from '../../common/constants/error-codes';
import { UserPreferenceRepository } from '../../database/repositories/user-preference.repository';
import {
  AI_VOICE_AGENT_CLIENT,
  IAiVoiceAgentClient,
} from './clients/ai-agent.interface';
import { VoiceTranscribeDto } from './dto/voice-transcribe.dto';
import { VoiceTranscribeResultDto } from './dto/voice-transcribe-result.dto';
import {
  ALLOWED_AUDIO_MIME_TYPES,
  DEFAULT_VOICE_LANGUAGE,
  UploadedAudioFile,
  VOICE_AUDIO_MAX_BYTES,
} from './voice.constants';

@Injectable()
export class VoiceTranscriptionService {
  private readonly logger = new Logger(VoiceTranscriptionService.name);

  constructor(
    @Inject(AI_VOICE_AGENT_CLIENT)
    private readonly aiVoiceClient: IAiVoiceAgentClient,
    private readonly userPreferenceRepository: UserPreferenceRepository,
  ) {}

  /**
   * Processes uploaded speech audio, verifies user consent, enforces size & format boundaries,
   * coordinates with upstream AI speech model, and returns validated transcript.
   */
  async transcribeAudio(
    file: UploadedAudioFile | undefined,
    dto: VoiceTranscribeDto,
    userId: string,
    correlationId?: string,
  ): Promise<VoiceTranscribeResultDto> {
    // 1. File missing / empty -> ERR_VALIDATION_FAILED
    if (!file || !file.buffer || file.buffer.length === 0 || file.size === 0) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        undefined,
        ['audio file is required and cannot be empty'],
      );
    }

    // 2. File size boundary check -> ERR_AUDIO_TOO_LARGE
    if (file.size > VOICE_AUDIO_MAX_BYTES || file.buffer.length > VOICE_AUDIO_MAX_BYTES) {
      throw new AppException(AppErrorCode.AUDIO_TOO_LARGE);
    }

    // 3. MIME type validation -> ERR_UNSUPPORTED_AUDIO_FORMAT
    const mime = file.mimetype?.trim().toLowerCase();
    if (!mime || !ALLOWED_AUDIO_MIME_TYPES.includes(mime as any)) {
      throw new AppException(AppErrorCode.UNSUPPORTED_AUDIO_FORMAT);
    }

    // 4. User Cloud AI Consent Verification BEFORE calling AI service
    const userPref = await this.userPreferenceRepository.findByUserId(userId);
    if (!userPref || userPref.cloudAiConsent !== true) {
      throw new AppException(AppErrorCode.CONSENT_REQUIRED);
    }

    const language = dto?.language || DEFAULT_VOICE_LANGUAGE;

    // Log only non-sensitive metadata (never audio raw content or transcript text)
    this.logger.log(
      `Processing speech transcription request [size: ${file.size} bytes, mime: ${mime}, language: ${language}, correlationId: ${correlationId || 'none'}]`,
    );

    // 5. Call AI service for speech transcription
    const aiResult = await this.aiVoiceClient.transcribeAudio(
      {
        buffer: file.buffer,
        mimeType: mime,
        fileName: file.originalname || 'speech.wav',
      },
      language,
      correlationId,
    );

    // 6. Validate transcript text: empty or whitespace-only -> ERR_NO_SPEECH_DETECTED
    if (!aiResult.transcript || aiResult.transcript.trim().length === 0) {
      throw new AppException(AppErrorCode.NO_SPEECH_DETECTED);
    }

    return {
      transcript: aiResult.transcript.trim(),
      language: aiResult.language || language,
      confidence: aiResult.confidence,
    };
  }
}
