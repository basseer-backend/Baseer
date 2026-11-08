import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskExecution } from '../entities/task-execution.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class TaskExecutionRepository extends DatabaseRepository<TaskExecution> {
  constructor(
    @InjectRepository(TaskExecution)
    protected readonly model: Repository<TaskExecution>,
  ) {
    super(model);
  }
}
