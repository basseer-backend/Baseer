import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VoiceIntent, MobileAction } from './voice-enums';
import { AiAgentEntities } from '../clients/ai-agent.interface';

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
    type: Number,
    example: 0.94,
    nullable: true,
    description:
      'Confidence score of intent classification (0 to 1), or null if model does not supply genuine score',
  })
  confidence: number | null;

  @ApiProperty({
    example: 'تمام، وجه الكاميرا نحو الورقة وسأقرأها لك حالاً',
    description: 'Spoken confirmation in Egyptian Arabic for text-to-speech',
  })
  spokenResponse: string;

  @ApiProperty({
    enum: MobileAction,
    example: MobileAction.OPEN_CAMERA_OCR,
    nullable: true,
    description:
      'Specific mobile camera or screen mode to automatically trigger. Null when command requires user clarification.',
  })
  actionToTriggerOnMobile: MobileAction | null;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'Indicates whether the assistant requires verbal clarification from the user before executing an action',
  })
  requiresClarification?: boolean;

  @ApiPropertyOptional({
    example: { target: 'document' },
    description: 'Extracted semantic entities or missing slot indicators',
  })
  entities?: AiAgentEntities;
}
