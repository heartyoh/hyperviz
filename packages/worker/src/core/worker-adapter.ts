import { EventEmitter } from "eventemitter3";
import {
  TaskPriority,
  WorkerEvents,
  WorkerStatus,
  Task,
  TaskStatus,
} from "../types/index.js";
import { IWorker } from "../types/interfaces.js";
import { StreamMessageType } from "../types/stream.js";

// 웹 환경 여부 확인
const isWeb = typeof window !== "undefined" && typeof Worker !== "undefined";

/**
 * 우선순위 메시지 인터페이스
 */
interface PriorityMessage {
  message: any;
  priority: TaskPriority;
  timestamp: number;
}

/**
 * 워커 초기화 옵션
 */
export interface WorkerOptions {
  /** 워커 ID */
  id: string;
  /** 워커 URL (웹 환경) */
  url?: string;
  /** 워커 파일 경로 (Node.js 환경) */
  file?: string;
  /** 워커 초기화 데이터 */
  workerData?: any;
  /** 워커 메시지 큐 크기 제한 */
  maxQueueSize?: number;
}

/**
 * 워커 어댑터 클래스
 * 웹 워커와 Node.js 워커를 일관된 인터페이스로 제공
 */
export class WorkerAdapter extends EventEmitter implements IWorker {
  /** 워커 ID */
  readonly id: string;
  /** 웹 워커 인스턴스 */
  private webWorker?: Worker;
  /** Node.js 워커 인스턴스 */
  private nodeWorker?: any;
  /** 워커 상태 */
  private _status: WorkerStatus = WorkerStatus.STARTING;
  /** 메시지 처리 중 여부 */
  private processing: boolean = false;
  /** 종료 여부 */
  private terminated: boolean = false;
  /** 메시지 우선순위 큐 */
  private messageQueue: PriorityMessage[] = [];
  /** 최대 큐 크기 */
  private maxQueueSize: number;
  /** 워커 정보 */
  info: {
    /** 상태 */
    status: WorkerStatus;
    /** 태스크 수 */
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
  };

  /** 워커 유형 */
  workerType: string = "default";

  /** 워커 생성 시간 */
  createdAt: number = Date.now();

  /** 마지막 활동 시간 */
  lastActiveAt: number = Date.now();

  /** 현재 실행 중인 태스크 */
  currentTask?: Task<any, any>;

  /**
   * 워커 상태 속성
   */
  get state(): WorkerStatus {
    return this._status;
  }

  /**
   * 워커 어댑터 생성자
   * @param options 워커 옵션
   */
  constructor(options: WorkerOptions) {
    super();

    this.id = options.id;
    this.maxQueueSize = options.maxQueueSize || 100;

    // 워커 정보 초기화
    this.info = {
      status: WorkerStatus.STARTING,
      tasks: 0,
      performance: {
        averageTaskTime: 0,
        completedTasks: 0,
        errors: 0,
      },
    };

    // 웹 또는 Node.js 환경에 맞게 워커 초기화
    if (isWeb && options.url) {
      this.initWebWorker(options.url, options.workerData);
    } else if (!isWeb && options.file) {
      this.initNodeWorker(options.file, options.workerData);
    } else {
      throw new Error(
        "워커 생성에 필요한 URL 또는 파일 경로가 지정되지 않았습니다"
      );
    }
  }

  /**
   * 웹 워커 초기화
   * @param url 워커 URL
   * @param workerData 초기화 데이터
   */
  private initWebWorker(url: string, workerData?: any): void {
    try {
      // 웹 워커 생성
      this.webWorker = new Worker(url, { type: "module" });

      // 메시지 핸들러 등록
      this.webWorker.onmessage = (event) => {
        this.emit("message", event.data);
      };

      // 오류 핸들러 등록
      this.webWorker.onerror = (error) => {
        this.info.performance.errors++;
        this.info.status = WorkerStatus.ERROR;
        this.emit(
          "error",
          error instanceof Error ? error : new Error(String(error))
        );
      };

      // 상태 업데이트
      this._status = WorkerStatus.IDLE;
      this.info.status = WorkerStatus.IDLE;

      // 초기화 데이터 전송 (있는 경우)
      if (workerData) {
        this.postMessage({
          __workerInit: true,
          id: this.id,
          data: workerData,
        });
      }
    } catch (error) {
      this._status = WorkerStatus.ERROR;
      this.info.status = WorkerStatus.ERROR;
      this.emit(
        "error",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Node.js 워커 초기화
   * @param file 워커 파일 경로
   * @param workerData 초기화 데이터
   */
  private initNodeWorker(file: string, workerData?: any): void {
    try {
      // Worker Threads 모듈 동적 임포트
      const { Worker } = require("worker_threads");

      // Node.js 워커 생성
      this.nodeWorker = new Worker(file, {
        workerData: {
          id: this.id,
          ...workerData,
        },
      });

      // 메시지 핸들러 등록
      this.nodeWorker.on("message", (data: any) => {
        this.emit("message", data);
      });

      // 오류 핸들러 등록
      this.nodeWorker.on("error", (error: Error) => {
        this.info.performance.errors++;
        this.info.status = WorkerStatus.ERROR;
        this.emit("error", error);
      });

      // 종료 핸들러 등록
      this.nodeWorker.on("exit", (code: number) => {
        this.emit("exit", code);
        this.terminated = true;
      });

      // 상태 업데이트
      this._status = WorkerStatus.IDLE;
      this.info.status = WorkerStatus.IDLE;
    } catch (error) {
      this._status = WorkerStatus.ERROR;
      this.info.status = WorkerStatus.ERROR;
      this.emit(
        "error",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 워커에 메시지 전송
   * @param message 메시지
   */
  postMessage(message: any): void {
    if (this.terminated) {
      throw new Error("종료된 워커에 메시지를 전송할 수 없습니다");
    }

    try {
      if (this.webWorker) {
        this.webWorker.postMessage(message);
      } else if (this.nodeWorker) {
        this.nodeWorker.postMessage(message);
      }
    } catch (error) {
      this.emit(
        "error",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 우선순위 메시지 전송
   * @param message 메시지
   * @param priority 우선순위
   */
  postPrioritizedMessage(
    message: any,
    priority: TaskPriority = TaskPriority.NORMAL
  ): void {
    // 큐가 가득 찼는지 확인
    if (this.messageQueue.length >= this.maxQueueSize) {
      throw new Error("메시지 큐가 가득 찼습니다");
    }

    // 메시지를 큐에 추가
    this.messageQueue.push({
      message,
      priority,
      timestamp: Date.now(),
    });

    // 메시지 처리 시작
    if (!this.processing) {
      this.processMessageQueue();
    }
  }

  /**
   * 메시지 큐 처리
   */
  private async processMessageQueue(): Promise<void> {
    if (this.processing || this.messageQueue.length === 0 || this.terminated) {
      return;
    }

    this.processing = true;

    try {
      // 큐 정렬 (우선순위 높은 순, 같은 우선순위면 먼저 들어온 순)
      this.messageQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.timestamp - b.timestamp;
      });

      // 첫 번째 메시지 처리
      const nextMessage = this.messageQueue.shift();
      if (nextMessage) {
        this.postMessage(nextMessage.message);
      }
    } catch (error) {
      this.emit(
        "error",
        error instanceof Error ? error : new Error(String(error))
      );
    } finally {
      this.processing = false;

      // 큐에 메시지가 남아있으면 계속 처리
      if (this.messageQueue.length > 0) {
        // 비동기로 다음 처리 예약
        setTimeout(() => this.processMessageQueue(), 0);
      }
    }
  }

  /**
   * 워커 종료
   * @param force 강제 종료 여부
   */
  async terminate(force: boolean = false): Promise<void> {
    if (this.terminated) {
      return;
    }

    this._status = WorkerStatus.TERMINATING;
    this.info.status = WorkerStatus.TERMINATING;
    this.terminated = true;

    // 실행 중인 태스크 종료 처리
    const terminationError = new Error(
      "Worker terminated while processing task"
    );
    const messageListeners = this.listeners("message");

    // 메시지 리스너 제거 (주로 태스크 처리 관련 리스너들)
    for (const listener of messageListeners) {
      this.off("message", listener);
    }

    // 모든 대기 중인 태스크에 대한 오류 이벤트 발생
    if (messageListeners.length > 0) {
      this.emit("error", terminationError);
    }

    if (this.webWorker) {
      this.webWorker.terminate();
    } else if (this.nodeWorker) {
      if (force) {
        this.nodeWorker.terminate();
      } else {
        this.nodeWorker.postMessage({ type: "terminate" });
      }
    }

    // 리소스 정리
    this.messageQueue = [];
    this.webWorker = undefined;
    this.nodeWorker = undefined;

    // 종료 이벤트 발생
    this.emit("exit", 0);
  }

  /**
   * 태스크 시작
   * @param task 시작할 태스크
   */
  async startTask<T, R>(task: Task<T, R>): Promise<R> {
    this._status = WorkerStatus.BUSY;
    this.info.status = WorkerStatus.BUSY;
    this.lastActiveAt = Date.now();

    return new Promise<R>((resolve, reject) => {
      const messageHandler = (response: any) => {
        try {
          if (response && response.taskId === task.id) {
            this.off("message", messageHandler);

            if (response.type === "taskCompleted") {
              this._status = WorkerStatus.IDLE;
              this.info.status = WorkerStatus.IDLE;
              resolve(response.result);
            } else if (response.type === "taskFailed") {
              this._status = WorkerStatus.IDLE;
              this.info.status = WorkerStatus.IDLE;
              reject(response.error);
            }
          }
        } catch (error) {
          this._status = WorkerStatus.ERROR;
          this.info.status = WorkerStatus.ERROR;
          this.off("message", messageHandler);
          reject(error instanceof Error ? error : new Error(String(error)));
          this.emit(
            "error",
            error instanceof Error ? error : new Error(String(error))
          );
        }
      };

      this.on("message", messageHandler);

      try {
        this.postMessage({
          type: "startTask",
          taskId: task.id,
          data: task.data,
        });
      } catch (error) {
        this.off("message", messageHandler);
        this._status = WorkerStatus.IDLE;
        this.info.status = WorkerStatus.IDLE;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * 워커가 유휴 상태인지 확인
   */
  isIdle(): boolean {
    return this._status === WorkerStatus.IDLE;
  }

  /**
   * 워커가 바쁜 상태인지 확인
   */
  isBusy(): boolean {
    return this._status === WorkerStatus.BUSY;
  }

  /**
   * 워커가 사용 가능한지 확인
   */
  isAvailable(): boolean {
    return this._status === WorkerStatus.IDLE;
  }

  /**
   * 태스크 상태 업데이트
   * @param taskId 태스크 ID
   * @param status 새로운 상태
   */
  updateTaskStatus(taskId: string, status: TaskStatus): void {
    if (this.currentTask && this.currentTask.id === taskId) {
      this.currentTask.status = status;
    }
  }

  /**
   * 태스크 정보 가져오기
   * @param taskId 태스크 ID
   */
  getTask(taskId: string): Task<any, any> | undefined {
    if (this.currentTask && this.currentTask.id === taskId) {
      return this.currentTask;
    }
    return undefined;
  }

  /**
   * 이벤트 리스너 등록
   * @param event 이벤트 이름
   * @param listener 리스너 함수
   */
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

/**
 * 워커 스크립트에 추가할 이벤트 스트림 처리 코드
 */
export const streamHandlerCode = `
// 활성 스트림 관리
const activeStreams = new Set();

// 스트림 처리 핸들러
function handleStreamMessage(message) {
  const { type, streamId, data } = message;
  
  if (!type || !streamId) return;
  
  switch (type) {
    case "${StreamMessageType.INIT}":
      // 스트림 초기화
      activeStreams.add(streamId);
      
      // 준비 완료 메시지 응답
      self.postMessage({
        type: "${StreamMessageType.READY}",
        streamId,
        timestamp: Date.now()
      });
      break;
      
    case "${StreamMessageType.MESSAGE}":
      // 스트림 활성 확인
      if (activeStreams.has(streamId)) {
        // 데이터 처리 및 응답
        // 실제 구현에서는 데이터 처리 로직 추가
        self.postMessage({
          type: "${StreamMessageType.MESSAGE}",
          streamId,
          data: data, // 처리된 데이터 반환
          timestamp: Date.now()
        });
      }
      break;
      
    case "${StreamMessageType.PAUSE}":
      // 스트림 일시 중지 처리
      if (activeStreams.has(streamId)) {
        // 일시 중지 확인 응답
        self.postMessage({
          type: "${StreamMessageType.PAUSE}",
          streamId,
          timestamp: Date.now()
        });
      }
      break;
      
    case "${StreamMessageType.RESUME}":
      // 스트림 재개 처리
      if (activeStreams.has(streamId)) {
        // 재개 확인 응답
        self.postMessage({
          type: "${StreamMessageType.RESUME}",
          streamId,
          timestamp: Date.now()
        });
      }
      break;
      
    case "${StreamMessageType.CLOSE}":
      // 스트림 종료
      activeStreams.delete(streamId);
      break;
  }
}

// 기존 메시지 핸들러 확장
const originalMessageHandler = self.onmessage;

self.onmessage = function(event) {
  const message = event.data;
  
  // 스트림 메시지 처리
  if (
    message && 
    typeof message === 'object' && 
    message.type && 
    message.type.startsWith('STREAM_')
  ) {
    handleStreamMessage(message);
    return;
  }
  
  // 기존 메시지 핸들러 호출
  if (originalMessageHandler) {
    originalMessageHandler.call(self, event);
  }
};
`;
