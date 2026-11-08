import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiModelVersion } from '../entities/ai-model-version.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class AiModelVersionRepository extends DatabaseRepository<AiModelVersion> {
  constructor(
    @InjectRepository(AiModelVersion)
    protected readonly model: Repository<AiModelVersion>,
  ) {
    super(model);
  }
}
