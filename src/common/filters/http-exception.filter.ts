import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AppErrorCode, ERROR_MESSAGES } from '../constants/error-codes.js';
import { ErrorResponse } from '../interfaces/api-response.interface.js';
import { AppException } from '../exceptions/app.exception.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode: AppErrorCode = AppErrorCode.INTERNAL_SERVER_ERROR;
    let message = ERROR_MESSAGES[AppErrorCode.INTERNAL_SERVER_ERROR];
    let details: any = undefined;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      errorCode = exception.errorCode;
      details = exception.details;
      const res = exception.getResponse() as Record<string, any>;
      message = res.message || ERROR_MESSAGES[errorCode] || exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorCode = this.mapStatusToErrorCode(status);
      const res = exception.getResponse();

      let originalMessage = exception.message;

      if (typeof res === 'string') {
        originalMessage = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        const rawMessage = resObj.message;

        if (Array.isArray(rawMessage)) {
          // Validation error from NestJS ValidationPipe
          errorCode = AppErrorCode.VALIDATION_FAILED;
          details = rawMessage;
          originalMessage = 'Validation failed';
        } else {
          originalMessage = rawMessage || exception.message;
          if (resObj.errorCode) {
            errorCode = resObj.errorCode;
          }
          if (resObj.details) {
            details = resObj.details;
          }
        }
      }

      // Log original Nest exception message
      this.logger.warn(
        `HttpException [${status}] (${errorCode}): ${originalMessage}`,
      );

      // Use standard Arabic error message instead of Nest English message
      message = ERROR_MESSAGES[errorCode] || originalMessage;

      // Log 5xx HttpException as server error, hide message, but keep mapped errorCode (e.g. 503 -> SERVICE_UNAVAILABLE)
      if (status >= 500) {
        this.logger.error(
          `HttpException 5xx [${status}]: ${originalMessage}`,
          exception.stack,
        );
        errorCode = this.mapStatusToErrorCode(status);
        message = ERROR_MESSAGES[errorCode];
      }
    } else if (exception instanceof Error) {
      const err = exception as any;
      const errStatus = err.status ?? err.statusCode;

      if (
        errStatus === HttpStatus.PAYLOAD_TOO_LARGE ||
        err.type === 'entity.too.large'
      ) {
        status = HttpStatus.PAYLOAD_TOO_LARGE;
        errorCode = AppErrorCode.FILE_TOO_LARGE;
        message = ERROR_MESSAGES[AppErrorCode.FILE_TOO_LARGE];
      } else if (
        exception instanceof SyntaxError &&
        (errStatus === HttpStatus.BAD_REQUEST || err.type === 'entity.parse.failed')
      ) {
        status = HttpStatus.BAD_REQUEST;
        errorCode = AppErrorCode.BAD_REQUEST;
        message = 'JSON غير صالح';
      } else {
        this.logger.error(
          `Unhandled Exception: ${exception.message}`,
          exception.stack,
        );
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        errorCode = AppErrorCode.INTERNAL_SERVER_ERROR;
        message = ERROR_MESSAGES[AppErrorCode.INTERNAL_SERVER_ERROR];
      }
    } else {
      this.logger.error('Unhandled non-error exception thrown', exception);
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = AppErrorCode.INTERNAL_SERVER_ERROR;
      message = ERROR_MESSAGES[AppErrorCode.INTERNAL_SERVER_ERROR];
    }

    const errorResponse: ErrorResponse = {
      success: false,
      statusCode: status,
      errorCode,
      message,
      ...(details !== undefined ? { details } : {}),
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(errorResponse);
  }

  private mapStatusToErrorCode(status: number): AppErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return AppErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return AppErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return AppErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return AppErrorCode.NOT_FOUND;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return AppErrorCode.FILE_TOO_LARGE;
      case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
        return AppErrorCode.UNSUPPORTED_IMAGE_FORMAT;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return AppErrorCode.BAD_REQUEST;
      case HttpStatus.TOO_MANY_REQUESTS:
        return AppErrorCode.TOO_MANY_REQUESTS;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return AppErrorCode.SERVICE_UNAVAILABLE;
      default:
        return AppErrorCode.INTERNAL_SERVER_ERROR;
    }
  }
}
