/**
 * 이벤트 허브 모듈
 * 메시지 브로커 역할을 담당하며, 다양한 컴포넌트 간의 이벤트 라우팅을 관리합니다.
 */

import { EventEmitter } from "eventemitter3";
import { Task, TaskStatus } from "../types/index.js";

/**
 * 태스크 이벤트 타입
 */
export enum TaskEventType {
  /** 태스크 큐에 추가됨 */
  QUEUED = "taskQueued",
  /** 태스크 시작됨 */
  STARTED = "taskStarted",
  /** 태스크 진행 중 */
  PROGRESS = "taskProgress",
  /** 태스크 완료됨 */
  COMPLETED = "taskCompleted",
  /** 태스크 실패함 */
  FAILED = "taskFailed",
  /** 태스크 취소됨 */
  CANCELLED = "taskCancelled",
  /** 태스크 재시도함 */
  RETRY = "taskRetry",
}

/**
 * 워커 이벤트 타입
 */
export enum WorkerEventType {
  /** 워커 생성됨 */
  CREATED = "workerCreated",
  /** 워커 종료됨 */
  EXIT = "workerExit",
  /** 워커 오류 발생함 */
  ERROR = "workerError",
  /** 워커 상태 변경됨 */
  STATUS_CHANGE = "workerStatusChange",
}

/**
 * 코어 이벤트 타입
 */
export enum CoreEventType {
  INIT = "systemInit",
  SHUTDOWN = "systemShutdown",
  CONFIG_CHANGE = "configChange",
  ERROR = "systemError",
  WARNING = "systemWarning",
}

/**
 * 이벤트 허브 인터페이스
 */
export interface IEventHub {
  /** 태스크 이벤트 발행 */
  emitTaskEvent(eventType: TaskEventType, data: TaskEventData): void;

  /** 워커 이벤트 발행 */
  emitWorkerEvent(eventType: WorkerEventType, data: WorkerEventData): void;

  /** 코어 이벤트 발행 */
  emitCoreEvent(eventType: CoreEventType, data: any): void;

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
   * 생성자
   */
  constructor() {
    super();
  }

  /**
   * 태스크 이벤트 발행
   * @param type 이벤트 타입
   * @param data 이벤트 데이터
   */
  emitTaskEvent(type: TaskEventType, data: any): void {
    // 태스크 이벤트 발행
    this.emit(type, data);

    // 메타 이벤트 발행
    this.emit("taskEvent", { type, data });
  }

  /**
   * 워커 이벤트 발행
   * @param type 이벤트 타입
   * @param data 이벤트 데이터
   */
  emitWorkerEvent(type: WorkerEventType, data: any): void {
    // 워커 이벤트 발행
    this.emit(type, data);

    // 메타 이벤트 발행
    this.emit("workerEvent", { type, data });
  }

  /**
   * 코어 이벤트 발행
   * @param eventType 이벤트 타입
   * @param data 이벤트 데이터
   */
  emitCoreEvent(eventType: CoreEventType, data: any): void {
    // 코어 이벤트 발행
    this.emit(eventType, data);

    // 메타 이벤트 발행
    this.emit("coreEvent", { type: eventType, data });
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
    this.emitWorkerEvent(WorkerEventType.STATUS_CHANGE, {
      workerId,
      previousState,
      newState,
      workerType,
    });
  }
}
