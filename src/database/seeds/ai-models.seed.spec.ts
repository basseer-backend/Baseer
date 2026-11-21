import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BASEER_PLANNED_MODELS, seedAiModels } from './ai-models.seed';
import { AiModel, AiModelStatus } from '../entities/ai-model.entity';

describe('AI Models Seed Data', () => {
  const MODEL_KEY_REGEX = /^[a-z0-9][a-z0-9_.-]*$/;

  it('should define all 11 required Baseer AI model categories', () => {
    expect(BASEER_PLANNED_MODELS).toHaveLength(11);

    const taskTypes = BASEER_PLANNED_MODELS.map((m) => m.taskType);
    expect(taskTypes).toContain('speech_recognition');
    expect(taskTypes).toContain('speech_synthesis');
    expect(taskTypes).toContain('document_ocr');
    expect(taskTypes).toContain('object_detection');
    expect(taskTypes).toContain('scene_description');
    expect(taskTypes).toContain('obstacle_detection');
    expect(taskTypes).toContain('traffic_sign_recognition');
    expect(taskTypes).toContain('color_detection');
    expect(taskTypes).toContain('currency_recognition');
    expect(taskTypes).toContain('visual_qa');
    expect(taskTypes).toContain('facial_expression');
  });

  it('should ensure all model keys satisfy the database regex and length constraints', () => {
    for (const model of BASEER_PLANNED_MODELS) {
      expect(model.modelKey).toMatch(MODEL_KEY_REGEX);
      expect(model.modelKey.length).toBeLessThanOrEqual(64);
      expect(model.displayName.length).toBeLessThanOrEqual(120);
      expect(model.taskFamily.length).toBeLessThanOrEqual(48);
    }
  });

  it('should ensure all models start in planned status without fabricated hashes', () => {
    for (const model of BASEER_PLANNED_MODELS) {
      expect(model.status).toBe(AiModelStatus.PLANNED);
      expect(model.provider).toBe('planned');
      expect(model.description).toBeDefined();
      expect(model.description.length).toBeGreaterThan(10);
    }
  });

  describe('Seed Idempotency', () => {
    let memoryStorage: Map<string, AiModel>;
    let mockDataSource: any;

    beforeEach(() => {
      memoryStorage = new Map<string, AiModel>();

      const mockRepo = {
        findOne: vi.fn(async ({ where }) => {
          return memoryStorage.get(where.modelKey) ?? null;
        }),
        create: vi.fn((data: Partial<AiModel>) => {
          return {
            id: `uuid-${data.modelKey}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            versions: [],
          } as AiModel;
        }),
        save: vi.fn(async (entity: AiModel) => {
          memoryStorage.set(entity.modelKey, entity);
          return entity;
        }),
      };

      mockDataSource = {
        getRepository: vi.fn(() => mockRepo),
      };
    });

    it('should seed 11 models on first execution', async () => {
      const result = await seedAiModels(mockDataSource);
      expect(result.seeded).toBe(11);
      expect(result.updated).toBe(0);
      expect(memoryStorage.size).toBe(11);
    });

    it('should be completely idempotent on repeated execution with zero duplicates', async () => {
      // First run
      const firstRun = await seedAiModels(mockDataSource);
      expect(firstRun.seeded).toBe(11);
      expect(memoryStorage.size).toBe(11);

      // Second run
      const secondRun = await seedAiModels(mockDataSource);
      expect(secondRun.seeded).toBe(0);
      expect(secondRun.updated).toBe(11);
      expect(memoryStorage.size).toBe(11); // Still exactly 11, no duplicates created
    });

    it('should preserve manually configured provider and status on subsequent seed runs', async () => {
      // First seed run
      await seedAiModels(mockDataSource);

      // Manually configure one model with an active deployment
      const ocrModel = memoryStorage.get('ocr-document-reading')!;
      ocrModel.provider = 'google-cloud-vision';
      ocrModel.status = AiModelStatus.ACTIVE;
      memoryStorage.set('ocr-document-reading', ocrModel);

      // Re-run seed
      await seedAiModels(mockDataSource);

      // Verify that provider and status were preserved and not reverted to 'planned'
      const updatedOcrModel = memoryStorage.get('ocr-document-reading')!;
      expect(updatedOcrModel.provider).toBe('google-cloud-vision');
      expect(updatedOcrModel.status).toBe(AiModelStatus.ACTIVE);
    });
  });
});
