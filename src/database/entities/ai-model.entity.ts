import { Check, Column, Entity, OneToMany, PrimaryColumn, Unique } from 'typeorm';
import { AiModelVersion } from './ai-model-version.entity';

@Entity({ name: 'ai_models' })
@Unique('uq_ai_models_model_key', ['modelKey'])
@Check('ck_ai_models_model_key', `"model_key" ~ '^[a-z0-9][a-z0-9_.-]*$'`)
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

  @Column({ name: 'task_family', type: 'varchar', length: 48 })
  taskFamily: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @OneToMany(() => AiModelVersion, (version) => version.model)
  versions: AiModelVersion[];
}
