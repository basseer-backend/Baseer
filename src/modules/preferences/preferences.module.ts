import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPreference } from '../../database/entities/user-preference.entity';
import { User } from '../../database/entities/user.entity';
import { UserPreferenceRepository } from '../../database/repositories/user-preference.repository';
import { UsersModule } from '../users/users.module';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserPreference, User]),
    UsersModule,
  ],
  controllers: [PreferencesController],
  providers: [PreferencesService, UserPreferenceRepository],
  exports: [PreferencesService, UserPreferenceRepository],
})
export class PreferencesModule {}
