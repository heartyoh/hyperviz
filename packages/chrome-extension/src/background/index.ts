/**
 * HyperViz 크롬 확장 프로그램 - 백그라운드 스크립트
 */

import tabManager from "./services/tab-manager";
import iconService from "./services/icon-service";
import messageHandler from "./communication/message-handler";
import devToolsBridge from "./communication/devtools-bridge";
import popupBridge from "./communication/popup-bridge";
import logger from "./utils/logger";
import { setupDevToolsConnectionListeners } from "./devtools-connection";

/**
 * 확장 프로그램 초기화
 */
function initialize() {
  logger.info("백그라운드 스크립트 초기화 중...", "Main");

  // 필요한 권한 확인
  checkRequiredPermissions().then((hasPermissions) => {
    if (hasPermissions) {
      // 탭 매니저 초기화
      tabManager.initialize();

      // DevTools 연결 리스너 설정
      setupDevToolsConnectionListeners();

      // 이벤트 리스너 설정
      setupEventListeners();

      // 메시지 리스너 설정
      setupMessageListeners();

      logger.info("백그라운드 스크립트 초기화 완료", "Main");
    } else {
      logger.error("필요한 권한이 없습니다", "Main");
    }
  });
}

/**
 * 필요한 권한 확인
 */
async function checkRequiredPermissions(): Promise<boolean> {
  try {
    // 필요한 권한 확인
    const permissions = {
      permissions: ["scripting", "tabs", "storage"],
      origins: ["<all_urls>"],
    };

    const hasPermissions = await chrome.permissions.contains(permissions);

    if (!hasPermissions) {
      logger.warn("필요한 권한이 없습니다", "Main");
    }

    return hasPermissions;
  } catch (error) {
    logger.error("권한 확인 중 오류 발생", "Main", error);
    return false;
  }
}

/**
 * 이벤트 리스너 설정
 */
function setupEventListeners() {
  // 브라우저 액션 클릭 이벤트
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
      logger.info(`브라우저 액션 클릭됨: 탭 ID ${tab.id}`, "Main");

      // 팝업이 없는 경우에만 처리 (팝업이 있으면 자동으로 팝업이 열림)
      chrome.action.setPopup({ tabId: tab.id, popup: "popup.html" });
    }
  });

  // 확장 프로그램 설치/업데이트 이벤트
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      logger.info("확장 프로그램이 설치되었습니다", "Main");
      showWelcomeMessage();
    } else if (details.reason === "update") {
      logger.info(
        `확장 프로그램이 업데이트되었습니다: ${details.previousVersion} -> ${
          chrome.runtime.getManifest().version
        }`,
        "Main"
      );
    }
  });

  // 탭 활성화 이벤트 - 아이콘 상태 업데이트
  chrome.tabs.onActivated.addListener((activeInfo) => {
    const tabInfo = tabManager.getTab(activeInfo.tabId);
    if (tabInfo) {
      iconService.updateIcon(activeInfo.tabId, tabInfo.connected);
    }
  });
}

/**
 * 메시지 리스너 설정
 */
function setupMessageListeners() {
  // 일반 메시지 리스너
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // DevTools 메시지인 경우
    if (message.type && message.type.startsWith("devtools_")) {
      return devToolsBridge.handleDevToolsMessage(
        message,
        sender,
        sendResponse
      );
    }

    // 팝업 메시지인 경우
    if (message.type && message.type.startsWith("popup_")) {
      // 팝업 메시지는 포트를 통해 처리하는 것이 좋지만,
      // 백업 처리 방법으로 일반 메시지도 지원
      logger.debug("팝업 메시지 일반 채널로 수신", "Main", message);
      return false;
    }

    // 일반 메시지인 경우
    return messageHandler.handleMessage(message, sender, sendResponse);
  });

  // 포트 연결 리스너 (팝업용)
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "popup") {
      popupBridge.handlePopupConnect(port);
    }
  });
}

/**
 * 환영 메시지 표시
 */
function showWelcomeMessage() {
  try {
    // 알림 생성
    chrome.notifications.create("welcome", {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon128.png"),
      title: "HyperViz 확장 프로그램",
      message: "HyperViz 확장 프로그램이 설치되었습니다.",
      priority: 2,
    });
  } catch (error) {
    logger.error("환영 메시지 표시 중 오류 발생", "Main", error);
  }
}

/**
 * 스토리지 초기화
 */
async function initializeStorage() {
  try {
    // 기본 설정 로드
    const storage = await chrome.storage.local.get("settings");
    if (!storage.settings) {
      // 기본 설정값 저장
      await chrome.storage.local.set({
        settings: {
          autoConnect: true,
          detectOnLoad: true,
          refreshInterval: 1000,
          logLevel: "info",
        },
      });
      logger.info("기본 설정값이 초기화되었습니다", "Main");
    }
  } catch (error) {
    logger.error("스토리지 초기화 중 오류 발생", "Main", error);
  }
}

// 초기화 실행
initialize();
initializeStorage().catch((error) => {
  logger.error("스토리지 초기화 실패", "Main", error);
});
