/**
 * 워커풀 모니터링 웹워커
 *
 * 워커풀의 상태를 실시간으로 모니터링하고 UI에 정보를 제공합니다.
 */

// 타입 정의
import { LogLevel, PoolStats } from "../types/index.js";

// 환경에 따라 다른 워커 API 사용
let _workerData: any;
let _parentPort: any = null;

// 웹 워커 환경 여부 확인
const isWebWorker =
  typeof self !== "undefined" && typeof self.postMessage === "function";

// 워커가 초기화될 때 로그
if (!isWebWorker) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const workerThreads = require("worker_threads");
    _workerData = workerThreads.workerData;
    _parentPort = workerThreads.parentPort;
    console.log(`모니터링 워커 [${_workerData?.id || "unknown"}] 초기화`);
  } catch (error) {
    console.error("Node.js 워커 초기화 오류:", error);
  }
}

// 상태 저장용 변수
const monitoringState = {
  isActive: false,
  interval: 1000, // 기본 업데이트 간격 (밀리초)
  poolStats: new Map<string, PoolStats>(),
  workers: new Map<string, any>(),
  logs: [] as any[],
  maxLogEntries: 1000,
  alertThresholds: {
    queuedTasks: 100,
    failedTasks: 10,
    idleWorkers: 0,
    averageProcessTime: 5000,
  },
};

// 메시지 처리 핸들러
function handleMessage(message: any): void {
  try {
    // 초기화 메시지 처리 (웹 워커일 경우)
    if (message && message.__workerInit && isWebWorker) {
      _workerData = message.workerData;
      console.log(`모니터링 워커 [${_workerData?.id || "unknown"}] 초기화`);
      return;
    }

    const { taskId, type, data } = message;

    // 작업 유형에 따른 처리
    let result;
    switch (type) {
      case "startMonitoring":
        result = startMonitoring(data);
        break;
      case "stopMonitoring":
        result = stopMonitoring();
        break;
      case "updateStats":
        result = updateStats(data);
        break;
      case "getStats":
        result = getStats(data);
        break;
      case "updateAlertThresholds":
        result = updateAlertThresholds(data);
        break;
      default:
        throw new Error(`지원하지 않는 모니터링 작업 유형: ${type}`);
    }

    // 결과 반환
    if (isWebWorker) {
      self.postMessage({
        taskId,
        status: "completed",
        result,
      });
    } else {
      _parentPort?.postMessage({
        taskId,
        status: "completed",
        result,
      });
    }
  } catch (error) {
    // 오류 처리
    const errorMessage = {
      taskId: message.taskId,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };

    if (isWebWorker) {
      self.postMessage(errorMessage);
    } else {
      _parentPort?.postMessage(errorMessage);
    }
  }
}

// 이벤트 리스너 등록
if (isWebWorker) {
  self.addEventListener("message", (event) => {
    handleMessage(event.data);
  });
} else {
  _parentPort?.on("message", (message: any) => {
    handleMessage(message);
  });

  // 워커 종료 처리
  _parentPort?.on("close", () => {
    console.log(`모니터링 워커 [${_workerData?.id || "unknown"}] 종료`);
    stopMonitoring();
  });
}

/**
 * 모니터링 시작
 */
function startMonitoring(data: any): any {
  monitoringState.isActive = true;
  monitoringState.interval = data.interval || monitoringState.interval;

  // 초기 설정값 적용
  if (data.maxLogEntries) {
    monitoringState.maxLogEntries = data.maxLogEntries;
  }

  if (data.alertThresholds) {
    monitoringState.alertThresholds = {
      ...monitoringState.alertThresholds,
      ...data.alertThresholds,
    };
  }

  // 모니터링 활성화 알림
  logMonitorEvent(LogLevel.INFO, "워커풀 모니터링이 시작되었습니다.");

  return {
    status: "active",
    interval: monitoringState.interval,
    message: "워커풀 모니터링이 시작되었습니다.",
  };
}

/**
 * 모니터링 중지
 */
function stopMonitoring(): any {
  monitoringState.isActive = false;
  logMonitorEvent(LogLevel.INFO, "워커풀 모니터링이 중지되었습니다.");

  return {
    status: "inactive",
    message: "워커풀 모니터링이 중지되었습니다.",
  };
}

/**
 * 통계 업데이트
 */
function updateStats(data: any): any {
  // 워커풀 통계 업데이트
  if (data.poolStats) {
    for (const [type, stats] of Object.entries(data.poolStats)) {
      monitoringState.poolStats.set(type, stats as PoolStats);
    }
  }

  // 워커 정보 업데이트
  if (data.workers) {
    for (const [id, workerInfo] of Object.entries(data.workers)) {
      monitoringState.workers.set(id, workerInfo);
    }
  }

  // 로그 업데이트
  if (data.logs && Array.isArray(data.logs)) {
    data.logs.forEach((log: any) => {
      monitoringState.logs.push(log);
    });

    // 로그 개수 제한
    if (monitoringState.logs.length > monitoringState.maxLogEntries) {
      monitoringState.logs = monitoringState.logs.slice(
        -monitoringState.maxLogEntries
      );
    }
  }

  // 경고 조건 확인 및 알림
  checkAlertConditions();

  return {
    updated: true,
    timestamp: Date.now(),
    poolsCount: monitoringState.poolStats.size,
    workersCount: monitoringState.workers.size,
    logsCount: monitoringState.logs.length,
  };
}

/**
 * 통계 가져오기
 */
function getStats(data: any): any {
  // 요청된 데이터만 필터링하여 반환
  const result: any = {
    timestamp: Date.now(),
    isActive: monitoringState.isActive,
  };

  if (data.includePools) {
    result.poolStats = Object.fromEntries(monitoringState.poolStats);
  }

  if (data.includeWorkers) {
    result.workers = Object.fromEntries(monitoringState.workers);
  }

  if (data.includeLogs) {
    const count = data.logsCount || 50; // 기본적으로 최근 50개 로그 반환
    result.logs = monitoringState.logs.slice(-count);
  }

  return result;
}

/**
 * 알림 임계값 업데이트
 */
function updateAlertThresholds(data: any): any {
  monitoringState.alertThresholds = {
    ...monitoringState.alertThresholds,
    ...data,
  };

  logMonitorEvent(LogLevel.INFO, "알림 임계값이 업데이트되었습니다.");

  return {
    updated: true,
    currentThresholds: monitoringState.alertThresholds,
  };
}

/**
 * 경고 조건 확인
 */
function checkAlertConditions(): void {
  const { alertThresholds } = monitoringState;

  // 각 풀의 통계 확인
  for (const [type, stats] of monitoringState.poolStats.entries()) {
    // 대기 중인 태스크가 임계값 초과
    if (stats.queuedTasks > alertThresholds.queuedTasks) {
      sendAlert(
        LogLevel.WARN,
        `${type} 풀의 대기 중인 태스크 수가 임계값을 초과했습니다: ${stats.queuedTasks}`,
        type
      );
    }

    // 실패한 태스크가 임계값 초과
    if (stats.failedTasks > alertThresholds.failedTasks) {
      sendAlert(
        LogLevel.ERROR,
        `${type} 풀의 실패한 태스크 수가 임계값을 초과했습니다: ${stats.failedTasks}`,
        type
      );
    }

    // 유휴 워커가 없음
    if (
      stats.idleWorkers <= alertThresholds.idleWorkers &&
      stats.queuedTasks > 0
    ) {
      sendAlert(
        LogLevel.WARN,
        `${type} 풀에 유휴 워커가 없지만 대기 중인 태스크가 있습니다.`,
        type
      );
    }

    // 평균 처리 시간이 임계값 초과
    if (stats.averageProcessTime > alertThresholds.averageProcessTime) {
      sendAlert(
        LogLevel.WARN,
        `${type} 풀의 평균 처리 시간이 임계값을 초과했습니다: ${stats.averageProcessTime}ms`,
        type
      );
    }
  }
}

/**
 * 알림 전송
 */
function sendAlert(
  level: LogLevel,
  message: string,
  workerType?: string
): void {
  logMonitorEvent(level, message, workerType);

  // 알림 이벤트 발행
  if (isWebWorker) {
    self.postMessage({
      type: "alert",
      data: {
        level,
        message,
        workerType,
        timestamp: Date.now(),
      },
    });
  } else {
    _parentPort?.postMessage({
      type: "alert",
      data: {
        level,
        message,
        workerType,
        timestamp: Date.now(),
      },
    });
  }
}

/**
 * 모니터링 이벤트 로깅
 */
function logMonitorEvent(
  level: LogLevel,
  message: string,
  workerType?: string
): void {
  const logEntry = {
    timestamp: Date.now(),
    level,
    message,
    workerType,
    source: "monitor",
  };

  // 로그 저장
  monitoringState.logs.push(logEntry);

  // 로그 개수 제한
  if (monitoringState.logs.length > monitoringState.maxLogEntries) {
    monitoringState.logs.shift();
  }

  // 콘솔에 로그 출력
  const timestamp = new Date(logEntry.timestamp).toISOString();
  let logMessage = `[${timestamp}] [${level}] ${message}`;

  if (workerType) {
    logMessage += ` [워커유형:${workerType}]`;
  }

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
