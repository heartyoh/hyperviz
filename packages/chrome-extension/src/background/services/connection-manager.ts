/**
 * 연결 관리 서비스
 */

import tabManager from "./tab-manager";
import scriptInjector from "./script-injector";

class ConnectionManager {
  private reconnectTimer: number | null = null;
  private reconnectAttempts: number = 0;

  /**
   * 워커풀에 연결
   * @param targetTabId 대상 탭 ID
   */
  public async connectToWorkerPool(
    targetTabId: number
  ): Promise<Record<string, any>> {
    return new Promise((resolve) => {
      // 워커풀 연결 전 콘텐츠 스크립트 확인 및 주입
      scriptInjector
        .checkOrInjectContentScript(targetTabId)
        .then((injected) => {
          if (!injected) {
            console.warn("[HyperViz] 콘텐츠 스크립트를 주입할 수 없습니다.");
            resolve({
              success: false,
              message: "콘텐츠 스크립트를 주입할 수 없습니다.",
            });
            return;
          }

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

                // 응답이 없는 경우
                if (!response) {
                  console.warn("[HyperViz] 연결 요청에 대한 응답이 없습니다.");
                  resolve({
                    success: false,
                    message: "연결 요청에 대한 응답이 없습니다.",
                  });
                  return;
                }

                // 성공적으로 연결된 경우
                if (response.success) {
                  console.log("[HyperViz] 워커풀 연결 성공");

                  // 탭 상태 업데이트
                  tabManager.updateTabStatus(
                    targetTabId,
                    response.exists,
                    true
                  );

                  resolve({
                    success: true,
                    exists: response.exists,
                    version: response.version,
                    info: response.info,
                    timestamp: response.timestamp,
                  });
                } else {
                  console.warn("[HyperViz] 워커풀 연결 실패:", response.error);

                  // 탭 상태 업데이트
                  tabManager.updateTabStatus(targetTabId, false, false);

                  resolve({
                    success: false,
                    message: response.error || "알 수 없는 오류",
                  });
                }
              }
            );
          } catch (msgError) {
            console.error("[HyperViz] 메시지 전송 중 예외:", msgError);
            resolve({
              success: false,
              message: `메시지 전송 오류: ${
                msgError instanceof Error ? msgError.message : "알 수 없는 오류"
              }`,
            });
          }
        })
        .catch((error) => {
          console.error("[HyperViz] 콘텐츠 스크립트 확인/주입 중 오류:", error);
          resolve({
            success: false,
            message: `콘텐츠 스크립트 오류: ${
              error instanceof Error ? error.message : "알 수 없는 오류"
            }`,
          });
        });
    });
  }

  /**
   * 워커풀 연결 해제
   * @param targetTabId 대상 탭 ID
   */
  public async disconnectFromWorkerPool(
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
                console.warn(
                  `탭 메시지 전송 오류: ${chrome.runtime.lastError.message}`
                );

                // 연결 상태 업데이트
                tabManager.updateTabStatus(targetTabId, false, false);

                resolve({ success: true, message: "연결이 해제되었습니다." });
                return;
              }

              // 응답이 있는 경우
              if (response && response.success) {
                console.log("[HyperViz] 워커풀 연결 해제 성공");

                // 연결 상태 업데이트
                tabManager.updateTabStatus(targetTabId, true, false);

                resolve({
                  success: true,
                  message: "연결이 해제되었습니다.",
                  timestamp: response.timestamp,
                });
              } else {
                console.warn("[HyperViz] 워커풀 연결 해제 실패");

                // 연결 상태 업데이트
                tabManager.updateTabStatus(targetTabId, false, false);

                resolve({ success: true, message: "연결이 해제되었습니다." });
              }
            }
          );
        } catch (msgError) {
          console.error("[HyperViz] 메시지 전송 중 예외:", msgError);

          // 연결 상태 업데이트
          tabManager.updateTabStatus(targetTabId, false, false);

          resolve({ success: true, message: "연결이 해제되었습니다." });
        }
      } catch (error) {
        console.error("[HyperViz] 연결 해제 시도 중 예외:", error);

        // 연결 상태 업데이트
        tabManager.updateTabStatus(targetTabId, false, false);

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
   * 재연결 예약
   */
  public scheduleReconnect(): void {
    // 이미 재연결 타이머가 있는 경우 취소
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts = 0;

    // 1초 후 재연결 시도
    this.reconnectTimer = setTimeout(() => {
      this.attemptReconnect();
    }, 1000) as unknown as number;
  }

  /**
   * 재연결 시도
   */
  private attemptReconnect(): void {
    this.reconnectAttempts++;

    // 최대 시도 횟수 (10회) 초과 시 중단
    if (this.reconnectAttempts > 10) {
      console.error("[HyperViz] 최대 재연결 시도 횟수 초과됨");
      this.reconnectTimer = null;
      return;
    }

    console.log(`[HyperViz] 재연결 시도 중... (${this.reconnectAttempts}/10)`);

    // 활성 탭 가져오기
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0 || !tabs[0].id) {
        console.warn("[HyperViz] 활성 탭을 찾을 수 없습니다. 재시도 예약...");
        // 3초 후 다시 시도
        this.reconnectTimer = setTimeout(() => {
          this.attemptReconnect();
        }, 3000) as unknown as number;
        return;
      }

      const tabId = tabs[0].id;

      // 연결 시도
      this.connectToWorkerPool(tabId)
        .then((result) => {
          if (result.success) {
            console.log("[HyperViz] 재연결 성공!");
            this.reconnectTimer = null;
          } else {
            console.warn(
              `[HyperViz] 재연결 실패: ${result.message}. 재시도 예약...`
            );
            // 3초 후 다시 시도
            this.reconnectTimer = setTimeout(() => {
              this.attemptReconnect();
            }, 3000) as unknown as number;
          }
        })
        .catch((error) => {
          console.error("[HyperViz] 재연결 시도 중 오류:", error);
          // 3초 후 다시 시도
          this.reconnectTimer = setTimeout(() => {
            this.attemptReconnect();
          }, 3000) as unknown as number;
        });
    });
  }

  /**
   * 연결 상태 전체 업데이트
   * @param isConnected 연결 상태
   */
  public updateConnectionStatus(isConnected: boolean): void {
    // 필요한 경우 전체 연결 상태 관리 로직 구현...
  }
}

// 싱글톤 인스턴스 내보내기
export default new ConnectionManager();
