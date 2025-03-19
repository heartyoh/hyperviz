/**
 * 워커풀 관련 서비스
 */

import scriptInjector from "./script-injector";

class WorkerPoolService {
  /**
   * 워커풀 데이터 가져오기
   * @param tabId 대상 탭 ID
   */
  public async fetchWorkerPoolData(
    tabId: number
  ): Promise<Record<string, any>> {
    return new Promise((resolve) => {
      try {
        // 콘텐츠 스크립트에 데이터 요청
        chrome.tabs.sendMessage(
          tabId,
          { type: "fetch_worker_pool_data" },
          (response) => {
            // 런타임 오류 확인
            if (chrome.runtime.lastError) {
              console.warn(
                "[HyperViz] 데이터 요청 오류:",
                chrome.runtime.lastError
              );
              resolve({
                success: false,
                error: chrome.runtime.lastError.message,
                timestamp: Date.now(),
              });
              return;
            }

            // 응답이 없는 경우
            if (!response) {
              resolve({
                success: false,
                error: "응답 없음",
                timestamp: Date.now(),
              });
              return;
            }

            // 성공 응답
            resolve({
              success: true,
              data: response.data,
              timestamp: Date.now(),
            });
          }
        );
      } catch (error) {
        console.error("[HyperViz] 워커풀 데이터 요청 중 오류:", error);
        resolve({
          success: false,
          error: error instanceof Error ? error.message : "알 수 없는 오류",
          timestamp: Date.now(),
        });
      }
    });
  }

  /**
   * 워커풀 설정 업데이트
   * @param tabId 대상 탭 ID
   * @param settings 업데이트할 설정
   */
  public async updateWorkerPoolSettings(
    tabId: number,
    settings: Record<string, any>
  ): Promise<Record<string, any>> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: function (settings) {
          try {
            const pool = window.hypervizWorkerPool?.manager;
            if (!pool) {
              // 워커풀 매니저가 없는 경우 가상 설정 처리
              if (typeof window.hypervizWorkerPool !== "undefined") {
                window.hypervizWorkerPool.settings = settings;
                console.log(
                  "[HyperViz] 가상 워커풀 설정이 업데이트되었습니다:",
                  settings
                );
                return { success: true };
              }
              return {
                success: false,
                error: "워커풀 매니저를 찾을 수 없습니다",
              };
            }

            // 실제 워커풀 매니저가 있는 경우 설정 적용
            if (typeof pool.updateSettings === "function") {
              pool.updateSettings(settings);
              return { success: true };
            } else if (typeof pool.setOptions === "function") {
              pool.setOptions(settings);
              return { success: true };
            }

            return {
              success: false,
              error: "워커풀 매니저에 적용 가능한 설정 메서드가 없습니다",
            };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : "알 수 없는 오류",
            };
          }
        },
        args: [settings],
      });

      if (results && results[0] && results[0].result) {
        return results[0].result;
      }

      return {
        success: false,
        error: "알 수 없는 오류",
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("[HyperViz] 워커풀 설정 업데이트 중 오류:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "알 수 없는 오류",
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 모든 워커 종료
   * @param tabId 대상 탭 ID
   */
  public async terminateAllWorkers(
    tabId: number
  ): Promise<Record<string, any>> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: function () {
          try {
            const pool = window.hypervizWorkerPool;
            if (!pool) {
              return {
                success: false,
                error: "워커풀을 찾을 수 없습니다",
              };
            }

            // 워커풀에 종료 메서드가 있는 경우
            if (typeof pool.terminateAllWorkers === "function") {
              pool.terminateAllWorkers();
              return { success: true };
            } else if (typeof pool.terminateAll === "function") {
              pool.terminateAll();
              return { success: true };
            } else if (pool.workers && Array.isArray(pool.workers)) {
              // 워커 배열에 직접 접근 가능한 경우
              pool.workers.forEach((worker: any) => {
                if (worker && typeof worker.terminate === "function") {
                  worker.terminate();
                }
              });
              return { success: true };
            }

            return {
              success: false,
              error: "워커 종료 메서드를 찾을 수 없습니다",
            };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : "알 수 없는 오류",
            };
          }
        },
      });

      if (results && results[0] && results[0].result) {
        return results[0].result;
      }

      return {
        success: false,
        error: "알 수 없는 오류",
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("[HyperViz] 워커 종료 중 오류:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "알 수 없는 오류",
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 가상 워커풀 생성
   * @param tabId 대상 탭 ID
   */
  public async createMockWorkerPool(
    tabId: number
  ): Promise<Record<string, any>> {
    try {
      const result = await scriptInjector.injectMockWorkerPool(tabId);

      return {
        success: result,
        message: result
          ? "가상 워커풀이 생성되었습니다"
          : "가상 워커풀 생성 실패",
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("[HyperViz] 가상 워커풀 생성 중 오류:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "알 수 없는 오류",
        timestamp: Date.now(),
      };
    }
  }
}

// 싱글톤 인스턴스 내보내기
export default new WorkerPoolService();
