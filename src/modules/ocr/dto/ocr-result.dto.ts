import { ApiProperty } from '@nestjs/swagger';

export class OcrResultDto {
  @ApiProperty({
    example: 'en',
    description: 'Detected language code (e.g. "ar", "en")',
  })
  detectedLanguage: string;

  @ApiProperty({
    example: 'Panadol Extra 500mg - Take 2 tablets every 8 hours after meals.',
    description: 'Raw extracted text from the image',
  })
  extractedText: string;

  @ApiProperty({
    example: 'بنادول إكسترا 500 مجم - قرصين كل 8 ساعات بعد الأكل',
    description: 'Simplified Arabic spoken text tailored for text-to-speech',
  })
  arabicSimplifiedText: string;

  @ApiProperty({
    example: 0.96,
    minimum: 0,
    maximum: 1,
    description: 'OCR model confidence score (0 to 1)',
  })
  confidence: number;
}
