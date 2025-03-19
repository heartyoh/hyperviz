/**
 * 메시지 처리 서비스
 */

import { Message, MessageResponse, MessageType } from "../types/message";
import connectionManager from "../services/connection-manager";
import workerPoolService from "../services/worker-pool-service";
import scriptInjector from "../services/script-injector";
import tabManager from "../services/tab-manager";
import logger from "../utils/logger";

class MessageHandler {
  /**
   * 메시지 처리
   * @param message 수신된 메시지
   * @param sender 메시지 발신자 정보
   * @param sendResponse 응답 콜백
   */
  public handleMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: MessageResponse
  ): boolean {
    logger.info(`메시지 수신: ${message.type}`, "MessageHandler");

    // 콘텐츠 스크립트가 로드됨
    if (message.type === MessageType.CONTENT_SCRIPT_LOADED) {
      this.handleContentScriptLoaded(message, sender);
      sendResponse({ success: true });
      return false;
    }

    // 워커풀 데이터
    if (message.type === MessageType.WORKER_POOL_DATA) {
      this.handleWorkerPoolData(message);
      sendResponse({ success: true });
      return false;
    }

    // 연결 요청
    if (message.type === MessageType.CONNECT) {
      this.handleConnect(sender.tab?.id, sendResponse);
      return true; // 비동기 응답
    }

    // 연결 해제 요청
    if (message.type === MessageType.DISCONNECT) {
      this.handleDisconnect(sender.tab?.id, sendResponse);
      return true; // 비동기 응답
    }

    // 워커풀 데이터 가져오기 요청
    if (message.type === MessageType.FETCH_DATA) {
      this.handleFetchData(sender.tab?.id, sendResponse);
      return true; // 비동기 응답
    }

    // 페이지 내 워커풀 확인 요청 (CSP 우회용)
    if (message.type === MessageType.CHECK_WORKER_POOL_IN_PAGE) {
      this.handleCheckWorkerPoolInPage(
        message.tabId || sender.tab?.id,
        sendResponse
      );
      return true; // 비동기 응답
    }

    // 페이지에서 워커풀 데이터 가져오기 요청 (CSP 우회용)
    if (message.type === MessageType.GET_WORKER_POOL_DATA_FROM_PAGE) {
      this.handleGetWorkerPoolDataFromPage(
        message.tabId || sender.tab?.id,
        sendResponse
      );
      return true; // 비동기 응답
    }

    // 현재 탭 ID 가져오기 요청
    if (message.type === MessageType.GET_CURRENT_TAB_ID) {
      this.handleGetCurrentTabId(sender.tab?.id, sendResponse);
      return false; // 동기 응답
    }

    // 핑 요청
    if (message.type === MessageType.PING) {
      sendResponse({ success: true, timestamp: Date.now() });
      return false;
    }

    // 처리되지 않은 메시지 타입
    logger.warn(`처리되지 않은 메시지 타입: ${message.type}`, "MessageHandler");
    return false;
  }

  /**
   * 콘텐츠 스크립트 로드 처리
   */
  private handleContentScriptLoaded(
    message: any,
    sender: chrome.runtime.MessageSender
  ): void {
    const tabId = sender.tab?.id;
    const url = sender.url || message.url;

    if (tabId && url) {
      logger.info(
        `콘텐츠 스크립트 로드됨: 탭 ID ${tabId}, URL ${url}`,
        "MessageHandler"
      );

      // 탭 정보 저장 또는 업데이트
      const tab = tabManager.getTab(tabId);
      if (!tab) {
        tabManager.addTab(tabId, url);
      }
    }
  }

  /**
   * 워커풀 데이터 처리
   */
  private handleWorkerPoolData(message: any): void {
    logger.debug("워커풀 데이터 수신됨", "MessageHandler", message.data);

    // 팝업에 데이터 전달 (일반 메시지 - 백업)
    try {
      chrome.runtime.sendMessage({
        type: "workerPoolDataUpdate",
        data: message.data,
      });
    } catch (error) {
      logger.warn("메시지 전송 중 오류 발생", "MessageHandler", error);
    }
  }

  /**
   * 연결 요청 처리
   */
  private handleConnect(tabId?: number, sendResponse?: MessageResponse): void {
    if (!tabId) {
      logger.error("탭 ID가 없습니다", "MessageHandler");
      if (sendResponse) {
        sendResponse({
          success: false,
          error: "탭 ID가 없습니다",
          timestamp: Date.now(),
        });
      }
      return;
    }

    logger.info(`워커풀 연결 요청: 탭 ID ${tabId}`, "MessageHandler");

    connectionManager
      .connectToWorkerPool(tabId)
      .then((result) => {
        if (sendResponse) {
          sendResponse(result);
        }
      })
      .catch((error) => {
        logger.error("연결 중 오류 발생", "MessageHandler", error);
        if (sendResponse) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "알 수 없는 오류",
            timestamp: Date.now(),
          });
        }
      });
  }

  /**
   * 연결 해제 요청 처리
   */
  private handleDisconnect(
    tabId?: number,
    sendResponse?: MessageResponse
  ): void {
    if (!tabId) {
      logger.error("탭 ID가 없습니다", "MessageHandler");
      if (sendResponse) {
        sendResponse({
          success: false,
          error: "탭 ID가 없습니다",
          timestamp: Date.now(),
        });
      }
      return;
    }

    logger.info(`워커풀 연결 해제 요청: 탭 ID ${tabId}`, "MessageHandler");

    connectionManager
      .disconnectFromWorkerPool(tabId)
      .then((result) => {
        if (sendResponse) {
          sendResponse(result);
        }
      })
      .catch((error) => {
        logger.error("연결 해제 중 오류 발생", "MessageHandler", error);
        if (sendResponse) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "알 수 없는 오류",
            timestamp: Date.now(),
          });
        }
      });
  }

  /**
   * 워커풀 데이터 가져오기 요청 처리
   */
  private handleFetchData(
    tabId?: number,
    sendResponse?: MessageResponse
  ): void {
    if (!tabId) {
      logger.error("탭 ID가 없습니다", "MessageHandler");
      if (sendResponse) {
        sendResponse({
          success: false,
          error: "탭 ID가 없습니다",
          timestamp: Date.now(),
        });
      }
      return;
    }

    logger.debug(`워커풀 데이터 요청: 탭 ID ${tabId}`, "MessageHandler");

    workerPoolService
      .fetchWorkerPoolData(tabId)
      .then((result) => {
        if (sendResponse) {
          sendResponse(result);
        }
      })
      .catch((error) => {
        logger.error("데이터 가져오기 중 오류 발생", "MessageHandler", error);
        if (sendResponse) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "알 수 없는 오류",
            timestamp: Date.now(),
          });
        }
      });
  }

  /**
   * 페이지 내 워커풀 확인 요청 처리 (CSP 우회를 위한 scripting API 사용)
   */
  private handleCheckWorkerPoolInPage(
    tabId?: number,
    sendResponse?: MessageResponse
  ): void {
    if (!tabId || tabId < 0) {
      logger.error("유효하지 않은 탭 ID입니다", "MessageHandler", { tabId });
      if (sendResponse) {
        sendResponse({
          success: false,
          exists: false,
          error: "유효하지 않은 탭 ID입니다",
          timestamp: Date.now(),
        });
      }
      return;
    }

    logger.debug(
      `페이지 내 워커풀 확인 요청: 탭 ID ${tabId}`,
      "MessageHandler"
    );

    // script-injector 서비스를 통해 페이지에서 워커풀 확인
    scriptInjector
      .checkWorkerPoolInPage(tabId)
      .then((result) => {
        if (sendResponse) {
          sendResponse(result);
        }
      })
      .catch((error) => {
        logger.error(
          "페이지 내 워커풀 확인 중 오류 발생",
          "MessageHandler",
          error
        );
        if (sendResponse) {
          sendResponse({
            success: false,
            exists: false,
            error: error instanceof Error ? error.message : "알 수 없는 오류",
            timestamp: Date.now(),
          });
        }
      });
  }

  /**
   * 페이지에서 워커풀 데이터 가져오기 요청 처리 (CSP 우회를 위한 scripting API 사용)
   */
  private handleGetWorkerPoolDataFromPage(
    tabId?: number,
    sendResponse?: MessageResponse
  ): void {
    if (!tabId || tabId < 0) {
      logger.error("유효하지 않은 탭 ID입니다", "MessageHandler", { tabId });
      if (sendResponse) {
        sendResponse({
          success: false,
          error: "유효하지 않은 탭 ID입니다",
          timestamp: Date.now(),
        });
      }
      return;
    }

    logger.debug(
      `페이지에서 워커풀 데이터 가져오기 요청: 탭 ID ${tabId}`,
      "MessageHandler"
    );

    // script-injector 서비스를 통해 페이지에서 워커풀 데이터 가져오기
    scriptInjector
      .getWorkerPoolDataFromPage(tabId)
      .then((result) => {
        if (sendResponse) {
          sendResponse(result);
        }
      })
      .catch((error) => {
        logger.error(
          "페이지에서 워커풀 데이터 가져오기 중 오류 발생",
          "MessageHandler",
          error
        );
        if (sendResponse) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "알 수 없는 오류",
            timestamp: Date.now(),
          });
        }
      });
  }

  /**
   * 현재 탭 ID 가져오기 요청 처리
   */
  private handleGetCurrentTabId(
    tabId?: number,
    sendResponse?: MessageResponse
  ): void {
    if (!tabId) {
      // 탭 ID가 없는 경우(직접 확장 프로그램에서 요청한 경우)
      logger.error("발신자의 탭 ID를 확인할 수 없습니다", "MessageHandler");
      if (sendResponse) {
        sendResponse({
          success: false,
          error: "발신자의 탭 ID를 확인할 수 없습니다",
          timestamp: Date.now(),
        });
      }
      return;
    }

    logger.debug(`현재 탭 ID 요청 처리: ${tabId}`, "MessageHandler");

    if (sendResponse) {
      sendResponse({
        success: true,
        tabId: tabId,
        timestamp: Date.now(),
      });
    }
  }
}

// 싱글톤 인스턴스 내보내기
export default new MessageHandler();
