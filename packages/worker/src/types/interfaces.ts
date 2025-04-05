/**
 * 워커 시스템 인터페이스 정의
 */

import { EventEmitter } from "eventemitter3";
import {
  WorkerEventData,
  TaskEventData,
  TaskEventType,
  WorkerEventType,
} from "../core/event-hub.js";
import {
  Task,
  TaskStatus,
  WorkerStatus,
  TaskPriority,
  WorkerEvents,
} from "./index.js";

/**
 * 워커 메시지 인터페이스
 */
export interface WorkerMessage {
  /** 메시지 유형 */
  type: string;
  /** 메시지 데이터 */
  data?: any;
  /** 태스크 ID */
  taskId?: string;
  /** 메시지 ID */
  id?: string;
}

/**
 * 통합된 워커 인터페이스
 */
export interface IWorker {
  /** 워커 ID */
  id: string;

  /** 워커 상태 */
  state: WorkerStatus;

  /** 현재 실행 중인 태스크 */
  currentTask?: Task<any, any>;

  /** 워커 유형 */
  workerType: string;

  /** 워커 생성 시간 */
  createdAt: number;

  /** 마지막 활동 시간 */
  lastActiveAt: number;

  /**
   * 메시지 전송
   * @param message 전송할 메시지
   */
  postMessage(message: any): void;

  /**
   * 우선순위 메시지 전송
   * @param message 메시지
   * @param priority 우선순위
   */
  postPrioritizedMessage(message: any, priority?: TaskPriority): void;

  /**
   * 태스크 시작
   * @param task 시작할 태스크
   */
  startTask<T, R>(task: Task<T, R>): Promise<R>;

  /**
   * 워커 종료
   * @param force 강제 종료 여부
   */
  terminate(force?: boolean): Promise<void>;

  /** 워커가 유휴 상태인지 확인 */
  isIdle(): boolean;

  /** 워커가 바쁜 상태인지 확인 */
  isBusy(): boolean;

  /** 워커가 사용 가능한지 확인 */
  isAvailable(): boolean;

  /**
   * 이벤트 리스너 등록
   * @param event 이벤트 이름
   * @param listener 리스너 함수
   */
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  on<E extends keyof WorkerEvents>(
    event: E,
    listener: (...args: WorkerEvents[E]) => void
  ): this;

  /**
   * 한 번만 실행되는 이벤트 리스너 등록
   * @param event 이벤트 이름
   * @param listener 리스너 함수
   */
  once(event: string | symbol, listener: (...args: any[]) => void): this;
  once<E extends keyof WorkerEvents>(
    event: E,
    listener: (...args: WorkerEvents[E]) => void
  ): this;

  /**
   * 이벤트 리스너 제거
   * @param event 이벤트 이름
   * @param listener 리스너 함수
   */
  off(event: string | symbol, listener: (...args: any[]) => void): this;
  off<E extends keyof WorkerEvents>(
    event: E,
    listener: (...args: WorkerEvents[E]) => void
  ): this;

  /** 이벤트 발신 */
  emit(event: string | symbol, ...args: any[]): boolean;
}

/**
 * 태스크 큐 인터페이스
 */
export interface ITaskQueue<T = any, R = any> {
  /**
   * 태스크 큐에 추가
   * @param task 추가할 태스크
   */
  enqueue(task: Task<T, R>): void;

  /** 태스크 큐에서 꺼내기 */
  dequeue(): Task<T, R> | undefined;

  /** 큐가 비어있는지 확인 */
  isEmpty(): boolean;

  /** 큐 크기 반환 */
  size(): number;

  /**
   * ID로 태스크 제거
   * @param taskId 제거할 태스크 ID
   */
  remove(taskId: string): boolean;

  /** 모든 태스크 반환 */
  getAll(): Task<T, R>[];

  /** 큐 초기화 */
  clear(): void;
}

/**
 * 워커 매니저 인터페이스
 */
export interface IWorkerManager extends EventEmitter {
  /**
   * 워커 생성
   * @param workerType 워커 유형
   */
  createWorker(workerType?: string): Promise<IWorker>;

  /**
   * 워커 해제
   * @param workerId 워커 ID
   * @param force 강제 종료 여부
   */
  releaseWorker(workerId: string, force?: boolean): Promise<void>;

  /**
   * 사용 가능한 워커 가져오기
   * @param workerType 워커 유형
   */
  getAvailableWorker(workerType?: string): Promise<IWorker | undefined>;

  /**
   * 모든 워커 종료
   * @param force 강제 종료 여부
   */
  terminateAll(force?: boolean): Promise<void>;

  /**
   * 워커 상태 관리
   * @param worker 워커 인스턴스
   */
  manageWorker(worker: IWorker): void;

  /** 워커 상태 통계 */
  getStats(): WorkerManagerStats;

  /**
   * 유휴 워커 관리
   * @param idleTimeout 유휴 타임아웃
   */
  manageIdleWorkers(idleTimeout: number): void;

  /** 최소 워커 수 유지 */
  ensureMinWorkers(): Promise<void>;
}

/**
 * 워커 매니저 통계 인터페이스
 */
export interface WorkerManagerStats {
  /** 총 워커 수 */
  totalWorkers: number;

  /** 활성 워커 수 */
  activeWorkers: number;

  /** 유휴 워커 수 */
  idleWorkers: number;

  /** 워커 유형별 통계 */
  byType?: Record<
    string,
    {
      total: number;
      active: number;
      idle: number;
    }
  >;
}

/**
 * 워커 매니저 설정 인터페이스
 */
export interface WorkerManagerConfig {
  /** 최소 워커 수 */
  minWorkers?: number;

  /** 최대 워커 수 */
  maxWorkers?: number;

  /** 유휴 타임아웃 (ms) */
  idleTimeout?: number;

  /** 워커 URL */
  workerUrl?: string;

  /** 워커 파일 */
  workerFile?: string;

  /** 워커 유형 */
  workerType?: string;

  /** 워커 옵션 */
  workerOptions?: any;
}

/**
 * 이벤트 허브 인터페이스
 */
export interface IEventHub extends EventEmitter {
  /**
   * 태스크 이벤트 발행
   * @param eventType 이벤트 타입
   * @param data 이벤트 데이터
   */
  emitTaskEvent(eventType: TaskEventType, data: TaskEventData): void;

  /**
   * 워커 이벤트 발행
   * @param eventType 이벤트 타입
   * @param data 이벤트 데이터
   */
  emitWorkerEvent(eventType: WorkerEventType, data: WorkerEventData): void;
}

/**
 * 워커 풀 인터페이스
 */
export interface IWorkerPool extends EventEmitter {
  /**
   * 태스크 제출
   * @param data 태스크 데이터
   * @param options 태스크 옵션
   */
  submitTask<T, R>(data: T, options?: TaskOptions<T, R>): Promise<R>;

  /**
   * 태스크 취소
   * @param taskId 취소할 태스크 ID
   */
  cancelTask(taskId: string): Promise<boolean>;

  /**
   * 태스크 상태 확인
   * @param taskId 태스크 ID
   */
  getTaskStatus(taskId: string): Promise<TaskStatus | undefined>;

  /**
   * 대기 중인 태스크 가져오기
   * @param workerType 워커 유형
   */
  getPendingTasks(workerType?: string): Task<any, any>[];

  /**
   * 실행 중인 태스크 가져오기
   * @param workerType 워커 유형
   */
  getRunningTasks(workerType?: string): Task<any, any>[];

  /** 워커 풀 상태 통계 */
  getStats(): WorkerPoolStats;

  /** 워커 풀 종료 */
  shutdown(force?: boolean): Promise<void>;
}

/**
 * 태스크 옵션 인터페이스
 */
export interface TaskOptions<T = any, R = any> {
  /** 태스크 ID */
  id?: string;

  /** 태스크 우선순위 (높을수록 먼저 처리) */
  priority?: number;

  /** 태스크 타임아웃 (ms) */
  timeout?: number;

  /** 워커 유형 */
  workerType?: string;

  /** 최대 재시도 횟수 */
  maxRetries?: number;

  /** 재시도 딜레이 (ms) */
  retryDelay?: number;

  /** 진행 상태 콜백 */
  onProgress?: (progress: any) => void;

  /** 취소 콜백 */
  onCancel?: () => void;

  /** 태그 */
  tags?: string[];

  /** 데이터 변환 함수 */
  transform?: (data: T) => any;

  /** 결과 변환 함수 */
  resultTransform?: (data: R) => any;
}

/**
 * 워커 풀 통계 인터페이스
 */
export interface WorkerPoolStats extends WorkerManagerStats {
  /** 대기 중인 태스크 수 */
  pendingTasks: number;

  /** 실행 중인 태스크 수 */
  runningTasks: number;

  /** 완료된 태스크 수 */
  completedTasks: number;

  /** 실패한 태스크 수 */
  failedTasks: number;

  /** 취소된 태스크 수 */
  cancelledTasks: number;

  /** 총 처리된 태스크 수 */
  totalProcessedTasks: number;

  /** 평균 태스크 처리 시간 (ms) */
  avgTaskDuration?: number;

  /** 태스크 처리 히스토리 */
  history?: {
    last10TaskDurations: number[];
    taskSuccessRate: number;
  };
}
