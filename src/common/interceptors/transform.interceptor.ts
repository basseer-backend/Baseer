import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';
import { Stream } from 'stream';
import { SuccessResponse } from '../interfaces/api-response.interface.js';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T> | T>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<T> | T> {
    const httpCtx = context.switchToHttp();
    const response = httpCtx.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        const statusCode = response.statusCode || HttpStatus.OK;

        // Do not wrap response if data is undefined, 204 No Content, headers are already sent, or response is stream/buffer
        if (
          data === undefined ||
          statusCode === HttpStatus.NO_CONTENT ||
          response.headersSent ||
          data instanceof Stream ||
          Buffer.isBuffer(data)
        ) {
          return data;
        }

        const successResponse: SuccessResponse<T> = {
          success: true,
          statusCode,
          data,
          timestamp: new Date().toISOString(),
        };

        return successResponse;
      }),
    );
  }
}
