import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskExecution } from '../../database/entities/task-execution.entity';
import { TaskModelRun } from '../../database/entities/task-model-run.entity';
import { TaskExecutionRepository } from '../../database/repositories/task-execution.repository';
import { TaskModelRunRepository } from '../../database/repositories/task-model-run.repository';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [TypeOrmModule.forFeature([TaskExecution, TaskModelRun])],
  controllers: [TasksController],
  providers: [TasksService, TaskExecutionRepository, TaskModelRunRepository],
  exports: [TaskExecutionRepository, TaskModelRunRepository],
})
export class TasksModule {}
