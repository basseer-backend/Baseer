import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AiModelVersion,
  AiModelVersionStatus,
} from '../entities/ai-model-version.entity';
import { DatabaseRepository } from './db.repository';

export interface RollbackValidationResult {
  valid: boolean;
  reason?: string;
  targetVersion?: AiModelVersion;
}

@Injectable()
export class AiModelVersionRepository extends DatabaseRepository<AiModelVersion> {
  constructor(
    @InjectRepository(AiModelVersion)
    protected readonly model: Repository<AiModelVersion>,
  ) {
    super(model);
  }

  async findByModelAndVersion(
    modelId: string,
    version: string,
  ): Promise<AiModelVersion | null> {
    return this.model.findOne({
      where: { modelId, version },
      relations: ['model'],
    });
  }

  async findVersionsForModel(modelId: string): Promise<AiModelVersion[]> {
    return this.model.find({
      where: { modelId },
      order: { createdAt: 'DESC' },
    });
  }

  async findActiveVersion(
    modelId: string,
    deploymentTarget: 'cloud' | 'mobile' = 'cloud',
  ): Promise<AiModelVersion | null> {
    return this.model.findOne({
      where: {
        modelId,
        deploymentTarget,
        status: AiModelVersionStatus.ACTIVE,
      },
      relations: ['model'],
    });
  }

  /**
   * Validates whether a rollback target version is valid:
   * 1. Self-reference check: A version cannot reference itself.
   * 2. Existence check: Target version must exist.
   * 3. Same-model check: Target version must belong to the same model (prevent cross-model rollback).
   * 4. State check: Target version must not be in draft or retired state.
   */
  async validateRollbackTarget(
    modelId: string,
    targetVersionId: string,
    currentVersionId?: string,
  ): Promise<RollbackValidationResult> {
    if (currentVersionId && targetVersionId === currentVersionId) {
      return {
        valid: false,
        reason: 'A model version cannot reference itself as a rollback target',
      };
    }

    const target = await this.model.findOne({
      where: { id: targetVersionId },
    });

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

    // Circular rollback chain prevention: traverse target's rollback ancestry
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
        currentAncestor = await this.model.findOne({
          where: { id: currentAncestor.rollbackTargetVersionId },
        });
      }
    }

    return {
      valid: true,
      targetVersion: target,
    };
  }
}
