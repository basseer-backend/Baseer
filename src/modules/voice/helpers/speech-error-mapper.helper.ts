import { Logger } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception';
import { AppErrorCode } from '../../../common/constants/error-codes';
import { SpeechTranscriptionResult } from '../interfaces/speech-service-client.interface';

const logger = new Logger('SpeechErrorMapper');

/**
 * Maps upstream Speech-to-Text provider errors, network failures, and timeouts
 * strictly to canonical Baseer application error codes defined in Contracts v1.0.0.
 *
 * Security & Privacy Guarantees:
 * 1. Never leaks upstream API keys, credentials, or internal server URLs in user-facing exceptions.
 * 2. Never leaks raw stack traces or internal vendor schemas.
 * 3. Logs diagnostic context internally for operational monitoring while returning safe Arabic messages.
 */
export class SpeechErrorMapperHelper {
  /**
   * Evaluates an upstream exception or HTTP failure and throws the appropriate canonical AppException.
   */
  public static mapUpstreamError(
    error: any,
    providerName = 'SpeechProvider',
    correlationId?: string,
  ): never {
    const corrStr = correlationId ? ` [correlationId: ${correlationId}]` : '';

    // 1. Timeout / Abort errors
    if (
      error?.name === 'AbortError' ||
      error?.name === 'TimeoutError' ||
      error?.code === 'ETIMEDOUT' ||
      error?.code === 'ESOCKETTIMEDOUT'
    ) {
      logger.warn(
        `Upstream ${providerName} request timed out${corrStr}`,
      );
      throw new AppException(
        AppErrorCode.REQUEST_TIMEOUT,
        'استغرقت المعالجة وقتاً أطول من المعتاد، يرجى المحاولة مرة أخرى',
      );
    }

    // 2. Network connection failures / DNS resolution / Service unavailable
    if (
      error?.code === 'ECONNREFUSED' ||
      error?.code === 'ENOTFOUND' ||
      error?.code === 'ECONNRESET' ||
      error?.code === 'EHOSTUNREACH' ||
      error?.status === 503 ||
      error?.status === 502
    ) {
      logger.error(
        `Upstream ${providerName} connection failed [code: ${error?.code || error?.status}]${corrStr}`,
      );
      throw new AppException(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'الخدمة غير متاحة حالياً، يرجى المحاولة بعد قليل',
      );
    }

    // 3. Upstream rate limiting (429)
    if (error?.status === 429) {
      logger.warn(
        `Upstream ${providerName} rate limit reached${corrStr}`,
      );
      throw new AppException(
        AppErrorCode.TOO_MANY_REQUESTS,
        'طلبات كثيرة جداً، يرجى الانتظار قليلاً',
      );
    }

    // 4. Payload too large (413)
    if (error?.status === 413) {
      logger.warn(
        `Upstream ${providerName} rejected audio as too large${corrStr}`,
      );
      throw new AppException(
        AppErrorCode.AUDIO_TOO_LARGE,
        'حجم التسجيل الصوتي كبير جداً، يرجى تسجيل أمر أقصر',
      );
    }

    // 5. Upstream validation / unsupported audio (400 / 422)
    if (error?.status === 400 || error?.status === 422) {
      logger.warn(
        `Upstream ${providerName} rejected audio payload as invalid/unsupported${corrStr}`,
      );
      throw new AppException(
        AppErrorCode.UNSUPPORTED_AUDIO_FORMAT,
        'صيغة الملف الصوتي غير مدعومة، يرجى تسجيل الأمر مرة أخرى',
      );
    }

    // 6. Existing AppException: rethrow without modification
    if (error instanceof AppException) {
      throw error;
    }

    // 7. Generic unexpected upstream failure -> 500 Internal Server Error
    logger.error(
      `Unhandled upstream error from ${providerName}: ${error?.message || error}${corrStr}`,
    );
    throw new AppException(
      AppErrorCode.INTERNAL_SERVER_ERROR,
      'حدث خطأ في الخادم أثناء معالجة الصوت، يرجى المحاولة لاحقاً',
    );
  }

  /**
   * Validates the normalized result returned from a speech provider.
   * Throws canonical error codes for empty or low confidence results.
   */
  public static validateTranscriptionResult(
    result: SpeechTranscriptionResult,
    minConfidenceThreshold = 0.5,
  ): SpeechTranscriptionResult {
    const text = result?.transcript?.trim();

    // Inaudible audio or silence
    if (!text || text.length === 0) {
      throw new AppException(
        AppErrorCode.NO_SPEECH_DETECTED,
        'لم أسمع أي كلام واضح، يرجى المحاولة مرة أخرى بصوت أوضح',
      );
    }

    // Low confidence threshold (verified in Contracts v1.0.0: ERR_LOW_CONFIDENCE)
    if (
      result.confidence !== undefined &&
      result.confidence !== null &&
      result.confidence > 0 &&
      result.confidence < minConfidenceThreshold
    ) {
      throw new AppException(
        AppErrorCode.LOW_CONFIDENCE,
        'لم أتمكن من التأكد من النتيجة، يرجى المحاولة بصوت أوضح',
      );
    }

    return {
      ...result,
      transcript: text,
    };
  }
}
