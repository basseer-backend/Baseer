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
      'Retrieves the status, execution metadata, and timings for a task belonging to the authenticated user.',
  })
  @ApiOkEnvelope(TaskResponseDto)
  @ApiErrorExamples(AppErrorCode.UNAUTHORIZED, AppErrorCode.NOT_FOUND)
  async findOne(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksService.getForUser(userId, id);
    return TaskResponseDto.fromEntity(task);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel task execution',
    description:
      'Cancels an active task execution. Safe to repeat if already cancelled. Returns 400 Bad Request if task is completed or failed.',
  })
  @ApiOkEnvelope(TaskResponseDto)
  @ApiErrorExamples(
    AppErrorCode.UNAUTHORIZED,
    AppErrorCode.NOT_FOUND,
    AppErrorCode.BAD_REQUEST,
  )
  async cancel(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksService.cancel(userId, id);
    return TaskResponseDto.fromEntity(task);
  }
}
