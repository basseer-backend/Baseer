import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskModelRun } from '../entities/task-model-run.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class TaskModelRunRepository extends DatabaseRepository<TaskModelRun> {
  constructor(
    @InjectRepository(TaskModelRun)
    protected readonly model: Repository<TaskModelRun>,
  ) {
    super(model);
  }
}
