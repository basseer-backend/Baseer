import { Logger } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception';
import { AppErrorCode, ERROR_META } from '../../../common/constants/error-codes';

export interface BaseAiHttpClientConfig {
  serviceName: string;
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
}

/**
 * Reusable HTTP client base for external AI microservices in Baseer.
 * Uses native Node 22 fetch with strict AbortSignal timeout and unified error handling.
 * Designed to be directly reusable by future OCR and Vision clients.
 */
export abstract class BaseAiHttpClient {
  protected readonly logger: Logger;
  protected readonly serviceName: string;
  protected readonly baseUrl: string;
  protected readonly apiKey?: string;
  protected readonly timeoutMs: number;

  constructor(config: BaseAiHttpClientConfig) {
    this.serviceName = config.serviceName;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey?.trim();
    this.timeoutMs = config.timeoutMs > 0 ? config.timeoutMs : 4000;
    this.logger = new Logger(this.serviceName);
  }

  /**
   * Executes a POST request to an external AI service endpoint with configurable timeout.
   * Enforces zero retries on timeout to protect voice interaction latency.
   */
  protected async postJson<TRequest, TResponse>(
    endpointPath: string,
    body: TRequest,
    correlationId?: string,
  ): Promise<TResponse> {
    const url = `${this.baseUrl}/${endpointPath.replace(/^\/+/, '')}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      headers['X-API-Key'] = this.apiKey;
    }

    if (correlationId) {
      headers['X-Correlation-ID'] = correlationId;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: unknown) {
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorName === 'TimeoutError' || errorMessage.toLowerCase().includes('timeout')) {
        this.logger.error(
          `[${this.serviceName}] Request timed out after ${this.timeoutMs}ms for URL: ${url}`,
        );
        throw new AppException(
          AppErrorCode.REQUEST_TIMEOUT,
          'استغرق الطلب وقتاً أطول من المعتاد، يرجى المحاولة مرة أخرى',
        );
      }

      this.logger.error(
        `[${this.serviceName}] Network communication failed for URL: ${url} - ${errorMessage}`,
      );
      throw new AppException(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'خدمة المساعد الذكي غير متوفرة حالياً، يرجى المحاولة لاحقاً',
      );
    }

    if (!response.ok) {
      const status = response.status;
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        // Ignore read failures
      }

      this.logger.error(
        `[${this.serviceName}] HTTP error ${status} from ${url}: ${errorBody.slice(0, 200)}`,
      );
      throw new AppException(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'حدث خطأ في التواصل مع خادم الذكاء الاصطناعي، يرجى المحاولة لاحقاً',
      );
    }

    try {
      return (await response.json()) as TResponse;
    } catch (parseErr: unknown) {
      this.logger.error(
        `[${this.serviceName}] Malformed non-JSON response received from ${url}: ${
          parseErr instanceof Error ? parseErr.message : String(parseErr)
        }`,
      );
      throw new AppException(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'استجابة خادم الذكاء الاصطناعي غير صالحة',
      );
    }
  }

  /**
   * Executes a multipart/form-data POST request to an external AI service endpoint.
   * Uses native FormData without manual Content-Type header.
   * Supports an optional timeout override per call.
   */
  protected async postMultipart<TResponse>(
    endpointPath: string,
    formData: FormData,
    correlationId?: string,
    timeoutMs?: number,
  ): Promise<TResponse> {
    const effectiveTimeout = timeoutMs && timeoutMs > 0 ? timeoutMs : this.timeoutMs;
    const url = `${this.baseUrl}/${endpointPath.replace(/^\/+/, '')}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      headers['X-API-Key'] = this.apiKey;
    }

    if (correlationId) {
      headers['X-Correlation-ID'] = correlationId;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(effectiveTimeout),
      });
    } catch (err: unknown) {
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorName === 'TimeoutError' || errorMessage.toLowerCase().includes('timeout')) {
        this.logger.error(
          `[${this.serviceName}] Multipart request timed out after ${effectiveTimeout}ms for URL: ${url}`,
        );
        throw new AppException(
          AppErrorCode.REQUEST_TIMEOUT,
          'استغرق الطلب وقتاً أطول من المعتاد، يرجى المحاولة مرة أخرى',
        );
      }

      this.logger.error(
        `[${this.serviceName}] Multipart network communication failed for URL: ${url} - ${errorMessage}`,
      );
      throw new AppException(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'خدمة المساعد الذكي غير متوفرة حالياً، يرجى المحاولة لاحقاً',
      );
    }

    if (!response.ok) {
      const status = response.status;
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        // Ignore read failures
      }

      // Check if upstream AI service returned an ai-owned error code in JSON
      try {
        const parsed = JSON.parse(errorBody);
        const code = parsed?.errorCode as AppErrorCode | undefined;
        if (code && Object.values(AppErrorCode).includes(code)) {
          const meta = ERROR_META[code];
          if (meta && meta.owner.includes('ai')) {
            this.logger.warn(
              `[${this.serviceName}] Upstream AI service returned AI-owned error code: ${code}`,
            );
            throw new AppException(code);
          }
        }
      } catch (e) {
        if (e instanceof AppException) {
          throw e;
        }
      }

      this.logger.error(
        `[${this.serviceName}] HTTP error ${status} from ${url}: ${errorBody.slice(0, 200)}`,
      );
      throw new AppException(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'حدث خطأ في التواصل مع خادم الذكاء الاصطناعي، يرجى المحاولة لاحقاً',
      );
    }

    try {
      return (await response.json()) as TResponse;
    } catch (parseErr: unknown) {
      this.logger.error(
        `[${this.serviceName}] Malformed non-JSON response received from ${url}: ${
          parseErr instanceof Error ? parseErr.message : String(parseErr)
        }`,
      );
      throw new AppException(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'استجابة خادم الذكاء الاصطناعي غير صالحة',
      );
    }
  }
}
