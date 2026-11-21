import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { AuthSession } from '../../database/entities/auth-session.entity';
import { UserPreference } from '../../database/entities/user-preference.entity';
import { UserRepository } from '../../database/repositories/user.repository';
import { AuthSessionRepository } from '../../database/repositories/auth-session.repository';
import { UserPreferenceRepository } from '../../database/repositories/user-preference.repository';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RegisteredUserGuard } from '../../common/guards/registered-user.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, AuthSession, UserPreference])],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserRepository,
    AuthSessionRepository,
    UserPreferenceRepository,
    JwtAuthGuard,
    RegisteredUserGuard,
  ],
  exports: [
    AuthService,
    UserRepository,
    AuthSessionRepository,
    JwtAuthGuard,
    RegisteredUserGuard,
  ],
})
export class AuthModule {}
