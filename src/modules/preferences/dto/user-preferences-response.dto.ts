import { ApiProperty } from '@nestjs/swagger';

export class UserPreferencesResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ example: 1.0, minimum: 0.5, maximum: 3.0 })
  speechRate: number;

  @ApiProperty({ example: false })
  highContrastEnabled: boolean;

  @ApiProperty({ example: true })
  hapticEnabled: boolean;

  @ApiProperty({ enum: ['low', 'medium', 'high'], example: 'medium' })
  hapticIntensity: string;

  @ApiProperty({ example: false })
  voiceWakeWordEnabled: boolean;

  @ApiProperty({ example: '2026-11-15T20:00:00.000Z' })
  updatedAt: string;
}
