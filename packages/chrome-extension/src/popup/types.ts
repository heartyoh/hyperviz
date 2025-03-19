/**
 * 팝업 컴포넌트에서 사용하는 타입 정의
 */

// 로그 레벨
export type LogLevel = "debug" | "info" | "warn" | "error";

// 로그 항목
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  source?: string;
  workerType?: string;
}

// 모니터 설정
export interface MonitorSettings {
  logLevel: LogLevel;
  updateInterval: number;
  maxLogEntries: number;
  autoRestart: boolean;
}

// 워커 정보
export interface WorkerInfo {
  id: string;
  type: string;
  status: string;
  tasks?: Record<string, any>;
  performance?: {
    totalTasks?: number;
    completedTasks?: number;
    failedTasks?: number;
    avgProcessingTime?: number;
    averageTaskTime?: number;
    errors?: number;
  };
  createdAt?: number;
  lastActivityAt?: number;
}

// 워커풀 통계
export interface WorkerPoolStats {
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
}
