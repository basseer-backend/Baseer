import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeletionToken } from '../entities/deletion-token.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class DeletionTokenRepository extends DatabaseRepository<DeletionToken> {
  constructor(
    @InjectRepository(DeletionToken)
    protected readonly model: Repository<DeletionToken>,
  ) {
    super(model);
  }
}
