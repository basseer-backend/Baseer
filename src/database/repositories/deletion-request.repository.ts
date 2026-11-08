import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeletionRequest } from '../entities/deletion-request.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class DeletionRequestRepository extends DatabaseRepository<DeletionRequest> {
  constructor(
    @InjectRepository(DeletionRequest)
    protected readonly model: Repository<DeletionRequest>,
  ) {
    super(model);
  }
}
