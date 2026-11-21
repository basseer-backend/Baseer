import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ example: '11111111-1111-1111-1111-111111111111' })
  id: string;

  @ApiProperty({ example: true, description: 'Whether the user is an anonymous guest' })
  isGuest: boolean;

  @ApiProperty({ example: 'ar-EG', enum: ['ar-EG', 'en-US'], description: 'User preferred language' })
  preferredLanguage: string;

  @ApiProperty({ example: '2026-11-16T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-11-16T00:00:00.000Z' })
  updatedAt: string;
}
