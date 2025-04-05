/**
 * EventStream 클래스
 * 워커와 메인 스레드 간 지속적인 통신을 위한 스트림 구현
 */

import { EventEmitter } from "eventemitter3";
import {
  StreamOptions,
  StreamStatus,
  StreamMessageType,
  StreamEvents,
  StreamMessage,
} from "../types/stream.js";
import { WorkerType, TaskPriority } from "../types/index.js";
import { generateId } from "./utils.js";
import { logger } from "../utils/logger.js";

/**
 * EventStream 클래스
 * 워커와의 양방향 통신 스트림을 제공
 */
export class EventStream<T = any> extends EventEmitter {
  /** 스트림 ID */
  private id: string;

  /** 스트림 상태 */
  private status: StreamStatus = StreamStatus.INITIALIZING;

  /** 워커 ID */
  private workerId?: string;

  /** 스트림 옵션 */
  private options: Required<StreamOptions>;

  /** 마지막 활동 시간 */
  private lastActivityTime: number = Date.now();

  /** 타임아웃 타이머 */
  private timeoutTimer?: NodeJS.Timeout;

  /**
   * EventStream 생성자
   * @param sendMessage 메시지 전송 콜백
   * @param options 스트림 옵션
   */
  constructor(
    private sendMessage: (message: StreamMessage<T>) => Promise<void>,
    options: StreamOptions = {}
  ) {
    super();

    // 스트림 ID 생성
    this.id = generateId();

    // 기본 옵션 설정
    this.options = {
      workerType: WorkerType.CALC,
      priority: TaskPriority.NORMAL,
      initialData: undefined,
      timeout: 0, // 0은 타임아웃 없음
      autoCleanup: true,
      metadata: {},
      ...options,
    };

    // 타임아웃 설정
    if (this.options.timeout > 0) {
      this.setupTimeoutTimer();
    }

    // 스트림 초기화
    this.initialize();
  }

  /**
   * 스트림 초기화
   */
  private async initialize(): Promise<void> {
    try {
      // 초기화 메시지 전송
      await this.sendMessage({
        type: StreamMessageType.INIT,
        streamId: this.id,
        data: this.options.initialData,
        timestamp: Date.now(),
      });

      logger.debug(`Stream ${this.id} initialized`);
    } catch (error) {
      this.status = StreamStatus.ERROR;
      this.emit("error", error);
      logger.error(`Stream initialization error:`, error);
    }
  }

  /**
   * 스트림 ID 가져오기
   */
  public getId(): string {
    return this.id;
  }

  /**
   * 스트림 상태 가져오기
   */
  public getStatus(): StreamStatus {
    return this.status;
  }

  /**
   * 메시지 전송
   * @param data 전송할 데이터
   */
  public async send(data: T): Promise<void> {
    // 스트림 상태 확인
    if (
      this.status !== StreamStatus.ACTIVE &&
      this.status !== StreamStatus.INITIALIZING
    ) {
      throw new Error(`Cannot send message: stream is ${this.status}`);
    }

    try {
      // 메시지 전송
      await this.sendMessage({
        type: StreamMessageType.MESSAGE,
        streamId: this.id,
        data,
        timestamp: Date.now(),
      });

      // 마지막 활동 시간 업데이트
      this.updateActivity();
    } catch (error) {
      logger.error(`Error sending message to stream ${this.id}:`, error);
      this.emit("error", error);
    }
  }

  /**
   * 메시지 수신 처리
   * @param message 수신된 메시지
   */
  public handleMessage(message: StreamMessage): void {
    // 활동 시간 업데이트
    this.updateActivity();

    // 메시지 타입에 따른 처리
    switch (message.type) {
      case StreamMessageType.READY:
        this.status = StreamStatus.ACTIVE;
        this.emit("ready");
        break;

      case StreamMessageType.MESSAGE:
        if (this.status === StreamStatus.ACTIVE) {
          this.emit("message", message.data);
        }
        break;

      case StreamMessageType.PAUSE:
        this.status = StreamStatus.PAUSED;
        this.emit("pause");
        break;

      case StreamMessageType.RESUME:
        this.status = StreamStatus.ACTIVE;
        this.emit("resume");
        break;

      case StreamMessageType.ERROR:
        this.emit("error", new Error(message.error || "Unknown stream error"));
        break;

      case StreamMessageType.CLOSE:
        this.close();
        break;

      default:
        logger.debug(`Unknown stream message type: ${message.type}`);
    }
  }

  /**
   * 스트림 일시 중지
   */
  public async pause(): Promise<void> {
    if (this.status !== StreamStatus.ACTIVE) return;

    try {
      await this.sendMessage({
        type: StreamMessageType.PAUSE,
        streamId: this.id,
        timestamp: Date.now(),
      });

      this.status = StreamStatus.PAUSED;
      this.emit("pause");
    } catch (error) {
      logger.error(`Error pausing stream ${this.id}:`, error);
    }
  }

  /**
   * 스트림 재개
   */
  public async resume(): Promise<void> {
    if (this.status !== StreamStatus.PAUSED) return;

    try {
      await this.sendMessage({
        type: StreamMessageType.RESUME,
        streamId: this.id,
        timestamp: Date.now(),
      });

      this.status = StreamStatus.ACTIVE;
      this.emit("resume");
    } catch (error) {
      logger.error(`Error resuming stream ${this.id}:`, error);
    }
  }

  /**
   * 스트림 종료
   */
  public async close(): Promise<void> {
    if (this.status === StreamStatus.CLOSED) return;

    try {
      // 종료 메시지 전송
      if (this.status !== StreamStatus.ERROR) {
        await this.sendMessage({
          type: StreamMessageType.CLOSE,
          streamId: this.id,
          timestamp: Date.now(),
        });
      }

      // 상태 업데이트
      this.status = StreamStatus.CLOSED;

      // 타임아웃 타이머 정리
      this.clearTimeoutTimer();

      // 이벤트 발행 및 리스너 정리
      this.emit("close");

      if (this.options.autoCleanup) {
        this.removeAllListeners();
      }

      logger.debug(`Stream ${this.id} closed`);
    } catch (error) {
      logger.error(`Error closing stream ${this.id}:`, error);
    }
  }

  /**
   * 워커 ID 설정
   * @param workerId 워커 ID
   */
  public setWorkerId(workerId: string): void {
    this.workerId = workerId;
  }

  /**
   * 활동 시간 업데이트
   */
  private updateActivity(): void {
    this.lastActivityTime = Date.now();

    // 타임아웃 타이머 재설정
    if (this.options.timeout > 0) {
      this.clearTimeoutTimer();
      this.setupTimeoutTimer();
    }
  }

  /**
   * 타임아웃 타이머 설정
   */
  private setupTimeoutTimer(): void {
    if (this.options.timeout <= 0) return;

    this.timeoutTimer = setTimeout(() => {
      const inactiveTime = Date.now() - this.lastActivityTime;

      if (inactiveTime >= this.options.timeout) {
        logger.warn(
          `Stream ${this.id} timed out after ${inactiveTime}ms of inactivity`
        );
        this.close();
      }
    }, this.options.timeout);
  }

  /**
   * 타임아웃 타이머 정리
   */
  private clearTimeoutTimer(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }
  }
}
