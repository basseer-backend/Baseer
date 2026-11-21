import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ConsentType {
  CLOUD_AI = 'cloud_ai',
  DIAGNOSTICS = 'diagnostics',
  PRIVACY_POLICY = 'privacy_policy',
}

export class ConsentItemDto {
  @ApiProperty({
    enum: ConsentType,
    example: ConsentType.CLOUD_AI,
    description: "Consent category: 'cloud_ai', 'diagnostics', or 'privacy_policy'",
  })
  @IsEnum(ConsentType, {
    message: "consentType must be one of: 'cloud_ai', 'diagnostics', 'privacy_policy'",
  })
  consentType: ConsentType;

  @ApiProperty({
    example: true,
    description: 'Whether the user explicitly accepted or rejected this consent',
  })
  @IsBoolean({ message: 'accepted must be a boolean' })
  accepted: boolean;

  @ApiProperty({
    example: '1.0',
    maxLength: 32,
    description: 'Version identifier of the policy the user responded to',
  })
  @IsString({ message: 'policyVersion must be a string' })
  @IsNotEmpty({ message: 'policyVersion cannot be empty' })
  @MaxLength(32, { message: 'policyVersion cannot exceed 32 characters' })
  policyVersion: string;
}

export class UpdateUserConsentsDto {
  @ApiProperty({
    type: [ConsentItemDto],
    description: 'List of consent records to save atomically',
  })
  @IsArray({ message: 'consents must be an array' })
  @ArrayMinSize(1, { message: 'consents array must contain at least 1 item' })
  @ValidateNested({ each: true })
  @Type(() => ConsentItemDto)
  consents: ConsentItemDto[];
}
