import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AppException } from '../../../common/exceptions/app.exception';
import { AppErrorCode } from '../../../common/constants/error-codes';

/**
 * Translates low-level Multer multipart errors into domain AppExceptions.
 * Positioned before FileInterceptor to convert size-limit and unexpected-field errors.
 */
@Injectable()
export class VoiceAudioMulterInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: any) => {
        if (
          err?.code === 'LIMIT_FILE_SIZE' ||
          (err?.name === 'MulterError' && err?.code === 'LIMIT_FILE_SIZE')
        ) {
          throw new AppException(AppErrorCode.AUDIO_TOO_LARGE);
        }
        if (
          err?.code === 'LIMIT_UNEXPECTED_FILE' ||
          (err?.name === 'MulterError' && err?.code === 'LIMIT_UNEXPECTED_FILE')
        ) {
          throw new AppException(
            AppErrorCode.VALIDATION_FAILED,
            undefined,
            ['Unexpected multipart field; expected "audio" file field'],
          );
        }
        if (err?.name === 'MulterError') {
          throw new AppException(
            AppErrorCode.VALIDATION_FAILED,
            undefined,
            [err.message || 'Multer audio upload validation failed'],
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
