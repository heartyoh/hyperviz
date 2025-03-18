/**
 * @hyperviz/worker-pool 기본 사용법 예시
 */

const {
  UnifiedWorkerPoolManager,
  WorkerType,
  LogLevel,
  TaskPriority,
} = require("@hyperviz/worker-pool");

async function main() {
  console.log("UnifiedWorkerPoolManager 예시 시작");

  // 통합 매니저 생성
  const manager = new UnifiedWorkerPoolManager({
    // 기본 풀 설정
    poolConfig: {
      minWorkers: 1,
      maxWorkers: 4,
      idleTimeout: 30000, // 30초
    },
    // 태스크 설정
    taskTimeout: 10000, // 10초
    retryLimit: 2,
    autoCreatePools: true,

    // 모니터 설정
    logLevel: LogLevel.DEBUG,
    metricsInterval: 3000, // 3초
    maxLogEntries: 100,
    autoRestart: true,

    // 초기 풀 설정
    initialPools: {
      [WorkerType.IMAGE]: { minWorkers: 2, maxWorkers: 4 },
      [WorkerType.DATA]: { minWorkers: 1, maxWorkers: 2 },
    },
  });

  // 디스패처 이벤트 핸들러 등록
  const dispatcher = manager.getDispatcher();

  dispatcher.on("taskQueued", (event) => {
    console.log(`[이벤트] 태스크 큐에 추가됨: ${event.taskId}`);
  });

  dispatcher.on("taskCompleted", (event) => {
    console.log(`[이벤트] 태스크 완료됨: ${event.taskId}`);

    // 태스크 결과 조회
    const task = manager.getTaskStatus(event.taskId);
    console.log("태스크 결과:", task?.result);
  });

  dispatcher.on("taskFailed", (event) => {
    console.log(`[이벤트] 태스크 실패: ${event.taskId}, 오류: ${event.error}`);
  });

  // 모니터 이벤트 핸들러 등록
  const monitor = manager.getMonitor();

  monitor.on("log", (entry) => {
    // 콘솔에 이미 출력되므로 중복 출력 방지
    // 필요한 경우 추가 처리 가능
  });

  monitor.on("metricsCollected", (event) => {
    // 메트릭 수집 이벤트 처리 (필요한 경우)
  });

  // 매니저 초기화
  manager.initialize();
  console.log("관리자 초기화 완료");

  // 태스크 제출 예시
  console.log("\n----- 이미지 처리 태스크 제출 -----");
  const imageTaskId = manager.submitTask(
    "resize",
    {
      width: 800,
      height: 600,
      format: "jpg",
    },
    {
      priority: TaskPriority.HIGH,
    }
  );
  console.log(`이미지 태스크 ID: ${imageTaskId}`);

  // 잠시 대기
  await delay(500);

  console.log("\n----- 데이터 처리 태스크 제출 -----");
  const dataTaskId = manager.submitTask("parse", {
    format: "json",
    content: [1, 2, 3, 4, 5],
  });
  console.log(`데이터 태스크 ID: ${dataTaskId}`);

  // 잠시 대기
  await delay(500);

  console.log("\n----- 계산 태스크 제출 -----");
  const calcTaskId = manager.submitTask(
    "matrix",
    {
      dimensions: [3, 3],
      operation: "inverse",
    },
    {
      priority: TaskPriority.CRITICAL,
    }
  );
  console.log(`계산 태스크 ID: ${calcTaskId}`);

  // 작업이 완료될 때까지 대기
  await delay(2000);

  // 풀 상태 출력
  console.log("\n----- 풀 상태 -----");
  const poolStats = manager.getPoolStats();
  for (const [type, stats] of poolStats.entries()) {
    console.log(`${type} 풀 상태:`, stats);
  }

  // 로그 출력 (최근 5개)
  console.log("\n----- 최근 로그 -----");
  const logs = manager.getLogs(5);
  logs.forEach((entry) => {
    const timestamp = new Date(entry.timestamp).toISOString();
    console.log(`${timestamp} [${entry.level}] ${entry.message}`);
  });

  // 3초 후 종료
  console.log("\n3초 후 종료합니다...");
  await delay(3000);

  // 종료
  await manager.shutdown();
  console.log("UnifiedWorkerPoolManager 예시 종료");
}

// 지연 유틸리티 함수
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 메인 함수 실행
main().catch((err) => {
  console.error("오류 발생:", err);
  process.exit(1);
});
