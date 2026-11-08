import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VoiceCommandDto {
  @ApiProperty({
    example: 'شوفلي الورقة دي مكتوب فيها إيه',
    description:
      'Colloquial Egyptian Arabic transcript. Fake test trigger: send "unrecognized" or unsupported words to test ERR_INTENT_NOT_RECOGNIZED.',
  })
  @IsString({ message: 'userSpeech must be a string' })
  @IsNotEmpty({ message: 'userSpeech is required' })
  @MaxLength(500, { message: 'userSpeech cannot exceed 500 characters' })
  userSpeech: string;
}
