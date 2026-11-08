import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { AiModelVersion } from './ai-model-version.entity';
import { TaskExecution } from './task-execution.entity';

@Entity({ name: 'task_model_runs' })
@Check('ck_task_model_runs_role', `"run_role" IN ('primary', 'fallback')`)
@Check(
  'ck_task_model_runs_status',
  `"status" IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')`,
)
@Check(
  'ck_task_model_runs_processing_time',
  `"processing_time_ms" IS NULL OR "processing_time_ms" >= 0`,
)
@Check(
  'ck_task_model_runs_confidence',
  `"confidence" IS NULL OR "confidence" BETWEEN 0 AND 1`,
)
@Check(
  'ck_task_model_runs_completion',
  `("status" IN ('PENDING', 'PROCESSING') AND "completed_at" IS NULL) OR ("status" IN ('COMPLETED', 'FAILED', 'CANCELLED') AND "completed_at" IS NOT NULL AND "completed_at" >= "created_at")`,
)
export class TaskModelRun {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_task_model_runs',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column({ name: 'task_execution_id', type: 'uuid' })
  taskExecutionId: string;

  @ManyToOne(() => TaskExecution, (taskExecution) => taskExecution.modelRuns, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'task_execution_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_task_model_runs_task',
  })
  taskExecution: TaskExecution;

  @Column({ name: 'model_version_id', type: 'uuid' })
  modelVersionId: string;

  @ManyToOne(() => AiModelVersion, (modelVersion) => modelVersion.taskModelRuns, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'model_version_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_task_model_runs_model_version',
  })
  modelVersion: AiModelVersion;

  @Column({ name: 'run_role', type: 'varchar', length: 8 })
  runRole: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    default: 'PENDING',
  })
  status: string;

  @Column({ name: 'processing_time_ms', type: 'integer', nullable: true })
  processingTimeMs: number | null;

  @Column({
    name: 'confidence',
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  confidence: string | null;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
