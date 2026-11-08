import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'user_preferences' })
@Check(
  'ck_user_preferences_speech_rate',
  `"speech_rate" BETWEEN 0.50 AND 3.00`,
)
@Check(
  'ck_user_preferences_haptic_intensity',
  `"haptic_intensity" IN ('low', 'medium', 'high')`,
)
@Check(
  'ck_user_preferences_consent_record',
  `(NOT "cloud_ai_consent" AND NOT "diagnostic_analytics_consent") OR ("consent_policy_version" IS NOT NULL AND "consent_updated_at" IS NOT NULL)`,
)
export class UserPreference {
  @PrimaryColumn({
    name: 'user_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_user_preferences',
  })
  userId: string;

  @OneToOne(() => User, (user) => user.preference, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_user_preferences_user',
  })
  user: User;

  @Column({
    name: 'speech_rate',
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: () => '1.00',
  })
  speechRate: string;

  @Column({ name: 'high_contrast_enabled', type: 'boolean', default: false })
  highContrastEnabled: boolean;

  @Column({ name: 'haptic_enabled', type: 'boolean', default: true })
  hapticEnabled: boolean;

  @Column({
    name: 'haptic_intensity',
    type: 'varchar',
    length: 6,
    default: 'medium',
  })
  hapticIntensity: string;

  @Column({ name: 'voice_wake_word_enabled', type: 'boolean', default: false })
  voiceWakeWordEnabled: boolean;

  @Column({ name: 'cloud_ai_consent', type: 'boolean', default: false })
  cloudAiConsent: boolean;

  @Column({
    name: 'diagnostic_analytics_consent',
    type: 'boolean',
    default: false,
  })
  diagnosticAnalyticsConsent: boolean;

  @Column({
    name: 'consent_policy_version',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  consentPolicyVersion: string | null;

  @Column({ name: 'consent_updated_at', type: 'timestamptz', nullable: true })
  consentUpdatedAt: Date | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
