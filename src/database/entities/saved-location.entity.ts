import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'saved_locations' })
@Check(
  'ck_saved_locations_label',
  `char_length(btrim("custom_label")) > 0`,
)
@Check('ck_saved_locations_latitude', `"latitude" BETWEEN -90 AND 90`)
@Check('ck_saved_locations_longitude', `"longitude" BETWEEN -180 AND 180`)
export class SavedLocation {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_saved_locations',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.savedLocations, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_saved_locations_user',
  })
  user: User;

  @Column({ name: 'custom_label', type: 'varchar', length: 100 })
  customLabel: string;

  @Column({ name: 'latitude', type: 'numeric', precision: 9, scale: 6 })
  latitude: string;

  @Column({ name: 'longitude', type: 'numeric', precision: 9, scale: 6 })
  longitude: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
