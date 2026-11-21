import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { AppErrorCode } from '../constants/error-codes';

/**
 * Guard that restricts access exclusively to registered (non-guest) users.
 */
@Injectable()
export class RegisteredUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new AppException(AppErrorCode.UNAUTHORIZED);
    }

    if (user.isGuest) {
      throw new AppException(
        AppErrorCode.FORBIDDEN,
        'هذه الميزة تتطلب تسجيل حساب مستخدم مسجل ولا يمكن استخدامها بحساب ضيف',
      );
    }

    return true;
  }
}
