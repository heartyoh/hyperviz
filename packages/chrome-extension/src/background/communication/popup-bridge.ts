/**
 * 팝업 통신 브릿지
 */

import tabManager from "../services/tab-manager";
import connectionManager from "../services/connection-manager";
import workerPoolService from "../services/worker-pool-service";
import logger from "../utils/logger";

class PopupBridge {
  private popupPort: chrome.runtime.Port | null = null;

  /**
   * 팝업 연결 처리
   * @param port 연결 포트
   */
  public handlePopupConnect(port: chrome.runtime.Port): void {
    logger.info("팝업 연결됨", "PopupBridge");

    // 포트 저장
    this.popupPort = port;

    // 메시지 리스너 설정
    port.onMessage.addListener(this.handlePopupMessage.bind(this));

    // 연결 해제 리스너 설정
    port.onDisconnect.addListener(this.handlePopupDisconnect.bind(this));

    // 연결 상태 전송
    this.sendConnectionStatusToPopup();
  }

  /**
   * 팝업 메시지 처리
   * @param message 수신된 메시지
   */
  public handlePopupMessage(message: any): void {
    logger.debug(`팝업 메시지 수신: ${message.type}`, "PopupBridge", message);

    // 탭 연결 요청
    if (message.type === "popup_connect_request") {
      this.handlePopupConnectRequest(message.tabId);
    }

    // 탭 연결 해제 요청
    else if (message.type === "popup_disconnect_request") {
      this.handlePopupDisconnectRequest(message.tabId);
    }

    // 설정 변경 요청
    else if (message.type === "popup_update_settings") {
      this.handlePopupUpdateSettingsRequest(message.tabId, message.settings);
    }

    // 데이터 요청
    else if (message.type === "popup_fetch_data") {
      this.handlePopupFetchDataRequest(message.tabId);
    }

    // 처리되지 않은 메시지 타입
    else {
      logger.warn(
        `처리되지 않은 팝업 메시지 타입: ${message.type}`,
        "PopupBridge"
      );
    }
  }

  /**
   * 팝업 연결 해제 처리
   */
  public handlePopupDisconnect(): void {
    logger.info("팝업 연결 해제됨", "PopupBridge");
    this.popupPort = null;
  }

  /**
   * 팝업에 연결 상태 전송
   */
  public sendConnectionStatusToPopup(): void {
    if (!this.popupPort) return;

    try {
      const connectedTabs = tabManager.getAllConnectedTabs();

      this.sendPopupMessage("connection_status", {
        tabs: connectedTabs,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error("팝업에 연결 상태 전송 중 오류 발생", "PopupBridge", error);
    }
  }

  /**
   * 팝업에 설정 전송
   */
  public sendSettingsToPopup(settings: any): void {
    if (!this.popupPort) return;
    this.sendPopupMessage("settings", settings);
  }

  /**
   * 팝업에 메시지 전송
   * @param type 메시지 유형
   * @param data 메시지 데이터
   */
  public sendPopupMessage(type: string, data: any = {}): void {
    if (!this.popupPort) {
      logger.warn("팝업이 연결되어 있지 않습니다", "PopupBridge");
      return;
    }

    try {
      this.popupPort.postMessage({
        type,
        data,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error("팝업 메시지 전송 중 오류 발생", "PopupBridge", error);
      // 포트 오류 시 연결 해제로 간주
      this.popupPort = null;
    }
  }

  /**
   * 팝업 연결 요청 처리
   * @param tabId 대상 탭 ID
   */
  private handlePopupConnectRequest(tabId: number): void {
    logger.info(`팝업 연결 요청: 탭 ID ${tabId}`, "PopupBridge");

    if (!tabId) {
      logger.error("유효하지 않은 탭 ID입니다", "PopupBridge");
      this.sendPopupMessage("connect_response", {
        success: false,
        error: "유효하지 않은 탭 ID입니다",
        timestamp: Date.now(),
      });
      return;
    }

    connectionManager
      .connectToWorkerPool(tabId)
      .then((result) => {
        this.sendPopupMessage("connect_response", {
          ...result,
          tabId,
        });

        // 연결 상태 업데이트 전송
        this.sendConnectionStatusToPopup();
      })
      .catch((error) => {
        logger.error("연결 중 오류 발생", "PopupBridge", error);
        this.sendPopupMessage("connect_response", {
          success: false,
          error: error instanceof Error ? error.message : "알 수 없는 오류",
          tabId,
          timestamp: Date.now(),
        });
      });
  }

  /**
   * 팝업 연결 해제 요청 처리
   * @param tabId 대상 탭 ID
   */
  private handlePopupDisconnectRequest(tabId: number): void {
    logger.info(`팝업 연결 해제 요청: 탭 ID ${tabId}`, "PopupBridge");

    if (!tabId) {
      logger.error("유효하지 않은 탭 ID입니다", "PopupBridge");
      this.sendPopupMessage("disconnect_response", {
        success: false,
        error: "유효하지 않은 탭 ID입니다",
        timestamp: Date.now(),
      });
      return;
    }

    connectionManager
      .disconnectFromWorkerPool(tabId)
      .then((result) => {
        this.sendPopupMessage("disconnect_response", {
          ...result,
          tabId,
        });

        // 연결 상태 업데이트 전송
        this.sendConnectionStatusToPopup();
      })
      .catch((error) => {
        logger.error("연결 해제 중 오류 발생", "PopupBridge", error);
        this.sendPopupMessage("disconnect_response", {
          success: false,
          error: error instanceof Error ? error.message : "알 수 없는 오류",
          tabId,
          timestamp: Date.now(),
        });
      });
  }

  /**
   * 팝업 설정 업데이트 요청 처리
   * @param tabId 대상 탭 ID
   * @param settings 업데이트할 설정
   */
  private handlePopupUpdateSettingsRequest(tabId: number, settings: any): void {
    logger.info(
      `팝업 설정 업데이트 요청: 탭 ID ${tabId}`,
      "PopupBridge",
      settings
    );

    if (!tabId) {
      logger.error("유효하지 않은 탭 ID입니다", "PopupBridge");
      this.sendPopupMessage("update_settings_response", {
        success: false,
        error: "유효하지 않은 탭 ID입니다",
        timestamp: Date.now(),
      });
      return;
    }

    if (!settings) {
      logger.error("설정 데이터가 없습니다", "PopupBridge");
      this.sendPopupMessage("update_settings_response", {
        success: false,
        error: "설정 데이터가 없습니다",
        timestamp: Date.now(),
      });
      return;
    }

    workerPoolService
      .updateWorkerPoolSettings(tabId, settings)
      .then((result) => {
        this.sendPopupMessage("update_settings_response", {
          ...result,
          tabId,
        });
      })
      .catch((error) => {
        logger.error("설정 업데이트 중 오류 발생", "PopupBridge", error);
        this.sendPopupMessage("update_settings_response", {
          success: false,
          error: error instanceof Error ? error.message : "알 수 없는 오류",
          tabId,
          timestamp: Date.now(),
        });
      });
  }

  /**
   * 팝업 데이터 요청 처리
   * @param tabId 대상 탭 ID
   */
  private handlePopupFetchDataRequest(tabId: number): void {
    logger.debug(`팝업 데이터 요청: 탭 ID ${tabId}`, "PopupBridge");

    if (!tabId) {
      logger.error("유효하지 않은 탭 ID입니다", "PopupBridge");
      this.sendPopupMessage("fetch_data_response", {
        success: false,
        error: "유효하지 않은 탭 ID입니다",
        timestamp: Date.now(),
      });
      return;
    }

    workerPoolService
      .fetchWorkerPoolData(tabId)
      .then((result) => {
        this.sendPopupMessage("fetch_data_response", {
          ...result,
          tabId,
        });
      })
      .catch((error) => {
        logger.error("데이터 가져오기 중 오류 발생", "PopupBridge", error);
        this.sendPopupMessage("fetch_data_response", {
          success: false,
          error: error instanceof Error ? error.message : "알 수 없는 오류",
          tabId,
          timestamp: Date.now(),
        });
      });
  }
}

// 싱글톤 인스턴스 내보내기
export default new PopupBridge();
