import { AiModel } from './ai-model.entity';
import { AiModelVersion } from './ai-model-version.entity';
import { AuthSession } from './auth-session.entity';
import { DeletionAuditEvent } from './deletion-audit-event.entity';
import { DeletionRequest } from './deletion-request.entity';
import { DeletionToken } from './deletion-token.entity';
import { DiagnosticReport } from './diagnostic-report.entity';
import { SavedLocation } from './saved-location.entity';
import { TaskExecution } from './task-execution.entity';
import { TaskModelRun } from './task-model-run.entity';
import { User } from './user.entity';
import { UserPreference } from './user-preference.entity';

export const databaseEntities = [
  User,
  AuthSession,
  DeletionToken,
  UserPreference,
  SavedLocation,
  AiModel,
  AiModelVersion,
  TaskExecution,
  TaskModelRun,
  DeletionRequest,
  DeletionAuditEvent,
  DiagnosticReport,
];

export {
  AiModel,
  AiModelVersion,
  AuthSession,
  DeletionAuditEvent,
  DeletionRequest,
  DeletionToken,
  DiagnosticReport,
  SavedLocation,
  TaskExecution,
  TaskModelRun,
  User,
  UserPreference,
};
