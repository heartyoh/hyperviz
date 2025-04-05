/**
 * 이벤트 스트림 관련 타입 정의
 */

import { WorkerType, TaskPriority } from "./index.js";

/**
 * 스트림 옵션 인터페이스
 */
export interface StreamOptions {
  /** 워커 유형 */
  workerType?: WorkerType | string;
  /** 스트림 우선순위 */
  priority?: TaskPriority;
  /** 스트림 초기 데이터 */
  initialData?: any;
  /** 스트림 타임아웃 (ms) */
  timeout?: number;
  /** 스트림 자동 정리 여부 */
  autoCleanup?: boolean;
  /** 스트림 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 스트림 상태 열거형
 */
export enum StreamStatus {
  /** 초기화 중 */
  INITIALIZING = "INITIALIZING",
  /** 활성 */
  ACTIVE = "ACTIVE",
  /** 일시 중지 */
  PAUSED = "PAUSED",
  /** 종료됨 */
  CLOSED = "CLOSED",
  /** 오류 */
  ERROR = "ERROR",
}

/**
 * 스트림 메시지 타입 열거형
 */
export enum StreamMessageType {
  /** 스트림 초기화 */
  INIT = "STREAM_INIT",
  /** 스트림 준비 완료 */
  READY = "STREAM_READY",
  /** 스트림 메시지 */
  MESSAGE = "STREAM_MESSAGE",
  /** 스트림 일시 중지 */
  PAUSE = "STREAM_PAUSE",
  /** 스트림 재개 */
  RESUME = "STREAM_RESUME",
  /** 스트림 종료 */
  CLOSE = "STREAM_CLOSE",
  /** 스트림 오류 */
  ERROR = "STREAM_ERROR",
}

/**
 * 스트림 이벤트 인터페이스
 */
export interface StreamEvents<T = any> {
  /** 메시지 이벤트 */
  message: [T];
  /** 준비 완료 이벤트 */
  ready: [void];
  /** 일시 중지 이벤트 */
  pause: [void];
  /** 재개 이벤트 */
  resume: [void];
  /** 종료 이벤트 */
  close: [void];
  /** 오류 이벤트 */
  error: [Error];
}

/**
 * 스트림 메시지 인터페이스
 */
export interface StreamMessage<T = any> {
  /** 메시지 타입 */
  type: StreamMessageType;
  /** 스트림 ID */
  streamId: string;
  /** 메시지 데이터 */
  data?: T;
  /** 타임스탬프 */
  timestamp?: number;
  /** 오류 정보 */
  error?: string;
}
