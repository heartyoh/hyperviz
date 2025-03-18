/**
 * HyperViz 크롬 확장 프로그램 - 백그라운드 스크립트
 */

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

// 메시지 리스너 설정
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // sender.tab이 없는 경우도 처리할 수 있도록 수정
  if (!message || typeof message !== "object") return false;

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
    chrome.runtime.sendMessage({
      type: "workerPoolDiscovered",
      tabId: messageTabId,
    });

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

    // 팝업에 데이터 전달 (일반 메시지 - 백업)
    chrome.runtime.sendMessage({
      type: "workerPoolDataUpdate",
      data: message.data,
    });

    return false;
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
  if (isConnected) {
    chrome.action.setIcon({
      tabId,
      path: {
        16: "../assets/icon-16.png",
        32: "../assets/icon-32.png",
        48: "../assets/icon-48.png",
        128: "../assets/icon-128.png",
      },
    });
  } else {
    chrome.action.setIcon({
      tabId,
      path: {
        16: "../assets/icon-gray-16.png",
        32: "../assets/icon-gray-32.png",
        48: "../assets/icon-gray-48.png",
        128: "../assets/icon-gray-128.png",
      },
    });
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
  return new Promise((resolve) => {
    try {
      // 스크립트 삽입 시도
      chrome.scripting
        .executeScript({
          target: { tabId: targetTabId },
          files: ["content.js"],
        })
        .then(() => {
          // 연결 요청 전송
          chrome.tabs.sendMessage(
            targetTabId,
            { type: "connect" },
            (response) => {
              if (chrome.runtime.lastError) {
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
    } catch (error) {
      resolve({
        success: false,
        message: `연결 해제 오류: ${
          error instanceof Error ? error.message : "알 수 없는 오류"
        }`,
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
