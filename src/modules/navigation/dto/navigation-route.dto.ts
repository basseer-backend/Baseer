import { ApiProperty } from '@nestjs/swagger';

export class NavigationRouteDto {
  @ApiProperty({
    example: 'المدخل الرئيسي - بوابة رقم 1',
    description: 'Human-readable starting point name detected from QR code',
  })
  startLocation: string;

  @ApiProperty({
    example: 'مكتب شؤون الطلبة',
    description: 'Human-readable Arabic destination name',
  })
  targetDestination: string;

  @ApiProperty({
    example: 'dept-affairs',
    description: 'Target destination unique identifier',
  })
  destinationId: string;

  @ApiProperty({
    example: 30,
    description: 'Estimated distance in meters to target destination',
  })
  estimatedDistanceMeters: number;

  @ApiProperty({
    example: 3,
    description:
      'عدد الخطوات الإرشادية في المسار (Number of instructional guidance steps in route)',
  })
  totalSteps: number;

  @ApiProperty({
    example: [
      'تحرك للأمام 10 خطوات مستقيماً',
      'استدر يميناً عند الممر الرئيسي',
      'وجهتك هي الباب الثاني على يسارك (شؤون الطلبة)',
    ],
    description: 'Sequential voice guidance instructions in Arabic',
  })
  voiceInstructions: string[];
}
