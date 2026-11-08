import { ApiProperty } from '@nestjs/swagger';
import { VoiceIntent, MobileAction } from './voice-enums.js';

export class VoiceCommandResultDto {
  @ApiProperty({
    example: 'شوفلي الورقة دي مكتوب فيها إيه',
    description: 'Original user speech query',
  })
  userInput: string;

  @ApiProperty({
    enum: VoiceIntent,
    example: VoiceIntent.READ_DOCUMENT,
    description: 'Classified user intent',
  })
  detectedIntent: VoiceIntent;

  @ApiProperty({
    example: 0.94,
    description: 'Confidence score of intent classification (0 to 1)',
  })
  confidence: number;

  @ApiProperty({
    example: 'تمام، وجه الكاميرا نحو الورقة وسأقرأها لك حالاً',
    description: 'Spoken confirmation in Egyptian Arabic for text-to-speech',
  })
  spokenResponse: string;

  @ApiProperty({
    enum: MobileAction,
    example: MobileAction.OPEN_CAMERA_OCR,
    description: 'Specific mobile screen or camera mode to automatically trigger',
  })
  actionToTriggerOnMobile: MobileAction;
}
