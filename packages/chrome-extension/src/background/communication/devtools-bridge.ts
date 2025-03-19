/**
 * DevTools 통신 브릿지
 */

import { MessageResponse } from "../types/message";
import connectionManager from "../services/connection-manager";
import workerPoolService from "../services/worker-pool-service";
import logger from "../utils/logger";

class DevToolsBridge {
  /**
   * DevTools 메시지 처리
   * @param message 수신된 메시지
   * @param sender 메시지 발신자 정보
   * @param sendResponse 응답 콜백
   */
  public handleDevToolsMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: MessageResponse
  ): boolean {
    logger.info(`DevTools 메시지 수신: ${message.type}`, "DevToolsBridge");

    // 연결 요청
    if (message.type === "devtools_connect_request") {
      this.handleConnectRequest(message, sendResponse);
      return true; // 비동기 응답
    }

    // 데이터 가져오기 요청
    if (message.type === "devtools_fetch_data") {
      this.handleFetchDataRequest(message, sendResponse);
      return true; // 비동기 응답
    }

    // 가상 워커풀 생성 요청
    if (message.type === "devtools_create_mock_pool") {
      this.handleCreateMockPoolRequest(message, sendResponse);
      return true; // 비동기 응답
    }

    // 워커풀 설정 업데이트 요청
    if (message.type === "devtools_update_pool_settings") {
      this.handleUpdatePoolSettingsRequest(message, sendResponse);
      return true; // 비동기 응답
    }

    // 모든 워커 종료 요청
    if (message.type === "devtools_terminate_all_workers") {
      this.handleTerminateAllWorkersRequest(message, sendResponse);
      return true; // 비동기 응답
    }

    // 처리되지 않은 메시지 타입
    logger.warn(
      `처리되지 않은 DevTools 메시지 타입: ${message.type}`,
      "DevToolsBridge"
    );
    return false;
  }

  /**
   * 연결 요청 처리
   */
  private handleConnectRequest(
    message: any,
    sendResponse: MessageResponse
  ): void {
    const tabId = message.tabId;

    if (!tabId || tabId === -1) {
      logger.error("유효하지 않은 탭 ID입니다", "DevToolsBridge", { tabId });
      sendResponse({
        success: false,
        error: "유효하지 않은 탭 ID입니다",
        timestamp: Date.now(),
      });
      return;
    }

    logger.info(`DevTools 연결 요청: 탭 ID ${tabId}`, "DevToolsBridge");

    connectionManager
      .connectToWorkerPool(tabId)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        logger.error("DevTools 연결 중 오류 발생", "DevToolsBridge", error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "알 수 없는 오류",
          timestamp: Date.now(),
        });
      });
  }

  /**
   * 데이터 가져오기 요청 처리
   */
  private handleFetchDataRequest(
    message: any,
    sendResponse: MessageResponse
  ): void {
    const tabId = message.tabId;

    if (!tabId || tabId === -1) {
      logger.error("유효하지 않은 탭 ID입니다", "DevToolsBridge", { tabId });
      sendResponse({
        success: false,
        error: "유효하지 않은 탭 ID입니다",
        timestamp: Date.now(),
      });
      return;
    }

    logger.debug(`DevTools 데이터 요청: 탭 ID ${tabId}`, "DevToolsBridge");

    workerPoolService
      .fetchWorkerPoolData(tabId)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        logger.error(
          "DevTools 데이터 가져오기 중 오류 발생",
          "DevToolsBridge",
          error
        );
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "알 수 없는 오류",
          timestamp: Date.now(),
        });
      });
  }

  /**
   * 가상 워커풀 생성 요청 처리
   */
  private handleCreateMockPoolRequest(
    message: any,
    sendResponse: MessageResponse
  ): void {
    const tabId = message.tabId;

    if (!tabId || tabId === -1) {
      logger.error("유효하지 않은 탭 ID입니다", "DevToolsBridge", { tabId });
      sendResponse({
        success: false,
        error: "유효하지 않은 탭 ID입니다",
        timestamp: Date.now(),
      });
      return;
    }

    logger.info(
      `DevTools 가상 워커풀 생성 요청: 탭 ID ${tabId}`,
      "DevToolsBridge"
    );

    workerPoolService
      .createMockWorkerPool(tabId)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        logger.error("가상 워커풀 생성 중 오류 발생", "DevToolsBridge", error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "알 수 없는 오류",
          timestamp: Date.now(),
        });
      });
  }

  /**
   * 워커풀 설정 업데이트 요청 처리
   */
  private handleUpdatePoolSettingsRequest(
    message: any,
    sendResponse: MessageResponse
  ): void {
    const tabId = message.tabId;
    const settings = message.settings;

    if (!tabId || tabId === -1) {
      logger.error("유효하지 않은 탭 ID입니다", "DevToolsBridge", { tabId });
      sendResponse({
        success: false,
        error: "유효하지 않은 탭 ID입니다",
        timestamp: Date.now(),
      });
      return;
    }

    if (!settings) {
      logger.error("설정 데이터가 없습니다", "DevToolsBridge");
      sendResponse({
        success: false,
        error: "설정 데이터가 없습니다",
        timestamp: Date.now(),
      });
      return;
    }

    logger.info(
      `DevTools 워커풀 설정 업데이트 요청: 탭 ID ${tabId}`,
      "DevToolsBridge",
      settings
    );

    workerPoolService
      .updateWorkerPoolSettings(tabId, settings)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        logger.error(
          "워커풀 설정 업데이트 중 오류 발생",
          "DevToolsBridge",
          error
        );
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "알 수 없는 오류",
          timestamp: Date.now(),
        });
      });
  }

  /**
   * 모든 워커 종료 요청 처리
   */
  private handleTerminateAllWorkersRequest(
    message: any,
    sendResponse: MessageResponse
  ): void {
    const tabId = message.tabId;

    if (!tabId || tabId === -1) {
      logger.error("유효하지 않은 탭 ID입니다", "DevToolsBridge", { tabId });
      sendResponse({
        success: false,
        error: "유효하지 않은 탭 ID입니다",
        timestamp: Date.now(),
      });
      return;
    }

    logger.info(
      `DevTools 모든 워커 종료 요청: 탭 ID ${tabId}`,
      "DevToolsBridge"
    );

    workerPoolService
      .terminateAllWorkers(tabId)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        logger.error("모든 워커 종료 중 오류 발생", "DevToolsBridge", error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "알 수 없는 오류",
          timestamp: Date.now(),
        });
      });
  }
}

// 싱글톤 인스턴스 내보내기
export default new DevToolsBridge();
