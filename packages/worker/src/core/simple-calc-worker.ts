/**
 * 간단한 계산 워커
 *
 * 웹 및 노드 환경에서 동작하는 워커 구현
 */

// 워커 상태 관리
let activeTaskCount = 0;
let totalTasksProcessed = 0;
let lastTaskId: string | null = null;

// 웹 워커 환경 확인
const isWebWorker =
  typeof self !== "undefined" && typeof self.postMessage === "function";

// Node.js 환경 변수
let nodeWorkerData: any;
let nodeParentPort: any;

/**
 * 로그 메시지 출력
 * @param message 로그 메시지
 */
function logTask(message: string): void {
  const prefix = isWebWorker ? "[웹 워커]" : "[노드 워커]";
  const workerId = nodeWorkerData?.id || "unknown";
  console.log(`${prefix} ${workerId}: ${message}`);
}

/**
 * 오류 로그 출력
 * @param message 오류 메시지
 * @param error 오류 객체
 */
function logError(message: string, error?: any): void {
  const prefix = isWebWorker ? "[웹 워커]" : "[노드 워커]";
  const workerId = nodeWorkerData?.id || "unknown";
  console.error(`${prefix} ${workerId}: ${message}`, error);
}

/**
 * 워커 상태 정보 반환
 * @returns 워커 상태 객체
 */
function getWorkerStats(): any {
  return {
    activeTaskCount,
    totalTasksProcessed,
    lastTaskId,
  };
}

/**
 * 오류 처리 함수
 * @param taskId 태스크 ID
 * @param error 오류 객체
 * @param sender 메시지 전송 함수
 */
function handleError(
  taskId: string,
  error: any,
  sender: (data: any) => void
): void {
  activeTaskCount--;
  logError(`태스크 ${taskId} 처리 오류:`, error);

  sender({
    taskId,
    status: "error",
    error: error instanceof Error ? error.message : String(error),
    workerStats: getWorkerStats(),
  });
}

/**
 * 메시지 처리 함수
 * @param message 수신 메시지
 * @param sender 메시지 전송 함수
 */
async function handleMessage(
  message: any,
  sender: (data: any) => void
): Promise<void> {
  try {
    // 초기화 메시지 처리
    if (message && message.__workerInit) {
      logTask("초기화 메시지 수신");
      return;
    }

    // 취소 메시지 처리
    if (message && message.action === "cancel") {
      logTask(`태스크 ${message.taskId} 취소 요청 수신`);
      return;
    }

    const { taskId, type, data } = message;
    lastTaskId = taskId;

    // 태스크 카운터 증가
    activeTaskCount++;
    logTask(
      `태스크 수신: ${taskId}, 유형: ${type}, 데이터: ${JSON.stringify(data)}`
    );

    // 작업 유형에 따른 처리
    let result;
    switch (type) {
      case "add":
        result = await handleAddition(data);
        break;
      case "multiply":
        result = await handleMultiplication(data);
        break;
      case "factorial":
        result = await handleFactorial(data);
        break;
      default:
        throw new Error(`지원하지 않는 계산 작업 유형: ${type}`);
    }

    // 태스크 카운터 감소 및 총 처리수 증가
    activeTaskCount--;
    totalTasksProcessed++;

    logTask(
      `태스크 ${taskId} 완료, 활성: ${activeTaskCount}, 총 처리: ${totalTasksProcessed}`
    );

    // 결과 전송
    sender({
      taskId,
      status: "completed",
      result,
      workerStats: getWorkerStats(),
    });
  } catch (error) {
    handleError(message.taskId || lastTaskId || "unknown", error, sender);
  }
}

/**
 * 덧셈 처리
 * @param data 입력 데이터
 * @returns 결과 객체
 */
async function handleAddition(data: any): Promise<any> {
  const { a, b, delay = 0 } = data;

  // 딜레이 시뮬레이션
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return {
    operation: "add",
    result: a + b,
    executionTime: Date.now(),
  };
}

/**
 * 곱셈 처리
 * @param data 입력 데이터
 * @returns 결과 객체
 */
async function handleMultiplication(data: any): Promise<any> {
  const { a, b, delay = 0 } = data;

  // 딜레이 시뮬레이션
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return {
    operation: "multiply",
    result: a * b,
    executionTime: Date.now(),
  };
}

/**
 * 팩토리얼 계산
 * @param data 입력 데이터
 * @returns 결과 객체
 */
async function handleFactorial(data: any): Promise<any> {
  const { n, delay = 0 } = data;

  // 유효성 검사
  if (n < 0 || !Number.isInteger(n)) {
    throw new Error("팩토리얼은 0 이상의 정수에 대해서만 계산할 수 있습니다");
  }

  // 계산 시작 시간
  const startTime = Date.now();

  // 딜레이 시뮬레이션
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // 팩토리얼 계산
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;

    // 계산 중간에 진행 상황 보고 (5단위)
    if (i % 5 === 0 && i < n) {
      const progress = Math.floor((i / n) * 100);
      if (isWebWorker) {
        self.postMessage({
          taskId: lastTaskId,
          status: "progress",
          progress: {
            percent: progress,
            currentValue: i,
            totalValue: n,
          },
        });
      } else if (nodeParentPort) {
        nodeParentPort.postMessage({
          taskId: lastTaskId,
          status: "progress",
          progress: {
            percent: progress,
            currentValue: i,
            totalValue: n,
          },
        });
      }
    }

    // 큰 팩토리얼 계산 시 중간에 양보 (비동기 처리)
    if (i % 1000 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return {
    operation: "factorial",
    input: n,
    result: result.toString(), // 큰 숫자는 문자열로 변환
    executionTime: Date.now() - startTime,
  };
}

// 환경별 초기화
if (isWebWorker) {
  // 웹 워커 환경 초기화
  logTask("계산 워커 초기화 (웹)");

  // 웹 워커 메시지 핸들러 등록
  self.addEventListener("message", async (event) => {
    await handleMessage(event.data, (data) => self.postMessage(data));
  });
} else {
  try {
    // Node.js Worker Threads 초기화
    const workerThreads = require("worker_threads");
    nodeWorkerData = workerThreads.workerData;
    nodeParentPort = workerThreads.parentPort;

    logTask("계산 워커 초기화 (노드)");

    // Node.js 메시지 핸들러 등록
    if (nodeParentPort) {
      nodeParentPort.on("message", async (message: any) => {
        await handleMessage(message, (data) =>
          nodeParentPort.postMessage(data)
        );
      });
    }
  } catch (error) {
    console.error("Node.js 워커 초기화 오류:", error);
  }
}

// CommonJS 및 ESM 호환성을 위한 내보내기
export default {};
