import { ApiProperty } from '@nestjs/swagger';

export enum HapticPattern {
  NONE = 'NONE',
  LIGHT_VIBRATION = 'LIGHT_VIBRATION',
  STRONG_VIBRATION = 'STRONG_VIBRATION',
}

export class ObstacleResultDto {
  @ApiProperty({
    example: true,
    description: 'Whether an active proximity hazard is detected',
  })
  hazardDetected: boolean;

  @ApiProperty({
    example: 'درج / سلم هابط',
    description: 'Type or classification of detected obstacle in Arabic',
    required: false,
  })
  obstacleType?: string;

  @ApiProperty({
    example: 1.2,
    description: 'Estimated distance in meters to obstacle',
    required: false,
  })
  distanceMeters?: number;

  @ApiProperty({
    enum: HapticPattern,
    example: HapticPattern.STRONG_VIBRATION,
    description: 'Recommended mobile haptic vibration feedback pattern',
  })
  hapticAlertPattern: HapticPattern;

  @ApiProperty({
    example: 'انتبه! أمامك درجات سلم على بعد خطوتين',
    description: 'Urgent spoken warning in Arabic',
  })
  spokenWarning: string;

  @ApiProperty({
    example: 0.93,
    minimum: 0,
    maximum: 1,
    description: 'Obstacle detection confidence score (0 to 1)',
  })
  confidence: number;
}
