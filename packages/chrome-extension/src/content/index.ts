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
        try {
          chrome.runtime.sendMessage({
            type: "workerPoolDetected",
            exists: data.exists,
            timestamp: data.timestamp,
          });
        } catch (error) {
          console.error("[HyperViz] 런타임 메시지 전송 중 오류:", error);
        }
        break;

      case "workerPoolData":
        // 워커풀 데이터 수신됨
        try {
          chrome.runtime.sendMessage({
            type: "workerPoolData",
            data: data.payload,
          });
        } catch (error) {
          console.error("[HyperViz] 런타임 메시지 전송 중 오류:", error);
        }
        break;

      case "logs":
        // 로그 데이터 수신됨
        try {
          chrome.runtime.sendMessage({
            type: "logs",
            logs: data.payload,
          });
        } catch (error) {
          console.error("[HyperViz] 런타임 메시지 전송 중 오류:", error);
        }
        break;

      case "taskInfo":
        // 태스크 정보 수신됨
        try {
          chrome.runtime.sendMessage({
            type: "taskInfo",
            taskInfo: data.payload,
          });
        } catch (error) {
          console.error("[HyperViz] 런타임 메시지 전송 중 오류:", error);
        }
        break;

      case "workerActionResult":
        // 워커 액션 결과 수신됨
        try {
          chrome.runtime.sendMessage({
            type: "workerActionResult",
            result: data.payload,
          });
        } catch (error) {
          console.error("[HyperViz] 런타임 메시지 전송 중 오류:", error);
        }
        break;

      default:
        console.log("[HyperViz] 알 수 없는 메시지:", data);
        break;
    }
  } catch (error) {
    console.error("[HyperViz] 메시지 처리 중 오류:", error);
    try {
      chrome.runtime.sendMessage({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    } catch (sendError) {
      console.error("[HyperViz] 오류 메시지 전송 중 추가 오류:", sendError);
    }
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
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  // ping 요청 (content script 존재 확인용)
  if (message && message.type === "ping") {
    sendResponse({ success: true });
    return true;
  }

  if (message && message.target === "content") {
    switch (message.action) {
      case "checkWorkerPool":
        // 페이지에 워커풀이 있는지 확인 요청
        checkWorkerPool()
          .then((result) => sendResponse(result))
          .catch((error) => sendResponse({ error: error.message }));
        return true; // 비동기 응답을 위해 true 반환

      case "getWorkerPoolData":
        // 워커풀 데이터 요청
        getWorkerPoolData()
          .then((data) => sendResponse({ success: true, data }))
          .catch((error) => sendResponse({ error: error.message }));
        return true; // 비동기 응답을 위해 true 반환

      case "terminateAllWorkers":
        // 모든 워커 종료 요청
        terminateAllWorkers()
          .then((result) => sendResponse({ success: true, result }))
          .catch((error) => sendResponse({ error: error.message }));
        return true; // 비동기 응답을 위해 true 반환

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

/**
 * 웹페이지에 HyperViz 워커풀이 있는지 확인
 */
async function checkWorkerPool(): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      // 웹페이지에서 window.hypervizWorkerPool을 확인하는 함수
      const checkWorkerPoolInPage = () => {
        try {
          if (typeof window.hypervizWorkerPool !== "undefined") {
            // 버전 정보 확인
            const version =
              typeof window.hypervizWorkerPool.version !== "undefined"
                ? window.hypervizWorkerPool.version
                : "unknown";

            // 추가 정보 수집
            const info = {
              hasStats:
                typeof window.hypervizWorkerPool.getStats === "function",
              hasTaskInfo:
                typeof window.hypervizWorkerPool.getTaskInfo === "function",
              hasLogs: typeof window.hypervizWorkerPool.getLogs === "function",
              hasTerminateAll:
                typeof window.hypervizWorkerPool.terminateAllWorkers ===
                "function",
            };

            return {
              success: true,
              exists: true,
              version: version,
              info: info,
            };
          } else {
            return {
              success: true,
              exists: false,
              error: "window.hypervizWorkerPool이 정의되지 않았습니다",
            };
          }
        } catch (error) {
          return {
            success: false,
            exists: false,
            error:
              error instanceof Error
                ? error.message
                : "워커풀 확인 중 오류 발생",
          };
        }
      };

      // Chrome API를 통해 백그라운드 스크립트에 실행 요청
      chrome.runtime.sendMessage(
        {
          type: "executeScriptInPage",
          function: checkWorkerPoolInPage.toString(),
          args: [],
          // tabId를 Content Script에서 전달하지 않음 - 백그라운드에서 sender.tab.id 사용
        },
        (response) => {
          // 응답 처리
          if (!response || response.error) {
            console.error(
              "[HyperViz] 워커풀 확인 중 오류:",
              response?.error || "응답 없음"
            );
            reject(new Error(response?.error || "워커풀을 확인할 수 없습니다"));
            return;
          }

          const result = response.result;
          console.log("[HyperViz] 워커풀 확인 결과:", result);

          if (result.success) {
            if (result.exists) {
              console.log("[HyperViz] 워커풀 발견, 버전:", result.version);

              // 배경 스크립트에 워커풀 발견 알림
              try {
                chrome.runtime.sendMessage({
                  type: "workerPoolDetected",
                  version: result.version,
                  pageUrl: window.location.href,
                });
              } catch (error) {
                console.warn(
                  "[HyperViz] 워커풀 발견 메시지 전송 중 오류:",
                  error
                );
              }

              resolve({
                version: result.version,
                info: result.info,
              });
            } else {
              console.log("[HyperViz] 워커풀이 발견되지 않음");
              reject(new Error(result.error || "워커풀이 발견되지 않음"));
            }
          } else {
            console.error("[HyperViz] 워커풀 확인 실패:", result.error);
            reject(new Error(result.error || "워커풀 확인 중 오류 발생"));
          }
        }
      );

      // 타임아웃 설정
      setTimeout(() => {
        reject(new Error("워커풀 확인 타임아웃"));
      }, 5000);
    } catch (error) {
      console.error("[HyperViz] 워커풀 확인 중 오류:", error);
      reject(
        error instanceof Error ? error : new Error("워커풀 확인 중 오류 발생")
      );
    }
  });
}

/**
 * window.hypervizWorkerPool 타입 정의를 위한 Window 인터페이스 확장
 */
declare global {
  interface Window {
    hypervizWorkerPool?: {
      version?: string;
      getStats?: () => Record<string, any>;
      getTaskInfo?: () => Record<string, any>;
      getLogs?: (count: number) => any[];
      terminateAllWorkers?: () => boolean;
      manager?: any;
    };
  }
}

// 상수 및 변수
let isContentScriptInjected = false;

/**
 * 워커풀 데이터 가져오기
 */
async function getWorkerPoolData(): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      // 웹페이지에서 window.hypervizWorkerPool 데이터를 가져오는 함수
      const getDataFromPage = () => {
        try {
          let data = null;
          let error = "";

          if (typeof window.hypervizWorkerPool !== "undefined") {
            // 필요한 메서드 있는지 확인
            const hasStats =
              typeof window.hypervizWorkerPool.getStats === "function";
            const hasTaskInfo =
              typeof window.hypervizWorkerPool.getTaskInfo === "function";
            const hasLogs =
              typeof window.hypervizWorkerPool.getLogs === "function";

            data = {
              stats: hasStats ? window.hypervizWorkerPool.getStats() : {},
              taskInfo: hasTaskInfo
                ? window.hypervizWorkerPool.getTaskInfo()
                : {},
              logs: hasLogs ? window.hypervizWorkerPool.getLogs(50) : [],
            };

            return { success: true, data: data };
          } else {
            error = "window.hypervizWorkerPool이 정의되지 않았습니다";
            return { success: false, error: error };
          }
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "데이터 가져오기 중 오류 발생",
          };
        }
      };

      // Chrome API를 통해 웹페이지 컨텍스트에서 직접 실행
      chrome.runtime.sendMessage(
        {
          type: "executeScriptInPage",
          function: getDataFromPage.toString(),
          args: [],
        },
        (response) => {
          // 응답 처리
          if (!response || response.error) {
            console.error(
              "[HyperViz] 데이터 요청 중 오류:",
              response?.error || "응답 없음"
            );
            reject(new Error(response?.error || "데이터를 가져올 수 없습니다"));
            return;
          }

          const result = response.result;

          if (result.success && result.data) {
            console.log("[HyperViz] 워커풀 데이터 가져오기 성공");

            // 페이지에 데이터 요청 메시지도 추가로 전송 (기존 코드와의 호환성 유지)
            sendMessageToPage("getWorkerPoolData");

            resolve(result.data);
          } else {
            console.error(
              "[HyperViz] 워커풀 데이터 가져오기 실패:",
              result.error
            );
            reject(new Error(result.error || "데이터를 가져올 수 없습니다"));
          }
        }
      );

      // 타임아웃 설정
      setTimeout(() => {
        reject(new Error("데이터 요청 타임아웃"));
      }, 5000);
    } catch (error) {
      console.error("[HyperViz] 데이터 요청 중 오류:", error);
      reject(
        error instanceof Error ? error : new Error("데이터 요청 중 오류 발생")
      );
    }
  });
}

/**
 * 모든 워커 종료
 */
async function terminateAllWorkers(): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      // 웹페이지에서 직접 window.hypervizWorkerPool.terminateAllWorkers()를 호출하는 스크립트 삽입
      const terminateScript = document.createElement("script");
      terminateScript.textContent = `
        (function() {
          try {
            let result = { success: false, message: '' };
            
            if (typeof window.hypervizWorkerPool !== 'undefined') {
              if (typeof window.hypervizWorkerPool.terminateAllWorkers === 'function') {
                // 함수 호출
                window.hypervizWorkerPool.terminateAllWorkers();
                result.success = true;
                result.message = '모든 워커가 종료되었습니다.';
              } else {
                result.message = 'terminateAllWorkers 메서드가 존재하지 않습니다.';
              }
            } else {
              result.message = 'window.hypervizWorkerPool이 정의되지 않았습니다';
            }
            
            window.postMessage({
              type: 'hyperviz-worker-terminate-result',
              result: result
            }, '*');
          } catch (error) {
            window.postMessage({
              type: 'hyperviz-worker-terminate-result',
              result: {
                success: false,
                message: error.message || '워커 종료 중 오류 발생'
              }
            }, '*');
          }
        })();
      `;

      // 이벤트 리스너 등록 (스크립트에서 전송한 결과 수신용)
      const messageListener = function (event: MessageEvent) {
        if (event.source !== window) return;
        if (
          !event.data ||
          event.data.type !== "hyperviz-worker-terminate-result"
        )
          return;

        window.removeEventListener("message", messageListener);
        document.head.removeChild(terminateScript);

        const result = event.data.result;

        if (result.success) {
          console.log("[HyperViz] 워커 종료 성공:", result.message);

          // 기존 코드와의 호환성 유지
          sendMessageToPage("terminateAllWorkers");

          resolve(result);
        } else {
          console.error("[HyperViz] 워커 종료 실패:", result.message);
          reject(new Error(result.message || "워커를 종료할 수 없습니다"));
        }
      };

      window.addEventListener("message", messageListener);

      // 스크립트를 페이지에 삽입
      document.head.appendChild(terminateScript);

      // 타임아웃 설정
      setTimeout(() => {
        window.removeEventListener("message", messageListener);
        if (document.head.contains(terminateScript)) {
          document.head.removeChild(terminateScript);
        }
        reject(new Error("워커 종료 요청 타임아웃"));
      }, 5000);
    } catch (error) {
      console.error("[HyperViz] 워커 종료 요청 중 오류:", error);
      reject(
        error instanceof Error
          ? error
          : new Error("워커 종료 요청 중 오류 발생")
      );
    }
  });
}

// 컨텐츠 스크립트 초기화
initContentScript();
