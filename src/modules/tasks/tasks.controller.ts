import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AppErrorCode } from '../../common/constants/error-codes';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import {
  ApiCreatedEnvelope,
  ApiErrorExamples,
  ApiOkEnvelope,
} from '../../common/decorators/swagger.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { TasksService } from './tasks.service';

@ApiTags('Tasks')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({
    summary: 'Create or retrieve task execution (Idempotent)',
    description:
      'Creates a new task execution or returns an existing one if the clientTaskId matches. Returns 201 Created on new task, or 200 OK on duplicate request.',
  })
  @ApiCreatedEnvelope(TaskResponseDto)
  @ApiOkEnvelope(TaskResponseDto)
  @ApiErrorExamples(
    AppErrorCode.VALIDATION_FAILED,
    AppErrorCode.UNAUTHORIZED,
    AppErrorCode.BAD_REQUEST,
  )
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateTaskDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TaskResponseDto> {
    const { task, created } = await this.tasksService.createOrGet(userId, dto);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return TaskResponseDto.fromEntity(task);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get task execution details',
    description:
      'Retrieves the status, temporary results, execution metadata, and timings for a task belonging to the authenticated user from Redis (2-hour TTL). Never falls back to persistent storage.',
  })
  @ApiOkEnvelope(TaskResponseDto)
  @ApiErrorExamples(
    AppErrorCode.UNAUTHORIZED,
    AppErrorCode.NOT_FOUND,
    AppErrorCode.SERVICE_UNAVAILABLE,
  )
  async findOne(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksService.getForUser(userId, id);
    return TaskResponseDto.fromRedisState(task);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel task execution',
    description:
      'Atomically cancels an active task execution in Redis. Safe to repeat if already cancelled. Returns 400 Bad Request if task is completed or failed. Note: cancellation sets the authoritative task state to CANCELLED and prevents future result commits; because the current OCR implementation is synchronous mock-based without a background worker queue, no underlying OS process termination is performed.',
  })
  @ApiOkEnvelope(TaskResponseDto)
  @ApiErrorExamples(
    AppErrorCode.UNAUTHORIZED,
    AppErrorCode.NOT_FOUND,
    AppErrorCode.BAD_REQUEST,
    AppErrorCode.SERVICE_UNAVAILABLE,
  )
  async cancel(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksService.cancel(userId, id);
    return TaskResponseDto.fromRedisState(task);
  }
}
