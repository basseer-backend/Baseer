import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../exceptions/app.exception';
import { AppErrorCode } from '../constants/error-codes';
import { verifyJwt } from '../helpers/jwt.helper';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Optional() private readonly reflector?: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector && typeof context.getHandler === 'function') {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) {
        return true;
      }
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new AppException(AppErrorCode.UNAUTHORIZED);
    }

    const [scheme, token] = authHeader.trim().split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
      throw new AppException(AppErrorCode.UNAUTHORIZED);
    }

    try {
      const payload = verifyJwt(token);

      // Refresh tokens must NEVER be accepted as access tokens
      if (payload.type && payload.type !== 'access') {
        throw new AppException(AppErrorCode.UNAUTHORIZED);
      }

      const userId = payload.sub || payload.userId;
      if (!userId) {
        throw new AppException(AppErrorCode.UNAUTHORIZED);
      }

      request.user = {
        userId,
        isGuest: payload.isGuest ?? true,
        ...payload,
      };

      return true;
    } catch {
      throw new AppException(AppErrorCode.UNAUTHORIZED);
    }
  }
}
