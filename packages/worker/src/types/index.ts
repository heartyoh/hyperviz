export * from "./interfaces.js";
export * from "./stream.js";
/**
 * 태스크 상태 열거형
 */
export enum TaskStatus {
  /** 대기 중 */
  QUEUED = "QUEUED",
  /** 실행 중 */
  RUNNING = "RUNNING",
  /** 완료됨 */
  COMPLETED = "COMPLETED",
  /** 실패함 */
  FAILED = "FAILED",
  /** 취소됨 */
  CANCELLED = "CANCELLED",
}

/**
 * 태스크 우선순위 열거형
 */
export enum TaskPriority {
  /** 높은 우선순위 */
  HIGH = 0,
  /** 보통 우선순위 */
  NORMAL = 1,
  /** 낮은 우선순위 */
  LOW = 2,
}

/**
 * 워커 상태 열거형
 */
export enum WorkerStatus {
  /** 사용 가능 */
  IDLE = "IDLE",
  /** 작업 중 */
  BUSY = "BUSY",
  /** 오류 발생 */
  ERROR = "ERROR",
  /** 시작 중 */
  STARTING = "STARTING",
  /** 종료 중 */
  TERMINATING = "TERMINATING",
  /** 알 수 없음 */
  UNKNOWN = "UNKNOWN",
}

/**
 * 워커 유형 열거형
 */
export enum WorkerType {
  /** 계산 워커 */
  CALC = "calc",
  /** 데이터 처리 워커 */
  DATA = "data",
  /** 이미지 처리 워커 */
  IMAGE = "image",
}

/**
 * 로그 레벨 열거형
 */
export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

/**
 * 태스크 옵션 인터페이스
 */
export interface TaskOptions {
  /** 우선순위 */
  priority: TaskPriority;
  /** 제한 시간 (밀리초) */
  timeout?: number;
  /** 재시도 횟수 */
  retries?: number;
  /** Transferable 객체 배열 */
  transferables?: Transferable[];
}

/**
 * 기본 태스크 인터페이스
 */
export interface Task<T = any, R = any> {
  /** 태스크 ID */
  id: string;
  /** 태스크 유형 */
  type: string;
  /** 워커 유형 */
  workerType: WorkerType | string;
  /** 태스크 데이터 */
  data: T;
  /** 태스크 상태 */
  status: TaskStatus;
  /** 우선순위 */
  priority: TaskPriority;
  /** 제출 시간 */
  submittedAt: number;
  /** 시작 시간 */
  startedAt?: number;
  /** 완료 시간 */
  completedAt?: number;
  /** 워커 ID */
  workerId?: string;
  /** 결과 */
  result?: R;
  /** 오류 */
  error?: string;
  /** 옵션 */
  options: TaskOptions;
}

/**
 * 워커 풀 설정 인터페이스
 */
export interface PoolConfig {
  /** 최소 워커 수 */
  minWorkers?: number;
  /** 최대 워커 수 */
  maxWorkers?: number;
  /** 워커 유휴 타임아웃 (밀리초) */
  idleTimeout?: number;
  /** 최대 큐 크기 */
  maxQueueSize?: number;
  /** 워커 URL (웹 환경) */
  workerUrl?: string | ((type: string) => string);
  /** 워커 파일 경로 (Node.js 환경) */
  workerFile?: string | ((type: string) => string);
}

/**
 * 워커 이벤트 유형
 */
export interface WorkerEvents {
  message: [any];
  error: [Error];
  exit: [number];
}

/**
 * 워커 인스턴스 정보
 */
export interface WorkerInstance {
  /** 워커 ID */
  id: string;
  /** 워커 상태 */
  status: WorkerStatus;
  /** 워커 유형 */
  type: WorkerType | string;
  /** 관리 중인 태스크 수 */
  tasks: number;
  /** 성능 정보 */
  performance: {
    /** 평균 태스크 처리 시간 */
    averageTaskTime: number;
    /** 완료한 태스크 수 */
    completedTasks: number;
    /** 오류 발생 횟수 */
    errors: number;
  };
}

/**
 * 워커 풀 통계 인터페이스
 */
export interface PoolStats {
  /** 워커 수 */
  workerCount: number;
  /** 활성 워커 수 */
  activeWorkers: number;
  /** 유휴 워커 수 */
  idleWorkers: number;
  /** 대기 중인 태스크 수 */
  queuedTasks: number;
  /** 활성 태스크 수 */
  activeTasks: number;
}
