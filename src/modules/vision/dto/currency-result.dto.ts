import { ApiProperty } from '@nestjs/swagger';

export enum EgyptianBanknote {
  FIVE = 5,
  TEN = 10,
  TWENTY = 20,
  FIFTY = 50,
  ONE_HUNDRED = 100,
  TWO_HUNDRED = 200,
}

export class CurrencyResultDto {
  @ApiProperty({
    enum: EgyptianBanknote,
    example: 50,
    description:
      'Banknote numerical denomination value (5, 10, 20, 50, 100, 200)',
  })
  denomination: number;

  @ApiProperty({
    example: 'EGP',
    description: 'Currency ISO code',
  })
  currency: string;

  @ApiProperty({
    example: 'خمسون جنيهاً مصرياً',
    description: 'Arabic spoken announcement',
  })
  spokenAnnouncement: string;

  @ApiProperty({
    example: 'New Banknote',
    description: 'Physical condition or banknote series note',
  })
  condition: string;

  @ApiProperty({
    example: 0.98,
    minimum: 0,
    maximum: 1,
    description: 'Classification confidence score (0 to 1)',
  })
  confidence: number;
}
