import {
  Check,
  Column,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { AuthSession } from './auth-session.entity';
import { DeletionRequest } from './deletion-request.entity';
import { DeletionToken } from './deletion-token.entity';
import { SavedLocation } from './saved-location.entity';
import { TaskExecution } from './task-execution.entity';
import { UserPreference } from './user-preference.entity';

@Entity({ name: 'users' })
@Check(
  'ck_users_preferred_language',
  `"preferred_language" IN ('ar-EG', 'en-US')`,
)
export class User {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_users',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column({ name: 'is_guest', type: 'boolean', default: true })
  isGuest: boolean;

  @Column({
    name: 'preferred_language',
    type: 'varchar',
    length: 5,
    default: 'ar-EG',
  })
  preferredLanguage: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;

  @OneToMany(() => AuthSession, (authSession) => authSession.user)
  authSessions: AuthSession[];

  @OneToMany(() => DeletionToken, (deletionToken) => deletionToken.user)
  deletionTokens: DeletionToken[];

  @OneToOne(() => UserPreference, (preference) => preference.user)
  preference: UserPreference;

  @OneToMany(() => SavedLocation, (savedLocation) => savedLocation.user)
  savedLocations: SavedLocation[];

  @OneToMany(() => TaskExecution, (taskExecution) => taskExecution.user)
  taskExecutions: TaskExecution[];

  @OneToMany(() => DeletionRequest, (deletionRequest) => deletionRequest.user)
  deletionRequests: DeletionRequest[];
}
