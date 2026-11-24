import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AppErrorCode } from '../../common/constants/error-codes';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import {
  ApiCreatedEnvelope,
  ApiErrorExamples,
  ApiOkEnvelope,
} from '../../common/decorators/swagger.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  DELETION_CAPABILITY_HEADER,
  IDEMPOTENCY_KEY_HEADER,
} from './deletion.constants';
import { DeletionService } from './deletion.service';
import { CreateDeletionRequestDto } from './dto/create-deletion-request.dto';
import { DeletionRequestResponseDto } from './dto/deletion-request-response.dto';
import { DeletionStatusResponseDto } from './dto/deletion-status-response.dto';

@ApiTags('Account Deletion')
@Controller('deletion/requests')
export class DeletionController {
  constructor(private readonly deletionService: DeletionService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Request account deletion (Idempotent)',
    description:
      'Creates an asynchronous account deletion request. Requires JWT authentication and an Idempotency-Key header. Returns 201 Created on initial creation with a one-time capability secret, or 200 OK on duplicate replay (without secret).',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description:
      'Client-provided UUID or unique string ensuring idempotent request handling',
    required: true,
  })
  @ApiCreatedEnvelope(DeletionRequestResponseDto)
  @ApiOkEnvelope(DeletionRequestResponseDto)
  @ApiErrorExamples(
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.UNAUTHORIZED,
    AppErrorCode.BAD_REQUEST,
  )
  async create(
    @CurrentUserId() userId: string,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
    @Body() _dto?: CreateDeletionRequestDto,
  ): Promise<DeletionRequestResponseDto> {
    const result = await this.deletionService.createRequest(
      userId,
      idempotencyKey,
    );
    res.status(result.isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return result.data;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Check account deletion status (Capability-authenticated)',
    description:
      'Retrieves the status and stage progression of an account deletion request using the capability secret. Requires NO user session and continues working after the user record is purged.',
  })
  @ApiHeader({
    name: 'X-Deletion-Capability',
    description:
      'High-entropy capability secret issued upon deletion request acceptance',
    required: true,
  })
  @ApiOkEnvelope(DeletionStatusResponseDto)
  @ApiErrorExamples(
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.BAD_REQUEST,
    AppErrorCode.NOT_FOUND,
  )
  async getStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers(DELETION_CAPABILITY_HEADER) capability: string | undefined,
  ): Promise<DeletionStatusResponseDto> {
    return this.deletionService.getStatus(id, capability);
  }
}
