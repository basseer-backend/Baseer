import { ApiProperty } from '@nestjs/swagger';

export class ColorResultDto {
  @ApiProperty({
    example: 'أزرق داكن',
    description: 'Detected color name in Arabic',
  })
  colorNameArabic: string;

  @ApiProperty({
    example: 'Dark Blue',
    description: 'Detected color name in English',
  })
  colorNameEnglish: string;

  @ApiProperty({
    example: '#002366',
    description: 'Hex color code',
  })
  hexCode: string;

  @ApiProperty({
    example: 'قد تتأثر دقة اللون بإضاءة الغرفة الحالية',
    description: 'Lighting warning or environmental note',
  })
  disclaimer: string;

  @ApiProperty({
    example: 0.95,
    minimum: 0,
    maximum: 1,
    description: 'Color detection confidence score (0 to 1)',
  })
  confidence: number;
}
