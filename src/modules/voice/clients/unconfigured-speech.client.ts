import { Injectable, Logger } from '@nestjs/common';
import {
  AudioTranscriptionRequest,
  ISpeechServiceClient,
  SpeechTranscriptionResult,
} from '../interfaces/speech-service-client.interface';
import { AppException } from '../../../common/exceptions/app.exception';
import { AppErrorCode } from '../../../common/constants/error-codes';

/**
 * Placeholder client active when no external Speech-to-Text provider has been officially approved.
 *
 * Architecture Compliance:
 * - Does not make unauthorized external network calls.
 * - Does not assume fake production credentials.
 * - Throws canonical ERR_SERVICE_UNAVAILABLE (503) when invoked in production,
 *   clearly reporting that provider selection is pending approval.
 */
@Injectable()
export class UnconfiguredSpeechClient implements ISpeechServiceClient {
  private readonly logger = new Logger(UnconfiguredSpeechClient.name);

  async transcribe(
    request: AudioTranscriptionRequest,
  ): Promise<SpeechTranscriptionResult> {
    this.logger.warn(
      `Speech-to-Text invocation attempted but no cloud STT provider is configured [correlationId: ${request.correlationId || 'none'}]`,
    );

    throw new AppException(
      AppErrorCode.SERVICE_UNAVAILABLE,
      'خدمة تحويل الصوت إلى نص غير مهيأة بعد (في انتظار اعتماد المزود)',
    );
  }
}
