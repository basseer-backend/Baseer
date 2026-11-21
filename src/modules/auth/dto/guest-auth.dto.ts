import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class GuestAuthDto {
  @ApiPropertyOptional({
    example: 'ar-EG',
    enum: ['ar-EG', 'en-US'],
    default: 'ar-EG',
    description: 'Preferred interface language for guest user',
  })
  @IsOptional()
  @IsIn(['ar-EG', 'en-US'], {
    message: 'اللغة المفضلة يجب أن تكون إما ar-EG أو en-US',
  })
  preferredLanguage?: 'ar-EG' | 'en-US';

  @ApiPropertyOptional({
    example: 'flutter',
    description: 'Device operating platform',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  devicePlatform?: string;
}
