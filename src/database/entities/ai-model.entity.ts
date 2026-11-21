import {
  Check,
  Column,
  Entity,
  OneToMany,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { AiModelVersion } from './ai-model-version.entity';

export enum AiModelStatus {
  PLANNED = 'planned',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DEPRECATED = 'deprecated',
}

@Entity({ name: 'ai_models' })
@Unique('uq_ai_models_model_key', ['modelKey'])
@Check('ck_ai_models_model_key', `"model_key" ~ '^[a-z0-9][a-z0-9_.-]*$'`)
@Check(
  'ck_ai_models_status',
  `"status" IN ('planned', 'active', 'inactive', 'deprecated')`,
)
export class AiModel {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_ai_models',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column({ name: 'model_key', type: 'varchar', length: 64 })
  modelKey: string;

  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'task_family', type: 'varchar', length: 48 })
  taskFamily: string;

  @Column({ name: 'task_type', type: 'varchar', length: 48, nullable: true })
  taskType: string | null;

  @Column({
    name: 'provider',
    type: 'varchar',
    length: 64,
    default: 'planned',
  })
  provider: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 24,
    default: AiModelStatus.PLANNED,
  })
  status: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;

  @OneToMany(() => AiModelVersion, (version) => version.model)
  versions: AiModelVersion[];
}
