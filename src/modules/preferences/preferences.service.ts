import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserPreference } from '../../database/entities/user-preference.entity';
import { User } from '../../database/entities/user.entity';
import { UserPreferenceRepository } from '../../database/repositories/user-preference.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { AppException } from '../../common/exceptions/app.exception';
import { AppErrorCode } from '../../common/constants/error-codes';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import { UserPreferencesResponseDto } from './dto/user-preferences-response.dto';
import {
  ConsentType,
  UpdateUserConsentsDto,
} from './dto/update-user-consents.dto';
import {
  UserConsentItemResponseDto,
  UserConsentsResponseDto,
} from './dto/user-consents-response.dto';

@Injectable()
export class PreferencesService {
  constructor(
    private readonly userPreferenceRepo: UserPreferenceRepository,
    private readonly userRepo: UserRepository,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Retrieves the current authenticated user's preferences.
   * Handles users who do not have saved preferences yet by returning the default configuration.
   */
  async getPreferences(userId: string): Promise<UserPreferencesResponseDto> {
    await this.assertUserExists(userId);

    const preference = await this.userPreferenceRepo.findByUserId(userId);

    if (!preference) {
      return this.buildDefaultPreferencesDto(userId);
    }

    return this.mapToPreferencesDto(preference);
  }

  /**
   * Creates or updates the authenticated user's preferences.
   * Supports partial updates while validating all constraints.
   */
  async updatePreferences(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponseDto> {
    await this.assertUserExists(userId);

    let preference = await this.userPreferenceRepo.findByUserId(userId);

    if (preference) {
      if (dto.speechRate !== undefined) {
        preference.speechRate = dto.speechRate.toFixed(2);
      }
      if (dto.highContrastEnabled !== undefined) {
        preference.highContrastEnabled = dto.highContrastEnabled;
      }
      if (dto.hapticEnabled !== undefined) {
        preference.hapticEnabled = dto.hapticEnabled;
      }
      if (dto.hapticIntensity !== undefined) {
        preference.hapticIntensity = dto.hapticIntensity;
      }
      if (dto.voiceWakeWordEnabled !== undefined) {
        preference.voiceWakeWordEnabled = dto.voiceWakeWordEnabled;
      }
      preference.updatedAt = new Date();

      preference = await this.userPreferenceRepo.create(preference);
    } else {
      preference = await this.userPreferenceRepo.create({
        userId,
        speechRate: dto.speechRate !== undefined ? dto.speechRate.toFixed(2) : '1.00',
        highContrastEnabled: dto.highContrastEnabled ?? false,
        hapticEnabled: dto.hapticEnabled ?? true,
        hapticIntensity: dto.hapticIntensity ?? 'medium',
        voiceWakeWordEnabled: dto.voiceWakeWordEnabled ?? false,
        cloudAiConsent: false,
        diagnosticAnalyticsConsent: false,
        consentPolicyVersion: null,
        consentUpdatedAt: null,
        updatedAt: new Date(),
      });
    }

    return this.mapToPreferencesDto(preference);
  }

  /**
   * Retrieves the authenticated user's consent records.
   */
  async getConsents(userId: string): Promise<UserConsentsResponseDto> {
    await this.assertUserExists(userId);

    const preference = await this.userPreferenceRepo.findByUserId(userId);

    if (!preference || !preference.consentPolicyVersion) {
      return {
        policyVersion: null,
        updatedAt: null,
        consents: [
          {
            consentType: ConsentType.CLOUD_AI,
            accepted: false,
            policyVersion: null,
            updatedAt: null,
          },
          {
            consentType: ConsentType.DIAGNOSTICS,
            accepted: false,
            policyVersion: null,
            updatedAt: null,
          },
          {
            consentType: ConsentType.PRIVACY_POLICY,
            accepted: false,
            policyVersion: null,
            updatedAt: null,
          },
        ],
      };
    }

    const version = preference.consentPolicyVersion;
    const updatedAt = preference.consentUpdatedAt?.toISOString() ?? null;

    return {
      policyVersion: version,
      updatedAt,
      consents: [
        {
          consentType: ConsentType.CLOUD_AI,
          accepted: preference.cloudAiConsent,
          policyVersion: version,
          updatedAt,
        },
        {
          consentType: ConsentType.DIAGNOSTICS,
          accepted: preference.diagnosticAnalyticsConsent,
          policyVersion: version,
          updatedAt,
        },
        {
          consentType: ConsentType.PRIVACY_POLICY,
          accepted: Boolean(
            preference.cloudAiConsent ||
              preference.diagnosticAnalyticsConsent ||
              preference.consentPolicyVersion,
          ),
          policyVersion: version,
          updatedAt,
        },
      ],
    };
  }

  /**
   * Saves one or multiple consent choices in an atomic database transaction.
   *
   * Core Policy Version Rules:
   * 1. Every consent record is tied to its explicit policyVersion.
   * 2. When a new policyVersion is submitted, acceptance is NOT inherited from previous versions.
   * 3. Database check constraint ck_user_preferences_consent_record is strictly satisfied:
   *    (NOT cloudAiConsent AND NOT diagnosticAnalyticsConsent) OR (consentPolicyVersion IS NOT NULL AND consentUpdatedAt IS NOT NULL)
   */
  async updateConsents(
    userId: string,
    dto: UpdateUserConsentsDto,
  ): Promise<UserConsentsResponseDto> {
    if (!dto.consents || dto.consents.length === 0) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'قائمة الموافقات لا يمكن أن تكون فارغة',
      );
    }

    // Verify all consents in batch reference the same target policy version
    const distinctVersions = Array.from(
      new Set(dto.consents.map((c) => c.policyVersion.trim())),
    );
    if (distinctVersions.length > 1) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'جميع بنود الموافقة في نفس الطلب يجب أن تنتمي لنفس إصدار السياسة (policyVersion)',
      );
    }

    // Verify no duplicate consent categories in the same batch
    const consentTypes = dto.consents.map((c) => c.consentType);
    if (new Set(consentTypes).size !== consentTypes.length) {
      throw new AppException(
        AppErrorCode.VALIDATION_FAILED,
        'لا يمكن تكرار نفس بند الموافقة أكثر من مرة في نفس الطلب',
      );
    }

    const targetPolicyVersion = distinctVersions[0];

    return this.dataSource.transaction(async (manager) => {
      // Ensure user exists
      const user = await manager.findOne(User, { where: { id: userId } });
      if (!user) {
        throw new AppException(
          AppErrorCode.NOT_FOUND,
          'المستخدم المطلوب غير موجود في النظام',
        );
      }

      let preference = await manager.findOne(UserPreference, {
        where: { userId },
      });

      if (!preference) {
        preference = manager.create(UserPreference, {
          userId,
          speechRate: '1.00',
          highContrastEnabled: false,
          hapticEnabled: true,
          hapticIntensity: 'medium',
          voiceWakeWordEnabled: false,
          cloudAiConsent: false,
          diagnosticAnalyticsConsent: false,
          consentPolicyVersion: null,
          consentUpdatedAt: null,
          updatedAt: new Date(),
        });
      }

      // Policy Version Transition:
      // If the incoming policy version is different from the currently saved version,
      // reset existing consents to false so new policy versions never automatically inherit old acceptances.
      if (preference.consentPolicyVersion !== targetPolicyVersion) {
        preference.cloudAiConsent = false;
        preference.diagnosticAnalyticsConsent = false;
      }

      let privacyPolicyExplicitlyAccepted: boolean | null = null;

      // Apply each consent item in the batch
      for (const item of dto.consents) {
        if (item.consentType === ConsentType.CLOUD_AI) {
          preference.cloudAiConsent = item.accepted;
        } else if (item.consentType === ConsentType.DIAGNOSTICS) {
          preference.diagnosticAnalyticsConsent = item.accepted;
        } else if (item.consentType === ConsentType.PRIVACY_POLICY) {
          privacyPolicyExplicitlyAccepted = item.accepted;
        }
      }

      const now = new Date();
      preference.consentPolicyVersion = targetPolicyVersion;
      preference.consentUpdatedAt = now;
      preference.updatedAt = now;

      // Persist in transaction
      const saved = await manager.save(UserPreference, preference);
      const isoUpdatedAt = saved.consentUpdatedAt?.toISOString() ?? now.toISOString();

      return {
        policyVersion: saved.consentPolicyVersion,
        updatedAt: isoUpdatedAt,
        consents: [
          {
            consentType: ConsentType.CLOUD_AI,
            accepted: saved.cloudAiConsent,
            policyVersion: saved.consentPolicyVersion,
            updatedAt: isoUpdatedAt,
          },
          {
            consentType: ConsentType.DIAGNOSTICS,
            accepted: saved.diagnosticAnalyticsConsent,
            policyVersion: saved.consentPolicyVersion,
            updatedAt: isoUpdatedAt,
          },
          {
            consentType: ConsentType.PRIVACY_POLICY,
            accepted:
              privacyPolicyExplicitlyAccepted !== null
                ? privacyPolicyExplicitlyAccepted
                : Boolean(
                    saved.cloudAiConsent ||
                      saved.diagnosticAnalyticsConsent ||
                      saved.consentPolicyVersion,
                  ),
            policyVersion: saved.consentPolicyVersion,
            updatedAt: isoUpdatedAt,
          },
        ],
      };
    });
  }

  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppException(
        AppErrorCode.NOT_FOUND,
        'المستخدم المطلوب غير موجود في النظام',
      );
    }
  }

  private mapToPreferencesDto(
    entity: UserPreference,
  ): UserPreferencesResponseDto {
    return {
      userId: entity.userId,
      speechRate: Number(entity.speechRate),
      highContrastEnabled: entity.highContrastEnabled,
      hapticEnabled: entity.hapticEnabled,
      hapticIntensity: entity.hapticIntensity,
      voiceWakeWordEnabled: entity.voiceWakeWordEnabled,
      updatedAt: entity.updatedAt ? entity.updatedAt.toISOString() : new Date().toISOString(),
    };
  }

  private buildDefaultPreferencesDto(
    userId: string,
  ): UserPreferencesResponseDto {
    return {
      userId,
      speechRate: 1.0,
      highContrastEnabled: false,
      hapticEnabled: true,
      hapticIntensity: 'medium',
      voiceWakeWordEnabled: false,
      updatedAt: new Date().toISOString(),
    };
  }
}
