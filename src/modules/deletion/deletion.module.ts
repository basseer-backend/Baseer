import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletionAuditEvent } from '../../database/entities/deletion-audit-event.entity';
import { DeletionRequest } from '../../database/entities/deletion-request.entity';
import { DeletionToken } from '../../database/entities/deletion-token.entity';
import { DeletionAuditEventRepository } from '../../database/repositories/deletion-audit-event.repository';
import { DeletionRequestRepository } from '../../database/repositories/deletion-request.repository';
import { DeletionTokenRepository } from '../../database/repositories/deletion-token.repository';
import { AuthModule } from '../auth/auth.module';
import { DeletionController } from './deletion.controller';
import { DeletionService } from './deletion.service';
import { DeletionWorkerService } from './deletion-worker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeletionToken,
      DeletionRequest,
      DeletionAuditEvent,
    ]),
    AuthModule,
  ],
  controllers: [DeletionController],
  providers: [
    DeletionTokenRepository,
    DeletionRequestRepository,
    DeletionAuditEventRepository,
    DeletionService,
    DeletionWorkerService,
  ],
  exports: [
    DeletionTokenRepository,
    DeletionRequestRepository,
    DeletionAuditEventRepository,
    DeletionService,
    DeletionWorkerService,
  ],
})
export class DeletionModule {}
