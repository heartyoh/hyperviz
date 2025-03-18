/**
 * Task Dispatcher
 *
 * 작업 배정을 담당하는 클래스
 */

import { EventEmitter } from "eventemitter3";
import { WorkerPoolFactory } from "../pool/worker-pool-factory.js";
import {
  WorkerType,
  Task,
  TaskStatus,
  TaskPriority,
  TaskOptions,
} from "../types/index.js";

/**
 * 디스패처 설정 인터페이스
 */
export interface DispatcherConfig {
  poolFactory: WorkerPoolFactory;
  taskTimeout?: number; // 기본 태스크 타임아웃(ms)
  retryLimit?: number; // 최대 재시도 횟수
  autoCreatePools?: boolean; // 풀 자동 생성 여부
}

/**
 * 태스크 디스패처 클래스
 */
export class TaskDispatcher extends EventEmitter {
  private poolFactory: WorkerPoolFactory;
  private tasks: Map<string, Task>;
  private taskTypeMapping: Map<string, WorkerType | string>;
  private taskTimeout: number;
  private retryLimit: number;
  private autoCreatePools: boolean;
  private taskRetries: Map<string, number>;

  /**
   * 태스크 디스패처 생성자
   *
   * @param config 디스패처 설정
   */
  constructor(config: DispatcherConfig) {
    super();

    this.poolFactory = config.poolFactory;
    this.tasks = new Map();
    this.taskTypeMapping = new Map();
    this.taskTimeout = config.taskTimeout || 30000; // 기본 30초
    this.retryLimit = config.retryLimit || 3;
    this.autoCreatePools =
      config.autoCreatePools !== undefined ? config.autoCreatePools : true;
    this.taskRetries = new Map();
  }

  /**
   * 태스크 유형과 워커 유형 매핑 등록
   *
   * @param taskType 태스크 유형
   * @param workerType 워커 유형
   */
  registerTaskType(taskType: string, workerType: WorkerType | string): void {
    this.taskTypeMapping.set(taskType, workerType);
  }

  /**
   * 태스크 유형의 매핑 제거
   *
   * @param taskType 태스크 유형
   * @returns 성공 여부
   */
  unregisterTaskType(taskType: string): boolean {
    return this.taskTypeMapping.delete(taskType);
  }

  /**
   * 태스크 유형에 해당하는 워커 유형 조회
   *
   * @param taskType 태스크 유형
   * @returns 워커 유형 또는 undefined
   */
  getWorkerTypeForTask(taskType: string): WorkerType | string | undefined {
    return this.taskTypeMapping.get(taskType);
  }

  /**
   * 태스크 제출 및 배정
   *
   * @param taskType 태스크 유형
   * @param data 태스크 데이터
   * @param options 태스크 옵션
   * @returns 태스크 ID
   */
  submitTask<T = any, R = any>(
    taskType: string,
    data: T,
    options: Partial<TaskOptions> = {}
  ): string {
    // 워커 유형 결정
    let workerType = this.getWorkerTypeForTask(taskType);

    // 매핑이 없으면 디폴트 처리 (태스크 유형을 워커 유형으로 사용)
    if (!workerType) {
      // 기본 워커 유형 중 일치하는 것이 있는지 확인
      const defaultWorkerTypes = Object.values(WorkerType);
      if (defaultWorkerTypes.includes(taskType as WorkerType)) {
        workerType = taskType as WorkerType;
      } else {
        throw new Error(
          `태스크 유형 '${taskType}'에 대한 워커 유형 매핑이 없습니다.`
        );
      }
    }

    // 풀이 존재하는지 확인하고 없으면 생성
    if (!this.poolFactory.hasPool(workerType)) {
      if (this.autoCreatePools) {
        this.poolFactory.createPool(workerType);
      } else {
        throw new Error(`'${workerType}' 유형의 워커 풀이 존재하지 않습니다.`);
      }
    }

    // 풀 가져오기
    const pool = this.poolFactory.getPool(workerType);
    if (!pool) {
      throw new Error(`'${workerType}' 유형의 워커 풀을 생성할 수 없습니다.`);
    }

    // 태스크 옵션 설정
    const finalOptions: TaskOptions = {
      priority: TaskPriority.NORMAL,
      timeout: this.taskTimeout,
      retries: this.retryLimit,
      ...options,
    };

    // 풀에 태스크 제출
    const taskId = pool.submitTask(taskType, data, finalOptions);

    // 태스크 조회를 위해 저장
    const task = pool.getTaskStatus<T, R>(taskId);
    if (task) {
      this.tasks.set(taskId, task);

      // 태스크 상태 변화 이벤트 리스닝
      this.setupTaskMonitoring(taskId, workerType);
    }

    return taskId;
  }

  /**
   * 태스크 모니터링 설정
   *
   * @param taskId 태스크 ID
   * @param workerType 워커 유형
   */
  private setupTaskMonitoring(
    taskId: string,
    workerType: WorkerType | string
  ): void {
    const pool = this.poolFactory.getPool(workerType);
    if (!pool) return;

    // 태스크 상태 변화 이벤트 리스닝
    pool.on("taskCompleted", (event) => {
      if (event.taskId === taskId) {
        this.emit("taskCompleted", { taskId, workerType });
      }
    });

    pool.on("taskFailed", (event) => {
      if (event.taskId === taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return;

        // 재시도 횟수 확인
        const retries = this.taskRetries.get(taskId) || 0;

        if (retries < (task.options.retries || this.retryLimit)) {
          // 재시도
          this.retryTask(taskId, task, workerType, retries + 1);
        } else {
          // 재시도 횟수 초과
          this.emit("taskFailed", {
            taskId,
            workerType,
            error: task.error,
            retries,
          });
        }
      }
    });

    pool.on("taskProgress", (event) => {
      if (event.taskId === taskId) {
        this.emit("taskProgress", {
          taskId,
          workerType,
          progress: event.progress,
        });
      }
    });

    // 태스크 타임아웃 설정
    if (pool.getTaskStatus(taskId)?.options.timeout) {
      const timeout = setTimeout(() => {
        const task = this.tasks.get(taskId);
        if (task && task.status === TaskStatus.RUNNING) {
          // 타임아웃 처리
          pool.cancelTask(taskId);

          // 재시도 횟수 확인
          const retries = this.taskRetries.get(taskId) || 0;

          if (retries < (task.options.retries || this.retryLimit)) {
            // 재시도
            this.retryTask(taskId, task, workerType, retries + 1);
          } else {
            // 재시도 횟수 초과
            task.status = TaskStatus.FAILED;
            task.error = "Task timeout";
            this.emit("taskTimeout", { taskId, workerType, retries });
          }
        }
      }, pool.getTaskStatus(taskId)?.options.timeout || this.taskTimeout);

      // 태스크가 완료되면 타이머 해제
      const clearTimeoutListener = (event: any) => {
        if (event.taskId === taskId) {
          clearTimeout(timeout);
          pool.off("taskCompleted", clearTimeoutListener);
          pool.off("taskFailed", clearTimeoutListener);
        }
      };

      pool.on("taskCompleted", clearTimeoutListener);
      pool.on("taskFailed", clearTimeoutListener);
    }
  }

  /**
   * 태스크 재시도
   *
   * @param originalTaskId 원본 태스크 ID
   * @param task 태스크 객체
   * @param workerType 워커 유형
   * @param retryCount 재시도 횟수
   * @returns 새 태스크 ID
   */
  private retryTask(
    originalTaskId: string,
    task: Task,
    workerType: WorkerType | string,
    retryCount: number
  ): string {
    // 풀 가져오기
    const pool = this.poolFactory.getPool(workerType);
    if (!pool) {
      throw new Error(`'${workerType}' 유형의 워커 풀이 존재하지 않습니다.`);
    }

    // 재시도 횟수 저장
    this.taskRetries.set(originalTaskId, retryCount);

    // 이벤트 발행
    this.emit("taskRetry", {
      taskId: originalTaskId,
      workerType,
      retryCount,
    });

    // 새 태스크 제출
    const newTaskId = pool.submitTask(task.type, task.data, task.options);

    // 원본 태스크 ID 매핑
    this.tasks.set(newTaskId, pool.getTaskStatus(newTaskId)!);

    // 새 태스크 모니터링 설정
    this.setupTaskMonitoring(newTaskId, workerType);

    return newTaskId;
  }

  /**
   * 태스크 상태 조회
   *
   * @param taskId 태스크 ID
   * @returns 태스크 객체 또는 undefined
   */
  getTaskStatus<T = any, R = any>(taskId: string): Task<T, R> | undefined {
    return this.tasks.get(taskId) as Task<T, R> | undefined;
  }

  /**
   * 태스크 취소
   *
   * @param taskId 태스크 ID
   * @returns 성공 여부
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // 워커 유형 확인
    const workerType = task.workerType;

    // 해당 풀 가져오기
    const pool = this.poolFactory.getPool(workerType);
    if (!pool) return false;

    // 태스크 취소
    const result = pool.cancelTask(taskId);

    if (result) {
      // 이벤트 발행
      this.emit("taskCancelled", { taskId, workerType });
    }

    return result;
  }

  /**
   * 모든 태스크의 진행 상황 조회
   *
   * @returns 태스크 상태 맵
   */
  getAllTaskStatuses(): Map<string, Task> {
    return new Map(this.tasks);
  }

  /**
   * 풀 팩토리 가져오기
   *
   * @returns 워커 풀 팩토리 인스턴스
   */
  getPoolFactory(): WorkerPoolFactory {
    return this.poolFactory;
  }

  /**
   * 디스패처 종료
   *
   * @param force 강제 종료 여부
   * @returns 프로미스
   */
  async close(force: boolean = false): Promise<void> {
    // 모든 풀 해제
    await this.poolFactory.releaseAllPools(force);

    // 내부 상태 초기화
    this.tasks.clear();
    this.taskRetries.clear();

    // 모든 이벤트 리스너 제거
    this.removeAllListeners();
  }
}
