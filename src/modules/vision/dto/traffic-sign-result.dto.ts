import { ApiProperty } from '@nestjs/swagger';

export class TrafficSignResultDto {
  @ApiProperty({
    example: 'Pedestrian Crossing',
    description: 'Traffic sign title or type',
  })
  signName: string;

  @ApiProperty({
    example: 'إشارة عبور مشاة، يمكنك العبور بحذر',
    description: 'Spoken safety advisory in Arabic',
  })
  spokenMeaning: string;

  @ApiProperty({
    example: 0.91,
    minimum: 0,
    maximum: 1,
    description: 'Sign detection confidence score (0 to 1)',
  })
  confidence: number;
}
