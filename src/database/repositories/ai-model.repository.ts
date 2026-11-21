import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiModel, AiModelStatus } from '../entities/ai-model.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class AiModelRepository extends DatabaseRepository<AiModel> {
  constructor(
    @InjectRepository(AiModel)
    protected readonly model: Repository<AiModel>,
  ) {
    super(model);
  }

  async findByKey(modelKey: string): Promise<AiModel | null> {
    return this.model.findOne({
      where: { modelKey },
      relations: ['versions'],
    });
  }

  async findByTaskType(taskType: string): Promise<AiModel[]> {
    return this.model.find({
      where: [{ taskType }, { taskFamily: taskType }],
      order: { createdAt: 'ASC' },
    });
  }

  async findPlanned(): Promise<AiModel[]> {
    return this.model.find({
      where: { status: AiModelStatus.PLANNED },
      order: { createdAt: 'ASC' },
    });
  }

  async upsertModel(data: Partial<AiModel>): Promise<AiModel> {
    if (!data.modelKey) {
      throw new Error('modelKey is required to upsert an AI model');
    }

    const existing = await this.findByKey(data.modelKey);
    if (existing) {
      Object.assign(existing, data);
      existing.updatedAt = new Date();
      return this.model.save(existing);
    }

    const entity = this.model.create(data);
    return this.model.save(entity);
  }
}
