import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckDto {
  @ApiProperty({
    example: 'ok',
    description: 'System health status',
  })
  status: string;

  @ApiProperty({
    example: 'Baseer API is healthy and operational',
    description: 'Status description message',
  })
  message: string;
}
