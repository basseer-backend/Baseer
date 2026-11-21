import {
  Controller,
  Get,
  Put,
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
import { PreferencesService } from './preferences.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import {
  ApiOkEnvelope,
  ApiErrorExamples,
} from '../../common/decorators/swagger.decorator';
import { AppErrorCode } from '../../common/constants/error-codes';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import { UserPreferencesResponseDto } from './dto/user-preferences-response.dto';
import { UpdateUserConsentsDto } from './dto/update-user-consents.dto';
import { UserConsentsResponseDto } from './dto/user-consents-response.dto';

@ApiTags('User Preferences & Consents')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get('preferences')
  @ApiOperation({
    summary: "Get authenticated user's accessibility preferences",
    description:
      'Returns current TTS speech rate, contrast, haptic feedback, and wake-word settings. Returns defaults if not yet configured.',
  })
  @ApiOkEnvelope(UserPreferencesResponseDto)
  @ApiErrorExamples(AppErrorCode.UNAUTHORIZED, AppErrorCode.NOT_FOUND)
  async getPreferences(
    @CurrentUserId() userId: string,
  ): Promise<UserPreferencesResponseDto> {
    return this.preferencesService.getPreferences(userId);
  }

  @Put('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update authenticated user's accessibility preferences",
    description:
      'Creates or partially updates speech rate, contrast, haptic feedback, and wake-word preferences.',
  })
  @ApiBody({ type: UpdateUserPreferencesDto })
  @ApiOkEnvelope(UserPreferencesResponseDto)
  @ApiErrorExamples(
    AppErrorCode.UNAUTHORIZED,
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.NOT_FOUND,
  )
  async updatePreferences(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponseDto> {
    return this.preferencesService.updatePreferences(userId, dto);
  }

  @Get('consents')
  @ApiOperation({
    summary: "Get authenticated user's privacy and data processing consents",
    description:
      'Returns the user consent choices for cloud AI, diagnostic analytics, and privacy policy versioning.',
  })
  @ApiOkEnvelope(UserConsentsResponseDto)
  @ApiErrorExamples(AppErrorCode.UNAUTHORIZED, AppErrorCode.NOT_FOUND)
  async getConsents(
    @CurrentUserId() userId: string,
  ): Promise<UserConsentsResponseDto> {
    return this.preferencesService.getConsents(userId);
  }

  @Put('consents')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Record or update authenticated user's consent choices",
    description:
      'Accepts or rejects consent categories in an atomic transaction. Enforces strict policy version tracking and non-inheritance across policy version upgrades. Note: Following the current relational schema design (user_preferences table), only the latest active consent state is stored per user; historical consent audit records require an append-only table.',
  })
  @ApiBody({ type: UpdateUserConsentsDto })
  @ApiOkEnvelope(UserConsentsResponseDto)
  @ApiErrorExamples(
    AppErrorCode.UNAUTHORIZED,
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.NOT_FOUND,
  )
  async updateConsents(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateUserConsentsDto,
  ): Promise<UserConsentsResponseDto> {
    return this.preferencesService.updateConsents(userId, dto);
  }
}
