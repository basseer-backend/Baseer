import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { AppErrorCode } from '../constants/error-codes';

/**
 * Parameter decorator to extract the full authenticated user object or a specific field.
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new AppException(AppErrorCode.UNAUTHORIZED);
    }

    return data ? user[data] : user;
  },
);

/**
 * Parameter decorator to strictly extract the authenticated user's ID (UUID).
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const userId = request.user?.userId || request.user?.sub;

    if (!userId) {
      throw new AppException(AppErrorCode.UNAUTHORIZED);
    }

    return userId;
  },
);
