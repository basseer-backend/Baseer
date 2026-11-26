import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseAiHttpClient } from './base-ai-http.client';
import {
  AiAgentClassificationRequest,
  AiAgentEntities,
  AiIntentClassificationResult,
  AiTranscriptionResult,
  IAiVoiceAgentClient,
  RawAiAgentResponse,
  RawAiTranscriptionResponse,
} from './ai-agent.interface';
import { AppException } from '../../../common/exceptions/app.exception';
import { AppErrorCode } from '../../../common/constants/error-codes';
import { VoiceIntent } from '../../../common/enums';

@Injectable()
export class HttpAiVoiceAgentClient
  extends BaseAiHttpClient
  implements IAiVoiceAgentClient
{
  private readonly classifyEndpoint: string;
  private readonly transcribeEndpoint: string;
  private readonly transcribeTimeoutMs: number;

  constructor(configService: ConfigService) {
    const baseUrl =
      configService.get<string>('AI_VOICE_AGENT_URL') ||
      configService.get<string>('AI_AGENT_URL') ||
      'http://localhost:8000/api/v1';
    const apiKey =
      configService.get<string>('AI_VOICE_AGENT_API_KEY') ||
      configService.get<string>('AI_AGENT_API_KEY');
    const timeoutMs = parseInt(
      configService.get<string>('AI_VOICE_AGENT_TIMEOUT_MS') ||
      configService.get<string>('AI_AGENT_TIMEOUT_MS') ||
      '4000',
      10,
    );

    super({
      serviceName: 'HttpAiVoiceAgentClient',
      baseUrl,
      apiKey,
      timeoutMs: !isNaN(timeoutMs) && timeoutMs > 0 ? timeoutMs : 4000,
    });

    this.classifyEndpoint =
      configService.get<string>('AI_VOICE_AGENT_CLASSIFY_PATH') ||
      'intent/classify';

    this.transcribeEndpoint =
      configService.get<string>('AI_VOICE_AGENT_TRANSCRIBE_PATH') ||
      'speech/transcribe';
    const transcribeTimeout = parseInt(
      configService.get<string>('AI_VOICE_AGENT_TRANSCRIBE_TIMEOUT_MS') ||
      '8000',
      10,
    );
    this.transcribeTimeoutMs =
      !isNaN(transcribeTimeout) && transcribeTimeout > 0 ? transcribeTimeout : 8000;
  }

  /**
   * Calls external AI Agent microservice over HTTP and enforces strict runtime validation.
   */
  async classifyIntent(
    text: string,
    language = 'ar-EG',
    correlationId?: string,
  ): Promise<AiIntentClassificationResult> {
    const requestPayload: AiAgentClassificationRequest = {
      text: text.trim(),
      language,
      correlationId,
    };

    const rawResponse = await this.postJson<
      AiAgentClassificationRequest,
      RawAiAgentResponse
    >(this.classifyEndpoint, requestPayload, correlationId);

    return this.validateRuntimeResponse(rawResponse);
  }

  /**
   * Strict runtime validation of AI response before exposing it to internal services.
   * Prevents corrupted, unexpected, or poisoned data from propagating into Baseer business logic.
   */
  validateRuntimeResponse(
    raw: unknown,
  ): AiIntentClassificationResult {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      this.logger.error('Runtime validation failed: AI response is not a valid JSON object');
      throw new AppException(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'استجابة خادم الذكاء الاصطناعي غير متطابقة مع عقد التكامل',
      );
    }

    const payload = raw as RawAiAgentResponse;

    // 1. Intent validation: must be a non-empty string
    if (typeof payload.intent !== 'string' || payload.intent.trim() === '') {
      this.logger.error('Runtime validation failed: missing or non-string intent');
      throw new AppException(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'استجابة خادم الذكاء الاصطناعي تفتقد حقل النية الصوتي',
      );
    }
    const normalizedIntent = payload.intent.trim().toUpperCase();
    const canonicalIntents = Object.values(VoiceIntent) as string[];
    const isCanonical = canonicalIntents.includes(normalizedIntent);
    const finalIntent = isCanonical || normalizedIntent === 'UNKNOWN' ? normalizedIntent : 'UNKNOWN';

    // 2. Confidence validation: must be a finite number between 0 and 1, or strictly null
    let normalizedConfidence: number | null = null;
    if (
      typeof payload.confidence === 'number' &&
      Number.isFinite(payload.confidence) &&
      payload.confidence >= 0 &&
      payload.confidence <= 1
    ) {
      normalizedConfidence = payload.confidence;
    }

    // 3. Requires clarification validation: strictly boolean
    const requiresClarification =
      typeof payload.requiresClarification === 'boolean'
        ? payload.requiresClarification
        : false;

    // 4. Entities validation: must be an object with string keys
    const entities: AiAgentEntities = {};
    if (
      payload.entities &&
      typeof payload.entities === 'object' &&
      !Array.isArray(payload.entities)
    ) {
      const rawEntities = payload.entities as Record<string, unknown>;
      for (const [key, value] of Object.entries(rawEntities)) {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          (Array.isArray(value) && value.every((v) => typeof v === 'string'))
        ) {
          entities[key] = value as string | number | boolean | string[];
        }
      }
    }

    // 5. Suggested response validation
    const suggestedResponse =
      typeof payload.suggestedResponse === 'string' &&
      payload.suggestedResponse.trim().length > 0
        ? payload.suggestedResponse.trim()
        : null;

    // 6. isSupported validation: strictly false if not canonical Baseer intent
    const isSupported =
      isCanonical &&
      (typeof payload.isSupported === 'boolean'
        ? payload.isSupported
        : finalIntent !== 'UNKNOWN');

    return {
      intent: finalIntent,
      confidence: normalizedConfidence,
      entities,
      requiresClarification,
      suggestedResponse,
      isSupported,
    };
  }

  /**
   * Calls external AI Agent microservice over multipart HTTP for audio transcription.
   * Performs runtime response validation before returning.
   */
  async transcribeAudio(
    audio: { buffer: Buffer; mimeType: string; fileName: string },
    language = 'ar-EG',
    correlationId?: string,
  ): Promise<AiTranscriptionResult> {
    const formData = new FormData();
    const arrayBuffer = audio.buffer.buffer.slice(
      audio.buffer.byteOffset,
      audio.buffer.byteOffset + audio.buffer.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: audio.mimeType });
    formData.append('audio', blob, audio.fileName);
    formData.append('language', language);
    if (correlationId) {
      formData.append('correlationId', correlationId);
    }

    const rawResponse = await this.postMultipart<RawAiTranscriptionResponse>(
      this.transcribeEndpoint,
      formData,
      correlationId,
      this.transcribeTimeoutMs,
    );

    return this.validateTranscriptionResponse(rawResponse);
  }

  /**
   * Strict runtime validation of AI speech transcription response.
   */
  validateTranscriptionResponse(raw: unknown): AiTranscriptionResult {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      this.logger.error(
        'Runtime validation failed: AI transcription response is not a valid JSON object',
      );
      throw new AppException(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'استجابة خادم الذكاء الاصطناعي غير متطابقة مع عقد التكامل',
      );
    }

    const payload = raw as RawAiTranscriptionResponse;

    if (typeof payload.transcript !== 'string') {
      this.logger.error('Runtime validation failed: missing or non-string transcript');
      throw new AppException(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'استجابة خادم الذكاء الاصطناعي تفتقد النص المستخرج',
      );
    }

    let normalizedConfidence: number | null = null;
    if (
      typeof payload.confidence === 'number' &&
      Number.isFinite(payload.confidence) &&
      payload.confidence >= 0 &&
      payload.confidence <= 1
    ) {
      normalizedConfidence = payload.confidence;
    }

    const normalizedLanguage =
      typeof payload.language === 'string' && payload.language.trim().length > 0
        ? payload.language.trim()
        : null;

    return {
      transcript: payload.transcript,
      language: normalizedLanguage,
      confidence: normalizedConfidence,
    };
  }
}
