/**
 * 워커풀 모니터링 공통 타입 정의
 */

// 로그 레벨 타입
export type LogLevel = "debug" | "info" | "warn" | "error";

// 워커 상태 타입
export type WorkerStatus = "idle" | "busy" | "error" | "terminated";

// 로그 항목 인터페이스
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  workerType?: string;
  workerId?: string;
  taskId?: string;
  source?: string;
  data?: any;
}

// 워커 정보 인터페이스
export interface WorkerInfo {
  id: string;
  type: string;
  status: WorkerStatus;
  tasks: number;
  performance: {
    averageTaskTime: number;
    completedTasks: number;
    errors: number;
  };
}

// 워커풀 통계 인터페이스
export interface PoolStats {
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageWaitTime: number;
  averageProcessTime: number;
}

// 워커 유형별 풀 통계 맵
export interface WorkerPoolStats {
  [workerType: string]: PoolStats;
}

// 모니터링 설정 인터페이스
export interface MonitorSettings {
  logLevel: LogLevel;
  updateInterval: number;
  maxLogEntries: number;
  autoRestart: boolean;
}

// 탭 인터페이스
export interface Tab {
  id: string;
  label: string;
}

// 차트 데이터 인터페이스
export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
  }[];
}
