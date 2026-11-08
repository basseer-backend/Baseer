import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPreference } from '../../database/entities/user-preference.entity';
import { UserPreferenceRepository } from '../../database/repositories/user-preference.repository';

@Module({
  imports: [TypeOrmModule.forFeature([UserPreference])],
  providers: [UserPreferenceRepository],
  exports: [UserPreferenceRepository],
})
export class PreferencesModule {}
