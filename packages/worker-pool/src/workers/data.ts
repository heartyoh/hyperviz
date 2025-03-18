/**
 * 데이터 처리 워커
 */

import { parentPort, workerData } from "worker_threads";

// 워커가 초기화될 때 로그
console.log(`데이터 처리 워커 [${workerData?.id || "unknown"}] 초기화`);

// 메시지 수신 처리
parentPort?.on("message", async (message) => {
  try {
    const { taskId, type, data } = message;

    // 작업 유형에 따른 처리
    let result;
    switch (type) {
      case "parse":
        result = await simulateDataParse(data);
        break;
      case "transform":
        result = await simulateDataTransform(data);
        break;
      case "validate":
        result = await simulateDataValidate(data);
        break;
      default:
        throw new Error(`지원하지 않는 데이터 작업 유형: ${type}`);
    }

    // 결과 반환
    parentPort?.postMessage({
      taskId,
      status: "completed",
      result,
    });
  } catch (error) {
    // 오류 처리
    parentPort?.postMessage({
      taskId: message.taskId,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// 데이터 파싱 시뮬레이션 함수
async function simulateDataParse(data: any): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 150)); // 작업 시뮬레이션
  return {
    format: data.format,
    records: Array.isArray(data.content) ? data.content.length : 0,
    parsed: true,
  };
}

// 데이터 변환 시뮬레이션 함수
async function simulateDataTransform(data: any): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return {
    transformation: data.transformation,
    recordsProcessed: data.count || 10,
    transformed: true,
  };
}

// 데이터 검증 시뮬레이션 함수
async function simulateDataValidate(_data: any): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    valid: true,
    errors: [],
    warnings: [],
    validated: true,
  };
}

// 워커 종료 처리
parentPort?.on("close", () => {
  console.log(`데이터 처리 워커 [${workerData?.id || "unknown"}] 종료`);
});
