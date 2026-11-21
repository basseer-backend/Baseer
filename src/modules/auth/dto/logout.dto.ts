import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Refresh token to revoke. If omitted, revokes current session.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
