/**
 * 계산 처리 워커
 */

// 타입 정의
declare const WorkerGlobalScope: {
  prototype: any;
  new (): any;
};

// 환경에 따라 다른 워커 API 사용
let _workerData: any;
let _parentPort: any = null;

// 웹 워커 환경 여부 확인
const isWebWorker =
  typeof self !== "undefined" && typeof self.postMessage === "function";

if (isWebWorker) {
  // 웹 워커 환경
  _workerData = (self as any).workerData;

  // 웹 워커 메시지 처리
  self.addEventListener("message", async (event) => {
    try {
      const message = event.data;

      // 초기화 메시지 처리
      if (message && message.__workerInit) {
        _workerData = message.workerData;
        console.log(`계산 처리 워커 [${_workerData?.id || "unknown"}] 초기화`);
        return;
      }

      const { taskId, type, data } = message;

      // 작업 유형에 따른 처리
      let result;
      switch (type) {
        case "matrix":
          result = await simulateMatrixCalculation(data);
          break;
        case "statistics":
          result = await simulateStatisticsCalculation(data);
          break;
        case "optimization":
          result = await simulateOptimizationCalculation(data);
          break;
        default:
          throw new Error(`지원하지 않는 계산 작업 유형: ${type}`);
      }

      // 결과 반환
      self.postMessage({
        taskId,
        status: "completed",
        result,
      });
    } catch (error) {
      // 오류 처리
      self.postMessage({
        taskId: event.data.taskId,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
} else {
  // Node.js 워커 환경
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const workerThreads = require("worker_threads");
    _workerData = workerThreads.workerData;
    _parentPort = workerThreads.parentPort;

    // 워커가 초기화될 때 로그
    console.log(`계산 처리 워커 [${_workerData?.id || "unknown"}] 초기화`);

    // 메시지 수신 처리
    _parentPort?.on("message", async (message: any) => {
      try {
        const { taskId, type, data } = message;

        // 작업 유형에 따른 처리
        let result;
        switch (type) {
          case "matrix":
            result = await simulateMatrixCalculation(data);
            break;
          case "statistics":
            result = await simulateStatisticsCalculation(data);
            break;
          case "optimization":
            result = await simulateOptimizationCalculation(data);
            break;
          default:
            throw new Error(`지원하지 않는 계산 작업 유형: ${type}`);
        }

        // 결과 반환
        _parentPort?.postMessage({
          taskId,
          status: "completed",
          result,
        });
      } catch (error) {
        // 오류 처리
        _parentPort?.postMessage({
          taskId: message.taskId,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // 워커 종료 처리
    _parentPort?.on("close", () => {
      console.log(`계산 처리 워커 [${_workerData?.id || "unknown"}] 종료`);
    });
  } catch (error) {
    console.error("Node.js 워커 초기화 오류:", error);
  }
}

// 행렬 계산 시뮬레이션 함수
async function simulateMatrixCalculation(data: any): Promise<any> {
  // 실제 구현에서는 행렬 계산 로직 구현
  await new Promise((resolve) => setTimeout(resolve, 400)); // 작업 시뮬레이션
  return {
    dimensions: data.dimensions,
    operation: data.operation,
    calculated: true,
  };
}

// 통계 계산 시뮬레이션 함수
async function simulateStatisticsCalculation(_data: any): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return {
    mean: 50,
    median: 45,
    standardDeviation: 15,
    calculated: true,
  };
}

// 최적화 계산 시뮬레이션 함수
async function simulateOptimizationCalculation(data: any): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return {
    optimizationMethod: data.method,
    iterations: 100,
    result: 42,
    calculated: true,
  };
}
