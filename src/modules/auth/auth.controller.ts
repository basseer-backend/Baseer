import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import {
  ApiOkEnvelope,
  ApiCreatedEnvelope,
  ApiErrorExamples,
} from '../../common/decorators/swagger.decorator';
import { AppErrorCode } from '../../common/constants/error-codes';
import {
  GuestAuthDto,
  RefreshTokenDto,
  LogoutDto,
  AuthResponseDto,
  TokenBundleDto,
  UserProfileDto,
} from './dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('guest')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create anonymous guest session',
    description:
      'Creates a user and issues scoped guest access & refresh tokens with session persistence for assistive access.',
  })
  @ApiBody({ type: GuestAuthDto })
  @ApiCreatedEnvelope(AuthResponseDto)
  @ApiErrorExamples(AppErrorCode.VALIDATION_FAILED)
  guest(@Body() dto: GuestAuthDto): Promise<AuthResponseDto> {
    return this.authService.guest(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Verifies refresh token signature and session, enforces token rotation, detects reuse attacks, and issues new tokens.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkEnvelope(TokenBundleDto)
  @ApiErrorExamples(
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.UNAUTHORIZED,
  )
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenBundleDto> {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Logout user session',
    description:
      'Revokes the specified refresh token or all active sessions for the authenticated user.',
  })
  @ApiBody({ type: LogoutDto, required: false })
  @ApiErrorExamples(AppErrorCode.UNAUTHORIZED)
  logout(
    @CurrentUserId() userId: string,
    @Body() dto?: LogoutDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.logout(userId, dto);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get current authenticated user profile',
    description:
      'Returns the safe profile of the currently authenticated user matching the Baseer database schema.',
  })
  @ApiOkEnvelope(UserProfileDto)
  @ApiErrorExamples(
    AppErrorCode.UNAUTHORIZED,
    AppErrorCode.NOT_FOUND,
  )
  getMe(@CurrentUserId() userId: string): Promise<UserProfileDto> {
    return this.authService.getMe(userId);
  }
}
