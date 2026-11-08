import { ApiProperty } from '@nestjs/swagger';

export class DestinationDto {
  @ApiProperty({
    example: 'dept-affairs',
    description: 'Unique identifier of destination point of interest',
  })
  id: string;

  @ApiProperty({
    example: 'مكتب شؤون الطلبة',
    description: 'Human-readable Arabic destination name',
  })
  name: string;
}
