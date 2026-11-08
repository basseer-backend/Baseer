import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSession } from '../../database/entities/auth-session.entity';
import { AuthSessionRepository } from '../../database/repositories/auth-session.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuthSession])],
  controllers: [AuthController],
  providers: [AuthService, AuthSessionRepository],
  exports: [AuthSessionRepository],
})
export class AuthModule {}
