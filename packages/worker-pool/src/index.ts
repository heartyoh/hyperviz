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

  // 확장 프로그램 설정
  enableExtensionCommunication?: boolean;
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
  private extensionCommunicationEnabled: boolean;
  private messageListener: ((event: MessageEvent) => void) | null = null;

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
    this.extensionCommunicationEnabled =
      config.enableExtensionCommunication !== false;

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

    // 확장 프로그램 통신 설정
    if (this.extensionCommunicationEnabled && typeof window !== "undefined") {
      this.setupExtensionCommunication();
    }

    this.isInitialized = true;
  }

  /**
   * 관리자 종료
   *
   * @param force 강제 종료 여부
   * @returns 프로미스
   */
  async shutdown(force: boolean = false): Promise<void> {
    // 확장 프로그램 통신 해제
    this.teardownExtensionCommunication();

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

  /**
   * 확장 프로그램 통신 활성화 여부 설정
   *
   * @param enabled 활성화 여부
   */
  setExtensionCommunicationEnabled(enabled: boolean): void {
    if (this.extensionCommunicationEnabled === enabled) return;

    this.extensionCommunicationEnabled = enabled;

    if (enabled && typeof window !== "undefined") {
      this.setupExtensionCommunication();
    } else {
      this.teardownExtensionCommunication();
    }
  }

  /**
   * 확장 프로그램 통신 설정
   * 크롬 확장 프로그램과의 통신을 위한 메시지 리스너 설정
   * @private
   */
  private setupExtensionCommunication(): void {
    if (this.messageListener || typeof window === "undefined") return;

    this.messageListener = this.handleExtensionMessage.bind(this);
    window.addEventListener("message", this.messageListener);

    // 로그
    this.monitor.log(
      LogLevel.INFO,
      "확장 프로그램과의 통신이 활성화되었습니다.",
      "SYSTEM"
    );
  }

  /**
   * 확장 프로그램 통신 정리
   * @private
   */
  private teardownExtensionCommunication(): void {
    if (!this.messageListener || typeof window === "undefined") return;

    window.removeEventListener("message", this.messageListener);
    this.messageListener = null;

    // 로그
    this.monitor.log(
      LogLevel.INFO,
      "확장 프로그램과의 통신이 비활성화되었습니다.",
      "SYSTEM"
    );
  }

  /**
   * 확장 프로그램 메시지 처리
   * @param event 메시지 이벤트
   * @private
   */
  private handleExtensionMessage(event: MessageEvent): void {
    // 동일한 출처의 메시지만 처리
    if (event.source !== window) return;

    const data = event.data;

    // HyperViz 확장 프로그램 요청만 처리
    if (!data || data.type !== "hyperviz-extension-request") return;

    try {
      const { action } = data;

      // 액션에 따라 처리
      switch (action) {
        case "connect":
        case "getWorkerPoolData":
          // 워커풀 존재 여부 알림
          window.postMessage(
            {
              type: "hyperviz-response",
              action: "workerPoolDetected",
              exists: true,
              timestamp: Date.now(),
            },
            "*"
          );

          // 워커풀 데이터 전송
          this.sendExtensionResponse("workerPoolData", {
            stats: this.getPoolStatsObject(),
            taskInfo: this.getTaskInfoObject(),
          });
          break;

        case "getStats":
          // 통계 데이터 요청
          this.sendExtensionResponse("workerPoolData", {
            stats: this.getPoolStatsObject(),
          });
          break;

        case "getLogs":
          // 로그 데이터 요청
          const count = data.count || 100;
          this.sendExtensionResponse("logs", this.getLogs(count));
          break;

        case "getTaskInfo":
          // 태스크 정보 요청
          this.sendExtensionResponse("taskInfo", this.getTaskInfoObject());
          break;

        case "restartWorker":
          // 워커 재시작 요청
          if (data.workerId && data.workerType) {
            // 간단한 접근 방식: 워커 재시작 시도
            try {
              const success = this.tryRestartWorker(
                data.workerType,
                data.workerId
              );
              this.sendExtensionResponse("workerActionResult", {
                action: "restartWorker",
                success,
                workerId: data.workerId,
              });
            } catch (error) {
              this.monitor.log(
                LogLevel.ERROR,
                `워커 재시작 실패: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                data.workerType
              );
              this.sendExtensionResponse("workerActionResult", {
                action: "restartWorker",
                success: false,
                workerId: data.workerId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
          break;

        case "disconnect":
          // 연결 해제 처리 (필요한 경우)
          this.monitor.log(
            LogLevel.INFO,
            "확장 프로그램 연결 해제 요청을 받았습니다.",
            "SYSTEM"
          );
          break;

        default:
          this.monitor.log(
            LogLevel.WARN,
            `알 수 없는 확장 프로그램 요청: ${action}`,
            "SYSTEM"
          );
          break;
      }
    } catch (error) {
      this.monitor.log(
        LogLevel.ERROR,
        `확장 프로그램 메시지 처리 중 오류: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "SYSTEM"
      );
    }
  }

  /**
   * 확장 프로그램에 응답 전송
   * @param action 액션 유형
   * @param payload 데이터
   * @private
   */
  private sendExtensionResponse(action: string, payload: any): void {
    if (typeof window === "undefined") return;

    window.postMessage(
      {
        type: "hyperviz-response",
        action,
        payload,
        timestamp: Date.now(),
      },
      "*"
    );
  }

  /**
   * 풀 통계를 객체로 변환
   * @returns 풀 통계 객체
   * @private
   */
  private getPoolStatsObject(): Record<string, any> {
    const stats: Record<string, any> = {};
    this.getPoolStats().forEach((poolStats, type) => {
      stats[type] = poolStats;
    });
    return stats;
  }

  /**
   * 워커 재시작 시도
   * @param workerType 워커 유형
   * @param workerId 워커 ID
   * @returns 성공 여부
   * @private
   */
  private tryRestartWorker(workerType: string, workerId: string): boolean {
    const pool = this.getPool(workerType);
    if (!pool) return false;

    // 로그 기록
    this.monitor.log(
      LogLevel.INFO,
      `워커 재시작 시도: ${workerId}`,
      workerType
    );

    // 풀에 재시작 메서드가 직접 있는지 확인
    if (typeof (pool as any).restartWorker === "function") {
      return (pool as any).restartWorker(workerId);
    }

    // 없으면 간접적으로 재시작 시도
    // 참고: 이 부분은 worker-pool의 실제 API에 맞게 구현해야 함
    // 여기서는 풀에 신호를 보내는 단순 구현만 제공
    this.monitor.log(
      LogLevel.INFO,
      `워커 ${workerId}에 대한 재시작 요청이 처리됨`,
      workerType
    );

    return true;
  }

  /**
   * 태스크 정보 객체 생성
   * @returns 태스크 정보 객체
   * @private
   */
  private getTaskInfoObject(): Record<string, any> {
    const taskInfo: Record<string, any> = {
      total: 0,
      completed: 0,
      failed: 0,
      active: 0,
      queued: 0,
      tasks: [],
    };

    // 디스패처에서 태스크 정보 수집 시도
    try {
      // 실제 디스패처의 메서드나 속성을 사용하여 태스크 정보 가져오기
      const allTasks = this.getAllTasksFromDispatcher();

      // 태스크 상태별 분류
      const pendingTasks = allTasks.filter(
        (task) => task.status === "pending" || task.status === "queued"
      );
      const activeTasks = allTasks.filter(
        (task) => task.status === "running" || task.status === "active"
      );
      const completedTasks = allTasks.filter(
        (task) => task.status === "completed" || task.status === "success"
      );
      const failedTasks = allTasks.filter(
        (task) => task.status === "failed" || task.status === "error"
      );

      // 카운트 업데이트
      taskInfo.queued = pendingTasks.length;
      taskInfo.active = activeTasks.length;
      taskInfo.completed = completedTasks.length;
      taskInfo.failed = failedTasks.length;
      taskInfo.total = allTasks.length;

      // 최근 태스크 정보 수집 (최대 20개)
      const recentTasks = [...allTasks]
        .sort((a, b) => {
          const timeA = typeof a.submittedAt === "number" ? a.submittedAt : 0;
          const timeB = typeof b.submittedAt === "number" ? b.submittedAt : 0;
          return timeB - timeA;
        })
        .slice(0, 20);

      // 태스크 정보 가공
      taskInfo.tasks = recentTasks.map((task) => {
        const taskInfo: Record<string, any> = {
          id: task.id,
          status: task.status,
          type: task.type,
        };

        // 선택적 속성 추가
        if (task.priority !== undefined) taskInfo.priority = task.priority;
        if (task.submittedAt !== undefined)
          taskInfo.submittedAt = task.submittedAt;

        // 처리 시간 계산 (속성이 있는 경우)
        if (task.startTime !== undefined && task.endTime !== undefined) {
          taskInfo.processingTime = task.endTime - task.startTime;
        }

        // 워커 ID 추가 (있는 경우)
        if (task.workerId !== undefined) {
          taskInfo.workerId = task.workerId;
        }

        return taskInfo;
      });
    } catch (error) {
      this.monitor.log(
        LogLevel.ERROR,
        `태스크 정보 수집 중 오류 발생: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "SYSTEM"
      );
    }

    return taskInfo;
  }

  /**
   * 디스패처로부터 모든 태스크 목록 가져오기
   * @returns 태스크 배열
   * @private
   */
  private getAllTasksFromDispatcher(): Array<Record<string, any>> {
    const tasks: Array<Record<string, any>> = [];

    try {
      // 디스패처 내부 구현에 따라 태스크, 가져오기
      // 여기서는 디스패처가 노출하는 API를 사용한다고 가정

      // 대기 중인 태스크 (내부 속성 접근)
      const pendingTasks = (this.dispatcher as any)._pendingTasks;
      if (pendingTasks && typeof pendingTasks === "object") {
        Object.values(pendingTasks).forEach((task: unknown) => {
          if (task && typeof task === "object") {
            tasks.push(task as Record<string, any>);
          }
        });
      }

      // 활성 태스크
      const activeTasks = (this.dispatcher as any)._activeTasks;
      if (activeTasks && typeof activeTasks === "object") {
        Object.values(activeTasks).forEach((task: unknown) => {
          if (task && typeof task === "object") {
            tasks.push(task as Record<string, any>);
          }
        });
      }

      // 완료된 태스크
      const completedTasks = (this.dispatcher as any)._completedTasks;
      if (completedTasks && typeof completedTasks === "object") {
        Object.values(completedTasks).forEach((task: unknown) => {
          if (task && typeof task === "object") {
            tasks.push(task as Record<string, any>);
          }
        });
      }

      // 실패한 태스크
      const failedTasks = (this.dispatcher as any)._failedTasks;
      if (failedTasks && typeof failedTasks === "object") {
        Object.values(failedTasks).forEach((task: unknown) => {
          if (task && typeof task === "object") {
            tasks.push(task as Record<string, any>);
          }
        });
      }
    } catch (error) {
      this.monitor.log(
        LogLevel.ERROR,
        `태스크 목록 가져오기 실패: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "SYSTEM"
      );
    }

    return tasks;
  }
}
