import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { AppErrorCode } from '../../common/constants/error-codes';
import { UserPreferenceRepository } from '../../database/repositories/user-preference.repository';
import {
  ISpeechServiceClient,
  SPEECH_SERVICE_CLIENT,
} from './interfaces/speech-service-client.interface';
import { VoiceTranscribeDto } from './dto/voice-transcribe.dto';
import { VoiceTranscribeResultDto } from './dto/voice-transcribe-result.dto';
import {
  DEFAULT_VOICE_LANGUAGE,
  UploadedAudioFile,
  VOICE_AUDIO_MAX_BYTES,
} from './voice.constants';
import { AudioValidatorHelper } from './helpers/audio-validator.helper';
import { AudioProcessorService } from './services/audio-processor.service';

@Injectable()
export class VoiceTranscriptionService {
  private readonly logger = new Logger(VoiceTranscriptionService.name);

  constructor(
    @Inject(SPEECH_SERVICE_CLIENT)
    private readonly speechServiceClient: ISpeechServiceClient,
    private readonly userPreferenceRepository: UserPreferenceRepository,
    @Optional()
    private readonly audioProcessorService?: AudioProcessorService,
  ) {}

  /**
   * Processes uploaded speech audio, verifies user consent, enforces size, format & metadata boundaries,
   * normalizes media using FFmpeg/FFprobe, coordinates with the Speech Service Client, and returns validated transcript.
   */
  async transcribeAudio(
    file: UploadedAudioFile | undefined,
    dto: VoiceTranscribeDto,
    userId: string,
    correlationId?: string,
  ): Promise<VoiceTranscribeResultDto> {
    // 1. File missing / empty check -> ERR_VALIDATION_FAILED
    if (!file || !file.buffer || file.buffer.length === 0 || file.size === 0) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        undefined,
        ['audio file is required and cannot be empty'],
      );
    }

    // 2. Early size check -> ERR_AUDIO_TOO_LARGE
    if (file.size > VOICE_AUDIO_MAX_BYTES || file.buffer.length > VOICE_AUDIO_MAX_BYTES) {
      throw new AppException(AppErrorCode.AUDIO_TOO_LARGE);
    }

    // 3. User Cloud AI Consent Verification BEFORE invoking FFmpeg or cloud speech service
    // (Per Section 9: Do not process or invoke FFmpeg for requests that fail consent validation)
    const userPref = await this.userPreferenceRepository.findByUserId(userId);
    if (!userPref || userPref.cloudAiConsent !== true) {
      throw new AppException(AppErrorCode.CONSENT_REQUIRED);
    }

    // 4. Audio Probing, Validation & Normalization
    // If AudioProcessorService is available, perform genuine FFprobe probing and FFmpeg normalization
    // to canonical Ogg Opus (16kHz, mono, <=10s). Otherwise fall back to in-memory header inspection.
    let normalizedBuffer: Buffer;
    let normalizedMimeType: string;
    let durationSeconds: number | undefined;
    let detectedFormat: string;

    if (this.audioProcessorService) {
      const normalized = await this.audioProcessorService.processAndNormalizeAudio(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      normalizedBuffer = normalized.buffer;
      normalizedMimeType = normalized.mimeType;
      durationSeconds = normalized.durationSeconds;
      detectedFormat = normalized.format;
    } else {
      const validatedAudio = AudioValidatorHelper.validate({
        audioBuffer: file.buffer,
        mimeType: file.mimetype,
      });
      normalizedBuffer = validatedAudio.buffer;
      normalizedMimeType = file.mimetype || 'audio/ogg';
      durationSeconds = validatedAudio.metadata.durationSeconds;
      detectedFormat = validatedAudio.metadata.format;
    }

    const language = dto?.language || DEFAULT_VOICE_LANGUAGE;

    // Log diagnostic metadata without exposing raw audio content or personal data
    this.logger.log(
      `Processing speech transcription request [originalSize: ${file.size} bytes, format: ${detectedFormat}, language: ${language}, correlationId: ${correlationId || 'none'}]`,
    );

    // 5. Delegate transcription to the provider-independent Speech Service Client
    const speechResult = await this.speechServiceClient.transcribe({
      audioBuffer: normalizedBuffer,
      mimeType: normalizedMimeType,
      language,
      durationSeconds,
      correlationId,
    });

    // 6. Validate transcript text: empty or whitespace-only -> ERR_NO_SPEECH_DETECTED
    if (!speechResult.transcript || speechResult.transcript.trim().length === 0) {
      throw new AppException(AppErrorCode.NO_SPEECH_DETECTED);
    }

    return {
      transcript: speechResult.transcript.trim(),
      language: speechResult.detectedLanguage || language,
      confidence: speechResult.confidence ?? null,
    };
  }
}
