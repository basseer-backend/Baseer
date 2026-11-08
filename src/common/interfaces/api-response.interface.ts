import { ApiProperty } from '@nestjs/swagger';
import { AppErrorCode } from '../constants/error-codes.js';

export interface SuccessResponse<T = any> {
  success: true;
  statusCode: number;
  data: T;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  statusCode: number;
  errorCode: AppErrorCode;
  message: string;
  details?: any;
  timestamp: string;
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

export class SuccessResponseDto<T = any> implements SuccessResponse<T> {
  @ApiProperty({ example: true })
  success: true = true;

  @ApiProperty({ example: 200 })
  statusCode: number;

  data: T;

  @ApiProperty({ example: '2026-11-06T14:30:00.000Z' })
  timestamp: string;
}

export class ErrorResponseDto implements ErrorResponse {
  @ApiProperty({ example: false })
  success: false = false;

  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ enum: AppErrorCode, example: AppErrorCode.VALIDATION_FAILED })
  errorCode: AppErrorCode;

  @ApiProperty({ example: 'بيانات الطلب غير صالحة' })
  message: string;

  @ApiProperty({
    type: [String],
    required: false,
    example: ['field must be a string'],
  })
  details?: any;

  @ApiProperty({ example: '2026-11-06T14:30:00.000Z' })
  timestamp: string;
}
