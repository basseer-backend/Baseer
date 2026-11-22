import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskExecution } from '../../../database/entities/task-execution.entity';

export class TaskResponseDto {
  @ApiProperty({
    description: 'Unique execution identifier (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Client provided idempotency identifier (UUID)',
    example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  })
  clientTaskId: string;

  @ApiProperty({
    description: 'Unique trace identifier for this request execution (UUID)',
    example: '987fcdeb-51a2-43f7-9012-3456789abcde',
  })
  requestId: string;

  @ApiProperty({
    description: 'Type of task executed',
    example: 'OCR_DOCUMENT',
  })
  taskType: string;

  @ApiProperty({
    enum: TaskStatus,
    description: 'Current status of the task execution',
    example: TaskStatus.PENDING,
  })
  status: TaskStatus;

  @ApiProperty({
    description: 'Execution processing duration in milliseconds',
    example: null,
    nullable: true,
    type: Number,
  })
  processingTimeMs: number | null;

  @ApiProperty({
    description: 'Error code if the task execution failed',
    example: null,
    nullable: true,
    type: String,
  })
  errorCode: string | null;

  @ApiProperty({
    description: 'Timestamp when the task execution was created',
    example: '2026-11-22T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description:
      'Timestamp when the task execution completed, failed, or was cancelled',
    example: null,
    nullable: true,
    type: Date,
  })
  completedAt: Date | null;

  static fromEntity(entity: TaskExecution): TaskResponseDto {
    const dto = new TaskResponseDto();
    dto.id = entity.id;
    dto.clientTaskId = entity.clientTaskId;
    dto.requestId = entity.requestId;
    dto.taskType = entity.taskType;
    dto.status = entity.status as TaskStatus;
    dto.processingTimeMs = entity.processingTimeMs;
    dto.errorCode = entity.errorCode;
    dto.createdAt = entity.createdAt;
    dto.completedAt = entity.completedAt;
    return dto;
  }
}
