import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModel } from '../../database/entities/ai-model.entity';
import { AiModelVersion } from '../../database/entities/ai-model-version.entity';
import { AiModelRepository } from '../../database/repositories/ai-model.repository';
import { AiModelVersionRepository } from '../../database/repositories/ai-model-version.repository';

@Module({
  imports: [TypeOrmModule.forFeature([AiModel, AiModelVersion])],
  providers: [AiModelRepository, AiModelVersionRepository],
  exports: [AiModelRepository, AiModelVersionRepository],
})
export class AiModelsModule {}
