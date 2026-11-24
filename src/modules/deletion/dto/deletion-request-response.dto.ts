import { ApiProperty } from '@nestjs/swagger';

export class DeletionRequestResponseDto {
  @ApiProperty({
    description: 'Unique deletion request identifier (receipt ID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Current lifecycle status of the deletion request',
    example: 'ACCEPTED',
    enum: ['ACCEPTED', 'PROCESSING', 'COMPLETED', 'FAILED'],
  })
  status: string;

  @ApiProperty({
    description:
      'High-entropy capability secret required to check deletion status. Returned ONLY once upon creation. Store securely on client.',
    example: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    nullable: true,
  })
  capability: string | null;

  @ApiProperty({
    description: 'Timestamp when the deletion request was accepted into the system',
    example: '2026-11-22T20:00:00.000Z',
  })
  acceptedAt: Date;
}
