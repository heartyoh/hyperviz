/**
 * HyperViz Chrome Extension - Content Script
 *
 * 이 스크립트는 웹 페이지의 콘텐츠와 상호 작용하여
 * HyperViz 워커풀이 있는지 확인하고 통계 데이터를 가져옵니다.
 */

// MessageType enum 가져오기 (타입스크립트 컴파일 시에만 사용됨)
// @ts-ignore - 백그라운드 스크립트와 콘텐츠 스크립트 간에 직접 임포트할 수 없으므로 타입만 가져옴
enum MessageType {
  CONNECT = "connect",
  DISCONNECT = "disconnect",
  FETCH_DATA = "fetch_worker_pool_data",
  CONTENT_SCRIPT_LOADED = "content_script_loaded",
  PING = "ping",
  CHECK_WORKER_POOL_IN_PAGE = "check_worker_pool_in_page",
  GET_WORKER_POOL_DATA_FROM_PAGE = "get_worker_pool_data_from_page",
  GET_CURRENT_TAB_ID = "get_current_tab_id",
}

// 통신 ID 생성 (요청/응답 매칭용)
let requestId = 0;
const pendingRequests = new Map();

// 현재 탭 ID 저장용 (백그라운드 스크립트로부터 받음)
let currentTabId = -1;

/**
 * 현재 실행 중인 탭 ID 가져오기
 */
async function getCurrentTabId(): Promise<number> {
  // 콘텐츠 스크립트에서는 chrome.devtools 접근 시도 제거
  // 대신 sender.tab.id를 사용하도록 백그라운드에 의존

  return new Promise<number>((resolve) => {
    // 콘텐츠 스크립트에서는 단순히 메시지만 전송
    chrome.runtime.sendMessage(
      {
        type: MessageType.GET_CURRENT_TAB_ID,
        // DevTools 관련 플래그 제거
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[HyperViz] 탭 ID 가져오기 오류:",
            chrome.runtime.lastError
          );
          resolve(-1);
          return;
        }

        if (response && response.success && response.tabId) {
          currentTabId = response.tabId;
          console.log(`[HyperViz] 현재 탭 ID: ${currentTabId}`);
          resolve(currentTabId);
        } else {
          console.warn("[HyperViz] 유효한 탭 ID를 받지 못했습니다", response);
          resolve(-1);
        }
      }
    );
  });
}

/**
 * 현재 페이지에서 워커풀 확인
 *
 * 디버깅 목적으로 사용되며, 실제로는 콘텐츠 스크립트가 로드되는 시점에
 * 이 함수를 호출하지 않고 메시지 리스너에서 처리합니다.
 */
function checkWorkerPoolInPage(): any {
  console.log("[HyperViz] 페이지에서 직접 워커풀 확인 중...");

  try {
    // 전역 객체에서 워커풀 찾기
    // @ts-ignore - window.hyperVizWorkerPool은 런타임에만 존재
    const workerPool = window.hyperVizWorkerPool;

    console.log(
      "[HyperViz] 워커풀 객체 검색 결과:",
      workerPool ? "찾음" : "찾지 못함"
    );

    if (workerPool) {
      console.log("[HyperViz] 워커풀 객체 정보:", {
        version: workerPool.version || "알 수 없음",
        workersCount: Object.keys(workerPool.workers || {}).length,
        isInitialized: workerPool.isInitialized || false,
      });

      return {
        exists: true,
        version: workerPool.version || "unknown",
        workersCount: Object.keys(workerPool.workers || {}).length,
      };
    }

    console.log(
      "[HyperViz] 워커풀을 찾을 수 없습니다. window 객체 확인:",
      Object.keys(window).filter(
        (key) => key.includes("worker") || key.includes("Worker")
      )
    );

    return {
      exists: false,
      error: "워커풀을 찾을 수 없습니다",
    };
  } catch (error) {
    console.error("[HyperViz] 워커풀 확인 중 오류:", error);
    return {
      exists: false,
      error: error instanceof Error ? error.message : "확인 중 오류 발생",
    };
  }
}

/**
 * 백그라운드 스크립트를 통한 워커풀 확인 (권장 방식)
 */
async function checkWorkerPoolViaBackground(): Promise<any> {
  try {
    console.log("[HyperViz] 백그라운드를 통한 워커풀 확인 시작");

    // 현재 탭 ID 가져오기
    console.log("[HyperViz] getCurrentTabId 호출 중...");
    const tabId = await getCurrentTabId();
    console.log(`[HyperViz] 받은 탭 ID: ${tabId}`);

    if (tabId <= 0) {
      console.error("[HyperViz] 유효한 탭 ID를 얻을 수 없습니다");
      return {
        exists: false,
        error: "유효한 탭 ID를 얻을 수 없습니다",
      };
    }

    console.log(`[HyperViz] 탭 ID ${tabId}로 워커풀 확인 메시지 전송 중...`);
    return new Promise((resolve, reject) => {
      const messageData = {
        type: MessageType.CHECK_WORKER_POOL_IN_PAGE,
        tabId: tabId,
        timestamp: Date.now(),
      };
      console.log("[HyperViz] 전송할 메시지 데이터:", messageData);

      chrome.runtime.sendMessage(messageData, (response) => {
        console.log("[HyperViz] 백그라운드 응답 수신:", response);

        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          console.error(`[HyperViz] 백그라운드 통신 오류: ${errorMsg}`);
          reject(new Error(errorMsg));
          return;
        }

        console.log("[HyperViz] 워커풀 확인 성공, 응답:", response);
        resolve(response);
      });
    });
  } catch (error) {
    console.error("[HyperViz] 백그라운드를 통한 워커풀 확인 중 오류:", error);
    return {
      exists: false,
      error: error instanceof Error ? error.message : "백그라운드 통신 오류",
    };
  }
}

/**
 * 페이지에 요청 전송하고 응답을 기다림
 * 이제 직접 통신보다 백그라운드를 통한 통신을 권장
 */
function sendRequestToPage(action, params = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`요청 타임아웃: ${action}`));
    }, 5000);

    // 응답 핸들러 등록
    pendingRequests.set(id, { resolve, reject, timeout });

    // 백그라운드를 통한 요청으로 변경 검토 중
    // 임시로 기존 방식 유지
    window.postMessage(
      {
        source: "hyperviz-extension",
        id,
        action,
        params,
      },
      "*"
    );
  });
}

// 페이지로부터 응답 수신 처리
function setupMessageListener() {
  window.addEventListener("message", (event) => {
    // 다른 출처의 메시지는 무시
    if (event.source !== window) return;

    const message = event.data;
    // 페이지에서 온 메시지만 처리
    if (!message || message.source !== "hyperviz-page") return;

    // 초기화 완료 메시지 처리
    if (message.action === "initialized") {
      console.log("[HyperViz] 페이지 스크립트 초기화 확인됨");
      return;
    }

    // ID가 있는 요청의 응답 처리
    const request = pendingRequests.get(message.id);
    if (request) {
      clearTimeout(request.timeout);
      pendingRequests.delete(message.id);

      if (message.success) {
        request.resolve(message);
      } else {
        request.reject(new Error(message.error || "알 수 없는 오류"));
      }
    }
  });
}

// 초기화 함수
async function initialize() {
  console.log("[HyperViz] 콘텐츠 스크립트 초기화 중...");

  // 메시지 리스너 설정
  setupMessageListener();

  try {
    // 현재 탭 ID 가져오기
    await getCurrentTabId();

    // 백그라운드 스크립트에 콘텐츠 스크립트 로드 알림
    chrome.runtime.sendMessage({
      type: MessageType.CONTENT_SCRIPT_LOADED,
      url: window.location.href,
      timestamp: Date.now(),
    });

    console.log("[HyperViz] 콘텐츠 스크립트 초기화 완료");
  } catch (error) {
    console.warn("[HyperViz] 초기화 중 오류:", error);
  }
}

// 콘텐츠 스크립트 초기화 실행
initialize();

// 메시지 리스너 설정
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[HyperViz] 콘텐츠 스크립트: 메시지 수신", message);

  // 워커풀 연결 요청 처리
  if (message.type === MessageType.CONNECT) {
    console.log("[HyperViz] 콘텐츠 스크립트: 워커풀 연결 요청");

    // 백그라운드 스크립트를 통해 워커풀 상태 확인 (권장 방식)
    checkWorkerPoolViaBackground()
      .then((result) => {
        console.log("[HyperViz] 콘텐츠 스크립트: 워커풀 확인 결과", result);
        sendResponse({
          success: true,
          exists: result.exists,
          version: result.version,
          info: result.info,
          timestamp: Date.now(),
        });
      })
      .catch((error) => {
        console.error("[HyperViz] 콘텐츠 스크립트: 워커풀 확인 오류", error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "워커풀 확인 오류",
          exists: false,
          timestamp: Date.now(),
        });
      });

    return true; // 비동기 응답 처리
  }

  // 워커풀 데이터 요청 처리
  if (message.type === MessageType.FETCH_DATA) {
    console.log("[HyperViz] 콘텐츠 스크립트: 워커풀 데이터 요청");

    // 현재 탭 ID 가져와서 사용
    getCurrentTabId().then((tabId) => {
      if (tabId <= 0) {
        console.error("[HyperViz] 유효한 탭 ID를 얻을 수 없습니다");
        sendResponse({
          success: false,
          error: "유효한 탭 ID를 얻을 수 없습니다",
          timestamp: Date.now(),
        });
        return;
      }

      // 백그라운드 스크립트를 통해 데이터 요청
      chrome.runtime.sendMessage(
        {
          type: MessageType.GET_WORKER_POOL_DATA_FROM_PAGE,
          tabId: tabId,
        },
        (result) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[HyperViz] 데이터 요청 중 오류:",
              chrome.runtime.lastError
            );
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
              timestamp: Date.now(),
            });
            return;
          }

          if (result && result.success) {
            console.log("[HyperViz] 데이터 요청 성공:", result.data);
            sendResponse({
              success: true,
              data: result.data,
              timestamp: Date.now(),
            });
          } else {
            console.warn(
              "[HyperViz] 데이터 요청 실패:",
              result?.error || "알 수 없는 오류"
            );
            sendResponse({
              success: false,
              error: result?.error || "알 수 없는 오류",
              timestamp: Date.now(),
            });
          }
        }
      );
    });

    return true; // 비동기 응답 처리
  }

  // 워커풀 연결 해제 요청 처리
  if (message.type === MessageType.DISCONNECT) {
    console.log("[HyperViz] 콘텐츠 스크립트: 워커풀 연결 해제 요청");
    sendResponse({
      success: true,
      message: "연결 해제됨",
      timestamp: Date.now(),
    });
    return true;
  }

  // ping 요청 (콘텐츠 스크립트 존재 확인용)
  if (message.type === MessageType.PING) {
    console.log("[HyperViz] 콘텐츠 스크립트: ping 요청");
    sendResponse({ success: true, timestamp: Date.now() });
    return true;
  }

  if (message.type === MessageType.GET_CURRENT_TAB_ID) {
    // 발신자가 콘텐츠 스크립트인 경우 (sender.tab이 있음)
    if (sender.tab && typeof sender.tab.id === "number") {
      console.log(`[HyperViz] 발신자의 탭 ID 사용: ${sender.tab.id}`);
      sendResponse({ success: true, tabId: sender.tab.id });
      return true;
    }

    // 발신자가 DevTools 또는 팝업인 경우 (sender.tab이 없음)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs.length || !tabs[0].id) {
        sendResponse({ success: false, error: "탭을 찾을 수 없음" });
        return;
      }

      sendResponse({ success: true, tabId: tabs[0].id });
    });

    return true; // 비동기 응답
  }

  // 워커풀 확인 요청
  if (message.type === MessageType.CHECK_WORKER_POOL_IN_PAGE) {
    console.log("[HyperViz] 콘텐츠 스크립트: 워커풀 확인 요청");
    const result = checkWorkerPoolInPage();
    console.log("[HyperViz] 워커풀 확인 결과:", result);
    sendResponse(result);
    return true; // 비동기 응답 처리
  }

  // 워커풀 데이터 요청 처리
  if (message.type === MessageType.GET_WORKER_POOL_DATA_FROM_PAGE) {
    console.log("[HyperViz] 콘텐츠 스크립트: 워커풀 데이터 요청");
    try {
      // @ts-ignore - window.hyperVizWorkerPool은 런타임에만 존재
      const workerPool = window.hyperVizWorkerPool;

      if (workerPool) {
        console.log("[HyperViz] 워커풀 데이터:", workerPool);
        sendResponse({
          success: true,
          data: workerPool,
          timestamp: Date.now(),
        });
      } else {
        console.warn("[HyperViz] 워커풀을 찾을 수 없습니다");
        sendResponse({
          success: false,
          error: "워커풀을 찾을 수 없습니다",
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error("[HyperViz] 워커풀 데이터 요청 중 오류:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "알 수 없는 오류",
        timestamp: Date.now(),
      });
    }
    return true; // 비동기 응답 처리
  }

  // 테스트 워커풀 주입 요청
  if (message.type === "inject_test_worker_pool") {
    console.log("[HyperViz] 테스트 워커풀 주입 요청 수신");
    injectTestWorkerPool();
    sendResponse({
      success: true,
      message: "테스트 워커풀 주입 완료",
      timestamp: Date.now(),
    });
    return true;
  }

  return false; // 다른 메시지 처리 없음
});

/**
 * 테스트 목적으로 페이지에 가짜 워커풀 주입
 * 이 함수는 디버깅 목적으로만 사용되며, 실제 환경에서는 사용하지 않아야 합니다.
 */
function injectTestWorkerPool(): void {
  console.log("[HyperViz] 테스트 워커풀 주입 시도 중...");

  try {
    const scriptElement = document.createElement("script");
    scriptElement.textContent = `
      // 디버깅 목적의 가짜 워커풀 생성
      window.hyperVizWorkerPool = {
        version: '1.0.0-test',
        isInitialized: true,
        settings: {
          maxWorkers: 4,
          idleTimeout: 30000
        },
        workers: {
          'worker-1': {
            id: 'worker-1',
            status: 'idle',
            createdAt: ${Date.now()},
            taskCount: 5
          },
          'worker-2': {
            id: 'worker-2',
            status: 'busy',
            createdAt: ${Date.now() - 60000},
            taskCount: 10,
            currentTask: {
              id: 'task-123',
              startedAt: ${Date.now() - 5000}
            }
          }
        },
        getInfo: function() {
          return {
            version: this.version,
            workerCount: Object.keys(this.workers).length,
            status: 'running',
            lastUpdated: ${Date.now()}
          };
        }
      };
      console.log("[HyperViz] 테스트 워커풀이 주입되었습니다:", window.hyperVizWorkerPool);
    `;

    document.head.appendChild(scriptElement);
    document.head.removeChild(scriptElement);
    console.log("[HyperViz] 테스트 워커풀 주입 스크립트 실행 완료");
  } catch (error) {
    console.error("[HyperViz] 테스트 워커풀 주입 중 오류:", error);
  }
}
