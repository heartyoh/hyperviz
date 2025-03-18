/**
 * Worker Monitor
 *
 * 워커 풀 모니터링 및 로깅 담당
 */

import { EventEmitter } from "eventemitter3";
import { WorkerPoolFactory } from "../pool/worker-pool-factory.js";
import { TaskDispatcher } from "../dispatcher/task-dispatcher.js";
import {
  LogLevel,
  LogEntry,
  WorkerStatus,
  PoolStats,
  WorkerType,
} from "../types/index.js";

/**
 * 모니터 설정 인터페이스
 */
export interface MonitorConfig {
  poolFactory: WorkerPoolFactory;
  dispatcher?: TaskDispatcher;
  logLevel?: LogLevel;
  metricsInterval?: number; // 메트릭 수집 간격(ms)
  maxLogEntries?: number; // 최대 로그 항목 수
  autoRestart?: boolean; // 비정상 워커 자동 재시작 여부
  healthCheckInterval?: number; // 상태 확인 간격(ms)
}

/**
 * 워커 모니터 클래스
 */
export class WorkerMonitor extends EventEmitter {
  private poolFactory: WorkerPoolFactory;
  private dispatcher?: TaskDispatcher;
  private logLevel: LogLevel;
  private logs: LogEntry[];
  private maxLogEntries: number;
  private metricsInterval: number;
  private metricsTimer?: NodeJS.Timeout;
  private metrics: Map<WorkerType | string, PoolStats[]>;
  private autoRestart: boolean;
  private healthCheckInterval: number;
  private healthCheckTimer?: NodeJS.Timeout;
  private isMonitoring: boolean;

  /**
   * 워커 모니터 생성자
   *
   * @param config 모니터 설정
   */
  constructor(config: MonitorConfig) {
    super();

    this.poolFactory = config.poolFactory;
    this.dispatcher = config.dispatcher;
    this.logLevel = config.logLevel || LogLevel.INFO;
    this.logs = [];
    this.maxLogEntries = config.maxLogEntries || 1000;
    this.metricsInterval = config.metricsInterval || 5000; // 기본 5초
    this.metrics = new Map();
    this.autoRestart =
      config.autoRestart !== undefined ? config.autoRestart : true;
    this.healthCheckInterval = config.healthCheckInterval || 10000; // 기본 10초
    this.isMonitoring = false;

    // 디스패처가 제공된 경우 이벤트 리스닝 설정
    if (this.dispatcher) {
      this.setupDispatcherListeners();
    }
  }

  /**
   * 디스패처 이벤트 리스너 설정
   */
  private setupDispatcherListeners(): void {
    if (!this.dispatcher) return;

    this.dispatcher.on("taskQueued", (event) => {
      this.log(
        LogLevel.INFO,
        `태스크 큐에 추가됨: ${event.taskId}`,
        undefined,
        event.taskId
      );
    });

    this.dispatcher.on("taskStarted", (event) => {
      this.log(
        LogLevel.INFO,
        `태스크 시작됨: ${event.taskId}`,
        event.workerType,
        event.taskId
      );
    });

    this.dispatcher.on("taskCompleted", (event) => {
      this.log(
        LogLevel.INFO,
        `태스크 완료됨: ${event.taskId}`,
        event.workerType,
        event.taskId
      );
    });

    this.dispatcher.on("taskFailed", (event) => {
      this.log(
        LogLevel.ERROR,
        `태스크 실패: ${event.taskId}, 오류: ${event.error}`,
        event.workerType,
        event.taskId
      );
    });

    this.dispatcher.on("taskRetry", (event) => {
      this.log(
        LogLevel.WARN,
        `태스크 재시도: ${event.taskId}, 재시도 횟수: ${event.retryCount}`,
        event.workerType,
        event.taskId
      );
    });

    this.dispatcher.on("taskTimeout", (event) => {
      this.log(
        LogLevel.WARN,
        `태스크 타임아웃: ${event.taskId}`,
        event.workerType,
        event.taskId
      );
    });
  }

  /**
   * 풀 팩토리의 이벤트 리스너 설정
   */
  private setupPoolListeners(): void {
    // 모든 풀 유형을 가져와서 이벤트 리스닝 설정
    for (const type of this.poolFactory.getPoolTypes()) {
      const pool = this.poolFactory.getPool(type);
      if (!pool) continue;

      // 워커 관련 이벤트
      pool.on("workerCreated", (event) => {
        this.log(LogLevel.INFO, `워커 생성됨: ${event.workerId}`, type);
      });

      pool.on("workerError", (event) => {
        this.log(
          LogLevel.ERROR,
          `워커 오류: ${event.workerId}, 오류: ${event.error}`,
          type,
          undefined,
          event.workerId
        );

        // 자동 재시작 설정이 켜져 있으면 재시작 알림
        if (this.autoRestart) {
          this.emit("workerNeedsRestart", {
            workerId: event.workerId,
            workerType: type,
          });
        }
      });

      pool.on("workerExit", (event) => {
        this.log(
          LogLevel.INFO,
          `워커 종료됨: ${event.workerId}, 종료 코드: ${event.exitCode}`,
          type
        );
      });

      pool.on("workerRestart", (event) => {
        this.log(LogLevel.WARN, `워커 재시작: ${event.workerId}`, type);
      });

      // 태스크 관련 이벤트는 이미 디스패처에서 처리됨
    }
  }

  /**
   * 메트릭 수집 시작
   */
  startMetricsCollection(): void {
    if (this.metricsTimer) return;

    // 즉시 한 번 수집
    this.collectMetrics();

    // 주기적으로 수집 시작
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, this.metricsInterval);
  }

  /**
   * 메트릭 수집 중지
   */
  stopMetricsCollection(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }
  }

  /**
   * 메트릭 수집
   */
  private collectMetrics(): void {
    // 모든 풀 유형을 가져와서 메트릭 수집
    for (const type of this.poolFactory.getPoolTypes()) {
      const pool = this.poolFactory.getPool(type);
      if (!pool) continue;

      // 풀 통계 가져오기
      const stats = pool.getPoolStats();

      // 이전 메트릭이 없으면 초기화
      if (!this.metrics.has(type)) {
        this.metrics.set(type, []);
      }

      // 메트릭 저장
      const poolMetrics = this.metrics.get(type)!;
      poolMetrics.push(stats as unknown as PoolStats);

      // 메트릭 개수 제한
      if (poolMetrics.length > 100) {
        poolMetrics.shift();
      }

      // 이벤트 발행
      this.emit("metricsCollected", { workerType: type, stats });
    }
  }

  /**
   * 상태 확인 시작
   */
  startHealthCheck(): void {
    if (this.healthCheckTimer) return;

    // 즉시 한 번 확인
    this.checkHealth();

    // 주기적으로 확인 시작
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth();
    }, this.healthCheckInterval);
  }

  /**
   * 상태 확인 중지
   */
  stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * 상태 확인
   */
  private checkHealth(): void {
    // 모든 풀 유형을 가져와서 상태 확인
    for (const type of this.poolFactory.getPoolTypes()) {
      const pool = this.poolFactory.getPool(type);
      if (!pool) continue;

      // 워커 목록 가져오기
      const workers = pool.getWorkers();

      // 각 워커의 상태 확인
      for (const worker of workers) {
        if (worker.status === WorkerStatus.ERROR) {
          // 오류 상태의 워커를 발견하면 로그 기록
          this.log(
            LogLevel.ERROR,
            `비정상 워커 감지: ${worker.id}, 상태: ${worker.status}`,
            type,
            undefined,
            worker.id
          );

          // 자동 재시작 설정이 켜져 있으면 재시작 알림
          if (this.autoRestart) {
            this.emit("workerNeedsRestart", {
              workerId: worker.id,
              workerType: type,
            });
          }
        }
      }
    }
  }

  /**
   * 모니터링 시작
   */
  start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;

    // 풀 이벤트 리스너 설정
    this.setupPoolListeners();

    // 메트릭 수집 시작
    this.startMetricsCollection();

    // 상태 확인 시작
    this.startHealthCheck();

    this.log(LogLevel.INFO, "워커 모니터링 시작됨");
    this.emit("monitoringStarted");
  }

  /**
   * 모니터링 중지
   */
  stop(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    // 메트릭 수집 중지
    this.stopMetricsCollection();

    // 상태 확인 중지
    this.stopHealthCheck();

    this.log(LogLevel.INFO, "워커 모니터링 중지됨");
    this.emit("monitoringStopped");
  }

  /**
   * 로그 메시지 기록
   *
   * @param level 로그 레벨
   * @param message 메시지
   * @param workerType 워커 유형 (선택 사항)
   * @param taskId 태스크 ID (선택 사항)
   * @param workerId 워커 ID (선택 사항)
   * @param data 추가 데이터 (선택 사항)
   */
  log(
    level: LogLevel,
    message: string,
    workerType?: WorkerType | string,
    taskId?: string,
    workerId?: string,
    data?: any
  ): void {
    // 설정된 로그 레벨보다 낮은 레벨의 로그는 무시
    if (!this.shouldLog(level)) return;

    // 로그 엔트리 생성
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      workerType: workerType as WorkerType | undefined,
      taskId,
      workerId,
      data,
    };

    // 로그 저장
    this.logs.push(entry);

    // 로그 개수 제한
    if (this.logs.length > this.maxLogEntries) {
      this.logs.shift();
    }

    // 이벤트 발행
    this.emit("log", entry);

    // 콘솔에 출력 (실제 구현에서는 로깅 라이브러리를 사용하는 것이 좋음)
    const timestamp = new Date(entry.timestamp).toISOString();
    let logMessage = `[${timestamp}] [${level}] ${message}`;

    if (workerType) logMessage += ` [워커유형:${workerType}]`;
    if (workerId) logMessage += ` [워커ID:${workerId}]`;
    if (taskId) logMessage += ` [태스크ID:${taskId}]`;

    switch (level) {
      case LogLevel.ERROR:
        console.error(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.INFO:
        console.info(logMessage);
        break;
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
    }
  }

  /**
   * 로그 기록 여부 확인
   *
   * @param level 로그 레벨
   * @returns 기록 여부
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
    };

    return levels[level] >= levels[this.logLevel];
  }

  /**
   * 로그 레벨 설정
   *
   * @param level 로그 레벨
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * 현재 로그 레벨 반환
   *
   * @returns 현재 로그 레벨
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * 로그 가져오기
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
    // 필터링
    let filteredLogs = this.logs;

    if (level) {
      filteredLogs = filteredLogs.filter((entry) => entry.level === level);
    }

    if (workerType) {
      filteredLogs = filteredLogs.filter(
        (entry) => entry.workerType === workerType
      );
    }

    if (taskId) {
      filteredLogs = filteredLogs.filter((entry) => entry.taskId === taskId);
    }

    if (workerId) {
      filteredLogs = filteredLogs.filter(
        (entry) => entry.workerId === workerId
      );
    }

    // 최근 로그부터 반환
    const sortedLogs = [...filteredLogs].sort(
      (a, b) => b.timestamp - a.timestamp
    );

    // 항목 수 제한
    if (limit && limit > 0) {
      return sortedLogs.slice(0, limit);
    }

    return sortedLogs;
  }

  /**
   * 특정 유형의 메트릭 가져오기
   *
   * @param workerType 워커 유형
   * @param limit 항목 수 제한 (선택 사항)
   * @returns 메트릭 배열
   */
  getMetrics(
    workerType: WorkerType | string,
    limit?: number
  ): PoolStats[] | undefined {
    const poolMetrics = this.metrics.get(workerType);
    if (!poolMetrics) return undefined;

    // 항목 수 제한
    if (limit && limit > 0) {
      return poolMetrics.slice(-limit);
    }

    return [...poolMetrics];
  }

  /**
   * 모든 유형의 최신 메트릭 가져오기
   *
   * @returns 유형별 최신 메트릭 맵
   */
  getLatestMetrics(): Map<WorkerType | string, PoolStats | undefined> {
    const latestMetrics = new Map();

    for (const [type, metrics] of this.metrics.entries()) {
      if (metrics.length > 0) {
        latestMetrics.set(type, metrics[metrics.length - 1]);
      } else {
        latestMetrics.set(type, undefined);
      }
    }

    return latestMetrics;
  }

  /**
   * 자동 재시작 설정
   *
   * @param enabled 활성화 여부
   */
  setAutoRestart(enabled: boolean): void {
    this.autoRestart = enabled;
  }

  /**
   * 최대 로그 항목 수 설정
   *
   * @param maxEntries 최대 항목 수
   */
  setMaxLogEntries(maxEntries: number): void {
    this.maxLogEntries = maxEntries;

    // 현재 로그가 최대 항목 수를 초과하면 자르기
    if (this.logs.length > this.maxLogEntries) {
      this.logs = this.logs.slice(-this.maxLogEntries);
    }
  }
}
