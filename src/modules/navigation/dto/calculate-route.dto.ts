import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CalculateRouteDto {
  @ApiProperty({
    example: 'QR_ENTRANCE_01',
    description:
      'Current scanned QR code identifier. Allowed QR codes: QR_ENTRANCE_01, QR_HALLWAY_A, QR_ELEVATOR_01, QR_STAIRS_EAST. Fake test triggers: "invalid" -> ERR_INVALID_QR_CODE, "notfound" -> ERR_QR_NOT_FOUND.',
  })
  @IsString({ message: 'currentQrCode must be a string' })
  @IsNotEmpty({ message: 'currentQrCode is required' })
  currentQrCode: string;

  @ApiProperty({
    example: 'dept-affairs',
    description:
      'Target destination ID (from GET /destinations). Fake test triggers: "invalid" -> ERR_DESTINATION_NOT_FOUND, "routeerror" -> ERR_ROUTE_CALCULATION_FAILED.',
  })
  @IsString({ message: 'destinationId must be a string' })
  @IsNotEmpty({ message: 'destinationId is required' })
  destinationId: string;
}
