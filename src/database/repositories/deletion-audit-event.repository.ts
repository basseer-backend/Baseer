import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FindOptionsWhere,
  QueryDeepPartialEntity,
  Repository,
  UpdateResult,
} from 'typeorm';
import { DeletionAuditEvent } from '../entities/deletion-audit-event.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class DeletionAuditEventRepository extends DatabaseRepository<DeletionAuditEvent> {
  constructor(
    @InjectRepository(DeletionAuditEvent)
    protected readonly model: Repository<DeletionAuditEvent>,
  ) {
    super(model);
  }

  override updateOne(
    _where: FindOptionsWhere<DeletionAuditEvent>,
    _data: QueryDeepPartialEntity<DeletionAuditEvent>,
  ): Promise<UpdateResult> {
    return this.rejectUpdate();
  }

  override updateMany(
    _where: FindOptionsWhere<DeletionAuditEvent>,
    _data: QueryDeepPartialEntity<DeletionAuditEvent>,
  ): Promise<UpdateResult> {
    return this.rejectUpdate();
  }

  private rejectUpdate(): Promise<UpdateResult> {
    return Promise.reject(
      new Error(
        'deletion_audit_events is append-only and cannot be updated.',
      ),
    );
  }
}
