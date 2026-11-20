import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VoiceCommandDto {
  @ApiProperty({
    example: 'شوفلي الورقة دي مكتوب فيها إيه',
    description:
      'Colloquial Egyptian Arabic transcript. Fake test triggers: send "unrecognized" or "unknown" for ERR_INTENT_NOT_RECOGNIZED, "lowconfidence" for ERR_LOW_CONFIDENCE, or "timeout" for ERR_REQUEST_TIMEOUT.',
  })
  @IsString({ message: 'userSpeech must be a string' })
  @IsNotEmpty({ message: 'userSpeech is required' })
  @MaxLength(500, { message: 'userSpeech cannot exceed 500 characters' })
  userSpeech: string;
}
