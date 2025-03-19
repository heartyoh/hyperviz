/**
 * 스크립트 주입 서비스
 */

class ScriptInjector {
  /**
   * 콘텐츠 스크립트 주입
   * @param tabId 대상 탭 ID
   */
  public async injectContentScript(tabId: number): Promise<boolean> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      console.log(`[HyperViz] 콘텐츠 스크립트 주입 성공 (탭 ID: ${tabId})`);
      return true;
    } catch (error) {
      console.error(
        `[HyperViz] 콘텐츠 스크립트 주입 실패 (탭 ID: ${tabId}):`,
        error
      );
      return false;
    }
  }

  /**
   * 스크립트 API를 사용하여 스크립트 실행
   * @param targetTabId 대상 탭 ID
   */
  public async executeScriptWithScriptingAPI(
    targetTabId: number
  ): Promise<boolean> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: function setupWorkerPoolMonitoring() {
          // 워커풀 모니터 정의
          const workerPoolMonitor = {
            initialized: false,
            workerPools: {},
            logs: [],
            monitoringInterval: null,

            // 초기화
            init() {
              if (this.initialized) return true;

              try {
                console.log("[HyperViz] 워커풀 모니터 초기화 중...");
                this.hookLogger();
                this.initialized = true;
                console.log("[HyperViz] 워커풀 모니터 초기화 완료");
                return true;
              } catch (error) {
                console.error("[HyperViz] 워커풀 모니터 초기화 실패:", error);
                return false;
              }
            },

            // 로거 후킹
            hookLogger() {
              // 필요한 경우 구현
            },

            // 로그 캡처
            captureLog(level, args) {
              const message = args
                .map((arg) => {
                  if (typeof arg === "object") {
                    try {
                      return JSON.stringify(arg);
                    } catch (e) {
                      return String(arg);
                    }
                  }
                  return String(arg);
                })
                .join(" ");

              this.logs.push({
                level,
                message,
                timestamp: Date.now(),
              });

              // 로그 개수 제한
              if (this.logs.length > 100) {
                this.logs.shift();
              }
            },

            // 모니터링 시작
            startMonitoring(interval = 1000) {
              if (this.monitoringInterval) {
                clearInterval(this.monitoringInterval);
              }

              this.monitoringInterval = setInterval(() => {
                try {
                  // 워커풀 데이터 확인...
                } catch (error) {
                  console.error("[HyperViz] 워커풀 모니터링 오류:", error);
                }
              }, interval);

              console.log(
                `[HyperViz] 워커풀 모니터링 시작 (${interval}ms 간격)`
              );
              return true;
            },
          };

          // 전역 객체에 할당
          window.hypervizMonitor = workerPoolMonitor;
          workerPoolMonitor.init();

          return { success: true };
        },
      });

      return (
        results && results[0] && results[0].result && results[0].result.success
      );
    } catch (error) {
      console.error(
        `[HyperViz] 스크립팅 API 실행 실패 (탭 ID: ${targetTabId}):`,
        error
      );
      return false;
    }
  }

  /**
   * 콘텐츠 스크립트 존재 확인 또는 주입
   * @param tabId 대상 탭 ID
   */
  public async checkOrInjectContentScript(tabId: number): Promise<boolean> {
    try {
      // 핑 메시지 보내서 콘텐츠 스크립트 존재 확인
      return new Promise((resolve) => {
        try {
          chrome.tabs.sendMessage(tabId, { type: "ping" }, (response) => {
            // 응답이 있으면 콘텐츠 스크립트가 이미 존재함
            if (chrome.runtime.lastError) {
              console.log(
                `[HyperViz] 콘텐츠 스크립트가 없습니다. 주입 시도...`
              );
              // 콘텐츠 스크립트 주입
              this.injectContentScript(tabId).then(resolve);
            } else {
              console.log(`[HyperViz] 콘텐츠 스크립트가 이미 존재합니다`);
              resolve(true);
            }
          });
        } catch (error) {
          console.error(`[HyperViz] 콘텐츠 스크립트 확인 중 오류:`, error);
          // 오류 발생 시 주입 시도
          this.injectContentScript(tabId).then(resolve);
        }
      });
    } catch (error) {
      console.error(`[HyperViz] 콘텐츠 스크립트 확인/주입 실패:`, error);
      return false;
    }
  }

  /**
   * 페이지에 워커풀 가상 생성 스크립트 주입
   * @param tabId 대상 탭 ID
   */
  public async injectMockWorkerPool(tabId: number): Promise<boolean> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: function () {
          try {
            // 이미 존재하는지 확인
            if (typeof window.hypervizWorkerPool !== "undefined") {
              return {
                success: true,
                exists: true,
                message: "워커풀이 이미 존재합니다",
              };
            }

            // 가상 워커풀 생성
            window.hypervizWorkerPool = {
              version: "mock-1.0.0",
              getStats: function () {
                return {
                  workers: [
                    {
                      id: "mock-worker-1",
                      status: "idle",
                      tasks: [],
                      createdAt: Date.now(),
                    },
                    {
                      id: "mock-worker-2",
                      status: "active",
                      tasks: ["mock-task-1"],
                      createdAt: Date.now(),
                    },
                  ],
                  tasks: {
                    total: 10,
                    active: 2,
                    waiting: 3,
                    completed: 4,
                    failed: 1,
                  },
                  timestamp: Date.now(),
                };
              },
              getInfo: function () {
                return { status: "mock", version: "mock-1.0.0" };
              },
            };

            console.log("[HyperViz] 가상 워커풀이 생성되었습니다");

            return {
              success: true,
              created: true,
              message: "가상 워커풀이 생성되었습니다",
            };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : "알 수 없는 오류",
            };
          }
        },
      });

      return (
        results && results[0] && results[0].result && results[0].result.success
      );
    } catch (error) {
      console.error(
        `[HyperViz] 가상 워커풀 생성 실패 (탭 ID: ${tabId}):`,
        error
      );
      return false;
    }
  }

  /**
   * 페이지 내 WorkerPool 확인 (Scripting API 사용)
   * @param tabId 대상 탭 ID
   */
  public async checkWorkerPoolInPage(tabId: number): Promise<any> {
    try {
      // 대상 탭이 유효한지 확인
      if (!tabId || tabId < 0) {
        console.error("[HyperViz] 유효하지 않은 탭 ID:", tabId);
        return {
          success: false,
          exists: false,
          error: "유효하지 않은 탭 ID",
          timestamp: Date.now(),
        };
      }

      console.log(`[HyperViz] 탭 ${tabId}에서 워커풀 확인 시작...`);

      // Scripting API로 페이지 내 코드 실행
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: function checkHypervizWorkerPool() {
          try {
            // 디버깅을 위한 로그 추가
            console.log(
              "[HyperViz] 페이지 내에서 hypervizWorkerPool 확인 중..."
            );

            // hypervizWorkerPool 존재 확인
            const exists = typeof window.hypervizWorkerPool !== "undefined";
            console.log("[HyperViz] 워커풀 존재 여부:", exists);

            const result = {
              success: true,
              exists,
              timestamp: Date.now(),
            };

            // 워커풀이 존재하면 추가 정보 수집
            if (exists) {
              const pool = window.hypervizWorkerPool;
              result["version"] = pool.version || "unknown";
              console.log("[HyperViz] 워커풀 버전:", result["version"]);

              // getInfo 메서드가 있으면 호출
              if (typeof pool.getInfo === "function") {
                try {
                  result["info"] = pool.getInfo();
                  console.log("[HyperViz] 워커풀 정보:", result["info"]);
                } catch (infoError) {
                  const errorMsg =
                    infoError instanceof Error
                      ? infoError.message
                      : "알 수 없는 오류";
                  console.error("[HyperViz] getInfo 호출 중 오류:", errorMsg);
                  result["info"] = {
                    status: "오류",
                    error: errorMsg,
                  };
                }
              } else {
                console.log("[HyperViz] getInfo 메서드가 없습니다");
                result["info"] = { status: "정보 없음" };
              }

              // getStats 메서드가 있으면 샘플 데이터 가져오기
              if (typeof pool.getStats === "function") {
                try {
                  result["stats"] = pool.getStats();
                  console.log("[HyperViz] 워커풀 통계 샘플:", result["stats"]);
                } catch (statsError) {
                  const errorMsg =
                    statsError instanceof Error
                      ? statsError.message
                      : "알 수 없는 오류";
                  console.error("[HyperViz] getStats 호출 중 오류:", errorMsg);
                  result["statsError"] = errorMsg;
                }
              } else {
                console.log("[HyperViz] getStats 메서드가 없습니다");
              }
            } else {
              console.warn(
                "[HyperViz] 페이지에서 hypervizWorkerPool을 찾을 수 없습니다"
              );
              // window 객체에 접근 가능한 속성 목록 확인 (디버깅용)
              try {
                const availableGlobals = Object.getOwnPropertyNames(window)
                  .filter(
                    (prop) =>
                      prop.includes("hyper") ||
                      prop.includes("worker") ||
                      prop.includes("pool")
                  )
                  .join(", ");
                console.log(
                  "[HyperViz] 페이지의 관련 전역 객체:",
                  availableGlobals || "없음"
                );
              } catch (e) {
                console.error("[HyperViz] 전역 객체 검사 중 오류:", e);
              }
            }

            return result;
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : "알 수 없는 오류";
            console.error("[HyperViz] 워커풀 확인 중 오류:", errorMsg);
            return {
              success: false,
              exists: false,
              error: errorMsg,
              timestamp: Date.now(),
            };
          }
        },
      });

      // 결과 확인
      if (results && results[0] && results[0].result) {
        console.log(
          `[HyperViz] 탭 ${tabId}에서 워커풀 확인 결과:`,
          results[0].result
        );
        return results[0].result;
      }

      console.warn(`[HyperViz] 탭 ${tabId}에서 스크립트 실행 결과가 없습니다`);
      return {
        success: false,
        exists: false,
        error: "스크립트 실행 결과가 없습니다",
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "알 수 없는 오류";
      const errorStack = error instanceof Error ? error.stack : null;
      console.error(
        `[HyperViz] 워커풀 확인 중 오류 (탭 ID: ${tabId}):`,
        errorMsg
      );
      if (errorStack) {
        console.error(`[HyperViz] 오류 스택:`, errorStack);
      }

      return {
        success: false,
        exists: false,
        error: errorMsg,
        errorStack: errorStack,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 페이지에서 워커풀 데이터 가져오기 (Scripting API 사용)
   * @param tabId 대상 탭 ID
   */
  public async getWorkerPoolDataFromPage(tabId: number): Promise<any> {
    try {
      // 대상 탭이 유효한지 확인
      if (!tabId || tabId < 0) {
        console.error("[HyperViz] 유효하지 않은 탭 ID:", tabId);
        return {
          success: false,
          error: "유효하지 않은 탭 ID",
          timestamp: Date.now(),
        };
      }

      console.log(`[HyperViz] 탭 ${tabId}에서 워커풀 데이터 가져오기 시작...`);

      // 먼저 워커풀이 존재하는지 확인
      const checkResult = await this.checkWorkerPoolInPage(tabId);
      if (!checkResult.exists) {
        console.warn(`[HyperViz] 탭 ${tabId}에서 워커풀을 찾을 수 없습니다`);
        return {
          success: false,
          error: "HyperViz WorkerPool이 초기화되지 않았습니다",
          checkResult: checkResult,
          timestamp: Date.now(),
        };
      }

      // Scripting API로 페이지 내 코드 실행
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: function getHypervizWorkerPoolData() {
          try {
            console.log(
              "[HyperViz] 페이지 내에서 워커풀 데이터 가져오기 시작..."
            );

            // hypervizWorkerPool 존재 확인
            if (typeof window.hypervizWorkerPool === "undefined") {
              console.error(
                "[HyperViz] hypervizWorkerPool이 정의되지 않았습니다"
              );
              return {
                success: false,
                error: "HyperViz WorkerPool이 초기화되지 않았습니다",
                timestamp: Date.now(),
              };
            }

            // getStats 메서드 확인
            const pool = window.hypervizWorkerPool;
            console.log("[HyperViz] 워커풀 객체:", Object.keys(pool));

            if (typeof pool.getStats !== "function") {
              console.error(
                "[HyperViz] WorkerPool에 getStats 메서드가 없습니다"
              );
              return {
                success: false,
                error: "WorkerPool에 getStats 메서드가 없습니다",
                availableMethods: Object.keys(pool)
                  .filter((key) => typeof pool[key] === "function")
                  .join(", "),
                timestamp: Date.now(),
              };
            }

            // 데이터 가져오기
            try {
              console.log("[HyperViz] getStats 메서드 호출 중...");
              const stats = pool.getStats();
              console.log("[HyperViz] 워커풀 통계 데이터:", stats);
              return {
                success: true,
                data: stats,
                timestamp: Date.now(),
              };
            } catch (statsError) {
              const errorMsg =
                statsError instanceof Error
                  ? statsError.message
                  : "통계 데이터 가져오기 오류";
              console.error("[HyperViz] getStats 호출 중 오류:", errorMsg);
              return {
                success: false,
                error: errorMsg,
                errorStack:
                  statsError instanceof Error ? statsError.stack : null,
                timestamp: Date.now(),
              };
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : "알 수 없는 오류";
            console.error(
              "[HyperViz] 워커풀 데이터 가져오기 중 오류:",
              errorMsg
            );
            return {
              success: false,
              error: errorMsg,
              errorStack: error instanceof Error ? error.stack : null,
              timestamp: Date.now(),
            };
          }
        },
      });

      // 결과 확인
      if (results && results[0] && results[0].result) {
        console.log(
          `[HyperViz] 탭 ${tabId}에서 워커풀 데이터 가져오기 결과:`,
          results[0].result
        );
        return results[0].result;
      }

      console.warn(`[HyperViz] 탭 ${tabId}에서 스크립트 실행 결과가 없습니다`);
      return {
        success: false,
        error: "스크립트 실행 결과가 없습니다",
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "알 수 없는 오류";
      const errorStack = error instanceof Error ? error.stack : null;
      console.error(
        `[HyperViz] 워커풀 데이터 가져오기 중 오류 (탭 ID: ${tabId}):`,
        errorMsg
      );
      if (errorStack) {
        console.error(`[HyperViz] 오류 스택:`, errorStack);
      }

      return {
        success: false,
        error: errorMsg,
        errorStack: errorStack,
        timestamp: Date.now(),
      };
    }
  }
}

// 싱글톤 인스턴스 내보내기
export default new ScriptInjector();
