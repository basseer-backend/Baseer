import { applyDecorators, Type, HttpStatus } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import {
  AppErrorCode,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
} from '../constants/error-codes.js';
import {
  SuccessResponseDto,
  ErrorResponseDto,
} from '../interfaces/api-response.interface.js';

/**
 * Decorator to wrap response DTO inside the standard Baseer SuccessResponse envelope
 */
export function ApiOkEnvelope<T extends Type<unknown>>(
  dataDto: T,
  isArray = false,
) {
  return applyDecorators(
    ApiExtraModels(SuccessResponseDto, dataDto),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Successful operation',
      schema: {
        allOf: [
          { $ref: getSchemaPath(SuccessResponseDto) },
          {
            properties: {
              data: isArray
                ? {
                    type: 'array',
                    items: { $ref: getSchemaPath(dataDto) },
                  }
                : {
                    $ref: getSchemaPath(dataDto),
                  },
            },
          },
        ],
      },
    }),
  );
}

/**
 * Decorator to generate Swagger OpenAPI error responses grouped by HTTP status
 */
export function ApiErrorExamples(...codes: AppErrorCode[]) {
  const allCodes = Array.from(
    new Set([...codes, AppErrorCode.INTERNAL_SERVER_ERROR]),
  );

  const statusMap = new Map<number, AppErrorCode[]>();
  for (const code of allCodes) {
    const status = ERROR_HTTP_STATUS[code] || HttpStatus.INTERNAL_SERVER_ERROR;
    if (!statusMap.has(status)) {
      statusMap.set(status, []);
    }
    statusMap.get(status)!.push(code);
  }

  const decorators = [ApiExtraModels(ErrorResponseDto)];

  for (const [status, groupCodes] of statusMap.entries()) {
    const examplesObj: Record<string, any> = {};
    for (const code of groupCodes) {
      examplesObj[code] = {
        summary: code,
        value: {
          success: false,
          statusCode: status,
          errorCode: code,
          message:
            ERROR_MESSAGES[code] || 'حدث خطأ أثناء معالجة الطلب',
          ...(code === AppErrorCode.VALIDATION_FAILED
            ? { details: ['field must be a string'] }
            : {}),
          timestamp: '2026-11-06T14:30:00.000Z',
        },
      };
    }

    decorators.push(
      ApiResponse({
        status,
        description: `Error responses for HTTP ${status}`,
        content: {
          'application/json': {
            schema: { $ref: getSchemaPath(ErrorResponseDto) },
            examples: examplesObj,
          },
        },
      }),
    );
  }

  return applyDecorators(...decorators);
}
