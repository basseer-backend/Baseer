import { ApiProperty } from '@nestjs/swagger';

export class VoiceTranscribeResultDto {
  @ApiProperty({
    example: 'عايز أروح مكتب العميد',
    description: 'Transcribed Arabic or English text from the audio input',
  })
  transcript: string;

  @ApiProperty({
    example: 'ar-EG',
    description: 'Detected or requested speech language locale',
  })
  language: string;

  @ApiProperty({
    example: 0.96,
    nullable: true,
    description: 'Transcription confidence score between 0 and 1, or null if unavailable',
  })
  confidence: number | null;
}
