import { ApiProperty } from '@nestjs/swagger';
import { UserProfileDto } from './user-profile.dto';
import { TokenBundleDto } from './token-bundle.dto';

export class AuthResponseDto {
  @ApiProperty({ type: () => UserProfileDto })
  user: UserProfileDto;

  @ApiProperty({ type: () => TokenBundleDto })
  tokens: TokenBundleDto;
}
