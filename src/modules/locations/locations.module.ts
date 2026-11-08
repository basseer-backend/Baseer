import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavedLocation } from '../../database/entities/saved-location.entity';
import { SavedLocationRepository } from '../../database/repositories/saved-location.repository';

@Module({
  imports: [TypeOrmModule.forFeature([SavedLocation])],
  providers: [SavedLocationRepository],
  exports: [SavedLocationRepository],
})
export class LocationsModule {}
