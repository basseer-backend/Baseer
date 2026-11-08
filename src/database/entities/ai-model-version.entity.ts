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
import { AiModel } from './ai-model.entity';
import { TaskModelRun } from './task-model-run.entity';

@Entity({ name: 'ai_model_versions' })
@Unique('uq_ai_model_versions_model_version', ['modelId', 'version'])
@Unique('uq_ai_model_versions_id_model', ['id', 'modelId'])
@Check(
  'ck_ai_model_versions_sha256',
  `"artifact_sha256" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'ck_ai_model_versions_target',
  `"deployment_target" IN ('cloud', 'mobile')`,
)
@Check(
  'ck_ai_model_versions_status',
  `"status" IN ('draft', 'approved', 'active', 'deprecated', 'retired')`,
)
@Check(
  'ck_ai_model_versions_rollback_self',
  `"rollback_target_version_id" IS NULL OR "rollback_target_version_id" <> "id"`,
)
export class AiModelVersion {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_ai_model_versions',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column({ name: 'model_id', type: 'uuid' })
  modelId: string;

  @ManyToOne(() => AiModel, (model) => model.versions, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'model_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_ai_model_versions_model',
  })
  model: AiModel;

  @Column({ name: 'version', type: 'varchar', length: 32 })
  version: string;

  @Column({ name: 'artifact_sha256', type: 'char', length: 64 })
  artifactSha256: string;

  @Column({ name: 'artifact_uri', type: 'text' })
  artifactUri: string;

  @Column({ name: 'runtime', type: 'varchar', length: 32 })
  runtime: string;

  @Column({ name: 'deployment_target', type: 'varchar', length: 6 })
  deploymentTarget: string;

  @Column({ name: 'license', type: 'varchar', length: 64 })
  license: string;

  @Column({ name: 'model_card_uri', type: 'text', nullable: true })
  modelCardUri: string | null;

  /**
   * fk_ai_model_versions_rollback is the composite foreign key
   * (rollback_target_version_id, model_id) -> ai_model_versions (id, model_id)
   * with ON DELETE RESTRICT. It is created in the SQL migration. A TypeORM
   * relation is not declared here because model_id is already the join column
   * of the model relation, and a second join on that column would not preserve
   * the same-model rule safely.
   */
  @Column({
    name: 'rollback_target_version_id',
    type: 'uuid',
    nullable: true,
  })
  rollbackTargetVersionId: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    default: 'draft',
  })
  status: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @OneToMany(() => TaskModelRun, (taskModelRun) => taskModelRun.modelVersion)
  taskModelRuns: TaskModelRun[];
}
