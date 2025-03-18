/**
 * UnifiedWorkerPoolManager
 *
 * 모든 워커 풀 관리 컴포넌트를 통합하는 메인 엔트리 포인트
 */

// 타입 내보내기
export * from "./types/index.js";

// 컴포넌트 가져오기
import { WorkerRegistry } from "./registry/worker-registry.js";
import { WorkerPool } from "./pool/worker-pool.js";
import { WorkerPoolFactory } from "./pool/worker-pool-factory.js";
import { TaskDispatcher } from "./dispatcher/task-dispatcher.js";
import { WorkerMonitor } from "./monitoring/worker-monitor.js";
import {
  WorkerType,
  PoolConfig,
  TaskOptions,
  Task,
  LogLevel,
  LogEntry,
} from "./types/index.js";
import { recommendWorkerCount } from "./utils/helpers.js";

// 컴포넌트 내보내기
export {
  WorkerRegistry,
  WorkerPool,
  WorkerPoolFactory,
  TaskDispatcher,
  WorkerMonitor,
  recommendWorkerCount,
};

/**
 * UnifiedWorkerPoolManager 설정 인터페이스
 */
export interface UnifiedWorkerPoolManagerConfig {
  // 풀 설정
  poolConfig?: Partial<PoolConfig>;

  // 디스패처 설정
  taskTimeout?: number;
  retryLimit?: number;
  autoCreatePools?: boolean;

  // 모니터 설정
  logLevel?: LogLevel;
  metricsInterval?: number;
  maxLogEntries?: number;
  autoRestart?: boolean;
  healthCheckInterval?: number;

  // 워커 유형별 초기 풀 설정
  initialPools?: Record<WorkerType | string, Partial<PoolConfig>>;
}

/**
 * 통합 워커 풀 관리자 클래스
 */
export class UnifiedWorkerPoolManager {
  private registry: WorkerRegistry;
  private poolFactory: WorkerPoolFactory;
  private dispatcher: TaskDispatcher;
  private monitor: WorkerMonitor;
  private isInitialized: boolean;

  /**
   * 통합 워커 풀 관리자 생성자
   *
   * @param config 설정 객체
   */
  constructor(config: UnifiedWorkerPoolManagerConfig = {}) {
    // 기본 컴포넌트 생성
    this.registry = new WorkerRegistry();

    // 풀 팩토리 생성
    this.poolFactory = new WorkerPoolFactory({
      registry: this.registry,
      defaultPoolConfig: config.poolConfig,
    });

    // 디스패처 생성
    this.dispatcher = new TaskDispatcher({
      poolFactory: this.poolFactory,
      taskTimeout: config.taskTimeout,
      retryLimit: config.retryLimit,
      autoCreatePools: config.autoCreatePools,
    });

    // 모니터 생성
    this.monitor = new WorkerMonitor({
      poolFactory: this.poolFactory,
      dispatcher: this.dispatcher,
      logLevel: config.logLevel,
      metricsInterval: config.metricsInterval,
      maxLogEntries: config.maxLogEntries,
      autoRestart: config.autoRestart,
      healthCheckInterval: config.healthCheckInterval,
    });

    this.isInitialized = false;

    // 초기 풀 생성
    if (config.initialPools) {
      for (const [type, poolConfig] of Object.entries(config.initialPools)) {
        this.createPool(type as WorkerType | string, poolConfig);
      }
    }
  }

  /**
   * 관리자 초기화 및 시작
   */
  initialize(): void {
    if (this.isInitialized) return;

    // 모니터링 시작
    this.monitor.start();

    // 워커 자동 재시작 처리
    this.monitor.on("workerNeedsRestart", (event) => {
      const pool = this.poolFactory.getPool(
        event.workerType as WorkerType | string
      );
      if (pool) {
        // 워커 자동 재시작 로직은 이미 WorkerPool 내부에 구현되어 있음
        this.monitor.log(
          LogLevel.INFO,
          `워커 자동 재시작 요청됨: ${event.workerId}`,
          event.workerType as WorkerType | string,
          undefined,
          event.workerId
        );
      }
    });

    this.isInitialized = true;
  }

  /**
   * 관리자 종료
   *
   * @param force 강제 종료 여부
   * @returns 프로미스
   */
  async shutdown(force: boolean = false): Promise<void> {
    // 모니터링 중지
    this.monitor.stop();

    // 디스패처 종료
    await this.dispatcher.close(force);
  }

  /**
   * 새 워커 풀 생성
   *
   * @param type 워커 유형
   * @param config 풀 설정
   * @returns 워커 풀
   */
  createPool(
    type: WorkerType | string,
    config?: Partial<PoolConfig>
  ): WorkerPool {
    return this.poolFactory.createPool(type, config);
  }

  /**
   * 태스크 제출
   *
   * @param type 태스크 유형
   * @param data 태스크 데이터
   * @param options 태스크 옵션
   * @returns 태스크 ID
   */
  submitTask<T = any>(
    type: string,
    data: T,
    options: Partial<TaskOptions> = {}
  ): string {
    return this.dispatcher.submitTask(type, data, options);
  }

  /**
   * 태스크 상태 조회
   *
   * @param taskId 태스크 ID
   * @returns 태스크 객체 또는 undefined
   */
  getTaskStatus<T = any, R = any>(taskId: string): Task<T, R> | undefined {
    return this.dispatcher.getTaskStatus<T, R>(taskId);
  }

  /**
   * 태스크 취소
   *
   * @param taskId 태스크 ID
   * @returns 성공 여부
   */
  cancelTask(taskId: string): boolean {
    return this.dispatcher.cancelTask(taskId);
  }

  /**
   * 태스크 유형에 대한 워커 유형 매핑 등록
   *
   * @param taskType 태스크 유형
   * @param workerType 워커 유형
   */
  registerTaskType(taskType: string, workerType: WorkerType | string): void {
    this.dispatcher.registerTaskType(taskType, workerType);
  }

  /**
   * 새 커스텀 워커 등록
   *
   * @param name 커스텀 워커 이름
   * @param scriptPath 워커 스크립트 경로
   */
  registerCustomWorker(name: string, scriptPath: string): void {
    this.registry.registerCustomWorker(name, scriptPath);
  }

  /**
   * 로그 레벨 설정
   *
   * @param level 로그 레벨
   */
  setLogLevel(level: LogLevel): void {
    this.monitor.setLogLevel(level);
  }

  /**
   * 로그 조회
   *
   * @param limit 항목 수 제한 (선택 사항)
   * @param level 로그 레벨 필터 (선택 사항)
   * @param workerType 워커 유형 필터 (선택 사항)
   * @param taskId 태스크 ID 필터 (선택 사항)
   * @param workerId 워커 ID 필터 (선택 사항)
   * @returns 필터링된 로그 항목 배열
   */
  getLogs(
    limit?: number,
    level?: LogLevel,
    workerType?: WorkerType | string,
    taskId?: string,
    workerId?: string
  ): LogEntry[] {
    return this.monitor.getLogs(limit, level, workerType, taskId, workerId);
  }

  /**
   * 풀 통계 조회
   *
   * @returns 풀 통계 맵
   */
  getPoolStats(): Map<WorkerType | string, any> {
    return this.poolFactory.getAllPoolStats();
  }

  /**
   * 풀 재설정
   *
   * @param type 워커 유형
   * @param config 새 설정
   * @returns 성공 여부
   */
  reconfigurePool(
    type: WorkerType | string,
    config: Partial<PoolConfig>
  ): boolean {
    return this.poolFactory.reconfigurePool(type, config);
  }

  /**
   * 워커 풀 가져오기
   *
   * @param type 워커 유형
   * @returns 워커 풀 또는 undefined
   */
  getPool(type: WorkerType | string): WorkerPool | undefined {
    return this.poolFactory.getPool(type);
  }

  /**
   * 워커 레지스트리 가져오기
   *
   * @returns 워커 레지스트리
   */
  getRegistry(): WorkerRegistry {
    return this.registry;
  }

  /**
   * 풀 팩토리 가져오기
   *
   * @returns 워커 풀 팩토리
   */
  getPoolFactory(): WorkerPoolFactory {
    return this.poolFactory;
  }

  /**
   * 디스패처 가져오기
   *
   * @returns 태스크 디스패처
   */
  getDispatcher(): TaskDispatcher {
    return this.dispatcher;
  }

  /**
   * 모니터 가져오기
   *
   * @returns 워커 모니터
   */
  getMonitor(): WorkerMonitor {
    return this.monitor;
  }
}
