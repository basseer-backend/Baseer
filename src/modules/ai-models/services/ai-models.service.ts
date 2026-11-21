import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AiModel, AiModelStatus } from '../../../database/entities/ai-model.entity';
import {
  AiModelVersion,
  AiModelVersionStatus,
} from '../../../database/entities/ai-model-version.entity';
import { AiModelRepository } from '../../../database/repositories/ai-model.repository';
import { AiModelVersionRepository } from '../../../database/repositories/ai-model-version.repository';
import { ModelArtifactHashService } from './model-artifact-hash.service';
import {
  BASEER_PLANNED_MODELS,
  seedAiModels,
} from '../../../database/seeds/ai-models.seed';

export interface CreateModelDto {
  modelKey: string;
  displayName: string;
  taskFamily: string;
  taskType?: string;
  description?: string;
  provider?: string;
  status?: AiModelStatus;
}

export interface CreateModelVersionDto {
  version: string;
  artifactSha256?: string | null;
  artifactUri?: string | null;
  runtime?: string;
  deploymentTarget?: 'cloud' | 'mobile';
  license?: string;
  modelCardUri?: string | null;
  rollbackTargetVersionId?: string | null;
  status?: AiModelVersionStatus;
}

@Injectable()
export class AiModelsService {
  constructor(
    private readonly aiModelRepo: AiModelRepository,
    private readonly aiModelVersionRepo: AiModelVersionRepository,
    private readonly hashService: ModelArtifactHashService,
    private readonly dataSource: DataSource,
  ) {}

  async getAllModels(): Promise<AiModel[]> {
    return this.aiModelRepo.find({
      order: { createdAt: 'ASC' },
      relations: ['versions'],
    });
  }

  async getModelByKey(modelKey: string): Promise<AiModel> {
    const model = await this.aiModelRepo.findByKey(modelKey);
    if (!model) {
      throw new NotFoundException(`AI Model with key '${modelKey}' not found`);
    }
    return model;
  }

  async getModelById(id: string): Promise<AiModel> {
    const model = await this.aiModelRepo.findOne({
      where: { id },
      relations: ['versions'],
    });
    if (!model) {
      throw new NotFoundException(`AI Model with id '${id}' not found`);
    }
    return model;
  }

  async createModel(dto: CreateModelDto): Promise<AiModel> {
    const existing = await this.aiModelRepo.findByKey(dto.modelKey);
    if (existing) {
      throw new ConflictException(
        `AI Model with key '${dto.modelKey}' already exists`,
      );
    }

    return this.aiModelRepo.create({
      modelKey: dto.modelKey,
      displayName: dto.displayName,
      taskFamily: dto.taskFamily,
      taskType: dto.taskType ?? dto.taskFamily,
      description: dto.description ?? null,
      provider: dto.provider ?? 'planned',
      status: dto.status ?? AiModelStatus.PLANNED,
    });
  }

  /**
   * Registers a new version for an AI model.
   * Enforces:
   * 1. Valid SHA-256 hash when artifact is present.
   * 2. No fabricated hashes for planned status.
   * 3. Valid rollback target belonging to the same model (no self-reference, no cross-model reference).
   */
  async createVersion(
    modelId: string,
    dto: CreateModelVersionDto,
  ): Promise<AiModelVersion> {
    const model = await this.getModelById(modelId);

    const versionStatus = dto.status ?? AiModelVersionStatus.PLANNED;

    // Validate hash requirements
    let validatedHash: string | null = null;
    if (dto.artifactSha256) {
      validatedHash = this.hashService.assertValidSha256(dto.artifactSha256);
    } else if (versionStatus !== AiModelVersionStatus.PLANNED) {
      throw new BadRequestException(
        `Artifact SHA-256 hash is required for version status '${versionStatus}'`,
      );
    }

    if (!dto.artifactUri && versionStatus !== AiModelVersionStatus.PLANNED) {
      throw new BadRequestException(
        `Artifact URI is required for version status '${versionStatus}'`,
      );
    }

    // Check duplicate version for same model
    const existingVersion = await this.aiModelVersionRepo.findByModelAndVersion(
      modelId,
      dto.version,
    );
    if (existingVersion) {
      throw new ConflictException(
        `Version '${dto.version}' already exists for model '${model.modelKey}'`,
      );
    }

    // Validate rollback target if provided
    if (dto.rollbackTargetVersionId) {
      const rollbackCheck = await this.aiModelVersionRepo.validateRollbackTarget(
        modelId,
        dto.rollbackTargetVersionId,
      );
      if (!rollbackCheck.valid) {
        throw new BadRequestException(
          `Invalid rollback target: ${rollbackCheck.reason}`,
        );
      }
    }

    return this.aiModelVersionRepo.create({
      modelId,
      version: dto.version,
      artifactSha256: validatedHash,
      artifactUri: dto.artifactUri ?? null,
      runtime: dto.runtime ?? 'onnx',
      deploymentTarget: dto.deploymentTarget ?? 'cloud',
      license: dto.license ?? 'Proprietary',
      modelCardUri: dto.modelCardUri ?? null,
      rollbackTargetVersionId: dto.rollbackTargetVersionId ?? null,
      status: versionStatus,
    });
  }

  /**
   * Seed all planned Baseer AI models idempotently.
   */
  async seedPlannedModels(): Promise<{ seeded: number; updated: number }> {
    return seedAiModels(this.dataSource);
  }

  getPlannedSeedDefinitions() {
    return BASEER_PLANNED_MODELS;
  }
}
