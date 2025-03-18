/**
 * 워커 풀 관리 시스템 타입 정의
 */

// 워커 유형 정의
export enum WorkerType {
  IMAGE = "image",
  DATA = "data",
  CALC = "calc",
  MONITOR = "monitor",
}

// 워커 옵션 인터페이스
export interface WorkerOptions {
  id?: string;
  env?: Record<string, any>;
  workerData?: Record<string, any>;
}

// 워커 인스턴스 상태
export enum WorkerStatus {
  IDLE = "idle",
  BUSY = "busy",
  ERROR = "error",
  TERMINATED = "terminated",
}

// 워커 인스턴스 인터페이스
export interface WorkerInstance {
  id: string;
  type: WorkerType;
  status: WorkerStatus;
  tasks: number;
  performance: {
    averageTaskTime: number;
    completedTasks: number;
    errors: number;
  };
}

// 풀 설정 인터페이스
export interface PoolConfig {
  minWorkers?: number;
  maxWorkers?: number;
  idleTimeout?: number; // ms
  maxQueueSize?: number;
}

// 태스크 우선순위
export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

// 태스크 상태
export enum TaskStatus {
  QUEUED = "queued",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

// 태스크 옵션 인터페이스
export interface TaskOptions {
  priority?: TaskPriority;
  timeout?: number; // ms
  retries?: number;
  onProgress?: (progress: number) => void;
}

// 태스크 인터페이스
export interface Task<T = any, R = any> {
  id: string;
  type: string;
  workerType: WorkerType;
  data: T;
  status: TaskStatus;
  priority: TaskPriority;
  result?: R;
  error?: Error | string;
  submittedAt: number;
  startedAt?: number;
  completedAt?: number;
  options: TaskOptions;
}

// 모니터링 통계 인터페이스
export interface PoolStats {
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageWaitTime: number;
  averageProcessTime: number;
}

// 로그 레벨
export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

// 로그 항목 인터페이스
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  workerType?: WorkerType;
  workerId?: string;
  taskId?: string;
  data?: any;
}
