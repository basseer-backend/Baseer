import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { TaskModelRun } from './task-model-run.entity';
import { User } from './user.entity';

@Entity({ name: 'task_executions' })
@Unique('uq_task_executions_user_client_task', ['userId', 'clientTaskId'])
@Check('ck_task_executions_task_type', `char_length("task_type") > 0`)
@Check(
  'ck_task_executions_status',
  `"status" IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')`,
)
@Check(
  'ck_task_executions_processing_time',
  `"processing_time_ms" IS NULL OR "processing_time_ms" >= 0`,
)
@Check(
  'ck_task_executions_completion',
  `("status" IN ('PENDING', 'PROCESSING') AND "completed_at" IS NULL) OR ("status" IN ('COMPLETED', 'FAILED', 'CANCELLED') AND "completed_at" IS NOT NULL AND "completed_at" >= "created_at")`,
)
export class TaskExecution {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_task_executions',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.taskExecutions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_task_executions_user',
  })
  user: User;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ name: 'client_task_id', type: 'uuid' })
  clientTaskId: string;

  @Column({ name: 'task_type', type: 'varchar', length: 48 })
  taskType: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    default: 'PENDING',
  })
  status: string;

  @Column({ name: 'processing_time_ms', type: 'integer', nullable: true })
  processingTimeMs: number | null;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @OneToMany(() => TaskModelRun, (taskModelRun) => taskModelRun.taskExecution)
  modelRuns: TaskModelRun[];
}
