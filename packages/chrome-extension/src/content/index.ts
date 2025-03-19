/**
 * HyperViz 크롬 확장 프로그램 - 콘텐츠 스크립트
 * 웹페이지와 확장 프로그램 사이의 통신을 담당합니다.
 */

/**
 * HypervizWorkerPool 인터페이스
 * worker-pool의 기본 데이터 구조를 정의합니다.
 */
interface HypervizWorkerPool {
  stats: Record<string, any>;
  logs: any[];
  taskInfo: Record<string, any>;
}

/**
 * 메시지 수신 시 핸들러
 * 웹페이지로부터 오는 메시지를 처리합니다.
 */
function handlePageMessage(event: MessageEvent) {
  // 동일 창에서 온 메시지만 처리
  if (event.source !== window) return;

  // hyperviz 응답 메시지만 처리
  const data = event.data;
  if (!data || data.type !== "hyperviz-response") return;

  // 메시지 타입에 따라 처리
  try {
    switch (data.action) {
      case "workerPoolDetected":
        // 워커풀 감지됨
        chrome.runtime.sendMessage({
          type: "workerPoolDetected",
          exists: data.exists,
          timestamp: data.timestamp,
        });
        break;

      case "workerPoolData":
        // 워커풀 데이터 수신됨
        chrome.runtime.sendMessage({
          type: "workerPoolData",
          data: data.payload,
        });
        break;

      case "logs":
        // 로그 데이터 수신됨
        chrome.runtime.sendMessage({
          type: "logs",
          logs: data.payload,
        });
        break;

      case "taskInfo":
        // 태스크 정보 수신됨
        chrome.runtime.sendMessage({
          type: "taskInfo",
          taskInfo: data.payload,
        });
        break;

      case "workerActionResult":
        // 워커 액션 결과 수신됨
        chrome.runtime.sendMessage({
          type: "workerActionResult",
          result: data.payload,
        });
        break;

      default:
        console.log("[HyperViz] 알 수 없는 메시지:", data);
        break;
    }
  } catch (error) {
    console.error("[HyperViz] 메시지 처리 중 오류:", error);
    chrome.runtime.sendMessage({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 확장 프로그램 <-> 페이지 간 메시지 전달
 * 확장 프로그램의 요청을 페이지로 전달합니다.
 */
function sendMessageToPage(type: string, data: any = {}) {
  window.postMessage(
    {
      type: "hyperviz-extension-request",
      action: type,
      ...data,
    },
    "*"
  );
}

/**
 * 백그라운드 스크립트로부터 메시지 수신
 */
chrome.runtime.onMessage.addListener((message: any) => {
  if (message && message.target === "content") {
    switch (message.action) {
      case "checkWorkerPool":
        // 페이지에 워커풀이 있는지 확인 요청
        sendMessageToPage("connect");
        break;

      case "getWorkerPoolData":
        // 워커풀 데이터 요청
        sendMessageToPage("getWorkerPoolData");
        break;

      case "getStats":
        // 통계 데이터 요청
        sendMessageToPage("getStats");
        break;

      case "getLogs":
        // 로그 데이터 요청
        sendMessageToPage("getLogs", { count: message.count });
        break;

      case "getTaskInfo":
        // 태스크 정보 요청
        sendMessageToPage("getTaskInfo");
        break;

      case "restartWorker":
        // 워커 재시작 요청
        sendMessageToPage("restartWorker", {
          workerId: message.workerId,
          workerType: message.workerType,
        });
        break;

      case "disconnect":
        // 연결 해제 요청
        sendMessageToPage("disconnect");
        break;
    }
  }
});

/**
 * 컨텐츠 스크립트 초기화
 */
function initContentScript() {
  console.log("[HyperViz] 컨텐츠 스크립트가 초기화되었습니다.");

  // 페이지 메시지 리스너 등록
  window.addEventListener("message", handlePageMessage);

  // 페이지 로드 시 워커풀 감지 시작
  sendMessageToPage("connect");
}

// 컨텐츠 스크립트 초기화
initContentScript();
