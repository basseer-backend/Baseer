import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class VoiceCommandDto {
  @ApiProperty({
    example: 'شوفلي الورقة دي مكتوب فيها إيه',
    description: 'Recognized Arabic speech transcript captured on mobile device',
  })
  @IsString({ message: 'userSpeech must be a string' })
  @IsNotEmpty({ message: 'userSpeech is required' })
  @MaxLength(500, { message: 'userSpeech cannot exceed 500 characters' })
  userSpeech: string;

  @ApiPropertyOptional({
    example: 'ar-EG',
    enum: ['ar-EG', 'en-US'],
    default: 'ar-EG',
    description: 'Spoken language/dialect locale of the speech input',
  })
  @IsOptional()
  @IsIn(['ar-EG', 'en-US'], { message: 'Language must be ar-EG or en-US' })
  language?: string = 'ar-EG';
}
