import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Current valid refresh token',
  })
  @IsString({ message: 'رمز التحديث يجب أن يكون نصياً' })
  @IsNotEmpty({ message: 'رمز التحديث مطلوب' })
  refreshToken: string;

  @ApiPropertyOptional({
    example: 'android',
    description: 'Device operating platform',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  devicePlatform?: string;
}
