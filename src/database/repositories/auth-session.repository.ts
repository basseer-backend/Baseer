import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthSession } from '../entities/auth-session.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class AuthSessionRepository extends DatabaseRepository<AuthSession> {
  constructor(
    @InjectRepository(AuthSession)
    protected readonly model: Repository<AuthSession>,
  ) {
    super(model);
  }
}
