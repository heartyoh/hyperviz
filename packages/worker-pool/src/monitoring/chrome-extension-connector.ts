/**
 * 크롬 확장 프로그램 커넥터
 *
 * 워커풀 모니터링 데이터를 크롬 확장 프로그램으로 전송하는 기능 제공
 */

import { EventEmitter } from "eventemitter3";
import { WorkerPoolFactory } from "../pool/worker-pool-factory.js";
import { WorkerMonitor } from "./worker-monitor.js";
import { TaskDispatcher } from "../dispatcher/task-dispatcher.js";
import { LogLevel, WorkerType } from "../types/index.js";

// 익스텐션 커넥터 설정 인터페이스
export interface ExtensionConnectorConfig {
  poolFactory: WorkerPoolFactory;
  dispatcher?: TaskDispatcher;
  monitor: WorkerMonitor;
  extensionId?: string;
  autoConnect?: boolean;
  updateInterval?: number;
}

/**
 * 크롬 확장 프로그램 커넥터 클래스
 */
export class ChromeExtensionConnector extends EventEmitter {
  private poolFactory: WorkerPoolFactory;
  private monitor: WorkerMonitor;
  private extensionId?: string;
  private port?: any; // Chrome 확장 프로그램과의 통신 포트
  private isConnected: boolean = false;
  private updateInterval: number;
  private updateTimer?: NodeJS.Timeout;
  private pendingUpdates: Map<string, any> = new Map();
  private debounceTime: number = 200; // 디바운스 시간 (밀리초)

  /**
   * 크롬 확장 프로그램 커넥터 생성자
   *
   * @param config 커넥터 설정
   */
  constructor(config: ExtensionConnectorConfig) {
    super();

    this.poolFactory = config.poolFactory;
    this.monitor = config.monitor;
    this.extensionId = config.extensionId;
    this.updateInterval = config.updateInterval || 1000; // 기본 1초

    // 모니터링 이벤트 리스너 설정
    this.setupMonitorListeners();

    // 자동 연결 설정
    if (config.autoConnect) {
      this.connect();
    }
  }

  /**
   * 모니터 이벤트 리스너 설정
   */
  private setupMonitorListeners(): void {
    // 로그 이벤트 구독
    this.monitor.on("log", (entry) => {
      this.debouncedUpdate("logs", { log: entry });
    });

    // 메트릭 수집 이벤트 구독
    this.monitor.on("metricsCollected", (data) => {
      this.debouncedUpdate("metrics", data);
    });

    // 워커 재시작 필요 이벤트 구독
    this.monitor.on("workerNeedsRestart", (data) => {
      this.sendUpdate("alert", {
        type: "workerRestart",
        level: LogLevel.WARN,
        message: `워커 ${data.workerId} (${data.workerType}) 재시작이 필요합니다.`,
        data,
      });
    });
  }

  /**
   * 확장 프로그램에 연결
   */
  connect(): boolean {
    // 브라우저 환경인지 확인
    if (
      typeof window === "undefined" ||
      typeof (window as any).chrome === "undefined" ||
      typeof (window as any).chrome.runtime === "undefined"
    ) {
      this.emit(
        "error",
        new Error("크롬 확장 프로그램 API를 사용할 수 없습니다.")
      );
      return false;
    }

    try {
      // 확장 프로그램에 연결
      this.port = (window as any).chrome.runtime.connect(this.extensionId, {
        name: "hyperviz-worker-monitor",
      });

      // 연결 이벤트 리스너 설정
      this.port.onDisconnect.addListener(() => {
        this.handleDisconnect();
      });

      this.port.onMessage.addListener((message: any) => {
        this.handleExtensionMessage(message);
      });

      this.isConnected = true;
      this.startUpdateTimer();

      this.emit("connected");
      this.monitor.log(LogLevel.INFO, "크롬 확장 프로그램에 연결되었습니다.");

      // 초기 상태 전송
      this.sendInitialState();

      return true;
    } catch (error) {
      this.emit("error", error);
      this.monitor.log(
        LogLevel.ERROR,
        `크롬 확장 프로그램 연결 오류: ${error}`
      );
      return false;
    }
  }

  /**
   * 확장 프로그램 연결 해제
   */
  disconnect(): void {
    if (!this.isConnected || !this.port) return;

    try {
      this.port.disconnect();
      this.handleDisconnect();
    } catch (error) {
      this.emit("error", error);
      this.monitor.log(
        LogLevel.ERROR,
        `크롬 확장 프로그램 연결 해제 오류: ${error}`
      );
    }
  }

  /**
   * 연결 해제 처리
   */
  private handleDisconnect(): void {
    this.isConnected = false;
    this.port = undefined;
    this.stopUpdateTimer();

    this.emit("disconnected");
    this.monitor.log(
      LogLevel.INFO,
      "크롬 확장 프로그램 연결이 해제되었습니다."
    );
  }

  /**
   * 확장 프로그램에서 받은 메시지 처리
   */
  private handleExtensionMessage(message: any): void {
    if (!message || !message.type) return;

    switch (message.type) {
      case "ping":
        this.sendUpdate("pong", { timestamp: Date.now() });
        break;

      case "requestStats":
        this.sendWorkerStats();
        break;

      case "requestLogs":
        this.sendLogs(message.data);
        break;

      case "updateMonitorSettings":
        this.updateMonitorSettings(message.data);
        break;

      case "restartWorker":
        this.restartWorker(message.data);
        break;

      default:
        this.emit("unknownMessage", message);
        break;
    }
  }

  /**
   * 주기적 업데이트 타이머 시작
   */
  private startUpdateTimer(): void {
    if (this.updateTimer) return;

    this.updateTimer = setInterval(() => {
      if (this.isConnected) {
        this.sendWorkerStats();
      }
    }, this.updateInterval);
  }

  /**
   * 주기적 업데이트 타이머 중지
   */
  private stopUpdateTimer(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
  }

  /**
   * 초기 상태 전송
   */
  private sendInitialState(): void {
    if (!this.isConnected) return;

    // 워커 유형 목록 전송
    const workerTypes = Array.from(this.poolFactory.getPoolTypes());

    // 모니터 설정 정보 전송
    this.sendUpdate("initialState", {
      workerTypes,
      timestamp: Date.now(),
    });

    // 현재 통계 전송
    this.sendWorkerStats();
  }

  /**
   * 워커 통계 전송
   */
  private sendWorkerStats(): void {
    if (!this.isConnected) return;

    // 모든 풀의 최신 통계 수집
    const latestMetrics = this.monitor.getLatestMetrics();
    const metricsData: Record<string, any> = {};

    for (const [type, stats] of latestMetrics.entries()) {
      if (stats) {
        metricsData[type] = stats;
      }
    }

    // 워커 정보 수집
    const workersData: Record<string, any> = {};
    for (const type of this.poolFactory.getPoolTypes()) {
      const pool = this.poolFactory.getPool(type);
      if (!pool) continue;

      const workers = pool.getWorkers();
      workers.forEach((worker) => {
        workersData[worker.id] = {
          id: worker.id,
          type: worker.type,
          status: worker.status,
          tasks: worker.tasks,
          performance: worker.performance,
        };
      });
    }

    // 통계 전송
    this.sendUpdate("stats", {
      metrics: metricsData,
      workers: workersData,
      timestamp: Date.now(),
    });
  }

  /**
   * 로그 전송
   */
  private sendLogs(data: any = {}): void {
    if (!this.isConnected) return;

    // 로그 필터링 옵션 처리
    const { limit = 50, level, workerType, taskId, workerId } = data;

    // 필터링된 로그 가져오기
    const logs = this.monitor.getLogs(
      limit,
      level,
      workerType,
      taskId,
      workerId
    );

    // 로그 전송
    this.sendUpdate("logs", {
      logs,
      filter: {
        limit,
        level,
        workerType,
        taskId,
        workerId,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * 모니터링 설정 업데이트
   */
  private updateMonitorSettings(data: any): void {
    if (!data) return;

    // 로그 레벨 업데이트
    if (data.logLevel !== undefined) {
      this.monitor.setLogLevel(data.logLevel);
      this.monitor.log(
        LogLevel.INFO,
        `로그 레벨이 ${data.logLevel}로 변경되었습니다.`
      );
    }

    // 최대 로그 항목 수 업데이트
    if (data.maxLogEntries !== undefined) {
      this.monitor.setMaxLogEntries(data.maxLogEntries);
      this.monitor.log(
        LogLevel.INFO,
        `최대 로그 항목 수가 ${data.maxLogEntries}로 변경되었습니다.`
      );
    }

    // 자동 재시작 설정 업데이트
    if (data.autoRestart !== undefined) {
      this.monitor.setAutoRestart(data.autoRestart);
      this.monitor.log(
        LogLevel.INFO,
        `워커 자동 재시작이 ${
          data.autoRestart ? "활성화" : "비활성화"
        }되었습니다.`
      );
    }

    // 업데이트 간격 변경
    if (data.updateInterval !== undefined) {
      this.updateInterval = data.updateInterval;
      this.stopUpdateTimer();
      this.startUpdateTimer();
      this.monitor.log(
        LogLevel.INFO,
        `업데이트 간격이 ${data.updateInterval}ms로 변경되었습니다.`
      );
    }

    // 설정 업데이트 응답 전송
    this.sendUpdate("settingsUpdated", {
      settings: {
        logLevel: this.monitor.getLogLevel(),
        updateInterval: this.updateInterval,
        // 기타 현재 설정 정보
      },
      timestamp: Date.now(),
    });
  }

  /**
   * 워커 재시작
   */
  private restartWorker(data: any): void {
    if (!data || !data.workerId || !data.workerType) {
      this.monitor.log(
        LogLevel.ERROR,
        "워커 재시작 요청에 필요한 정보가 부족합니다."
      );
      return;
    }

    const { workerId, workerType } = data;

    // 해당 풀 가져오기
    const pool = this.poolFactory.getPool(workerType as WorkerType);
    if (!pool) {
      this.monitor.log(
        LogLevel.ERROR,
        `워커 유형 ${workerType}에 대한 풀을 찾을 수 없습니다.`
      );
      return;
    }

    // 워커 재시작 시도
    try {
      // restartWorker는 private 메서드이므로 이벤트 발생을 통해 처리
      this.emit("requestWorkerRestart", { workerId, workerType });
      this.monitor.log(
        LogLevel.INFO,
        `워커 ${workerId} (${workerType}) 재시작이 요청되었습니다.`
      );

      // 재시작 응답 전송
      this.sendUpdate("workerRestarted", {
        workerId,
        workerType,
        success: true,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.monitor.log(
        LogLevel.ERROR,
        `워커 ${workerId} (${workerType}) 재시작 오류: ${error}`,
        workerType,
        undefined,
        workerId
      );

      // 오류 응답 전송
      this.sendUpdate("workerRestarted", {
        workerId,
        workerType,
        success: false,
        error: String(error),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 디바운스된 업데이트 전송
   */
  private debouncedUpdate(type: string, data: any): void {
    // 기존 디바운스 핸들이 있으면 취소
    if (this.pendingUpdates.has(type)) {
      clearTimeout(this.pendingUpdates.get(type));
    }

    // 새 디바운스 핸들 생성
    const timeoutId = setTimeout(() => {
      this.sendUpdate(type, data);
      this.pendingUpdates.delete(type);
    }, this.debounceTime);

    this.pendingUpdates.set(type, timeoutId);
  }

  /**
   * 확장 프로그램에 업데이트 전송
   */
  private sendUpdate(type: string, data: any): void {
    if (!this.isConnected || !this.port) return;

    try {
      this.port.postMessage({
        type,
        data,
      });
    } catch (error) {
      // 전송 오류 시 연결 해제로 처리
      this.emit("error", error);
      this.handleDisconnect();
    }
  }

  /**
   * 업데이트 간격 설정
   */
  setUpdateInterval(interval: number): void {
    if (interval < 100) {
      throw new Error("업데이트 간격은 최소 100ms 이상이어야 합니다.");
    }

    this.updateInterval = interval;

    // 타이머 갱신
    if (this.isConnected) {
      this.stopUpdateTimer();
      this.startUpdateTimer();
    }
  }

  /**
   * 현재 연결 상태 확인
   */
  isExtensionConnected(): boolean {
    return this.isConnected;
  }
}
