/**
 * WorkerPool 클래스
 * 워커 풀 관리 및 태스크 처리를 담당합니다.
 */

import { EventEmitter } from "eventemitter3";
import {
  Task,
  TaskStatus,
  TaskPriority,
  WorkerType,
  WorkerStatus,
} from "../types/index.js";
import { TaskQueue } from "./task-queue.js";
import { WorkerManager } from "./worker-manager.js";
import { EventHub, TaskEventType, WorkerEventType } from "./event-hub.js";
import { logger } from "../utils/logger.js";
import { generateId } from "./utils.js";
import { StreamManager } from "./stream-manager.js";
import { EventStream } from "./event-stream.js";
import { StreamOptions } from "../types/stream.js";
import { WorkerAdapter } from "./worker-adapter.js";

/**
 * WorkerPool 설정 인터페이스
 */
export interface WorkerPoolConfig {
  /** 최소 워커 수 */
  minWorkers?: number;
  /** 최대 워커 수 */
  maxWorkers?: number;
  /** 워커 유휴 타임아웃 (ms) */
  idleTimeout?: number;
  /** 워커 URL (웹 환경) */
  workerUrl?: string | ((type: string) => string);
  /** 워커 파일 경로 (Node.js 환경) */
  workerFile?: string | ((type: string) => string);
  /** 워커 옵션 */
  workerOptions?: any;
  /** 태스크 제한 시간 (ms) */
  taskTimeout?: number;
  /** 태스크 폴링 간격 (ms) */
  taskPollingInterval?: number;
  /** 통계 업데이트 간격 (ms) */
  statsUpdateInterval?: number;
  /** 로깅 활성화 여부 */
  enableLogging?: boolean;
  /** 메모리 임계치 (MB) */
  memoryThreshold?: number;
  /** CPU 임계치 (%) */
  cpuThreshold?: number;
  /** 리소스 모니터링 간격 (ms) */
  resourceMonitorInterval?: number;
  /** 동적 스케일링 활성화 여부 */
  enableDynamicScaling?: boolean;
  /** 스케일 업 임계치 (%) */
  scaleUpThreshold?: number;
  /** 스케일 다운 임계치 (%) */
  scaleDownThreshold?: number;
  /** 태스크 우선순위 기반 리소스 할당 활성화 여부 */
  enablePriorityBasedAllocation?: boolean;
  /** 고우선순위 태스크 리소스 할당 비율 (%) */
  highPriorityResourceRatio?: number;
}

/**
 * 워커 풀 통계 인터페이스
 */
export interface WorkerPoolStats {
  /** 총 워커 수 */
  totalWorkers: number;
  /** 활성 워커 수 */
  activeWorkers: number;
  /** 유휴 워커 수 */
  idleWorkers: number;
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
  avgTaskDuration: number;
}

/**
 * 태스크 옵션 인터페이스
 */
export interface TaskOptions<T = any, R = any> {
  /** 태스크 ID */
  id?: string;
  /** 태스크 우선순위 */
  priority?: TaskPriority;
  /** 태스크 타임아웃 (ms) */
  timeout?: number;
  /** 워커 유형 */
  workerType?: string;
  /** 최대 재시도 횟수 */
  maxRetries?: number;
  /** 진행 상태 콜백 */
  onProgress?: (progress: any) => void;
}

/**
 * WorkerPool 클래스
 * 워커 풀과 태스크 큐를 관리하는 주요 클래스
 */
export class WorkerPool extends EventEmitter {
  /** 태스크 큐 */
  private taskQueues: Map<string, TaskQueue<any, any>> = new Map();

  /** 워커 매니저 */
  private workerManager: WorkerManager;

  /** 이벤트 허브 */
  private eventHub: EventHub;

  /** 실행 중인 태스크 */
  private runningTasks: Map<string, Task<any, any>> = new Map();

  /** 태스크 해결자 */
  private taskResolvers: Map<string, { resolve: Function; reject: Function }> =
    new Map();

  /** 워커 풀 설정 */
  private config: WorkerPoolConfig;

  /** 폴링 인터벌 ID */
  private pollingIntervalId?: NodeJS.Timeout;

  /** 통계 인터벌 ID */
  private statsIntervalId?: NodeJS.Timeout;

  /** 통계 정보 */
  private stats: WorkerPoolStats = {
    totalWorkers: 0,
    activeWorkers: 0,
    idleWorkers: 0,
    pendingTasks: 0,
    runningTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    cancelledTasks: 0,
    totalProcessedTasks: 0,
    avgTaskDuration: 0,
  };

  /** 태스크 소요 시간 기록 */
  private taskDurations: number[] = [];

  /** 워커 풀이 종료되었는지 여부 */
  private isShutdown: boolean = false;

  /** 스트림 매니저 */
  private streamManager: StreamManager;

  /** 리소스 모니터링 타이머 */
  private resourceMonitorTimer: NodeJS.Timeout | null = null;

  /** 리소스 사용량 통계 */
  private resourceStats: {
    memory: number;
    cpu: number;
    lastUpdate: number;
  } = {
    memory: 0,
    cpu: 0,
    lastUpdate: Date.now()
  };

  /**
   * WorkerPool 생성자
   * @param config 워커 풀 설정
   */
  constructor(config: Partial<WorkerPoolConfig> = {}) {
    super();

    // 기본 설정 적용
    this.config = {
      minWorkers: 1,
      maxWorkers: 4,
      idleTimeout: 30000,
      taskTimeout: 60000,
      taskPollingInterval: 100,
      statsUpdateInterval: 5000,
      enableLogging: true,
      ...config,
    };

    // 이벤트 허브 초기화
    this.eventHub = new EventHub();
    this.setupEventHub();

    // 워커 매니저 초기화
    this.workerManager = new WorkerManager({
      minWorkers: this.config.minWorkers || 1,
      maxWorkers: this.config.maxWorkers || 4,
      idleTimeout: this.config.idleTimeout || 30000,
      workerUrl: this.config.workerUrl,
      workerFile: this.config.workerFile,
      workerType: WorkerType.CALC,
    });

    // 이벤트 리스너 설정
    this.setupEventListeners();

    // 태스크 폴링 시작
    this.startTaskPolling();

    // 통계 업데이트 시작
    this.startStatsUpdates();

    // 스트림 매니저 초기화
    this.streamManager = new StreamManager();

    // 리소스 모니터링 설정
    this.startResourceMonitoring();

    if (this.config.enableLogging) {
      logger.info(
        `WorkerPool initialized with ${this.config.minWorkers} min and ${this.config.maxWorkers} max workers`
      );
    }
  }

  /**
   * 이벤트 허브 설정
   */
  private setupEventHub(): void {
    // 태스크 이벤트 구독
    this.eventHub.on(TaskEventType.COMPLETED, (data: any) => {
      const { taskId, result } = data;
      this.handleTaskCompletion(taskId, result);
    });

    this.eventHub.on(TaskEventType.FAILED, (data: any) => {
      const { taskId, error } = data;
      this.handleTaskFailure(taskId, error);
    });

    this.eventHub.on(TaskEventType.CANCELLED, (data: any) => {
      const { taskId } = data;
      this.handleTaskCancellation(taskId);
    });

    // 워커 이벤트 구독
    this.eventHub.on(WorkerEventType.ERROR, (data: any) => {
      const { workerId, error } = data;
      this.handleWorkerError(workerId, error);
    });

    // 모든 이벤트를 상위 이벤트 발신기로 전달
    this.eventHub.on("taskEvent", (data: any) => {
      this.emit("taskEvent", data);
    });

    this.eventHub.on("workerEvent", (data: any) => {
      this.emit("workerEvent", data);
    });
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    // 워커 매니저 이벤트 리스너
    this.workerManager.on("workerCreated", ({ workerId, workerType }) => {
      this.eventHub.emitWorkerEvent(WorkerEventType.CREATED, {
        workerId,
        workerType,
      });
    });

    this.workerManager.on("workerError", ({ workerId, error, workerType }) => {
      this.eventHub.emitWorkerEvent(WorkerEventType.ERROR, {
        workerId,
        error,
        workerType,
      });

      // 현재 실행 중인 태스크 찾기
      const task = this.findTaskByWorkerId(workerId);
      if (task) {
        this.handleTaskFailure(task.id, error);
      }
    });

    this.workerManager.on(
      "workerExit",
      ({ workerId, exitCode, workerType }) => {
        this.eventHub.emitWorkerEvent(WorkerEventType.EXIT, {
          workerId,
          exitCode,
          workerType,
        });

        // 현재 실행 중인 태스크 찾기
        const task = this.findTaskByWorkerId(workerId);
        if (task) {
          this.handleTaskFailure(
            task.id,
            new Error(
              `Worker exited with code ${exitCode} while processing task`
            )
          );
        }
      }
    );

    this.workerManager.on(
      "workerMessage",
      ({ workerId, message, workerType }) => {
        this.handleWorkerMessage(workerId, message);
      }
    );
  }

  /**
   * 워커 ID로 태스크 찾기
   * @param workerId 워커 ID
   */
  private findTaskByWorkerId(workerId: string): Task<any, any> | undefined {
    for (const task of this.runningTasks.values()) {
      if (task.workerId === workerId) {
        return task;
      }
    }
    return undefined;
  }

  /**
   * 태스크 폴링 시작
   */
  private startTaskPolling(): void {
    this.pollingIntervalId = setInterval(() => {
      this.processPendingTasks();
    }, this.config.taskPollingInterval);
  }

  /**
   * 통계 업데이트 시작
   */
  private startStatsUpdates(): void {
    this.statsIntervalId = setInterval(() => {
      this.updateStats();
    }, this.config.statsUpdateInterval);
  }

  /**
   * 리소스 모니터링 시작
   */
  private startResourceMonitoring(): void {
    if (this.resourceMonitorTimer) {
      clearInterval(this.resourceMonitorTimer);
    }

    const interval = this.config.resourceMonitorInterval || 5000;
    this.resourceMonitorTimer = setInterval(() => {
      this.monitorResources();
    }, interval);
  }

  /**
   * 리소스 사용량 모니터링
   */
  private async monitorResources(): Promise<void> {
    try {
      const { memory, cpu } = await this.getResourceUsage();
      this.resourceStats = {
        memory,
        cpu,
        lastUpdate: Date.now()
      };

      // 리소스 임계치 체크
      this.checkResourceThresholds();

      // 동적 스케일링
      if (this.config.enableDynamicScaling) {
        this.adjustWorkerCount();
      }
    } catch (error) {
      this.log('error', 'Resource monitoring failed:', error);
    }
  }

  /**
   * 리소스 사용량 조회
   */
  private async getResourceUsage(): Promise<{ memory: number; cpu: number }> {
    // TODO: 실제 리소스 사용량 측정 구현
    return {
      memory: 0,
      cpu: 0
    };
  }

  /**
   * 리소스 임계치 체크
   */
  private checkResourceThresholds(): void {
    const { memory, cpu } = this.resourceStats;
    const { memoryThreshold, cpuThreshold } = this.config;

    if (memoryThreshold && memory > memoryThreshold) {
      this.eventHub.emitWorkerEvent(WorkerEventType.ERROR, {
        type: 'memory',
        value: memory,
        threshold: memoryThreshold
      });
    }

    if (cpuThreshold && cpu > cpuThreshold) {
      this.eventHub.emitWorkerEvent(WorkerEventType.ERROR, {
        type: 'cpu',
        value: cpu,
        threshold: cpuThreshold
      });
    }
  }

  /**
   * 워커 수 동적 조정
   */
  private adjustWorkerCount(): void {
    const { scaleUpThreshold, scaleDownThreshold, maxWorkers = 4, minWorkers = 1 } = this.config;
    const { cpu } = this.resourceStats;
    const currentWorkers = this.workerManager.getWorkers().length;

    if (scaleUpThreshold && cpu > scaleUpThreshold && currentWorkers < maxWorkers) {
      this.workerManager.addWorker();
    } else if (scaleDownThreshold && cpu < scaleDownThreshold && currentWorkers > minWorkers) {
      this.workerManager.removeIdleWorker();
    }
  }

  /**
   * 우선순위 기반 리소스 할당
   */
  private allocateResourcesByPriority(task: Task): void {
    if (!this.config.enablePriorityBasedAllocation) {
      return;
    }

    const { highPriorityResourceRatio = 70 } = this.config;
    const totalWorkers = this.workerManager.getWorkers().length;
    const highPriorityWorkers = Math.ceil((totalWorkers * highPriorityResourceRatio) / 100);

    if (task.priority === TaskPriority.HIGH) {
      // 고우선순위 태스크를 위한 워커 할당
      const highPriorityWorker = this.workerManager.getWorkers()
        .filter(w => !w.isBusy)
        .slice(0, highPriorityWorkers)
        .find(w => !w.currentTask);

      if (highPriorityWorker) {
        this.assignTaskToWorker(task, highPriorityWorker);
      }
    } else {
      // 일반 우선순위 태스크를 위한 워커 할당
      const normalPriorityWorker = this.workerManager.getWorkers()
        .filter(w => !w.isBusy)
        .slice(highPriorityWorkers)
        .find(w => !w.currentTask);

      if (normalPriorityWorker) {
        this.assignTaskToWorker(task, normalPriorityWorker);
      }
    }
  }

  /**
   * 대기 중인 태스크 처리
   */
  private async processPendingTasks(): Promise<void> {
    // 워커 풀이 종료되었으면 처리하지 않음
    if (this.isShutdown) return;

    // 모든 워커 유형에 대해 처리
    for (const [workerType, queue] of this.taskQueues.entries()) {
      // 큐가 비어있으면 다음 큐로
      if (queue.isEmpty()) continue;

      try {
        // 사용 가능한 워커 가져오기
        const worker = this.workerManager.getIdleWorker();

        // 사용 가능한 워커가 없으면 다음 큐로
        if (!worker) continue;

        // 태스크 가져오기
        const task = queue.dequeue();
        if (!task) continue;

        // 태스크에 워커 ID 할당
        task.workerId = worker.id;

        // 태스크 실행
        this.runningTasks.set(task.id, task);
        this.processTask(worker, task);

        // 통계 업데이트
        this.stats.pendingTasks--;
        this.stats.runningTasks++;

        // 이벤트 발행
        this.eventHub.emitTaskEvent(TaskEventType.STARTED, {
          taskId: task.id,
          workerId: worker.id,
          workerType,
        });
      } catch (error) {
        logger.error(
          `Error processing pending tasks for worker type ${workerType}:`,
          error
        );
      }
    }
  }

  /**
   * 태스크 처리
   * @param worker 워커 인스턴스
   * @param task 태스크
   */
  private async processTask<T, R>(
    worker: any,
    task: Task<T, R>
  ): Promise<void> {
    try {
      // 태스크 시작 시간 기록
      const startTime = Date.now();

      // 태스크 타임아웃 설정
      const timeout = task.options.timeout || this.config.taskTimeout;
      let timeoutId: NodeJS.Timeout | undefined;

      if (timeout) {
        timeoutId = setTimeout(() => {
          // 타임아웃 처리
          this.handleTaskFailure(
            task.id,
            new Error(`Task timed out after ${timeout}ms`)
          );

          // 워커 재시작
          this.workerManager
            .releaseWorker(worker.id)
            .catch((error) =>
              logger.error(`Error restarting worker ${worker.id}:`, error)
            );
        }, timeout);
      }

      try {
        // 워커에 태스크 메시지 전송
        worker.postMessage({
          type: "startTask",
          taskId: task.id,
          data: task.data,
        });

        // 워커 상태 업데이트
        this.workerManager.setWorkerStatus(worker.id, WorkerStatus.BUSY);

        // 태스크 상태 업데이트
        task.status = TaskStatus.RUNNING;
        task.startedAt = Date.now();

        // 태스크가 워커에서 처리되는 동안 대기
        // 실제 처리는 워커 메시지 핸들러에서 처리됨
      } catch (error) {
        // 타임아웃 취소
        if (timeoutId) clearTimeout(timeoutId);

        // 태스크 실패 처리
        this.handleTaskFailure(task.id, error);
      }
    } catch (error) {
      logger.error(`Error in processTask:`, error);
      this.handleTaskFailure(task.id, error);
    }
  }

  /**
   * 워커에 메시지 전송
   * @param workerId 워커 ID
   * @param message 메시지
   */
  private async sendMessageToWorker(
    workerId: string,
    message: any
  ): Promise<void> {
    const worker = this.workerManager.getWorker(workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }

    return new Promise<void>((resolve, reject) => {
      try {
        worker.postMessage(message);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 워커 메시지 처리
   * @param workerId 워커 ID
   * @param message 메시지
   */
  private handleWorkerMessage(workerId: string, message: any): void {
    if (!message || !message.type) return;

    try {
      // 스트림 메시지 처리
      if (message.type.startsWith("STREAM_")) {
        this.streamManager.handleWorkerMessage(workerId, message);
        return;
      }

      // 기존 메시지 처리 로직
      switch (message.type) {
        case "taskProgress":
          if (message.taskId && message.progress) {
            this.eventHub.emitTaskEvent(TaskEventType.PROGRESS, {
              taskId: message.taskId,
              workerId,
              progress: message.progress,
            });

            // 진행 상태 이벤트 발행
            this.emit("taskProgress", {
              taskId: message.taskId,
              progress: message.progress,
            });
          }
          break;

        case "taskCompleted":
          if (message.taskId && message.result !== undefined) {
            this.handleTaskCompletion(message.taskId, message.result);
          }
          break;

        case "taskFailed":
          if (message.taskId && message.error) {
            this.handleTaskFailure(message.taskId, message.error);
          }
          break;

        default:
          // 알 수 없는 메시지 타입 처리
          logger.debug(
            `Unknown message type from worker ${workerId}:`,
            message
          );
          break;
      }
    } catch (error) {
      logger.error(`Error handling worker message:`, error);
    }
  }

  /**
   * 워커 오류 처리
   * @param workerId 워커 ID
   * @param error 오류
   */
  private handleWorkerError(workerId: string, error: any): void {
    logger.error(`Worker ${workerId} error:`, error);

    // 오류 이벤트 발행
    this.emit("workerError", { workerId, error });
  }

  /**
   * 태스크 완료 처리
   * @param taskId 태스크 ID
   * @param result 결과
   */
  private handleTaskCompletion(taskId: string, result: any): void {
    const task = this.runningTasks.get(taskId);
    if (!task) return;

    try {
      // 태스크 상태 업데이트
      task.status = TaskStatus.COMPLETED;
      task.result = result;
      task.completedAt = Date.now();

      // 워커 상태 업데이트
      if (task.workerId) {
        this.workerManager.setWorkerStatus(task.workerId, WorkerStatus.IDLE);
      }

      // 태스크 해결
      const resolver = this.taskResolvers.get(taskId);
      if (resolver) {
        resolver.resolve(result);
        this.taskResolvers.delete(taskId);
      }

      // 태스크 정리
      this.cleanupTask(taskId);

      // 통계 업데이트
      this.stats.runningTasks--;
      this.stats.completedTasks++;
      this.stats.totalProcessedTasks++;

      // 이벤트 발행
      this.emit("taskCompleted", { taskId, result });
    } catch (error) {
      logger.error(`Error handling task completion:`, error);
    }
  }

  /**
   * 태스크 실패 처리
   * @param taskId 태스크 ID
   * @param error 오류
   */
  private handleTaskFailure(taskId: string, error: any): void {
    const task = this.runningTasks.get(taskId);
    if (!task) return;

    try {
      // 태스크 상태 업데이트
      task.status = TaskStatus.FAILED;
      task.error = error?.message || String(error);
      task.completedAt = Date.now();

      // 워커 상태 업데이트
      if (task.workerId) {
        this.workerManager.setWorkerStatus(task.workerId, WorkerStatus.IDLE);
      }

      // 태스크 거부
      const resolver = this.taskResolvers.get(taskId);
      if (resolver) {
        resolver.reject(error);
        this.taskResolvers.delete(taskId);
      }

      // 태스크 정리
      this.cleanupTask(taskId);

      // 통계 업데이트
      this.stats.runningTasks--;
      this.stats.failedTasks++;
      this.stats.totalProcessedTasks++;

      // 이벤트 발행
      this.emit("taskFailed", { taskId, error });
    } catch (err) {
      logger.error(`Error handling task failure:`, err);
    }
  }

  /**
   * 태스크 취소 처리
   * @param taskId 태스크 ID
   */
  private handleTaskCancellation(taskId: string): void {
    const pendingTask = this.findPendingTask(taskId);

    if (pendingTask) {
      // 대기 중인 태스크 취소
      const workerType = pendingTask.workerType as string;
      const queue = this.taskQueues.get(workerType);

      if (queue) {
        queue.remove(taskId);
        this.stats.pendingTasks--;
      }
    }

    const runningTask = this.runningTasks.get(taskId);

    if (runningTask) {
      // 실행 중인 태스크 취소
      runningTask.status = TaskStatus.CANCELLED;

      // 워커에 취소 메시지 전송
      if (runningTask.workerId) {
        const worker = this.workerManager.getWorker(runningTask.workerId);
        if (worker) {
          worker.postMessage({ type: "cancelTask", taskId });
        }

        // 워커 상태 업데이트
        this.workerManager.setWorkerStatus(
          runningTask.workerId,
          WorkerStatus.IDLE
        );
      }

      // 태스크 거부
      const resolver = this.taskResolvers.get(taskId);
      if (resolver) {
        resolver.reject(new Error("Task cancelled"));
        this.taskResolvers.delete(taskId);
      }

      // 태스크 정리
      this.cleanupTask(taskId);

      // 통계 업데이트
      this.stats.runningTasks--;
      this.stats.cancelledTasks++;
      this.stats.totalProcessedTasks++;
    }

    // 이벤트 발행
    this.emit("taskCancelled", { taskId });
  }

  /**
   * 태스크 정리
   * @param taskId 태스크 ID
   */
  private cleanupTask(taskId: string): void {
    this.runningTasks.delete(taskId);
  }

  /**
   * 대기 중인 태스크 찾기
   * @param taskId 태스크 ID
   */
  private findPendingTask(taskId: string): Task<any, any> | undefined {
    for (const [_, queue] of this.taskQueues.entries()) {
      const tasks = queue.getAll();
      const task = tasks.find((t) => t.id === taskId);
      if (task) return task;
    }
    return undefined;
  }

  /**
   * 태스크 큐 가져오기 또는 생성
   * @param workerType 워커 유형
   */
  private getOrCreateQueue<T, R>(workerType: string): TaskQueue<T, R> {
    let queue = this.taskQueues.get(workerType) as TaskQueue<T, R>;

    if (!queue) {
      queue = new TaskQueue<T, R>();
      this.taskQueues.set(workerType, queue);
    }

    return queue;
  }

  /**
   * 통계 업데이트
   */
  private updateStats(): void {
    // 워커 매니저 통계 가져오기
    const managerStats = this.workerManager.getStats();

    // 태스크 통계 업데이트
    this.stats = {
      totalWorkers: managerStats.totalWorkers ?? 0,
      activeWorkers: managerStats.activeWorkers ?? 0,
      idleWorkers: managerStats.idleWorkers ?? 0,
      pendingTasks: Array.from(this.taskQueues.values()).reduce(
        (sum, queue) => sum + queue.size(),
        0
      ),
      runningTasks: this.runningTasks.size,
      completedTasks: this.stats.completedTasks,
      failedTasks: this.stats.failedTasks,
      cancelledTasks: this.stats.cancelledTasks,
      totalProcessedTasks: this.stats.totalProcessedTasks,
      avgTaskDuration: this.calculateAvgTaskDuration(),
    };

    // 통계 이벤트 발행
    this.emit("stats", this.stats);
  }

  /**
   * 평균 태스크 소요 시간 계산
   */
  private calculateAvgTaskDuration(): number {
    if (this.taskDurations.length === 0) return 0;

    const sum = this.taskDurations.reduce((acc, duration) => acc + duration, 0);
    return Math.round(sum / this.taskDurations.length);
  }

  /**
   * 태스크 제출
   * @param data 태스크 데이터
   * @param options 태스크 옵션
   */
  public async submitTask<T, R>(
    data: T,
    options: Partial<TaskOptions<T, R>> = {}
  ): Promise<R> {
    // 워커 풀이 종료되었는지 확인
    if (this.isShutdown) {
      throw new Error("Worker pool has been shut down");
    }

    // 태스크 ID 생성
    const taskId = options.id || generateId();

    // 워커 유형 결정
    const workerType = options.workerType || WorkerType.CALC;

    // 우선순위 결정
    const priority = options.priority ?? TaskPriority.NORMAL;

    // 태스크 생성 (루트 레벨의 priority 제거, options 내부에만 유지)
    const task: Task<T, R> = {
      id: taskId,
      type: "task",
      workerType,
      data,
      status: TaskStatus.QUEUED,
      submittedAt: Date.now(),
      options: {
        priority,
        timeout: options.timeout || this.config.taskTimeout,
        retries: options.maxRetries || 0,
      },
      get priority() {
        return this.options.priority;
      },
    };

    // 태스크 큐에 추가
    const queue = this.getOrCreateQueue<T, R>(workerType);
    queue.enqueue(task);

    // 통계 업데이트
    this.stats.pendingTasks++;

    // 태스크 큐 이벤트 발행
    this.eventHub.emitTaskEvent(TaskEventType.QUEUED, {
      taskId,
      workerType,
    });

    // 태스크 처리 약속 생성
    return new Promise<R>((resolve, reject) => {
      this.taskResolvers.set(taskId, { resolve, reject });

      // 진행 상태 콜백 처리
      if (options.onProgress) {
        const progressListener = (data: any) => {
          if (data.taskId === taskId) {
            options.onProgress!(data.progress);
          }
        };

        this.on("taskProgress", progressListener);

        // 완료 또는 실패 시 리스너 제거
        const cleanup = () => {
          this.off("taskProgress", progressListener);
        };

        this.once("taskCompleted", (data: any) => {
          if (data.taskId === taskId) cleanup();
        });

        this.once("taskFailed", (data: any) => {
          if (data.taskId === taskId) cleanup();
        });

        this.once("taskCancelled", (data: any) => {
          if (data.taskId === taskId) cleanup();
        });
      }
    });
  }

  /**
   * 태스크 취소
   * @param taskId 취소할 태스크 ID
   */
  public async cancelTask(taskId: string): Promise<boolean> {
    // 워커 풀이 종료되었는지 확인
    if (this.isShutdown) {
      throw new Error("Worker pool has been shut down");
    }

    // 대기 중인 태스크 확인
    const pendingTask = this.findPendingTask(taskId);

    if (pendingTask) {
      // 대기 중인 태스크 취소
      this.handleTaskCancellation(taskId);
      return true;
    }

    // 실행 중인 태스크 확인
    const runningTask = this.runningTasks.get(taskId);

    if (runningTask) {
      // 실행 중인 태스크 취소
      this.handleTaskCancellation(taskId);
      return true;
    }

    return false;
  }

  /**
   * 태스크 상태 확인
   * @param taskId 태스크 ID
   */
  public async getTaskStatus(taskId: string): Promise<TaskStatus | undefined> {
    // 실행 중인 태스크 확인
    const runningTask = this.runningTasks.get(taskId);
    if (runningTask) {
      return runningTask.status;
    }

    // 대기 중인 태스크 확인
    const pendingTask = this.findPendingTask(taskId);
    if (pendingTask) {
      return pendingTask.status;
    }

    return undefined;
  }

  /**
   * 대기 중인 태스크 가져오기
   * @param workerType 워커 유형
   */
  public getPendingTasks(workerType?: string): Task<any, any>[] {
    if (workerType) {
      const queue = this.taskQueues.get(workerType);
      return queue ? queue.getAll() : [];
    } else {
      return Array.from(this.taskQueues.values()).flatMap((queue) =>
        queue.getAll()
      );
    }
  }

  /**
   * 실행 중인 태스크 가져오기
   * @param workerType 워커 유형
   */
  public getRunningTasks(workerType?: string): Task<any, any>[] {
    if (!workerType) {
      return Array.from(this.runningTasks.values());
    }

    return Array.from(this.runningTasks.values()).filter(
      (task) => task.workerType === workerType
    );
  }

  /**
   * 워커 풀 상태 통계
   */
  public getStats(): WorkerPoolStats {
    return { ...this.stats };
  }

  /**
   * 이벤트 스트림 생성
   * @param options 스트림 옵션
   */
  public createEventStream<T = any>(
    options: StreamOptions = {}
  ): EventStream<T> {
    const worker = this.workerManager.getIdleWorker();
    if (!worker) {
      throw new Error("No available workers to create event stream");
    }
    return this.streamManager.createStream<T>(worker as WorkerAdapter, options);
  }

  /**
   * 워커 풀 종료
   * @param force 강제 종료 여부
   */
  public async shutdown(force: boolean = false): Promise<void> {
    if (this.isShutdown) return;

    try {
      this.isShutdown = true;

      // 폴링 중지
      if (this.pollingIntervalId) {
        clearInterval(this.pollingIntervalId);
        this.pollingIntervalId = undefined;
      }

      // 통계 업데이트 중지
      if (this.statsIntervalId) {
        clearInterval(this.statsIntervalId);
        this.statsIntervalId = undefined;
      }

      // 실행 중인 모든 타이머 중지
      this._clearAllTimeouts();

      // 모든 스트림 닫기
      await this.streamManager.closeAllStreams();

      if (!force) {
        // 대기 중인 태스크 취소
        for (const [workerType, queue] of this.taskQueues.entries()) {
          const tasks = queue.getAll();
          for (const task of tasks) {
            await this.handleTaskCancellation(task.id);
          }
        }
      }

      // 워커 매니저 종료 - 반드시 Promise가 완료될 때까지 기다림
      await this.workerManager.closeAll(force);

      // 이벤트 리스너 수를 확인하고 로깅 (디버깅용)
      if (this.config.enableLogging) {
        const listenerCounts = this.eventNames().reduce((acc, event) => {
          acc[event as string] = this.listenerCount(event);
          return acc;
        }, {} as Record<string, number>);

        logger.debug("EventEmitter listeners before cleanup:", listenerCounts);
      }

      // 모든 이벤트 관련 클린업
      this.eventHub.removeAllListeners();
      this.workerManager.removeAllListeners();
      this.removeAllListeners();

      // 맵과 컬렉션 정리
      this.taskResolvers.clear();
      this.runningTasks.clear();
      this.taskQueues.clear();
      this.taskDurations.length = 0;

      if (this.config.enableLogging) {
        logger.info("WorkerPool shut down successfully");
      }

      // 종료 이벤트 발행
      this.emit("shutdown");
    } catch (error) {
      logger.error("Error during WorkerPool shutdown:", error);
      throw error;
    }
  }

  /**
   * 모든 타이머를 정리하는 내부 메서드
   */
  private _clearAllTimeouts(): void {
    // 추가적인 타이머가 있다면 여기서 정리
  }

  /**
   * 로그 출력
   */
  private log(level: 'info' | 'error', message: string, ...args: any[]): void {
    if (this.config.enableLogging) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
      if (level === 'error') {
        console.error(logMessage, ...args);
      } else {
        console.log(logMessage, ...args);
      }
    }
  }

  private assignTaskToWorker(task: Task<any, any>, worker: any): void {
    if (worker) {
      worker.assignTask(task);
      this.eventHub.emitTaskEvent(TaskEventType.STARTED, {
        taskId: task.id,
        workerId: worker.id,
        timestamp: Date.now()
      });
    }
  }
}
