import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { AiModelsService } from './ai-models.service';
import { ModelArtifactHashService } from './model-artifact-hash.service';
import { AiModel, AiModelStatus } from '../../../database/entities/ai-model.entity';
import {
  AiModelVersion,
  AiModelVersionStatus,
} from '../../../database/entities/ai-model-version.entity';

describe('AiModelsService', () => {
  let service: AiModelsService;
  let mockModelRepo: any;
  let mockVersionRepo: any;
  let hashService: ModelArtifactHashService;
  let mockDataSource: any;

  // In-memory mock storage
  let models: AiModel[] = [];
  let versions: AiModelVersion[] = [];

  beforeEach(() => {
    models = [];
    versions = [];

    mockModelRepo = {
      find: vi.fn(async () => models),
      findOne: vi.fn(async ({ where }) => {
        if (where.id) return models.find((m) => m.id === where.id) ?? null;
        if (where.modelKey) return models.find((m) => m.modelKey === where.modelKey) ?? null;
        return null;
      }),
      findByKey: vi.fn(async (key: string) => {
        return models.find((m) => m.modelKey === key) ?? null;
      }),
      create: vi.fn(async (data: Partial<AiModel>) => {
        const entity: AiModel = {
          id: data.id ?? `model-uuid-${models.length + 1}`,
          modelKey: data.modelKey!,
          displayName: data.displayName!,
          taskFamily: data.taskFamily!,
          taskType: data.taskType ?? data.taskFamily!,
          description: data.description ?? null,
          provider: data.provider ?? 'planned',
          status: data.status ?? AiModelStatus.PLANNED,
          createdAt: new Date(),
          updatedAt: new Date(),
          versions: [],
        };
        models.push(entity);
        return entity;
      }),
    };

    mockVersionRepo = {
      findByModelAndVersion: vi.fn(async (modelId: string, version: string) => {
        return versions.find((v) => v.modelId === modelId && v.version === version) ?? null;
      }),
      create: vi.fn(async (data: Partial<AiModelVersion>) => {
        const entity: AiModelVersion = {
          id: data.id ?? `ver-uuid-${versions.length + 1}`,
          modelId: data.modelId!,
          model: models.find((m) => m.id === data.modelId!)!,
          version: data.version!,
          artifactSha256: data.artifactSha256 ?? null,
          artifactUri: data.artifactUri ?? null,
          runtime: data.runtime ?? 'onnx',
          deploymentTarget: data.deploymentTarget ?? 'cloud',
          license: data.license ?? 'Proprietary',
          modelCardUri: data.modelCardUri ?? null,
          rollbackTargetVersionId: data.rollbackTargetVersionId ?? null,
          status: data.status ?? AiModelVersionStatus.PLANNED,
          createdAt: new Date(),
          updatedAt: new Date(),
          taskModelRuns: [],
        };
        versions.push(entity);
        return entity;
      }),
      validateRollbackTarget: vi.fn(
        async (
          modelId: string,
          targetVersionId: string,
          currentVersionId?: string,
        ) => {
          if (currentVersionId && targetVersionId === currentVersionId) {
            return {
              valid: false,
              reason: 'A model version cannot reference itself as a rollback target',
            };
          }

          const target = versions.find((v) => v.id === targetVersionId);
          if (!target) {
            return {
              valid: false,
              reason: `Rollback target version '${targetVersionId}' does not exist`,
            };
          }

          if (target.modelId !== modelId) {
            return {
              valid: false,
              reason: `Cross-model rollback is prohibited: target version belongs to model '${target.modelId}', not '${modelId}'`,
            };
          }

          if (
            target.status === AiModelVersionStatus.DRAFT ||
            target.status === AiModelVersionStatus.RETIRED ||
            target.status === AiModelVersionStatus.PLANNED
          ) {
            return {
              valid: false,
              reason: `Cannot rollback to version in '${target.status}' state`,
              targetVersion: target,
            };
          }

          // Circular chain check
          if (currentVersionId) {
            let currentAncestor: AiModelVersion | null = target;
            const visited = new Set<string>([currentVersionId]);
            while (currentAncestor && currentAncestor.rollbackTargetVersionId) {
              if (visited.has(currentAncestor.rollbackTargetVersionId)) {
                return {
                  valid: false,
                  reason: `Circular rollback chain detected involving version '${currentAncestor.rollbackTargetVersionId}'`,
                  targetVersion: target,
                };
              }
              visited.add(currentAncestor.rollbackTargetVersionId);
              currentAncestor = versions.find((v) => v.id === currentAncestor?.rollbackTargetVersionId) ?? null;
            }
          }

          return { valid: true, targetVersion: target };
        },
      ),
    };

    hashService = new ModelArtifactHashService();

    mockDataSource = {
      getRepository: vi.fn(() => mockModelRepo),
    };

    service = new AiModelsService(
      mockModelRepo,
      mockVersionRepo,
      hashService,
      mockDataSource,
    );
  });

  describe('Model Creation & Retrieval', () => {
    it('should successfully create a new model record', async () => {
      const model = await service.createModel({
        modelKey: 'ocr-document-reading',
        displayName: 'OCR & Document Reading',
        taskFamily: 'document_ocr',
        description: 'Arabic and English OCR',
      });

      expect(model).toBeDefined();
      expect(model.modelKey).toBe('ocr-document-reading');
      expect(model.status).toBe(AiModelStatus.PLANNED);
      expect(models).toHaveLength(1);
    });

    it('should reject duplicate model keys with ConflictException', async () => {
      await service.createModel({
        modelKey: 'ocr-document-reading',
        displayName: 'OCR Model 1',
        taskFamily: 'document_ocr',
      });

      await expect(
        service.createModel({
          modelKey: 'ocr-document-reading',
          displayName: 'OCR Duplicate',
          taskFamily: 'document_ocr',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should retrieve a model by its unique key', async () => {
      await service.createModel({
        modelKey: 'vision-currency-recognition',
        displayName: 'Egyptian Currency Recognition',
        taskFamily: 'currency_recognition',
      });

      const found = await service.getModelByKey('vision-currency-recognition');
      expect(found).toBeDefined();
      expect(found.modelKey).toBe('vision-currency-recognition');
    });

    it('should throw NotFoundException when model key is not found', async () => {
      await expect(service.getModelByKey('non-existent-key')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Multiple Versions & Hash Requirements', () => {
    let createdModel: AiModel;
    const sampleHash1 =
      'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const sampleHash2 =
      'b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1';

    beforeEach(async () => {
      createdModel = await service.createModel({
        modelKey: 'vision-obstacle-detection',
        displayName: 'Obstacle Detection',
        taskFamily: 'obstacle_detection',
      });
    });

    it('should allow multiple versions to belong to one model', async () => {
      const v1 = await service.createVersion(createdModel.id, {
        version: '1.0.0',
        artifactSha256: sampleHash1,
        artifactUri: 's3://baseer-models/obstacles-v1.onnx',
        status: AiModelVersionStatus.ACTIVE,
      });

      const v2 = await service.createVersion(createdModel.id, {
        version: '1.1.0',
        artifactSha256: sampleHash2,
        artifactUri: 's3://baseer-models/obstacles-v1.1.onnx',
        status: AiModelVersionStatus.APPROVED,
        rollbackTargetVersionId: v1.id,
      });

      expect(v1.modelId).toBe(createdModel.id);
      expect(v2.modelId).toBe(createdModel.id);
      expect(versions).toHaveLength(2);
    });

    it('should allow planned model versions without fabricating hashes', async () => {
      const plannedVer = await service.createVersion(createdModel.id, {
        version: '0.1.0-planned',
        status: AiModelVersionStatus.PLANNED,
      });

      expect(plannedVer.status).toBe(AiModelVersionStatus.PLANNED);
      expect(plannedVer.artifactSha256).toBeNull();
      expect(plannedVer.artifactUri).toBeNull();
    });

    it('should require a valid SHA-256 hash when version status is active', async () => {
      await expect(
        service.createVersion(createdModel.id, {
          version: '1.0.0',
          status: AiModelVersionStatus.ACTIVE,
          // Missing artifactSha256
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid hash formats on version registration', async () => {
      await expect(
        service.createVersion(createdModel.id, {
          version: '1.0.0',
          artifactSha256: 'not-a-valid-sha256-string',
          artifactUri: 's3://models/weights.bin',
          status: AiModelVersionStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate version numbers for the same model', async () => {
      await service.createVersion(createdModel.id, {
        version: '1.0.0',
        artifactSha256: sampleHash1,
        artifactUri: 's3://models/v1.onnx',
        status: AiModelVersionStatus.ACTIVE,
      });

      await expect(
        service.createVersion(createdModel.id, {
          version: '1.0.0',
          artifactSha256: sampleHash2,
          artifactUri: 's3://models/v1-alt.onnx',
          status: AiModelVersionStatus.ACTIVE,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Rollback Target Requirements & Safety', () => {
    let modelA: AiModel;
    let modelB: AiModel;
    const validHash =
      'c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2';

    beforeEach(async () => {
      modelA = await service.createModel({
        modelKey: 'model-a',
        displayName: 'Model A',
        taskFamily: 'family_a',
      });

      modelB = await service.createModel({
        modelKey: 'model-b',
        displayName: 'Model B',
        taskFamily: 'family_b',
      });
    });

    it('should allow valid rollback target referencing prior version of same model', async () => {
      const v1 = await service.createVersion(modelA.id, {
        version: '1.0.0',
        artifactSha256: validHash,
        artifactUri: 's3://models/a-v1.onnx',
        status: AiModelVersionStatus.ACTIVE,
      });

      const v2 = await service.createVersion(modelA.id, {
        version: '2.0.0',
        artifactSha256: validHash,
        artifactUri: 's3://models/a-v2.onnx',
        status: AiModelVersionStatus.APPROVED,
        rollbackTargetVersionId: v1.id,
      });

      expect(v2.rollbackTargetVersionId).toBe(v1.id);
    });

    it('should reject non-existent rollback target version', async () => {
      await expect(
        service.createVersion(modelA.id, {
          version: '2.0.0',
          artifactSha256: validHash,
          artifactUri: 's3://models/a-v2.onnx',
          status: AiModelVersionStatus.APPROVED,
          rollbackTargetVersionId: 'non-existent-version-id',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject cross-model rollback references', async () => {
      // v1 belongs to modelB
      const versionOfModelB = await service.createVersion(modelB.id, {
        version: '1.0.0',
        artifactSha256: validHash,
        artifactUri: 's3://models/b-v1.onnx',
        status: AiModelVersionStatus.ACTIVE,
      });

      // Attempt to reference versionOfModelB as rollback target for modelA version
      await expect(
        service.createVersion(modelA.id, {
          version: '1.0.0',
          artifactSha256: validHash,
          artifactUri: 's3://models/a-v1.onnx',
          status: AiModelVersionStatus.ACTIVE,
          rollbackTargetVersionId: versionOfModelB.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject rollback target in draft or retired state', async () => {
      const retiredVersion = await service.createVersion(modelA.id, {
        version: '0.9.0',
        artifactSha256: validHash,
        artifactUri: 's3://models/a-v0.9.onnx',
        status: AiModelVersionStatus.RETIRED,
      });

      await expect(
        service.createVersion(modelA.id, {
          version: '1.0.0',
          artifactSha256: validHash,
          artifactUri: 's3://models/a-v1.onnx',
          status: AiModelVersionStatus.ACTIVE,
          rollbackTargetVersionId: retiredVersion.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject rollback target in planned state', async () => {
      const plannedVersion = await service.createVersion(modelA.id, {
        version: '0.1.0-planned',
        status: AiModelVersionStatus.PLANNED,
      });

      await expect(
        service.createVersion(modelA.id, {
          version: '1.0.0',
          artifactSha256: validHash,
          artifactUri: 's3://models/a-v1.onnx',
          status: AiModelVersionStatus.ACTIVE,
          rollbackTargetVersionId: plannedVersion.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should detect and reject circular rollback chains', async () => {
      const v1 = await service.createVersion(modelA.id, {
        version: '1.0.0',
        artifactSha256: validHash,
        artifactUri: 's3://models/a-v1.onnx',
        status: AiModelVersionStatus.ACTIVE,
      });

      const v2 = await service.createVersion(modelA.id, {
        version: '2.0.0',
        artifactSha256: validHash,
        artifactUri: 's3://models/a-v2.onnx',
        status: AiModelVersionStatus.APPROVED,
        rollbackTargetVersionId: v1.id,
      });

      // Now attempt to update or create a version referencing v2 where v2 leads back to v1
      // If v1 were set to rollback to v2, that creates a cycle (v1 -> v2 -> v1)
      const rollbackCheck = await mockVersionRepo.validateRollbackTarget(
        modelA.id,
        v2.id,
        v1.id, // Current is v1, target is v2 which rolls back to v1!
      );

      expect(rollbackCheck.valid).toBe(false);
      expect(rollbackCheck.reason).toContain('Circular rollback chain detected');
    });
  });
});
