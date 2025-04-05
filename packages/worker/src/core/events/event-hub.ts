/**
 * 이벤트 허브
 * 워커 풀 이벤트 관리
 */

import { EventEmitter } from "eventemitter3";
import { Task, TaskStatus } from "../../types/index.js";

/**
 * 태스크 이벤트 타입
 */
export enum TaskEventType {
  QUEUED = "taskQueued",
  STARTED = "taskStarted",
  COMPLETED = "taskCompleted",
  FAILED = "taskFailed",
  CANCELLED = "taskCancelled",
  PROGRESS = "taskProgress",
  RETRY = "taskRetry",
  TIMEOUT = "taskTimeout",
}

/**
 * 워커 이벤트 타입
 */
export enum WorkerEventType {
  CREATED = "workerCreated",
  ERROR = "workerError",
  EXIT = "workerExit",
  TERMINATING = "workerTerminating",
  RESTART = "workerRestart",
  STATE_CHANGE = "workerStateChange",
}

/**
 * 이벤트 허브 인터페이스
 */
export interface IEventHub {
  /** 태스크 이벤트 발행 */
  emitTaskEvent(eventType: TaskEventType, data: TaskEventData): void;

  /** 워커 이벤트 발행 */
  emitWorkerEvent(eventType: WorkerEventType, data: WorkerEventData): void;

  /** 이벤트 리스너 등록 */
  on<E extends string>(event: E, listener: (...args: any[]) => void): this;

  /** 이벤트 리스너 한 번만 등록 */
  once<E extends string>(event: E, listener: (...args: any[]) => void): this;

  /** 이벤트 리스너 제거 */
  off<E extends string>(event: E, listener: (...args: any[]) => void): this;
}

/**
 * 태스크 이벤트 데이터 인터페이스
 */
export interface TaskEventData {
  /** 태스크 ID */
  taskId: string;
  /** 워커 ID */
  workerId?: string;
  /** 워커 유형 */
  workerType?: string;
  /** 결과 데이터 */
  result?: any;
  /** 오류 */
  error?: any;
  /** 진행 상태 */
  progress?: any;
  /** 재시도 횟수 */
  retryCount?: number;
  /** 추가 데이터 */
  [key: string]: any;
}

/**
 * 워커 이벤트 데이터 인터페이스
 */
export interface WorkerEventData {
  /** 워커 ID */
  workerId: string;
  /** 워커 유형 */
  workerType?: string;
  /** 이전 상태 */
  previousState?: string;
  /** 새 상태 */
  newState?: string;
  /** 종료 코드 */
  exitCode?: number;
  /** 오류 */
  error?: any;
  /** 추가 데이터 */
  [key: string]: any;
}

/**
 * 이벤트 허브 클래스
 */
export class EventHub extends EventEmitter implements IEventHub {
  /**
   * 태스크 이벤트 발행
   * @param eventType 이벤트 타입
   * @param data 이벤트 데이터
   */
  emitTaskEvent(eventType: TaskEventType, data: TaskEventData): void {
    // 이벤트 메타데이터 추가
    const enhancedData = {
      ...data,
      timestamp: Date.now(),
      eventType,
    };

    // 이벤트 발행
    this.emit(eventType, enhancedData);

    // 모든 이벤트에 대한 일반 이벤트도 발행
    this.emit("taskEvent", { type: eventType, ...enhancedData });
  }

  /**
   * 워커 이벤트 발행
   * @param eventType 이벤트 타입
   * @param data 이벤트 데이터
   */
  emitWorkerEvent(eventType: WorkerEventType, data: WorkerEventData): void {
    // 이벤트 메타데이터 추가
    const enhancedData = {
      ...data,
      timestamp: Date.now(),
      eventType,
    };

    // 이벤트 발행
    this.emit(eventType, enhancedData);

    // 모든 이벤트에 대한 일반 이벤트도 발행
    this.emit("workerEvent", { type: eventType, ...enhancedData });
  }

  /**
   * 태스크 큐에 추가됨 이벤트 발행
   * @param taskId 태스크 ID
   * @param workerType 워커 유형
   */
  taskQueued(taskId: string, workerType?: string): void {
    this.emitTaskEvent(TaskEventType.QUEUED, { taskId, workerType });
  }

  /**
   * 태스크 시작됨 이벤트 발행
   * @param taskId 태스크 ID
   * @param workerId 워커 ID
   * @param workerType 워커 유형
   */
  taskStarted(taskId: string, workerId: string, workerType?: string): void {
    this.emitTaskEvent(TaskEventType.STARTED, { taskId, workerId, workerType });
  }

  /**
   * 태스크 완료됨 이벤트 발행
   * @param taskId 태스크 ID
   * @param workerId 워커 ID
   * @param result 결과
   * @param workerType 워커 유형
   */
  taskCompleted(
    taskId: string,
    workerId: string,
    result: any,
    workerType?: string
  ): void {
    this.emitTaskEvent(TaskEventType.COMPLETED, {
      taskId,
      workerId,
      result,
      workerType,
    });
  }

  /**
   * 태스크 실패함 이벤트 발행
   * @param taskId 태스크 ID
   * @param workerId 워커 ID
   * @param error 오류
   * @param workerType 워커 유형
   */
  taskFailed(
    taskId: string,
    workerId: string,
    error: any,
    workerType?: string
  ): void {
    this.emitTaskEvent(TaskEventType.FAILED, {
      taskId,
      workerId,
      error,
      workerType,
    });
  }

  /**
   * 태스크 취소됨 이벤트 발행
   * @param taskId 태스크 ID
   * @param workerId 워커 ID
   * @param workerType 워커 유형
   */
  taskCancelled(taskId: string, workerId?: string, workerType?: string): void {
    this.emitTaskEvent(TaskEventType.CANCELLED, {
      taskId,
      workerId,
      workerType,
    });
  }

  /**
   * 태스크 진행 상태 이벤트 발행
   * @param taskId 태스크 ID
   * @param workerId 워커 ID
   * @param progress 진행 상태
   * @param workerType 워커 유형
   */
  taskProgress(
    taskId: string,
    workerId: string,
    progress: any,
    workerType?: string
  ): void {
    this.emitTaskEvent(TaskEventType.PROGRESS, {
      taskId,
      workerId,
      progress,
      workerType,
    });
  }

  /**
   * 워커 생성됨 이벤트 발행
   * @param workerId 워커 ID
   * @param workerType 워커 유형
   */
  workerCreated(workerId: string, workerType?: string): void {
    this.emitWorkerEvent(WorkerEventType.CREATED, { workerId, workerType });
  }

  /**
   * 워커 오류 이벤트 발행
   * @param workerId 워커 ID
   * @param error 오류
   * @param workerType 워커 유형
   */
  workerError(workerId: string, error: any, workerType?: string): void {
    this.emitWorkerEvent(WorkerEventType.ERROR, {
      workerId,
      error,
      workerType,
    });
  }

  /**
   * 워커 종료 이벤트 발행
   * @param workerId 워커 ID
   * @param exitCode 종료 코드
   * @param workerType 워커 유형
   */
  workerExit(workerId: string, exitCode: number, workerType?: string): void {
    this.emitWorkerEvent(WorkerEventType.EXIT, {
      workerId,
      exitCode,
      workerType,
    });
  }

  /**
   * 워커 상태 변경 이벤트 발행
   * @param workerId 워커 ID
   * @param previousState 이전 상태
   * @param newState 새 상태
   * @param workerType 워커 유형
   */
  workerStateChange(
    workerId: string,
    previousState: string,
    newState: string,
    workerType?: string
  ): void {
    this.emitWorkerEvent(WorkerEventType.STATE_CHANGE, {
      workerId,
      previousState,
      newState,
      workerType,
    });
  }
}
