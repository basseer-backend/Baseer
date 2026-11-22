import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({
    description: 'Unique client-generated idempotency identifier (UUID)',
    example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  })
  @IsUUID(undefined, { message: 'clientTaskId must be a valid UUID' })
  clientTaskId: string;

  @ApiProperty({
    description: 'Type of task to execute',
    example: 'OCR_DOCUMENT',
    maxLength: 48,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'taskType must be a string' })
  @IsNotEmpty({ message: 'taskType should not be empty' })
  @MaxLength(48, { message: 'taskType must not exceed 48 characters' })
  taskType: string;
}
