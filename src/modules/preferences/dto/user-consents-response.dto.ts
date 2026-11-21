import { ApiProperty } from '@nestjs/swagger';
import { ConsentType } from './update-user-consents.dto';

export class UserConsentItemResponseDto {
  @ApiProperty({
    enum: ConsentType,
    example: ConsentType.CLOUD_AI,
    description: 'Consent type identifier',
  })
  consentType: ConsentType;

  @ApiProperty({
    example: true,
    description: 'Whether this consent is actively granted',
  })
  accepted: boolean;

  @ApiProperty({
    example: '1.0',
    nullable: true,
    description: 'Policy version corresponding to this consent response',
  })
  policyVersion: string | null;

  @ApiProperty({
    example: '2026-11-15T20:00:00.000Z',
    nullable: true,
    description: 'Timestamp when this consent was recorded or updated',
  })
  updatedAt: string | null;
}

export class UserConsentsResponseDto {
  @ApiProperty({
    example: '1.0',
    nullable: true,
    description: 'Latest policy version consented or evaluated by the user',
  })
  policyVersion: string | null;

  @ApiProperty({
    example: '2026-11-15T20:00:00.000Z',
    nullable: true,
    description: 'Timestamp when consent choices last changed',
  })
  updatedAt: string | null;

  @ApiProperty({
    type: [UserConsentItemResponseDto],
    description: 'Array of consent statuses per category',
  })
  consents: UserConsentItemResponseDto[];
}
