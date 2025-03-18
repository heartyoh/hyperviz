/**
 * HyperViz 크롬 확장 프로그램 - 콘텐츠 스크립트
 */

// 워커풀 인터페이스 정의
interface HypervizWorkerPool {
  getStats: () => any;
  getLogs: (limit?: number) => any[];
  getTaskInfo: () => any;
}

// 워커풀 객체 가져오기
function getWorkerPool(): HypervizWorkerPool | null {
  try {
    return (window as any).hypervizWorkerPool as HypervizWorkerPool;
  } catch (error) {
    console.error("워커풀 접근 오류:", error);
    return null;
  }
}

// 연결 상태 및 폴링 인터벌
let isConnected = false;
let pollInterval: number | null = null;

// 백그라운드 스크립트와의 포트 연결
let contentPort: chrome.runtime.Port | null = null;

// 연결 시도 함수
function connectToBackgroundScript() {
  if (contentPort) {
    try {
      contentPort.disconnect();
    } catch (error) {
      console.warn("기존 포트 연결 해제 오류:", error);
    }
  }

  try {
    contentPort = chrome.runtime.connect({ name: "content-script" });

    contentPort.onMessage.addListener(handlePortMessage);

    contentPort.onDisconnect.addListener(() => {
      console.log("백그라운드와 연결이 끊어졌습니다.");
      contentPort = null;

      // 폴링 중지
      if (pollInterval) {
        window.clearInterval(pollInterval);
        pollInterval = null;
      }

      // 2초 후 재연결 시도
      setTimeout(connectToBackgroundScript, 2000);
    });

    console.log("백그라운드 스크립트와 포트 연결됨");
    return true;
  } catch (error) {
    console.error("백그라운드 연결 오류:", error);
    contentPort = null;
    return false;
  }
}

// 포트 메시지 처리
function handlePortMessage(message: any) {
  if (!message || !message.type) return;

  console.log("포트 메시지 수신:", message);

  switch (message.type) {
    case "connect":
      handleContentConnect();
      break;

    case "disconnect":
      handleContentDisconnect();
      break;

    case "requestLogs":
      sendLogsData(message.data?.limit || 30);
      break;

    case "restartWorker":
      // 이 기능은 현재 구현되어 있지 않음
      break;

    default:
      break;
  }
}

// 연결 처리
function handleContentConnect() {
  const workerPool = getWorkerPool();

  if (workerPool) {
    isConnected = true;

    // 연결 성공 메시지 전송
    sendToBackground("connected", null);

    // 초기 데이터 전송
    sendWorkerPoolData();

    // 연결에 성공하면 주기적으로 데이터 전송 시작
    if (!pollInterval) {
      pollInterval = window.setInterval(sendWorkerPoolData, 1000);
    }
  } else {
    sendToBackground("connectionFailed", {
      message: "페이지에서 워커풀을 찾을 수 없습니다.",
    });
  }
}

// 연결 해제 처리
function handleContentDisconnect() {
  if (pollInterval) {
    window.clearInterval(pollInterval);
    pollInterval = null;
  }

  isConnected = false;
  sendToBackground("disconnected", null);
}

// 로그 데이터 전송
function sendLogsData(limit: number = 30) {
  const workerPool = getWorkerPool();

  if (workerPool) {
    const logs = workerPool.getLogs(limit);
    sendToBackground("logs", { logs });
  } else {
    sendToBackground("logs", { logs: [], error: "워커풀을 찾을 수 없습니다." });
  }
}

// 워커풀 데이터를 백그라운드 스크립트에 전송
function sendWorkerPoolData() {
  const workerPool = getWorkerPool();

  if (!workerPool || !isConnected) {
    if (pollInterval) {
      window.clearInterval(pollInterval);
      pollInterval = null;
    }
    return;
  }

  try {
    const metrics = workerPool.getStats();
    const logs = workerPool.getLogs(10);
    const workers = workerPool.getTaskInfo();

    sendToBackground("workerPoolData", {
      metrics,
      logs,
      workers,
    });
  } catch (error) {
    console.error("워커풀 데이터 전송 오류:", error);

    // 오류 발생 시 폴링 중지
    if (pollInterval) {
      window.clearInterval(pollInterval);
      pollInterval = null;
    }

    // 연결 해제 상태로 변경
    isConnected = false;
    sendToBackground("disconnected", { error: "데이터 전송 중 오류 발생" });
  }
}

// 백그라운드에 메시지 전송 (포트와 일반 메시지 둘 다 사용)
function sendToBackground(type: string, data: any) {
  // 포트가 있으면 포트로 전송
  if (contentPort) {
    try {
      contentPort.postMessage({ type, data });
    } catch (error) {
      console.error(`포트 메시지 전송 오류 (${type}):`, error);
      // 포트 연결이 끊어진 경우 일반 메시지로 시도
      try {
        chrome.runtime.sendMessage({ type, data });
      } catch (backupError) {
        console.error(`백업 메시지 전송도 실패 (${type}):`, backupError);
      }
    }
  } else {
    // 포트가 없으면 일반 메시지로 전송
    try {
      chrome.runtime.sendMessage({ type, data });
    } catch (error) {
      console.error(`일반 메시지 전송 오류 (${type}):`, error);
    }
  }
}

// 대비책으로 기존의 메시지 리스너도 유지
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  // 연결 요청
  if (message.type === "connect") {
    handleContentConnect();
    sendResponse({ success: true, message: "연결 처리 완료" });
    return true;
  }

  // 연결 해제 요청
  if (message.type === "disconnect") {
    handleContentDisconnect();
    sendResponse({ success: true, message: "연결 해제 처리 완료" });
    return true;
  }

  // 워커풀 데이터 요청
  if (message.type === "getWorkerPoolData") {
    const workerPool = getWorkerPool();

    if (workerPool) {
      sendResponse({
        success: true,
        data: {
          stats: workerPool.getStats(),
          logs: workerPool.getLogs(30),
          taskInfo: workerPool.getTaskInfo(),
        },
      });
    } else {
      sendResponse({
        success: false,
        message: "워커풀을 찾을 수 없습니다.",
      });
    }

    return true;
  }

  return false;
});

// 페이지 로드 시 워커풀 탐지 시도
window.addEventListener("load", () => {
  // 백그라운드 스크립트와 연결
  connectToBackgroundScript();

  setTimeout(() => {
    const workerPool = getWorkerPool();

    if (workerPool) {
      // 일반 메시지로도 전송 (포트가 아직 설정되지 않았을 수 있음)
      chrome.runtime.sendMessage({
        type: "workerPoolDetected",
        pageUrl: window.location.href,
      });

      // 포트를 통해 전송
      sendToBackground("workerPoolDetected", { pageUrl: window.location.href });
    }
  }, 1000);
});

// 페이지 언로드 시 정리
window.addEventListener("beforeunload", () => {
  if (pollInterval) {
    window.clearInterval(pollInterval);
    pollInterval = null;
  }

  if (contentPort) {
    try {
      contentPort.disconnect();
    } catch (error) {
      // 언로드 중 오류는 무시
    }
    contentPort = null;
  }
});
