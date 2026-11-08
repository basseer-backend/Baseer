import { ApiProperty } from '@nestjs/swagger';

export class SceneDescriptionDto {
  @ApiProperty({
    example:
      'أمامك طاولة خشبية عليها زجاجة ماء ومفتاح، وعلى يمينك مقعد فارغ',
    description: 'Natural Arabic scene narration for text-to-speech',
  })
  description: string;

  @ApiProperty({
    example: ['table', 'bottle', 'key', 'chair'],
    description: 'List of detected object labels',
  })
  detectedObjects: string[];

  @ApiProperty({
    example: 0.92,
    minimum: 0,
    maximum: 1,
    description: 'Overall vision detection confidence score (0 to 1)',
  })
  confidence: number;
}
