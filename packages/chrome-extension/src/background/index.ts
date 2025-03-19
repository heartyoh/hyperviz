/**
 * HyperViz 크롬 확장 프로그램 - 백그라운드 스크립트
 */
import * as DevToolsConnection from "./devtools-connection";

// 워커풀이 탐지된 탭 정보
interface TabInfo {
  tabId: number;
  url: string;
  hasWorkerPool: boolean;
  connected: boolean;
  lastUpdate: number;
}

// 타입 인터페이스 정의
type MessageResponse = (response?: any) => void;

// 워커풀 타입 정의
interface WorkerPoolsMap {
  [key: string]: any;
}

// 모니터 인터페이스 정의
interface WorkerPoolMonitor {
  initialized: boolean;
  workerPools: WorkerPoolsMap;
  logs: any[];
  monitoringInterval: number | null;
  init(): boolean;
  hookLogger?(): void;
  startMonitoring(interval?: number): boolean;
}

// 탭 정보 저장소
const tabsWithWorkerPool = new Map<number, TabInfo>();

// 현재 연결된 탭 ID
let currentConnectedTabId: number | null = null;

// 워커풀 데이터 캐시
let workerPoolDataCache: any = null;

// 연결 상태
let connected = false;
let backgroundPort: chrome.runtime.Port | null = null;
let tabId: number | null = null;
let updateTimer: number | null = null;
let reconnectTimer: number | null = null;

// 설정
const settings = {
  logLevel: "info",
  updateInterval: 1000,
  maxLogEntries: 1000,
  autoRestart: true,
};

// 팝업 연결 포트
let popupPort: chrome.runtime.Port | null = null;

// 초기화
function initialize() {
  // 개발자 도구 연결 리스너 설정
  DevToolsConnection.setupDevToolsConnectionListeners();

  console.log("HyperViz 확장 프로그램 백그라운드 스크립트가 초기화되었습니다.");

  // 필요한 권한 확인
  checkRequiredPermissions();
}

// 필요한 권한 확인 함수
async function checkRequiredPermissions() {
  try {
    // 스크립팅 권한 확인
    const hasScriptingPermission = await chrome.permissions.contains({
      permissions: ["scripting"],
    });

    if (!hasScriptingPermission) {
      console.warn("스크립팅 권한이 없습니다. 일부 기능이 제한될 수 있습니다.");
    }

    // 호스트 권한 확인
    const hasHostPermission = await chrome.permissions.contains({
      origins: ["*://*/*"],
    });

    if (!hasHostPermission) {
      console.warn(
        "호스트 권한이 제한되어 있습니다. 일부 사이트에서 기능이 제한될 수 있습니다."
      );
    }
  } catch (error) {
    console.error("권한 확인 중 오류 발생:", error);
  }
}

// 메시지 리스너 설정
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // sender.tab이 없는 경우도 처리할 수 있도록 수정
  if (!message || typeof message !== "object") return false;

  // DevTools에서 오는 메시지 처리
  if (message.type === "devtools_connect_request" && message.tabId) {
    const targetTabId = message.tabId;

    // 콘텐츠 스크립트가 이미 로드되어 있는지 확인하고, 필요하면 로드한 후 워커풀 확인
    checkOrInjectContentScript(targetTabId)
      .then(() => {
        // 콘텐츠 스크립트에 워커풀 확인 요청
        try {
          chrome.tabs.sendMessage(
            targetTabId,
            { target: "content", action: "checkWorkerPool" },
            (response) => {
              if (chrome.runtime.lastError) {
                console.warn(
                  "워커풀 확인 요청 오류:",
                  chrome.runtime.lastError.message
                );
                sendResponse({ error: chrome.runtime.lastError.message });
                return;
              }

              // 응답이 없거나 오류가 있는 경우
              if (!response || response.error) {
                sendResponse({
                  exists: false,
                  error: response?.error || "워커풀을 확인할 수 없습니다",
                });
                return;
              }

              // 성공적으로 워커풀 정보 확인
              sendResponse({
                exists: true,
                version: response.version || "unknown",
                info: response.info,
              });
            }
          );
        } catch (error) {
          console.error("워커풀 확인 메시지 전송 오류:", error);
          sendResponse({
            exists: false,
            error: error instanceof Error ? error.message : "메시지 전송 오류",
          });
        }
      })
      .catch((error: Error) => {
        console.error("콘텐츠 스크립트 로드 오류:", error);
        sendResponse({
          exists: false,
          error: error.message || "콘텐츠 스크립트 로드 실패",
        });
      });

    return true; // 비동기 응답을 위해 true 반환
  }

  // 워커풀 데이터 가져오기 요청
  if (message.type === "devtools_fetch_data" && message.tabId) {
    const targetTabId = message.tabId;

    try {
      chrome.tabs.sendMessage(
        targetTabId,
        { target: "content", action: "getWorkerPoolData" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn("데이터 요청 오류:", chrome.runtime.lastError.message);
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }

          if (!response || response.error) {
            sendResponse({
              success: false,
              error: response?.error || "데이터를 받을 수 없습니다",
            });
            return;
          }

          sendResponse({
            success: true,
            data: response.data,
          });
        }
      );
    } catch (error) {
      console.error("데이터 요청 메시지 전송 오류:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "메시지 전송 오류",
      });
    }

    return true; // 비동기 응답을 위해 true 반환
  }

  // 모든 워커 종료 요청
  if (message.type === "devtools_terminate_all_workers" && message.tabId) {
    const targetTabId = message.tabId;

    try {
      chrome.tabs.sendMessage(
        targetTabId,
        { target: "content", action: "terminateAllWorkers" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "워커 종료 요청 오류:",
              chrome.runtime.lastError.message
            );
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }

          if (!response || response.error) {
            sendResponse({
              success: false,
              error: response?.error || "워커를 종료할 수 없습니다",
            });
            return;
          }

          sendResponse({
            success: true,
            message: "모든 워커가 종료되었습니다",
          });
        }
      );
    } catch (error) {
      console.error("워커 종료 요청 메시지 전송 오류:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "메시지 전송 오류",
      });
    }

    return true; // 비동기 응답을 위해 true 반환
  }

  // executeScriptInPage 요청 처리
  if (message.type === "executeScriptInPage") {
    try {
      // sender.tab이 있으면 sender.tab.id를 사용, 아니면 전달된 tabId 사용 (DevTools 패널에서 온 경우)
      const targetTabId = (sender.tab && sender.tab.id) || message.tabId;

      // tabId가 없으면 오류 반환
      if (!targetTabId || targetTabId < 0) {
        console.error("유효한 탭 ID가 없습니다:", targetTabId);
        sendResponse({
          success: false,
          error: `유효한 탭 ID가 없습니다: ${targetTabId}`,
        });
        return true;
      }

      // 함수 문자열과 인수를 가져옴
      const functionStr = message.function;
      const args = message.args || [];

      // 함수 문자열을 실행 가능한 코드로 변환하여 executeScript로 실행
      const scriptToExecute = `
        (function() {
          const fn = ${functionStr};
          return fn(${args.map((arg: any) => JSON.stringify(arg)).join(",")});
        })()
      `;

      console.log(`[DEBUG] 스크립트 실행: tabId=${targetTabId}`);

      chrome.scripting
        .executeScript({
          target: { tabId: targetTabId },
          world: "MAIN", // 웹페이지의 JavaScript 컨텍스트에서 실행
          func: function (scriptCode: string) {
            try {
              // scriptToExecute를 eval로 실행
              return eval(scriptCode);
            } catch (error) {
              return {
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "스크립트 실행 중 오류 발생",
              };
            }
          },
          args: [scriptToExecute],
        })
        .then((results) => {
          if (results && results.length > 0) {
            sendResponse({ success: true, result: results[0].result });
          } else {
            sendResponse({
              success: false,
              error: "스크립트 실행 결과가 없습니다",
            });
          }
        })
        .catch((error) => {
          console.error("스크립팅 API 오류:", error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "스크립팅 API 오류",
          });
        });
    } catch (error) {
      console.error("스크립트 실행 요청 처리 중 오류:", error);
      sendResponse({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "스크립트 실행 요청 처리 중 오류",
      });
    }

    return true; // 비동기 응답을 위해 true 반환
  }

  // 팝업에서 오는 메시지 처리 (sender.tab이 없음)
  if (!sender.tab) {
    // 연결 확인 요청
    if (message.type === "checkConnection") {
      sendResponse({
        connected: currentConnectedTabId !== null,
        tabId: currentConnectedTabId,
      });
      return false; // 동기적 응답이므로 false 반환
    }

    // 연결 요청
    if (message.type === "connect") {
      handleConnect(sendResponse);
      return true; // 비동기 응답 처리를 위해 true 반환
    }

    // 연결 해제 요청
    if (message.type === "disconnect") {
      handleDisconnect(sendResponse);
      return true; // 비동기 응답 처리를 위해 true 반환
    }

    // 설정 업데이트 요청
    if (message.type === "updateSettings" && message.data) {
      handleUpdateSettings(message.data, sendResponse);
      return true; // 비동기 응답 처리를 위해 true 반환
    }

    // 워커 재시작 요청
    if (message.type === "restartWorker" && message.data) {
      handleRestartWorker(message.data, sendResponse);
      return true; // 비동기 응답 처리를 위해 true 반환
    }

    // 로그 요청
    if (message.type === "requestLogs") {
      handleRequestLogs(message.data, sendResponse);
      return true; // 비동기 응답 처리를 위해 true 반환
    }

    return false;
  }

  // 콘텐츠 스크립트에서 오는 메시지는 탭 ID가 필요
  if (!sender.tab.id) return false;

  const messageTabId = sender.tab.id;

  // 워커풀 탐지 메시지 처리
  if (message.type === "workerPoolDetected") {
    // 탭 정보 저장
    tabsWithWorkerPool.set(messageTabId, {
      tabId: messageTabId,
      url: message.pageUrl || sender.tab.url || "",
      hasWorkerPool: true,
      connected: false,
      lastUpdate: Date.now(),
    });

    // 아이콘 업데이트
    updateIcon(messageTabId, false);

    // 팝업에 워커풀 발견 알림
    try {
      chrome.runtime.sendMessage({
        type: "workerPoolDiscovered",
        tabId: messageTabId,
      });
    } catch (error) {
      console.warn("메시지 전송 중 오류 발생:", error);
    }

    return false;
  }

  // 워커풀 데이터 메시지 처리
  if (message.type === "workerPoolData") {
    // 데이터 캐시 업데이트
    workerPoolDataCache = message.data;

    // 연결된 탭 정보 업데이트
    if (tabsWithWorkerPool.has(messageTabId)) {
      const tabInfo = tabsWithWorkerPool.get(messageTabId)!;
      tabInfo.lastUpdate = Date.now();
      tabInfo.connected = true;
      tabsWithWorkerPool.set(messageTabId, tabInfo);
    }

    // 팝업에 데이터 전달 (포트 사용)
    sendPopupMessage("stats", message.data);

    // DevTools에 데이터 전달 (해당 탭의 DevTools가 열려있는 경우)
    if (DevToolsConnection.isDevToolsConnected(messageTabId)) {
      try {
        DevToolsConnection.sendWorkerPoolDataToDevTools(
          messageTabId,
          message.data
        );
      } catch (error) {
        console.warn("DevTools에 메시지 전송 중 오류 발생:", error);
      }
    }

    // 팝업에 데이터 전달 (일반 메시지 - 백업)
    try {
      chrome.runtime.sendMessage({
        type: "workerPoolDataUpdate",
        data: message.data,
      });
    } catch (error) {
      console.warn("메시지 전송 중 오류 발생:", error);
    }

    return true;
  }

  // 연결 가능한 탭 목록 요청
  if (message.type === "getConnectableTabs") {
    const tabs = Array.from(tabsWithWorkerPool.values());
    sendResponse({ tabs });
    return true;
  }

  // 워커풀 연결 요청
  if (message.type === "connectToWorkerPool") {
    const { tabId: targetTabId } = message;
    if (!targetTabId) {
      sendResponse({ success: false, message: "탭 ID가 지정되지 않았습니다." });
      return true;
    }

    // 이전 연결 해제
    if (
      currentConnectedTabId !== null &&
      currentConnectedTabId !== targetTabId
    ) {
      disconnectFromWorkerPool(currentConnectedTabId);
    }

    // 새 탭에 연결
    connectToWorkerPool(targetTabId)
      .then((result) => {
        if (result.success) {
          currentConnectedTabId = targetTabId;
          // 연결된 탭 정보 업데이트
          if (tabsWithWorkerPool.has(targetTabId)) {
            const tabInfo = tabsWithWorkerPool.get(targetTabId)!;
            tabInfo.connected = true;
            tabsWithWorkerPool.set(targetTabId, tabInfo);
          }
        }
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          success: false,
          message: `연결 오류: ${error.message || "알 수 없는 오류"}`,
        });
      });

    return true;
  }

  // 워커풀 연결 해제 요청
  if (message.type === "disconnectFromWorkerPool") {
    const { tabId: targetTabId } = message;
    if (!targetTabId) {
      sendResponse({ success: false, message: "탭 ID가 지정되지 않았습니다." });
      return true;
    }

    disconnectFromWorkerPool(targetTabId)
      .then((result) => {
        if (result.success && currentConnectedTabId === targetTabId) {
          currentConnectedTabId = null;
        }
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          success: false,
          message: `연결 해제 오류: ${error.message || "알 수 없는 오류"}`,
        });
      });

    return true;
  }

  // 캐시된 워커풀 데이터 요청
  if (message.type === "getCachedWorkerPoolData") {
    sendResponse({
      data: workerPoolDataCache,
      connected: currentConnectedTabId !== null,
    });
    return true;
  }

  // 현재 연결 상태 요청
  if (message.type === "getConnectionStatus") {
    sendResponse({
      connected: currentConnectedTabId !== null,
      tabId: currentConnectedTabId,
    });
    return true;
  }

  return false;
});

/**
 * chrome.scripting API를 사용하여 스크립트 실행
 */
async function executeScriptWithScriptingAPI(
  targetTabId: number
): Promise<boolean> {
  try {
    // 실행할 함수 정의 - 실제 페이지 컨텍스트에서 실행됩니다
    function setupWorkerPoolMonitoring() {
      // 페이지 내 HyperViz 워커풀 모니터링 스크립트
      // 이미 설정된 경우 중복 설정 방지
      if ((window as any).__hypervizMonitorInitialized) return;

      (function () {
        // 워커풀 객체 타입 정의
        interface WorkerPoolsMap {
          [key: string]: any;
        }

        // 모니터 객체 생성
        const monitor = {
          initialized: false,
          workerPools: {} as WorkerPoolsMap,
          logs: [] as any[],
          monitoringInterval: null as number | null,

          // 초기화 메서드
          init() {
            if (this.initialized) return false;

            try {
              // 워커풀 객체 검색
              if ((window as any).workerPool) {
                this.workerPools.MAIN = (window as any).workerPool;
              }

              // 타입별 워커풀 검색 (HyperViz 특화)
              if (
                (window as any).appContext &&
                (window as any).appContext.workers
              ) {
                const typedPools = (window as any).appContext.workers;
                for (const type in typedPools) {
                  if (typedPools[type] && typedPools[type].pool) {
                    this.workerPools[type] = typedPools[type].pool;
                  }
                }
              }

              // 워커풀이 존재하는지 확인
              if (Object.keys(this.workerPools).length === 0) {
                console.warn("HyperViz 워커풀을 찾을 수 없습니다.");
                window.postMessage(
                  {
                    source: "HYPERVIZ_PAGE_MONITOR",
                    type: "WORKER_POOL_ERROR",
                    error: "워커풀을 찾을 수 없습니다",
                  },
                  "*"
                );
                return false;
              }

              this.initialized = true;
              console.log("HyperViz 워커풀 모니터링이 초기화되었습니다.");

              // 로그 후킹 설정
              this.hookLogger();

              // 워커풀 발견 알림
              window.postMessage(
                {
                  source: "HYPERVIZ_PAGE_MONITOR",
                  type: "WORKER_POOL_DETECTED",
                  details: {
                    types: Object.keys(this.workerPools),
                    timestamp: Date.now(),
                  },
                },
                "*"
              );

              return true;
            } catch (error) {
              console.error("워커풀 모니터링 초기화 오류:", error);
              window.postMessage(
                {
                  source: "HYPERVIZ_PAGE_MONITOR",
                  type: "WORKER_POOL_ERROR",
                  error: (error as Error).message || "초기화 중 오류 발생",
                },
                "*"
              );
              return false;
            }
          },

          // 로그 후킹 설정
          hookLogger() {
            try {
              // 원본 콘솔 메서드 저장
              const originalLog = console.log;
              const originalWarn = console.warn;
              const originalError = console.error;

              // 콘솔 메서드 재정의
              console.log = (...args: any[]) => {
                originalLog.apply(console, args);
                this.captureLog("info", args);
              };

              console.warn = (...args: any[]) => {
                originalWarn.apply(console, args);
                this.captureLog("warn", args);
              };

              console.error = (...args: any[]) => {
                originalError.apply(console, args);
                this.captureLog("error", args);
              };
            } catch (error) {
              console.error("로그 후킹 설정 오류:", error);
            }
          },

          // 로그 캡처 함수
          captureLog(level: string, args: any[]) {
            // 워커풀 관련 로그만 캡처 (필터링)
            const logMessage = Array.from(args).join(" ");
            if (
              logMessage.includes("worker") ||
              logMessage.includes("task") ||
              logMessage.includes("queue") ||
              logMessage.includes("pool")
            ) {
              this.logs.push({
                timestamp: Date.now(),
                level,
                message: logMessage,
              });

              // 로그 개수 제한
              if (this.logs.length > 1000) {
                this.logs = this.logs.slice(-1000);
              }
            }
          },

          // 모니터링 시작
          startMonitoring(interval = 1000) {
            if (this.monitoringInterval) {
              clearInterval(this.monitoringInterval);
              this.monitoringInterval = null;
            }

            this.monitoringInterval = window.setInterval(() => {
              // 상태 수집 및 전송 코드
              console.log("워커풀 상태 모니터링 중...");
            }, interval) as unknown as number;

            console.log("HyperViz 워커풀 모니터링이 시작되었습니다.");

            // 전역 플래그 설정으로 중복 실행 방지
            (window as any).__hypervizMonitorInitialized = true;

            return true;
          },
        };

        // 초기화 시도
        monitor.init();
        if (monitor.initialized) {
          monitor.startMonitoring();
        }
      })();
    }

    // 스크립트 실행
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: setupWorkerPoolMonitoring,
    });

    // 실행 결과 확인
    return results && results.length > 0;
  } catch (error) {
    console.error("스크립팅 API 실행 오류:", error);
    return false;
  }
}

/**
 * 콘텐츠 스크립트가 이미 로드되어 있는지 확인하고, 필요하면 로드
 */
async function checkOrInjectContentScript(tabId: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      // 먼저 콘텐츠 스크립트가 이미 로드되었는지 확인
      chrome.tabs.sendMessage(tabId, { type: "ping" }, (response) => {
        // 응답이 있으면 이미 로드된 것
        if (response && !chrome.runtime.lastError) {
          resolve(true);
          return;
        }

        // 오류가 있거나 응답이 없으면 스크립트 로드 시도
        chrome.scripting
          .executeScript({
            target: { tabId },
            files: ["content.js"],
          })
          .then(() => {
            console.log("콘텐츠 스크립트 삽입 성공");
            resolve(true);
          })
          .catch((error: Error) => {
            console.error("콘텐츠 스크립트 삽입 오류:", error);
            reject(error);
          });
      });
    } catch (error) {
      console.error("콘텐츠 스크립트 확인 오류:", error);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * 콘텐츠 스크립트와의 연결 관리
 */
chrome.runtime.onConnect.addListener((newPort) => {
  console.log(`포트 연결 수신: ${newPort.name}`);

  if (newPort.name === "popup") {
    // 팝업 포트 저장
    popupPort = newPort;

    // 메시지 리스너
    newPort.onMessage.addListener(handlePopupMessage);

    // 연결 해제 리스너
    newPort.onDisconnect.addListener(() => {
      console.log("팝업 포트 연결 해제됨");
      popupPort = null;
    });

    // 현재 연결 상태 전송
    sendConnectionStatusToPopup();
  } else if (newPort.name === "content-script") {
    // 기존 포트 정리
    if (backgroundPort) {
      backgroundPort.disconnect();
    }

    backgroundPort = newPort;
    backgroundPort.onMessage.addListener(handleContentMessage);
    backgroundPort.onDisconnect.addListener(handleBgContentDisconnect);
  }
});

/**
 * 콘텐츠 스크립트로부터 받은 메시지 처리
 */
function handleContentMessage(message: any) {
  if (!message || !message.type) return;

  // 팝업에 메시지 전달 (포트 사용)
  if (popupPort) {
    sendPopupMessage(message.type, message.data);
  }

  // 팝업에 메시지 전달 (일반 메시지 - 백업)
  chrome.runtime.sendMessage(message);

  switch (message.type) {
    case "connected":
      connected = true;
      updateConnectionStatus(true);
      break;

    case "disconnected":
      connected = false;
      updateConnectionStatus(false);
      break;

    default:
      break;
  }
}

/**
 * 콘텐츠 스크립트와의 연결이 끊어졌을 때 처리
 */
function handleBgContentDisconnect() {
  backgroundPort = null;
  connected = false;
  updateConnectionStatus(false);

  // 자동 재연결 시도
  if (tabId) {
    scheduleReconnect();
  }
}

/**
 * 연결 상태 업데이트
 */
function updateConnectionStatus(isConnected: boolean) {
  // 팝업에 상태 업데이트 전송 (포트 사용)
  sendPopupMessage("connectionStatus", { connected: isConnected });

  // 기존 코드 유지 (일반 메시지도 함께 전송)
  chrome.runtime.sendMessage({
    type: "connectionChanged",
    data: { connected: isConnected },
  });

  if (isConnected) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
  } else {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#F44336" });
  }
}

/**
 * 아이콘 업데이트
 */
function updateIcon(tabId: number, isConnected: boolean) {
  try {
    // 아이콘 설정 시도 (경로 문제로 오류 발생 가능하므로 try-catch로 감싸기)
    if (isConnected) {
      chrome.action.setBadgeText({ tabId, text: "ON" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#4CAF50" });
    } else {
      chrome.action.setBadgeText({ tabId, text: "OFF" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#F44336" });
    }

    // 아이콘 설정은 생략 - setBadgeText만으로 충분함
  } catch (error) {
    console.error("아이콘 업데이트 오류:", error);
  }
}

/**
 * 연결 처리
 */
function handleConnect(sendResponse: MessageResponse) {
  if (connected) {
    sendResponse({ success: true, message: "이미 연결되어 있습니다." });
    return;
  }

  // 현재 활성 탭에 콘텐츠 스크립트 삽입
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0 || !tabs[0].id) {
      sendResponse({ success: false, message: "활성 탭을 찾을 수 없습니다." });
      return;
    }

    tabId = tabs[0].id;

    // 콘텐츠 스크립트 실행
    chrome.scripting
      .executeScript({
        target: { tabId },
        files: ["content.js"],
      })
      .then(() => {
        sendResponse({ success: true, message: "연결 시도 중..." });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          message: `스크립트 삽입 오류: ${error.message}`,
        });
      });
  });
}

/**
 * 연결 해제 처리
 */
function handleDisconnect(sendResponse: MessageResponse) {
  if (!connected || !backgroundPort) {
    sendResponse({ success: true, message: "이미 연결이 해제되어 있습니다." });
    return;
  }

  try {
    // 콘텐츠 스크립트에 연결 해제 요청
    backgroundPort.postMessage({ type: "disconnect" });

    // 타이머 정리
    if (updateTimer) {
      clearInterval(updateTimer);
      updateTimer = null;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    connected = false;
    updateConnectionStatus(false);

    sendResponse({ success: true, message: "연결이 해제되었습니다." });
  } catch (error) {
    console.error("연결 해제 오류:", error);
    // 포트 연결 실패 시 강제로 연결 해제 상태로 설정
    connected = false;
    updateConnectionStatus(false);
    sendResponse({
      success: false,
      message: `연결 해제 오류: ${
        error instanceof Error ? error.message : "알 수 없는 오류"
      }`,
    });
  }
}

/**
 * 설정 업데이트 처리
 */
function handleUpdateSettings(
  data: Record<string, any>,
  sendResponse: MessageResponse
) {
  try {
    // 설정 업데이트
    Object.assign(settings, data);

    // 설정 저장
    chrome.storage.local.set({ settings }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          message: `설정 저장 오류: ${chrome.runtime.lastError.message}`,
        });
        return;
      }

      // 콘텐츠 스크립트에 설정 업데이트 알림
      if (connected && backgroundPort) {
        try {
          backgroundPort.postMessage({
            type: "updateSettings",
            data: settings,
          });
        } catch (error) {
          console.error("설정 업데이트 전송 오류:", error);
        }
      }

      sendResponse({ success: true, message: "설정이 업데이트되었습니다." });
    });
  } catch (error) {
    sendResponse({
      success: false,
      message: `설정 업데이트 오류: ${
        error instanceof Error ? error.message : "알 수 없는 오류"
      }`,
    });
  }
}

/**
 * 워커 재시작 처리
 */
function handleRestartWorker(
  data: Record<string, any>,
  sendResponse: MessageResponse
) {
  if (!connected || !backgroundPort) {
    sendResponse({
      success: false,
      message: "워커풀에 연결되어 있지 않습니다.",
    });
    return;
  }

  try {
    backgroundPort.postMessage({ type: "restartWorker", data });
    sendResponse({
      success: true,
      message: "워커 재시작 요청을 전송했습니다.",
    });
  } catch (error) {
    sendResponse({
      success: false,
      message: `워커 재시작 요청 오류: ${
        error instanceof Error ? error.message : "알 수 없는 오류"
      }`,
    });
  }
}

/**
 * 로그 요청 처리
 */
function handleRequestLogs(
  data: Record<string, any>,
  sendResponse: MessageResponse
) {
  if (!connected || !backgroundPort) {
    sendResponse({
      success: false,
      message: "워커풀에 연결되어 있지 않습니다.",
    });
    return;
  }

  try {
    backgroundPort.postMessage({ type: "requestLogs", data });
    sendResponse({ success: true, message: "로그 요청을 전송했습니다." });
  } catch (error) {
    sendResponse({
      success: false,
      message: `로그 요청 오류: ${
        error instanceof Error ? error.message : "알 수 없는 오류"
      }`,
    });
  }
}

/**
 * 워커풀에 연결
 */
async function connectToWorkerPool(
  targetTabId: number
): Promise<Record<string, any>> {
  console.log("[DEBUG] 워커풀 연결 시도 중...");
  return new Promise((resolve) => {
    try {
      // 스크립트 삽입 시도
      chrome.scripting
        .executeScript({
          target: { tabId: targetTabId },
          files: ["content.js"],
        })
        .then(() => {
          // 연결 요청 전송 - 오류 처리 추가
          try {
            chrome.tabs.sendMessage(
              targetTabId,
              { type: "connect" },
              (response) => {
                // 런타임 오류 확인
                if (chrome.runtime.lastError) {
                  console.warn(
                    "연결 메시지 전송 오류:",
                    chrome.runtime.lastError.message
                  );
                  resolve({
                    success: false,
                    message: `연결 오류: ${chrome.runtime.lastError.message}`,
                  });
                  return;
                }

                if (response && response.success) {
                  resolve(response);
                } else {
                  resolve({
                    success: false,
                    message:
                      response && response.message
                        ? response.message
                        : "알 수 없는 오류",
                  });
                }
              }
            );
          } catch (msgError) {
            console.error("메시지 전송 중 예외:", msgError);
            resolve({
              success: false,
              message: `메시지 전송 오류: ${
                msgError instanceof Error ? msgError.message : "알 수 없는 오류"
              }`,
            });
          }
        })
        .catch((error) => {
          resolve({
            success: false,
            message: `스크립트 삽입 오류: ${error.message}`,
          });
        });
    } catch (error) {
      resolve({
        success: false,
        message: `연결 시도 오류: ${
          error instanceof Error ? error.message : "알 수 없는 오류"
        }`,
      });
    }
  });
}

/**
 * 워커풀 연결 해제
 */
async function disconnectFromWorkerPool(
  targetTabId: number
): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    try {
      // 연결 해제 요청 전송
      try {
        chrome.tabs.sendMessage(
          targetTabId,
          { type: "disconnect" },
          (response) => {
            if (chrome.runtime.lastError) {
              // 탭이 더 이상 존재하지 않을 수 있음
              console.warn(
                `탭 메시지 전송 오류: ${chrome.runtime.lastError.message}`
              );
              resolve({ success: true, message: "연결이 해제되었습니다." });
              return;
            }

            if (response && response.success) {
              resolve(response);
            } else {
              resolve({
                success: false,
                message:
                  response && response.message
                    ? response.message
                    : "알 수 없는 오류",
              });
            }
          }
        );
      } catch (msgError) {
        console.error("메시지 전송 중 예외:", msgError);
        // 메시지 전송 실패는 연결 해제로 간주
        resolve({ success: true, message: "연결이 해제되었습니다." });
      }
    } catch (error) {
      console.error("연결 해제 시도 중 예외:", error);
      // 어쨌든 연결은 해제된 것으로 간주
      resolve({
        success: true,
        message:
          "연결이 해제되었습니다. (오류 발생: " +
          (error instanceof Error ? error.message : "알 수 없는 오류") +
          ")",
      });
    }
  });
}

/**
 * 자동 재연결 예약
 */
function scheduleReconnect() {
  // 이미 예약된 재연결이 있으면 취소
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  // 5초 후 재연결 시도
  reconnectTimer = setTimeout(() => {
    if (!connected && tabId) {
      connectToWorkerPool(tabId)
        .then((result) => {
          if (result.success) {
            currentConnectedTabId = tabId;
          }
        })
        .catch((error) => {
          console.error("자동 재연결 오류:", error);
        });
    }
  }, 5000) as unknown as number;
}

/**
 * 팝업 메시지 처리
 */
function handlePopupMessage(message: any) {
  console.log("팝업 메시지 수신:", message);

  if (!message || !message.type) return;

  switch (message.type) {
    case "getConnectionStatus":
      sendConnectionStatusToPopup();
      break;

    case "connect":
      handlePopupConnect();
      break;

    case "disconnect":
      handlePopupDisconnect();
      break;

    case "updateSettings":
      if (message.data) {
        // 설정 업데이트
        Object.assign(settings, message.data);
        sendSettingsToPopup();
      }
      break;

    case "requestLogs":
      // 현재 연결된 탭이 있는 경우에만 로그 요청
      if (connected && backgroundPort) {
        try {
          backgroundPort.postMessage({
            type: "requestLogs",
            data: message.data || {},
          });
        } catch (error) {
          console.error("로그 요청 오류:", error);
          sendPopupMessage("logs", { logs: [], error: "로그 요청 실패" });
        }
      } else {
        sendPopupMessage("logs", { logs: [], error: "연결되지 않음" });
      }
      break;

    case "restartWorker":
      // 워커 재시작 요청
      if (connected && backgroundPort && message.data) {
        try {
          backgroundPort.postMessage({
            type: "restartWorker",
            data: {
              workerId: message.data.workerId,
              workerType: message.data.workerType,
            },
          });
        } catch (error) {
          console.error("워커 재시작 요청 오류:", error);
          sendPopupMessage("error", { message: "워커 재시작 요청 실패" });
        }
      } else {
        sendPopupMessage("error", { message: "연결되지 않음" });
      }
      break;

    default:
      break;
  }
}

/**
 * 팝업 연결 요청 처리
 */
function handlePopupConnect() {
  if (connected) {
    sendConnectionStatusToPopup();
    return;
  }

  // 현재 활성 탭에 콘텐츠 스크립트 삽입
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0 || !tabs[0].id) {
      sendPopupMessage("connectionStatus", {
        connected: false,
        error: "활성 탭을 찾을 수 없습니다.",
      });
      return;
    }

    tabId = tabs[0].id;

    // 콘텐츠 스크립트 실행
    chrome.scripting
      .executeScript({
        target: { tabId },
        files: ["content.js"],
      })
      .then(() => {
        // 상태 업데이트는 연결 성공 시 이벤트로 전송됨
        console.log("콘텐츠 스크립트 삽입 성공");
      })
      .catch((error) => {
        sendPopupMessage("connectionStatus", {
          connected: false,
          error: `스크립트 삽입 오류: ${error.message || "알 수 없는 오류"}`,
        });
      });
  });
}

/**
 * 팝업 연결 해제 요청 처리
 */
function handlePopupDisconnect() {
  if (!connected || !backgroundPort) {
    sendConnectionStatusToPopup();
    return;
  }

  try {
    // 콘텐츠 스크립트에 연결 해제 요청
    backgroundPort.postMessage({ type: "disconnect" });

    // 타이머 정리
    if (updateTimer) {
      clearInterval(updateTimer);
      updateTimer = null;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // 상태 업데이트는 연결 해제 시 이벤트로 전송됨
  } catch (error) {
    console.error("연결 해제 오류:", error);
    // 포트 연결 실패 시 강제로 연결 해제 상태로 설정
    connected = false;
    updateConnectionStatus(false);
  }
}

/**
 * 팝업에 연결 상태 전송
 */
function sendConnectionStatusToPopup() {
  sendPopupMessage("connectionStatus", {
    connected: currentConnectedTabId !== null && connected,
    tabId: currentConnectedTabId,
  });
}

/**
 * 팝업에 설정 전송
 */
function sendSettingsToPopup() {
  sendPopupMessage("settingsUpdated", { settings });
}

/**
 * 팝업에 메시지 전송
 */
function sendPopupMessage(type: string, data: any = {}) {
  if (!popupPort) {
    console.warn(`팝업 포트 없음, 메시지 전송 실패: ${type}`);
    return;
  }

  try {
    popupPort.postMessage({ type, data });
  } catch (error) {
    console.error(`팝업 메시지 전송 오류 (${type}):`, error);
    // 포트 연결이 끊어진 경우
    popupPort = null;
  }
}

// 초기 설정
chrome.action.setBadgeText({ text: "OFF" });
chrome.action.setBadgeBackgroundColor({ color: "#F44336" });

// 확장 프로그램 초기화
initialize();

// 모든 단계에 로깅 추가
// chrome.devtools.inspectedWindow.eval 호출 제거 (백그라운드 스크립트에서 사용 불가)
