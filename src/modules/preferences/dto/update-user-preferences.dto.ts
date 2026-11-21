import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum HapticIntensity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export class UpdateUserPreferencesDto {
  @ApiPropertyOptional({
    example: 1.25,
    minimum: 0.5,
    maximum: 3.0,
    description: 'Speech rate for TTS announcements between 0.50 and 3.00',
  })
  @IsOptional()
  @IsNumber({}, { message: 'speechRate must be a valid number' })
  @Min(0.5, { message: 'speechRate must be at least 0.50' })
  @Max(3.0, { message: 'speechRate must not exceed 3.00' })
  @Type(() => Number)
  speechRate?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Enable high contrast color scheme on mobile application',
  })
  @IsOptional()
  @IsBoolean({ message: 'highContrastEnabled must be a boolean' })
  highContrastEnabled?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Enable haptic vibration feedback for warnings and obstacles',
  })
  @IsOptional()
  @IsBoolean({ message: 'hapticEnabled must be a boolean' })
  hapticEnabled?: boolean;

  @ApiPropertyOptional({
    enum: HapticIntensity,
    example: HapticIntensity.MEDIUM,
    description: "Vibration feedback intensity: 'low', 'medium', or 'high'",
  })
  @IsOptional()
  @IsEnum(HapticIntensity, {
    message: "hapticIntensity must be one of: 'low', 'medium', 'high'",
  })
  hapticIntensity?: HapticIntensity;

  @ApiPropertyOptional({
    example: false,
    description: 'Enable voice wake word detection (Hey Baseer / بصير)',
  })
  @IsOptional()
  @IsBoolean({ message: 'voiceWakeWordEnabled must be a boolean' })
  voiceWakeWordEnabled?: boolean;
}
