import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ALLOWED_VOICE_LANGUAGES, DEFAULT_VOICE_LANGUAGE } from '../voice.constants';

export class VoiceTranscribeDto {
  @ApiPropertyOptional({
    example: 'ar-EG',
    enum: ALLOWED_VOICE_LANGUAGES,
    default: DEFAULT_VOICE_LANGUAGE,
    description: 'Spoken language/dialect locale of the audio file',
  })
  @IsOptional()
  @IsIn(ALLOWED_VOICE_LANGUAGES, { message: 'Language must be ar-EG or en-US' })
  language?: string = DEFAULT_VOICE_LANGUAGE;
}
