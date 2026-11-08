import { HttpException, HttpStatus } from '@nestjs/common';
import {
  AppErrorCode,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
} from '../constants/error-codes.js';

export class AppException extends HttpException {
  constructor(
    public readonly errorCode: AppErrorCode,
    message?: string,
    public readonly details?: any,
  ) {
    const status =
      ERROR_HTTP_STATUS[errorCode] || HttpStatus.INTERNAL_SERVER_ERROR;
    const finalMessage = message || ERROR_MESSAGES[errorCode] || errorCode;

    super(
      {
        errorCode,
        message: finalMessage,
        details,
      },
      status,
    );
  }
}
