import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class UserRepository extends DatabaseRepository<User> {
  constructor(
    @InjectRepository(User)
    protected readonly model: Repository<User>,
  ) {
    super(model);
  }
}
