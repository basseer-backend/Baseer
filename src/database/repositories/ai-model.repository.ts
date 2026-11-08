import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiModel } from '../entities/ai-model.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class AiModelRepository extends DatabaseRepository<AiModel> {
  constructor(
    @InjectRepository(AiModel)
    protected readonly model: Repository<AiModel>,
  ) {
    super(model);
  }
}
