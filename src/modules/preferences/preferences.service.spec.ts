import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PreferencesService } from './preferences.service';
import { UserPreference } from '../../database/entities/user-preference.entity';
import { User } from '../../database/entities/user.entity';
import { AppException } from '../../common/exceptions/app.exception';
import { AppErrorCode } from '../../common/constants/error-codes';
import { HapticIntensity } from './dto/update-user-preferences.dto';
import { ConsentType } from './dto/update-user-consents.dto';

describe('PreferencesService', () => {
  let service: PreferencesService;
  let mockUserPrefRepo: any;
  let mockUserRepo: any;
  let mockDataSource: any;

  // In-memory data store
  let usersStore: Map<string, User>;
  let preferencesStore: Map<string, UserPreference>;

  const testUserId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    usersStore = new Map<string, User>();
    preferencesStore = new Map<string, UserPreference>();

    // Seed test users
    usersStore.set(testUserId, {
      id: testUserId,
      isGuest: false,
      preferredLanguage: 'ar-EG',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User);

    usersStore.set(otherUserId, {
      id: otherUserId,
      isGuest: true,
      preferredLanguage: 'en-US',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User);

    mockUserRepo = {
      findById: vi.fn(async (id: string) => usersStore.get(id) ?? null),
    };

    mockUserPrefRepo = {
      findByUserId: vi.fn(async (userId: string) =>
        preferencesStore.get(userId) ?? null,
      ),
      create: vi.fn(async (data: Partial<UserPreference>) => {
        const entity: UserPreference = {
          userId: data.userId!,
          user: usersStore.get(data.userId!)!,
          speechRate: data.speechRate ?? '1.00',
          highContrastEnabled: data.highContrastEnabled ?? false,
          hapticEnabled: data.hapticEnabled ?? true,
          hapticIntensity: data.hapticIntensity ?? 'medium',
          voiceWakeWordEnabled: data.voiceWakeWordEnabled ?? false,
          cloudAiConsent: data.cloudAiConsent ?? false,
          diagnosticAnalyticsConsent: data.diagnosticAnalyticsConsent ?? false,
          consentPolicyVersion: data.consentPolicyVersion ?? null,
          consentUpdatedAt: data.consentUpdatedAt ?? null,
          updatedAt: data.updatedAt ?? new Date(),
        };
        preferencesStore.set(data.userId!, entity);
        return entity;
      }),
    };

    mockDataSource = {
      transaction: vi.fn(async (callback: (manager: any) => Promise<any>) => {
        const mockManager = {
          findOne: vi.fn(async (entityClass: any, { where }: any) => {
            if (entityClass === User) {
              return usersStore.get(where.id) ?? null;
            }
            if (entityClass === UserPreference) {
              return preferencesStore.get(where.userId) ?? null;
            }
            return null;
          }),
          create: vi.fn((_entityClass: any, data: any) => ({
            ...data,
            updatedAt: new Date(),
          })),
          save: vi.fn(async (_entityClass: any, entity: UserPreference) => {
            preferencesStore.set(entity.userId, entity);
            return entity;
          }),
        };
        return callback(mockManager);
      }),
    };

    service = new PreferencesService(
      mockUserPrefRepo,
      mockUserRepo,
      mockDataSource,
    );
  });

  describe('Preferences Management', () => {
    it('should return default preferences when user has no record saved yet', async () => {
      const result = await service.getPreferences(testUserId);

      expect(result).toBeDefined();
      expect(result.userId).toBe(testUserId);
      expect(result.speechRate).toBe(1.0);
      expect(result.highContrastEnabled).toBe(false);
      expect(result.hapticEnabled).toBe(true);
      expect(result.hapticIntensity).toBe('medium');
      expect(result.voiceWakeWordEnabled).toBe(false);
    });

    it('should throw NOT_FOUND when getting preferences for non-existent user', async () => {
      await expect(
        service.getPreferences('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(AppException);
    });

    it('should create new preferences if user does not have a saved record yet', async () => {
      const result = await service.updatePreferences(testUserId, {
        speechRate: 1.5,
        hapticIntensity: HapticIntensity.HIGH,
      });

      expect(result.speechRate).toBe(1.5);
      expect(result.hapticIntensity).toBe('high');
      expect(result.hapticEnabled).toBe(true); // default preserved
      expect(result.highContrastEnabled).toBe(false); // default preserved
      expect(preferencesStore.has(testUserId)).toBe(true);
    });

    it('should partially update existing preferences without overwriting unmentioned fields', async () => {
      // First update
      await service.updatePreferences(testUserId, {
        speechRate: 2.0,
        highContrastEnabled: true,
        hapticIntensity: HapticIntensity.LOW,
      });

      // Second partial update (only hapticEnabled)
      const updated = await service.updatePreferences(testUserId, {
        hapticEnabled: false,
      });

      expect(updated.speechRate).toBe(2.0); // preserved
      expect(updated.highContrastEnabled).toBe(true); // preserved
      expect(updated.hapticIntensity).toBe('low'); // preserved
      expect(updated.hapticEnabled).toBe(false); // updated
    });

    it('should ensure users cannot modify other users preferences', async () => {
      // User 1 sets preferences
      await service.updatePreferences(testUserId, {
        speechRate: 1.25,
      });

      // User 2 sets different preferences
      await service.updatePreferences(otherUserId, {
        speechRate: 2.5,
      });

      const user1Pref = await service.getPreferences(testUserId);
      const user2Pref = await service.getPreferences(otherUserId);

      expect(user1Pref.speechRate).toBe(1.25);
      expect(user2Pref.speechRate).toBe(2.5);
    });
  });

  describe('Consent Records & Policy Version Handling', () => {
    it('should return unaccepted defaults when user has no consent record', async () => {
      const result = await service.getConsents(testUserId);

      expect(result.policyVersion).toBeNull();
      expect(result.updatedAt).toBeNull();
      expect(result.consents).toHaveLength(3);

      for (const item of result.consents) {
        expect(item.accepted).toBe(false);
        expect(item.policyVersion).toBeNull();
      }
    });

    it('should save multiple consent choices atomically', async () => {
      const result = await service.updateConsents(testUserId, {
        consents: [
          {
            consentType: ConsentType.CLOUD_AI,
            accepted: true,
            policyVersion: '1.0',
          },
          {
            consentType: ConsentType.DIAGNOSTICS,
            accepted: false,
            policyVersion: '1.0',
          },
        ],
      });

      expect(result.policyVersion).toBe('1.0');
      expect(result.updatedAt).toBeDefined();

      const cloudAi = result.consents.find(
        (c) => c.consentType === ConsentType.CLOUD_AI,
      );
      const diag = result.consents.find(
        (c) => c.consentType === ConsentType.DIAGNOSTICS,
      );

      expect(cloudAi?.accepted).toBe(true);
      expect(cloudAi?.policyVersion).toBe('1.0');
      expect(diag?.accepted).toBe(false);
      expect(diag?.policyVersion).toBe('1.0');

      // Verify persisted state
      const savedInDb = preferencesStore.get(testUserId)!;
      expect(savedInDb.cloudAiConsent).toBe(true);
      expect(savedInDb.diagnosticAnalyticsConsent).toBe(false);
      expect(savedInDb.consentPolicyVersion).toBe('1.0');
    });

    it('should verify that a new policy version does NOT inherit older consent acceptance', async () => {
      // 1. User accepts Cloud AI for policy v1.0
      await service.updateConsents(testUserId, {
        consents: [
          {
            consentType: ConsentType.CLOUD_AI,
            accepted: true,
            policyVersion: '1.0',
          },
        ],
      });

      expect(preferencesStore.get(testUserId)!.cloudAiConsent).toBe(true);
      expect(preferencesStore.get(testUserId)!.consentPolicyVersion).toBe('1.0');

      // 2. New policy v2.0 is issued. User only responds to diagnostics consent for v2.0
      const v2Result = await service.updateConsents(testUserId, {
        consents: [
          {
            consentType: ConsentType.DIAGNOSTICS,
            accepted: true,
            policyVersion: '2.0',
          },
        ],
      });

      expect(v2Result.policyVersion).toBe('2.0');

      const cloudAiV2 = v2Result.consents.find(
        (c) => c.consentType === ConsentType.CLOUD_AI,
      );
      const diagV2 = v2Result.consents.find(
        (c) => c.consentType === ConsentType.DIAGNOSTICS,
      );

      // Crucial requirement: Cloud AI was NOT accepted for v2.0, so it must NOT inherit the v1.0 acceptance!
      expect(cloudAiV2?.accepted).toBe(false);
      expect(diagV2?.accepted).toBe(true);

      const dbRecord = preferencesStore.get(testUserId)!;
      expect(dbRecord.cloudAiConsent).toBe(false);
      expect(dbRecord.diagnosticAnalyticsConsent).toBe(true);
      expect(dbRecord.consentPolicyVersion).toBe('2.0');
    });

    it('should reject batch consent request with conflicting policy versions', async () => {
      await expect(
        service.updateConsents(testUserId, {
          consents: [
            {
              consentType: ConsentType.CLOUD_AI,
              accepted: true,
              policyVersion: '1.0',
            },
            {
              consentType: ConsentType.DIAGNOSTICS,
              accepted: true,
              policyVersion: '2.0', // Mismatched!
            },
          ],
        }),
      ).rejects.toThrow(AppException);
    });

    it('should reject batch consent request with duplicate consent types', async () => {
      await expect(
        service.updateConsents(testUserId, {
          consents: [
            {
              consentType: ConsentType.CLOUD_AI,
              accepted: true,
              policyVersion: '1.0',
            },
            {
              consentType: ConsentType.CLOUD_AI, // Duplicate!
              accepted: false,
              policyVersion: '1.0',
            },
          ],
        }),
      ).rejects.toThrow(AppException);
    });

    it('should reject empty consent array', async () => {
      await expect(
        service.updateConsents(testUserId, {
          consents: [],
        }),
      ).rejects.toThrow(AppException);
    });

    it('should rollback transaction when an error occurs during batch operation', async () => {
      // Seed pre-existing state
      await service.updateConsents(testUserId, {
        consents: [
          {
            consentType: ConsentType.CLOUD_AI,
            accepted: true,
            policyVersion: '1.0',
          },
        ],
      });

      const previousState = { ...preferencesStore.get(testUserId)! };

      // Simulate failing transaction
      mockDataSource.transaction = vi.fn(async () => {
        throw new Error('Database connection failure during transaction');
      });

      await expect(
        service.updateConsents(testUserId, {
          consents: [
            {
              consentType: ConsentType.CLOUD_AI,
              accepted: false,
              policyVersion: '2.0',
            },
          ],
        }),
      ).rejects.toThrow('Database connection failure during transaction');

      // Verify that state remained untouched due to rollback
      const currentState = preferencesStore.get(testUserId)!;
      expect(currentState.cloudAiConsent).toBe(previousState.cloudAiConsent);
      expect(currentState.consentPolicyVersion).toBe(
        previousState.consentPolicyVersion,
      );
    });
  });
});
