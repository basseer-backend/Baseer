import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreference } from '../entities/user-preference.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class UserPreferenceRepository extends DatabaseRepository<UserPreference> {
  constructor(
    @InjectRepository(UserPreference)
    protected readonly model: Repository<UserPreference>,
  ) {
    super(model);
  }

  override findById(id: string): Promise<UserPreference | null> {
    return super.findById(id, 'userId');
  }
}
