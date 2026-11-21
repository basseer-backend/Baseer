import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModel } from '../../database/entities/ai-model.entity';
import { AiModelVersion } from '../../database/entities/ai-model-version.entity';
import { AiModelRepository } from '../../database/repositories/ai-model.repository';
import { AiModelVersionRepository } from '../../database/repositories/ai-model-version.repository';
import { ModelArtifactHashService } from './services/model-artifact-hash.service';
import { AiModelsService } from './services/ai-models.service';

@Module({
  imports: [TypeOrmModule.forFeature([AiModel, AiModelVersion])],
  providers: [
    AiModelRepository,
    AiModelVersionRepository,
    ModelArtifactHashService,
    AiModelsService,
  ],
  exports: [
    AiModelRepository,
    AiModelVersionRepository,
    ModelArtifactHashService,
    AiModelsService,
  ],
})
export class AiModelsModule {}
