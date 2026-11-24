import { ApiProperty } from '@nestjs/swagger';

export class DeletionStatusResponseDto {
  @ApiProperty({
    description: 'Unique deletion request identifier (receipt ID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Current status of the deletion request',
    example: 'COMPLETED',
    enum: ['ACCEPTED', 'PROCESSING', 'COMPLETED', 'FAILED'],
  })
  status: string;

  @ApiProperty({
    description: 'Granular status of individual deletion stages',
    example: { revoke_sessions: 'COMPLETED' },
    type: 'object',
    additionalProperties: true,
  })
  stageStatus: Record<string, unknown>;

  @ApiProperty({
    description: 'Timestamp when the deletion request was accepted',
    example: '2026-11-22T20:00:00.000Z',
  })
  acceptedAt: Date;

  @ApiProperty({
    description: 'Timestamp when account deletion was fully completed',
    example: '2026-11-22T20:00:05.000Z',
    nullable: true,
  })
  completedAt: Date | null;

  @ApiProperty({
    description: 'Non-sensitive failure code if the request failed',
    example: null,
    nullable: true,
  })
  failureCode: string | null;
}
