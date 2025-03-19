/**
 * Worker Pool
 *
 * 특정 유형의 Worker를 관리하는 풀
 */

import { EventEmitter } from "eventemitter3";
import {
  WorkerType,
  WorkerInstance,
  WorkerStatus,
  PoolConfig,
  Task,
  TaskStatus,
  TaskPriority,
  TaskOptions,
} from "../types/index.js";
import { generateId } from "../utils/helpers.js";
import { WorkerAdapter, createWorker } from "../utils/worker-adapter.js";
import { createWorkerURL, revokeWorkerURL } from "../utils/env-detector.js";

// 기본 풀 설정
const DEFAULT_POOL_CONFIG: PoolConfig = {
  minWorkers: 1,
  maxWorkers: 4,
  idleTimeout: 60000, // 1분
  maxQueueSize: 100,
};

export class WorkerPool extends EventEmitter {
  private type: WorkerType | string;
  private scriptPath: string;
  private config: PoolConfig;
  private workers: Map<string, { worker: WorkerAdapter; info: WorkerInstance }>;
  private taskQueue: Task[];
  private taskMap: Map<string, Task>;
  private isClosing: boolean;
  private idleTimers: Map<string, NodeJS.Timeout>;
  private workerURLs: Map<string, string>;

  /**
   * Worker Pool 생성자
   *
   * @param type 워커 유형
   * @param scriptPath 워커 스크립트 경로
   * @param config 풀 설정
   */
  constructor(
    type: WorkerType | string,
    scriptPath: string,
    config: Partial<PoolConfig> = {}
  ) {
    super();

    this.type = type;
    this.scriptPath = scriptPath;
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.workers = new Map();
    this.taskQueue = [];
    this.taskMap = new Map();
    this.isClosing = false;
    this.idleTimers = new Map();
    this.workerURLs = new Map();

    // 최소 워커 수 생성
    this.ensureMinWorkers();
  }

  /**
   * 최소 워커 수 확보
   */
  private ensureMinWorkers(): void {
    if (this.isClosing) return;

    const currentWorkerCount = this.workers.size;
    const minWorkers = this.config.minWorkers || 1;

    for (let i = currentWorkerCount; i < minWorkers; i++) {
      this.createWorker();
    }
  }

  /**
   * 새 워커 생성
   */
  private createWorker(): WorkerInstance {
    const workerId = generateId();

    // 워커 스크립트 URL 생성
    const workerScriptURL = createWorkerURL(this.scriptPath);
    this.workerURLs.set(workerId, workerScriptURL);

    // Worker 생성 - worker_threads 대신 WorkerAdapter 사용
    const worker = createWorker(workerScriptURL, {
      workerData: { id: workerId, type: this.type },
    });

    // Worker 정보 객체 생성
    const workerInfo: WorkerInstance = {
      id: workerId,
      type: this.type as WorkerType,
      status: WorkerStatus.IDLE,
      tasks: 0,
      performance: {
        averageTaskTime: 0,
        completedTasks: 0,
        errors: 0,
      },
    };

    // 이벤트 핸들러 등록
    worker.on("message", (message) =>
      this.handleWorkerMessage(workerId, message)
    );
    worker.on("error", (error) => this.handleWorkerError(workerId, error));
    worker.on("exit", (code) => this.handleWorkerExit(workerId, code || 0));

    // 맵에 저장
    this.workers.set(workerId, { worker, info: workerInfo });

    // 워커 생성 이벤트 발행
    this.emit("workerCreated", { workerId, type: this.type });

    return workerInfo;
  }

  /**
   * 워커에서 받은, 메시지 처리
   *
   * @param workerId 워커 ID
   * @param message 메시지 객체
   */
  private handleWorkerMessage(workerId: string, message: any): void {
    const workerData = this.workers.get(workerId);
    if (!workerData) return;

    // 태스크 관련 메시지 처리
    if (message && message.taskId) {
      const task = this.taskMap.get(message.taskId);
      if (!task) return;

      // 상태에 따른 처리
      if (message.status === "completed") {
        task.status = TaskStatus.COMPLETED;
        task.result = message.result;
        task.completedAt = Date.now();

        // 통계 업데이트
        workerData.info.performance.completedTasks++;
        if (task.startedAt) {
          const taskTime = task.completedAt - task.startedAt;
          const prevAvg = workerData.info.performance.averageTaskTime;
          const prevTotal = workerData.info.performance.completedTasks - 1;
          workerData.info.performance.averageTaskTime =
            (prevAvg * prevTotal + taskTime) /
            workerData.info.performance.completedTasks;
        }

        // 이벤트 발행
        this.emit("taskCompleted", { taskId: task.id, workerId });
      } else if (message.status === "error") {
        task.status = TaskStatus.FAILED;
        task.error = message.error;
        task.completedAt = Date.now();

        // 통계 업데이트
        workerData.info.performance.errors++;

        // 이벤트 발행
        this.emit("taskFailed", {
          taskId: task.id,
          workerId,
          error: message.error,
        });
      } else if (message.status === "progress" && task.options.onProgress) {
        // 진행 상황 콜백 호출
        task.options.onProgress(message.progress);

        // 이벤트 발행
        this.emit("taskProgress", {
          taskId: task.id,
          workerId,
          progress: message.progress,
        });
      }

      // 태스크가 완료됐거나 실패한 경우 워커 상태 업데이트
      if (
        task.status === TaskStatus.COMPLETED ||
        task.status === TaskStatus.FAILED
      ) {
        workerData.info.tasks--;
        this.taskMap.delete(task.id);

        // 워커가 할 일이 없다면 IDLE로 설정
        if (workerData.info.tasks === 0) {
          workerData.info.status = WorkerStatus.IDLE;
          this.emit("workerIdle", { workerId });

          // 다음 태스크 처리
          this.processNextTask();

          // 유휴 타이머 설정 (최소 워커 수 이상일 때만)
          if (
            this.workers.size > (this.config.minWorkers || 1) &&
            this.config.idleTimeout
          ) {
            this.setIdleTimer(workerId);
          }
        }
      }
    }
  }

  /**
   * 워커 오류 처리
   *
   * @param workerId 워커 ID
   * @param error 오류 객체
   */
  private handleWorkerError(workerId: string, error: Error): void {
    const workerData = this.workers.get(workerId);
    if (!workerData) return;

    // 이벤트 발행
    this.emit("workerError", { workerId, error });

    // 워커가 처리 중인 태스크가 있으면 해당 태스크 실패 처리
    const currentTask = Array.from(this.taskMap.values()).find(
      (task) => task.status === TaskStatus.RUNNING
    );

    if (currentTask) {
      currentTask.status = TaskStatus.FAILED;
      currentTask.error = error;
      currentTask.completedAt = Date.now();

      // 이벤트 발행
      this.emit("taskFailed", {
        taskId: currentTask.id,
        workerId,
        error,
      });

      // 태스크 맵에서 제거
      this.taskMap.delete(currentTask.id);
    }

    // 워커 제거 및 새 워커 생성
    this.removeWorker(workerId);
    if (!this.isClosing) {
      this.createWorker();
    }
  }

  /**
   * 워커 종료 처리
   *
   * @param workerId 워커 ID
   * @param code 종료 코드
   */
  private handleWorkerExit(workerId: string, code: number): void {
    // URL 정리
    const workerURL = this.workerURLs.get(workerId);
    if (workerURL) {
      revokeWorkerURL(workerURL);
      this.workerURLs.delete(workerId);
    }

    // 타이머 제거
    this.clearIdleTimer(workerId);

    // 맵에서 제거
    const wasRemoved = this.removeWorker(workerId);
    if (wasRemoved) {
      // 이벤트 발행
      this.emit("workerExited", { workerId, code });

      // 최소 워커 수 확보 (비정상 종료인 경우)
      if (!this.isClosing && code !== 0) {
        this.ensureMinWorkers();
      }
    }
  }

  /**
   * 워커 제거
   *
   * @param workerId 워커 ID
   * @returns 제거 여부
   */
  private removeWorker(workerId: string): boolean {
    const workerData = this.workers.get(workerId);
    if (!workerData) return false;

    // 맵에서 제거
    this.workers.delete(workerId);

    return true;
  }

  /**
   * 유휴 워커 타이머 설정
   *
   * @param workerId 워커 ID
   */
  private setIdleTimer(workerId: string): void {
    // 기존 타이머가 있다면 제거
    this.clearIdleTimer(workerId);

    // 새 타이머 설정
    const timer = setTimeout(() => {
      const workerData = this.workers.get(workerId);
      if (
        workerData &&
        workerData.info.status === WorkerStatus.IDLE &&
        this.workers.size > (this.config.minWorkers || 1)
      ) {
        // 이벤트 발행
        this.emit("workerTimeout", { workerId });

        // 워커 종료
        try {
          workerData.worker.terminate();
        } catch (error) {
          // 이미 종료된 경우는 무시
        }
      }
    }, this.config.idleTimeout);

    // 타이머 저장
    this.idleTimers.set(workerId, timer);
  }

  /**
   * 유휴 워커 타이머 제거
   *
   * @param workerId 워커 ID
   */
  private clearIdleTimer(workerId: string): void {
    const timer = this.idleTimers.get(workerId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(workerId);
    }
  }

  /**
   * 테스크 큐 정렬 (우선순위 기준)
   */
  private sortTaskQueue(): void {
    this.taskQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 다음 태스크 처리
   */
  private processNextTask(): void {
    if (this.isClosing || this.taskQueue.length === 0) return;

    // 유휴 워커 찾기
    let idleWorker: { worker: WorkerAdapter; info: WorkerInstance } | undefined;
    for (const [workerId, workerData] of this.workers.entries()) {
      if (workerData.info.status === WorkerStatus.IDLE) {
        // 유휴 워커를 찾았다면 타이머 제거
        this.clearIdleTimer(workerId);
        idleWorker = workerData;
        break;
      }
    }

    // 유휴 워커가 없고 최대 워커 수에 도달하지 않았다면 새 워커 생성
    if (!idleWorker && this.workers.size < (this.config.maxWorkers || 4)) {
      const workerInfo = this.createWorker();
      idleWorker = this.workers.get(workerInfo.id);
    }

    // 유휴 워커가 있으면 태스크 할당
    if (idleWorker) {
      const task = this.taskQueue.shift();
      if (task) {
        this.assignTaskToWorker(task, idleWorker);
      }
    }
  }

  /**
   * 특정 워커에 태스크 할당
   *
   * @param task 태스크 객체
   * @param workerData 워커 데이터
   */
  private assignTaskToWorker(
    task: Task,
    workerData: { worker: WorkerAdapter; info: WorkerInstance }
  ): void {
    // 워커 상태 업데이트
    workerData.info.status = WorkerStatus.BUSY;
    workerData.info.tasks++;

    // 태스크 상태 업데이트
    task.status = TaskStatus.RUNNING;
    task.startedAt = Date.now();

    // 워커에 태스크 할당
    workerData.worker.postMessage({
      taskId: task.id,
      type: task.type,
      data: task.data,
    });

    // 이벤트 발행
    this.emit("taskAssigned", {
      taskId: task.id,
      workerId: workerData.info.id,
    });
  }

  /**
   * 태스크 제출
   *
   * @param type 태스크 유형
   * @param data 태스크 데이터
   * @param options 태스크 옵션
   * @returns 태스크 ID
   */
  submitTask<T = any, R = any>(
    type: string,
    data: T,
    options: Partial<TaskOptions> = {}
  ): string {
    if (this.isClosing) {
      throw new Error("워커 풀이 종료 중입니다");
    }

    // 큐 크기 확인
    if (this.taskQueue.length >= (this.config.maxQueueSize || 100)) {
      throw new Error("태스크 큐가 가득 찼습니다");
    }

    // 태스크 ID 생성
    const taskId = generateId();

    // 태스크 객체 생성
    const task: Task<T, R> = {
      id: taskId,
      type,
      workerType: this.type as WorkerType,
      data,
      status: TaskStatus.QUEUED,
      priority:
        options.priority !== undefined ? options.priority : TaskPriority.NORMAL,
      submittedAt: Date.now(),
      options: {
        priority: TaskPriority.NORMAL,
        ...options,
      },
    };

    // 태스크 저장
    this.taskMap.set(taskId, task);
    this.taskQueue.push(task);

    // 이벤트 발행
    this.emit("taskQueued", { taskId, type, priority: task.priority });

    // 태스크 큐 정렬
    this.sortTaskQueue();

    // 다음 태스크 처리
    this.processNextTask();

    return taskId;
  }

  /**
   * 태스크 상태 조회
   *
   * @param taskId 태스크 ID
   * @returns 태스크 객체 또는 undefined
   */
  getTaskStatus<T = any, R = any>(taskId: string): Task<T, R> | undefined {
    return this.taskMap.get(taskId) as Task<T, R> | undefined;
  }

  /**
   * 태스크 취소
   *
   * @param taskId 태스크 ID
   * @returns 성공 여부
   */
  cancelTask(taskId: string): boolean {
    const task = this.taskMap.get(taskId);
    if (!task) return false;

    // 이미 완료되었거나 실패한 태스크는 취소할 수 없음
    if (
      task.status === TaskStatus.COMPLETED ||
      task.status === TaskStatus.FAILED
    ) {
      return false;
    }

    // 대기 중인 태스크는 큐에서 제거
    if (task.status === TaskStatus.QUEUED) {
      this.taskQueue = this.taskQueue.filter((t) => t.id !== taskId);
      task.status = TaskStatus.CANCELLED;

      // 이벤트 발행
      this.emit("taskCancelled", { taskId });

      return true;
    }

    // 실행 중인 태스크는 워커 중지로 취소 (실제로는 워커가 취소 메시지를 처리해야 함)
    // 여기서는 단순화를 위해 워커를 중지시키지 않고 취소로만 표시
    task.status = TaskStatus.CANCELLED;

    // 이벤트 발행
    this.emit("taskCancelled", { taskId });

    return true;
  }

  /**
   * 워커 풀 초기화
   *
   * @param config 풀 설정
   */
  reconfigure(config: Partial<PoolConfig>): void {
    // 설정 업데이트
    this.config = { ...this.config, ...config };

    // 최소 워커 수 확보
    this.ensureMinWorkers();

    // 최대 워커 수가 줄어들었다면 초과 워커 정리
    if (
      this.config.maxWorkers !== undefined &&
      this.workers.size > this.config.maxWorkers
    ) {
      // IDLE 상태의 워커부터 종료
      let workersToRemove = this.workers.size - this.config.maxWorkers;
      for (const [workerId, workerData] of this.workers.entries()) {
        if (workersToRemove <= 0) break;

        if (workerData.info.status === WorkerStatus.IDLE) {
          // 유휴 타이머 제거
          this.clearIdleTimer(workerId);

          // 워커 종료
          try {
            workerData.worker.terminate();
          } catch (error) {
            // 이미 종료된 경우는 무시
          }

          workersToRemove--;
        }
      }
    }
  }

  /**
   * 워커 풀 종료
   *
   * @param force 강제 종료 여부
   * @returns 프로미스
   */
  async close(force: boolean = false): Promise<void> {
    if (this.isClosing) return;

    this.isClosing = true;

    // 모든 유휴 타이머 제거
    for (const timerId of this.idleTimers.keys()) {
      this.clearIdleTimer(timerId);
    }

    // 강제 종료라면 모든 워커 즉시 종료
    if (force) {
      const terminatePromises = [];

      for (const [, workerData] of this.workers.entries()) {
        terminatePromises.push(workerData.worker.terminate());
      }

      await Promise.all(terminatePromises);
      this.workers.clear();

      // 모든 태스크 취소
      for (const [taskId, task] of this.taskMap.entries()) {
        if (
          task.status === TaskStatus.QUEUED ||
          task.status === TaskStatus.RUNNING
        ) {
          task.status = TaskStatus.CANCELLED;
          this.emit("taskCancelled", { taskId });
        }
      }

      this.taskQueue = [];
      return;
    }

    // 대기 중인 모든 태스크 처리 완료 대기
    return new Promise<void>((resolve) => {
      // 활성 태스크가 없다면 즉시 종료
      if (this.taskQueue.length === 0 && this.getActiveTasks() === 0) {
        // 모든 워커 종료
        for (const [, workerData] of this.workers.entries()) {
          workerData.worker.terminate();
        }

        resolve();
        return;
      }

      // 풀이 완전히 비워질 때까지 대기
      const checkInterval = setInterval(() => {
        if (this.taskQueue.length === 0 && this.getActiveTasks() === 0) {
          clearInterval(checkInterval);

          // 모든 워커 종료
          for (const [, workerData] of this.workers.entries()) {
            workerData.worker.terminate();
          }

          resolve();
        }
      }, 100);
    });
  }

  /**
   * 활성 태스크 수 조회
   */
  getActiveTasks(): number {
    let count = 0;
    for (const task of this.taskMap.values()) {
      if (task.status === TaskStatus.RUNNING) {
        count++;
      }
    }
    return count;
  }

  /**
   * 워커 풀 상태 조회
   */
  getPoolStats(): {
    workerCount: number;
    activeWorkers: number;
    idleWorkers: number;
    queuedTasks: number;
    activeTasks: number;
  } {
    let activeWorkers = 0;
    let idleWorkers = 0;

    for (const [, workerData] of this.workers.entries()) {
      if (workerData.info.status === WorkerStatus.BUSY) {
        activeWorkers++;
      } else if (workerData.info.status === WorkerStatus.IDLE) {
        idleWorkers++;
      }
    }

    return {
      workerCount: this.workers.size,
      activeWorkers,
      idleWorkers,
      queuedTasks: this.taskQueue.length,
      activeTasks: this.getActiveTasks(),
    };
  }

  /**
   * 워커 목록 조회
   */
  getWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values()).map((data) => ({ ...data.info }));
  }

  /**
   * 워커 풀 유형 반환
   *
   * @returns 워커 유형
   */
  getType(): WorkerType | string {
    return this.type;
  }

  /**
   * 워커 수 반환
   *
   * @returns 워커 수
   */
  getWorkerCount(): number {
    return this.workers.size;
  }

  /**
   * 특정 워커 종료
   *
   * @param workerId 워커 ID
   * @returns 성공 여부
   */
  terminateWorker(workerId: string): boolean {
    if (!this.workers.has(workerId)) {
      return false;
    }

    try {
      return this.removeWorker(workerId);
    } catch (error) {
      console.error(`워커 종료 중 오류: ${error}`);
      return false;
    }
  }

  /**
   * 모든 워커 종료
   *
   * @returns 성공 여부
   */
  terminateAllWorkers(): boolean {
    try {
      // 모든 워커 ID 복사 (반복 중 삭제를 위해)
      const workerIds = Array.from(this.workers.keys());

      // 각 워커 종료
      for (const workerId of workerIds) {
        this.terminateWorker(workerId);
      }

      // 새 최소 워커 수 생성
      this.ensureMinWorkers();

      return true;
    } catch (error) {
      console.error(`모든 워커 종료 중 오류: ${error}`);
      return false;
    }
  }
}
