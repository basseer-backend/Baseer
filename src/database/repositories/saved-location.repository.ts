import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedLocation } from '../entities/saved-location.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class SavedLocationRepository extends DatabaseRepository<SavedLocation> {
  constructor(
    @InjectRepository(SavedLocation)
    protected readonly model: Repository<SavedLocation>,
  ) {
    super(model);
  }
}
