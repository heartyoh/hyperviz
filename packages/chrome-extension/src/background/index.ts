/**
 * 백그라운드 스크립트 진입점
 *
 * 크롬 확장의 백그라운드 서비스 워커를 초기화합니다.
 */

import {
  messagingService,
  stateManager,
  workerConnector,
} from "../common/services";
import badgeManager from "./badge-manager";
import "./devtools-connection";

// 디버그 로깅 활성화
const DEBUG = true;

/**
 * 로깅 유틸리티
 */
function log(message: string, ...data: any[]): void {
  if (DEBUG) {
    console.log(`[HyperViz 백그라운드] ${message}`, ...data);
  }
}

/**
 * 오류 로깅 유틸리티
 */
function logError(message: string, error?: any): void {
  console.error(`[HyperViz 백그라운드] ${message}`, error);
}

/**
 * 확장 프로그램 초기화
 */
async function initializeExtension(): Promise<void> {
  log("백그라운드 서비스 워커 초기화 중...");

  try {
    // 저장된 상태 복원
    await stateManager.restoreState();

    // 워커 커넥터 초기화
    workerConnector.initialize({
      autoConnect: false,
      updateInterval: 1000,
      monitoringEnabled: true,
    });

    // 배지 매니저 초기화
    badgeManager.initialize({
      showWorkerCount: true,
      colorByStatus: true,
    });

    // 워커 커넥터 이벤트 리스너 설정
    setupConnectorListeners();

    // 확장 프로그램 이벤트 리스너 설정
    setupExtensionListeners();

    log("백그라운드 서비스 워커 초기화 완료");
  } catch (error) {
    logError("초기화 중 오류 발생", error);
  }
}

/**
 * 워커 커넥터 이벤트 리스너 설정
 */
function setupConnectorListeners(): void {
  // 연결 상태 변경 이벤트
  workerConnector.on("connected", async ({ tabId, workerInfo }) => {
    log(`워커풀 연결됨: 탭 ID ${tabId}`, workerInfo);

    // 연결된 탭에 대한 배지 업데이트
    badgeManager.updateBadge(tabId, {
      connected: true,
      workerCount: workerInfo?.workerCount || 0,
    });
  });

  workerConnector.on("disconnected", () => {
    log("워커풀 연결 해제됨");

    const tabId = stateManager.getState().currentTabId;
    if (tabId) {
      badgeManager.updateBadge(tabId, { connected: false });
    }
  });

  // 데이터 업데이트 이벤트
  workerConnector.on("dataUpdated", (data) => {
    const tabId = stateManager.getState().currentTabId;
    const workerCount = Object.keys(data.workers || {}).length;

    if (tabId) {
      // 배지 업데이트
      badgeManager.updateBadge(tabId, {
        connected: true,
        workerCount,
        busyWorkers: Object.values(data.workers || {}).filter(
          (w: any) => w.status === "busy"
        ).length,
      });
    }
  });

  // 오류 이벤트
  workerConnector.on("error", ({ error, message }) => {
    logError(message || "워커풀 오류", error);
  });
}

/**
 * 확장 프로그램 이벤트 리스너 설정
 */
function setupExtensionListeners(): void {
  // 탭 활성화 이벤트
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    log(`탭 활성화됨: ${activeInfo.tabId}`);

    // 현재 탭 ID 업데이트
    stateManager.setState({ currentTabId: activeInfo.tabId });

    // 해당 탭의 워커풀 연결 상태 확인 및 연결 시도
    try {
      // 탭 정보 가져오기
      const tab = await chrome.tabs.get(activeInfo.tabId);

      // 유효한 웹 페이지인 경우에만 연결 시도
      if (tab.url && tab.url.startsWith("http")) {
        workerConnector.connectToTab(activeInfo.tabId);
      }
    } catch (error) {
      logError("탭 활성화 처리 중 오류 발생", error);
    }
  });

  // 탭 업데이트 이벤트 (페이지 새로고침 등)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // 페이지 로드 완료 시
    if (changeInfo.status === "complete" && tab.active) {
      log(`탭 업데이트됨: ${tabId}, URL: ${tab.url}`);

      // 유효한 웹 페이지인 경우 연결 시도
      if (tab.url && tab.url.startsWith("http")) {
        workerConnector.connectToTab(tabId);
      }
    }
  });

  // 탭 종료 이벤트
  chrome.tabs.onRemoved.addListener((tabId) => {
    log(`탭 종료됨: ${tabId}`);

    // 현재 탭이 종료된 경우 연결 해제
    if (stateManager.getState().currentTabId === tabId) {
      workerConnector.disconnect();
      stateManager.setState({ currentTabId: null });
    }

    // 탭 상태 정보 정리
    chrome.storage.session.remove(`tabState:${tabId}`);
  });

  // 메시지 처리 리스너
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 메시지 타입 확인
    const messageType = message?.type || "unknown";
    log(`메시지 수신됨: ${messageType}`, { message, sender });

    // 워커풀 확인 요청
    if (messageType === "check_worker_pool_in_page") {
      log(`워커풀 확인 요청 처리 중. TabId: ${message.tabId}`);

      // tabId 유효성 확인
      if (
        !message.tabId ||
        typeof message.tabId !== "number" ||
        message.tabId <= 0
      ) {
        const errorMsg = `유효하지 않은 탭 ID: ${message.tabId}`;
        logError(errorMsg);
        sendResponse({ exists: false, error: errorMsg });
        return true;
      }

      try {
        log(
          `탭 ${message.tabId}에 콘텐츠 스크립트로 워커풀 확인 메시지 전송 중...`
        );
        // 콘텐츠 스크립트에 워커풀 확인 요청 전송
        chrome.tabs.sendMessage(
          message.tabId,
          { type: "check_worker_pool_in_page", timestamp: Date.now() },
          (response) => {
            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message;
              logError(`워커풀 확인 중 오류: ${errorMsg}`);
              sendResponse({ exists: false, error: errorMsg });
              return;
            }

            log(`워커풀 확인 응답 수신:`, response);
            sendResponse(response);
          }
        );
        return true; // 비동기 응답 처리
      } catch (error) {
        logError("워커풀 확인 중 예외 발생", error);
        sendResponse({
          exists: false,
          error: error instanceof Error ? error.message : "알 수 없는 오류",
        });
        return true;
      }
    }

    // 탭 ID 요청 처리
    if (messageType === "get_current_tab_id") {
      log(`탭 ID 요청 처리 중. 발신자:`, sender);

      // 발신자가 콘텐츠 스크립트인 경우 (sender.tab이 있음)
      if (sender.tab && typeof sender.tab.id === "number") {
        log(`발신자의 탭 ID 사용: ${sender.tab.id}`);
        sendResponse({ success: true, tabId: sender.tab.id });
        return true;
      }

      // 발신자가 DevTools 또는 팝업인 경우 (sender.tab이 없음)
      log(`발신자의 탭 정보 없음, active 탭 쿼리 중...`);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs.length || typeof tabs[0].id !== "number") {
          const errorMsg = "활성 탭을 찾을 수 없거나 탭 ID가 유효하지 않음";
          logError(errorMsg, tabs);
          sendResponse({ success: false, error: errorMsg });
          return;
        }

        log(`활성 탭 ID 찾음: ${tabs[0].id}`);
        sendResponse({ success: true, tabId: tabs[0].id });
      });

      return true; // 비동기 응답 처리
    }

    // 기타 메시지 처리
    log(`지원되지 않는 메시지 타입: ${messageType}`);
    return false; // 다른 메시지 처리기에게 전달
  });
}

// 확장 프로그램 초기화 실행
initializeExtension();
