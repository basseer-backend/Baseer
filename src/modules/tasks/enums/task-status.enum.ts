export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export const TERMINAL_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.COMPLETED,
  TaskStatus.FAILED,
  TaskStatus.CANCELLED,
];

export const ALLOWED_TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.PENDING]: [
    TaskStatus.PROCESSING,
    TaskStatus.COMPLETED,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.PROCESSING]: [
    TaskStatus.COMPLETED,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.COMPLETED]: [],
  [TaskStatus.FAILED]: [],
  [TaskStatus.CANCELLED]: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) {
    return true;
  }
  const allowed = ALLOWED_TASK_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
