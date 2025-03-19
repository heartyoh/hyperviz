/**
 * 워커풀 커넥터
 *
 * 웹 페이지 내의 워커풀과 크롬 확장 간 통신을 담당하는 커넥터
 */

import { EventEmitter } from "events";
import messagingService, { MessageType } from "./messaging-service";
import stateManager from "./state-manager";

// 워커풀 연결 설정 인터페이스
export interface WorkerConnectorConfig {
  securityToken?: string;
  autoConnect?: boolean;
  updateInterval?: number;
  monitoringEnabled?: boolean;
}

// 응답 인터페이스 정의
interface ConnectResponse {
  success: boolean;
  exists: boolean;
  version: string | null;
  info: {
    version: string;
    poolCount: number;
    workerCount: number;
  } | null;
}

interface DataResponse {
  success: boolean;
  data: {
    workers: Record<string, any>;
    stats: Record<string, any>;
    logs: any[];
  } | null;
}

interface WorkerResponse {
  success: boolean;
  error?: string;
  terminatedCount?: number;
}

// 메시지 타입 정의
interface ExtensionMessage {
  source: "hyperviz-extension";
  securityToken: string;
  type: string;
  data?: any;
}

interface PageMessage {
  source: "hyperviz-page";
  securityToken: string;
  type: string;
  data?: any;
  timestamp: number;
}

/**
 * 워커풀 커넥터 클래스
 */
export class WorkerConnector extends EventEmitter {
  private static instance: WorkerConnector;
  private connected: boolean = false;
  private connecting: boolean = false;
  private updateTimer: NodeJS.Timeout | null = null;
  private updateInterval: number;
  private monitoringEnabled: boolean;
  private securityToken: string;
  private currentTabId: number | null = null;
  private injectionStatus: Map<number, boolean> = new Map();

  /**
   * 싱글톤 생성자
   */
  private constructor() {
    super();

    // 기본 설정
    this.updateInterval = 1000;
    this.monitoringEnabled = true;
    this.securityToken = "";

    // 메시징 서비스 이벤트 리스너 설정
    this.setupMessageListeners();
  }

  /**
   * 싱글톤 인스턴스 접근자
   */
  public static getInstance(): WorkerConnector {
    if (!this.instance) {
      this.instance = new WorkerConnector();
    }
    return this.instance;
  }

  /**
   * 커넥터 초기화
   * @param config 커넥터 설정
   */
  public initialize(config: WorkerConnectorConfig = {}): void {
    // 설정 적용
    if (config.updateInterval) this.updateInterval = config.updateInterval;
    if (config.securityToken) this.securityToken = config.securityToken;
    if (config.monitoringEnabled !== undefined)
      this.monitoringEnabled = config.monitoringEnabled;

    // 자동 연결
    if (config.autoConnect) {
      this.getCurrentTabId().then((tabId) => {
        if (tabId) {
          this.connectToTab(tabId);
        }
      });
    }

    // 상태 초기화
    stateManager.setState({
      connected: false,
      connecting: false,
      currentTabId: null,
    });
  }

  /**
   * 특정 탭의 워커풀에 연결
   * @param tabId 연결할 탭 ID
   */
  public async connectToTab(tabId: number): Promise<boolean> {
    if (this.connecting) return false;

    // 탭 ID 유효성 검증 추가
    if (typeof tabId !== "number" || tabId <= 0) {
      console.error("[HyperViz] 유효하지 않은 탭 ID로 연결 시도:", tabId);
      return false;
    }

    try {
      this.connecting = true;
      this.currentTabId = tabId;
      stateManager.setState({ connecting: true, currentTabId: tabId });

      // 확장 프로그램 컨텍스트 유효성 확인
      try {
        // 간단한 API 호출로 컨텍스트 유효성 확인
        await new Promise<void>((resolve) => {
          chrome.runtime.getPlatformInfo(() => {
            if (chrome.runtime.lastError) {
              throw new Error("Extension context invalidated");
            }
            resolve();
          });
        });
      } catch (err) {
        console.error(
          "[HyperViz] 확장 프로그램 컨텍스트가 무효화되었습니다:",
          err
        );
        throw new Error(
          "확장 프로그램 컨텍스트가 무효화되었습니다. 페이지를 새로고침하세요."
        );
      }

      // 해당 탭으로 상태 전환
      await stateManager.switchToTab(tabId);

      // 먼저 워커풀 커넥터 스크립트가 주입되었는지 확인
      if (!this.injectionStatus.get(tabId)) {
        console.log(`[HyperViz] 탭 ${tabId}에 커넥터 스크립트 주입 시도...`);
        const injected = await this.injectConnector(tabId);
        if (!injected) {
          throw new Error("워커풀 커넥터 스크립트 주입 실패");
        }
        console.log(`[HyperViz] 탭 ${tabId}에 커넥터 스크립트 주입 성공`);
      }

      // 콘텐츠 스크립트를 통해 워커풀 연결 시도
      console.log(`[HyperViz] 탭 ${tabId}에 연결 메시지 전송 중...`);
      const response = await messagingService.sendToContentScript(
        tabId,
        MessageType.CONNECT,
        {
          securityToken: this.securityToken,
        }
      );

      // 연결 결과 처리
      if (response && response.success) {
        this.connected = true;
        this.startUpdateTimer(tabId);

        // 상태 업데이트
        stateManager.setState({
          connected: true,
          connecting: false,
          lastConnection: Date.now(),
        });

        console.log(
          `[HyperViz] 탭 ${tabId}의 워커풀 연결 성공:`,
          response.info
        );
        this.emit("connected", { tabId, workerInfo: response.info });
        return true;
      } else {
        // 구체적인 오류 메시지 제공
        const errorMsg =
          response?.error || "알 수 없는 오류로 워커풀 연결 실패";
        console.error(`[HyperViz] 워커풀 연결 응답 오류:`, errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error: unknown) {
      // TypeScript 오류 해결을 위해 error 타입 처리
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // 오류 유형에 따른 구체적인 로그
      if (errorMessage.includes("Cannot access contents of url")) {
        console.error(`[HyperViz] 탭 ${tabId}에 접근 권한이 없습니다:`, error);
      } else if (errorMessage.includes("message port closed")) {
        console.error(
          `[HyperViz] 탭 ${tabId}와의 통신 채널이 닫혔습니다:`,
          error
        );
      } else if (errorMessage.includes("Extension context invalidated")) {
        console.error(
          `[HyperViz] 확장 프로그램 컨텍스트가 무효화되었습니다. 페이지를 새로고침하세요:`,
          error
        );
      } else {
        console.error(`[HyperViz] 탭 ${tabId}에 워커풀 연결 오류:`, error);
      }

      // 상태 업데이트
      stateManager.setState({
        connected: false,
        connecting: false,
      });

      this.emit("error", { error, message: "워커풀 연결 실패" });
      return false;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * 연결 해제
   */
  public async disconnect(): Promise<boolean> {
    if (!this.connected || !this.currentTabId) return false;

    try {
      // 업데이트 타이머 중지
      this.stopUpdateTimer();

      // 콘텐츠 스크립트에 연결 해제 요청
      await messagingService.sendToContentScript(
        this.currentTabId,
        MessageType.DISCONNECT
      );

      // 상태 업데이트
      this.connected = false;
      stateManager.setState({ connected: false });

      this.emit("disconnected");
      return true;
    } catch (error) {
      console.error("워커풀 연결 해제 오류:", error);
      this.emit("error", { error, message: "워커풀 연결 해제 실패" });

      // 오류가 있어도 연결 상태는 해제로 처리
      this.connected = false;
      stateManager.setState({ connected: false });

      return false;
    }
  }

  /**
   * 워커풀 데이터 요청
   */
  public async requestWorkerData(): Promise<boolean> {
    if (!this.connected || !this.currentTabId) return false;

    try {
      // 콘텐츠 스크립트에 데이터 요청
      const response = await messagingService.sendToContentScript(
        this.currentTabId,
        MessageType.REQUEST_DATA
      );

      if (response && response.success) {
        // 데이터 수신 시 상태 업데이트
        const { workers, stats, logs } = response.data;

        stateManager.updateTabState(this.currentTabId, {
          workers: workers || {},
          stats: stats || {},
          logs: logs || [],
        });

        this.emit("dataUpdated", response.data);
        return true;
      } else {
        throw new Error(response?.error || "데이터 요청 실패");
      }
    } catch (error) {
      console.error("워커풀 데이터 요청 오류:", error);
      this.emit("error", { error, message: "워커풀 데이터 요청 실패" });

      // 연결 오류가 지속되면 연결 상태 재설정
      if (this.isConnectionError(error)) {
        this.connected = false;
        stateManager.setState({ connected: false });
      }

      return false;
    }
  }

  /**
   * 워커풀 설정 업데이트
   * @param settings 업데이트할 설정
   */
  public async updateSettings(settings: Record<string, any>): Promise<boolean> {
    if (!this.connected || !this.currentTabId) return false;

    try {
      // 콘텐츠 스크립트에 설정 업데이트 요청
      const response = await messagingService.sendToContentScript(
        this.currentTabId,
        MessageType.UPDATE_SETTINGS,
        { settings }
      );

      if (response && response.success) {
        // 설정 업데이트 성공 시 상태 업데이트
        stateManager.setState({
          settings: {
            ...stateManager.getState().settings,
            ...settings,
          },
        });

        this.emit("settingsUpdated", settings);
        return true;
      } else {
        throw new Error(response?.error || "설정 업데이트 실패");
      }
    } catch (error) {
      console.error("워커풀 설정 업데이트 오류:", error);
      this.emit("error", { error, message: "워커풀 설정 업데이트 실패" });
      return false;
    }
  }

  /**
   * 워커 재시작
   * @param workerId 재시작할 워커 ID
   */
  public async restartWorker(workerId: string): Promise<boolean> {
    if (!this.connected || !this.currentTabId) return false;

    try {
      // 콘텐츠 스크립트에 워커 재시작 요청
      const response = await messagingService.sendToContentScript(
        this.currentTabId,
        MessageType.RESTART_WORKER,
        { workerId }
      );

      if (response && response.success) {
        this.emit("workerRestarted", { workerId });
        return true;
      } else {
        throw new Error(response?.error || "워커 재시작 실패");
      }
    } catch (error) {
      console.error("워커 재시작 오류:", error);
      this.emit("error", { error, message: "워커 재시작 실패" });
      return false;
    }
  }

  /**
   * 워커 종료
   * @param workerId 종료할 워커 ID
   */
  public async terminateWorker(workerId: string): Promise<boolean> {
    if (!this.connected || !this.currentTabId) return false;

    try {
      // 콘텐츠 스크립트에 워커 종료 요청
      const response = await messagingService.sendToContentScript(
        this.currentTabId,
        MessageType.TERMINATE_WORKER,
        { workerId }
      );

      if (response && response.success) {
        this.emit("workerTerminated", { workerId });
        return true;
      } else {
        throw new Error(response?.error || "워커 종료 실패");
      }
    } catch (error) {
      console.error("워커 종료 오류:", error);
      this.emit("error", { error, message: "워커 종료 실패" });
      return false;
    }
  }

  /**
   * 모든 워커 종료
   */
  public async terminateAllWorkers(): Promise<boolean> {
    if (!this.connected || !this.currentTabId) return false;

    try {
      // 콘텐츠 스크립트에 모든 워커 종료 요청
      const response = await messagingService.sendToContentScript(
        this.currentTabId,
        MessageType.TERMINATE_WORKER,
        { all: true }
      );

      if (response && response.success) {
        this.emit("allWorkersTerminated");
        return true;
      } else {
        throw new Error(response?.error || "모든 워커 종료 실패");
      }
    } catch (error) {
      console.error("모든 워커 종료 오류:", error);
      this.emit("error", { error, message: "모든 워커 종료 실패" });
      return false;
    }
  }

  /**
   * 현재 활성화된 탭 ID 가져오기
   */
  public async getCurrentTabId(): Promise<number | null> {
    try {
      // DevTools 환경인지 확인
      if (
        typeof chrome.devtools !== "undefined" &&
        chrome.devtools.inspectedWindow
      ) {
        // DevTools 컨텍스트에서는 inspectedWindow.tabId 사용
        const inspectedTabId = chrome.devtools.inspectedWindow.tabId;

        if (typeof inspectedTabId === "number" && inspectedTabId > 0) {
          console.log(
            `[HyperViz] DevTools에서 검사 중인 탭 ID: ${inspectedTabId}`
          );
          return inspectedTabId;
        } else {
          console.error(
            "[HyperViz] DevTools에서 유효하지 않은 탭 ID:",
            inspectedTabId
          );
          return null;
        }
      }

      // 확장 프로그램 컨텍스트 유효성 확인
      try {
        await new Promise<void>((resolve, reject) => {
          chrome.runtime.getPlatformInfo((info) => {
            if (chrome.runtime.lastError) {
              reject(new Error("Extension context invalidated"));
              return;
            }
            resolve();
          });
        });
      } catch (err) {
        console.error(
          "[HyperViz] 확장 프로그램 컨텍스트가 무효화되었습니다:",
          err
        );
        throw new Error("확장 프로그램 컨텍스트가 무효화되었습니다.");
      }

      // 일반 확장 컨텍스트에서는 기존 방식 사용
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      // 탭 검증 로직 강화
      if (!tabs || tabs.length === 0) {
        console.error("[HyperViz] 활성 탭을 찾을 수 없음");
        return null;
      }

      if (typeof tabs[0].id !== "number" || tabs[0].id <= 0) {
        console.error("[HyperViz] 유효하지 않은 탭 ID:", tabs[0].id);
        return null;
      }

      console.log(`[HyperViz] 활성 탭 ID: ${tabs[0].id}`);
      return tabs[0].id;
    } catch (error) {
      console.error("[HyperViz] 현재 탭 ID 가져오기 오류:", error);

      // 특별한 오류 메시지 처리
      if (
        error instanceof Error &&
        error.message.includes("Extension context invalidated")
      ) {
        console.error(
          "[HyperViz] 확장 프로그램 컨텍스트가 무효화되었습니다. 페이지를 새로고침하세요."
        );
      }

      return null;
    }
  }

  /**
   * 워커풀 커넥터 스크립트 주입
   * @param tabId 대상 탭 ID
   */
  private async injectConnector(tabId: number): Promise<boolean> {
    try {
      // 스크립트 주입 전 타겟 확인
      await messagingService.executeScriptInPage(tabId, () => true);

      // 워커풀 커넥터 스크립트 주입
      const result = await messagingService.executeScriptInPage(
        tabId,
        (securityToken: string) => {
          // 페이지에 이미 커넥터가 있는지 확인
          if (window.__hypervizExtensionConnector) {
            return { success: true, exists: true };
          }

          // 전역 커넥터 객체 생성
          window.__hypervizExtensionConnector = {
            securityToken,
            initialized: true,
            timestamp: Date.now(),
            workerPool: undefined,
            findWorkerPool: () => {
              // 전역 객체에서 유력한 후보 찾기
              if (window.hypervizWorkerPool) {
                return window.hypervizWorkerPool;
              }

              // 확장을 위한 속성명 추가 가능
              const potentialNames = [
                "workerPool",
                "workerPoolManager",
                "hypervizWorkerPool",
              ];
              for (const name of potentialNames) {
                if (window[name]) {
                  return window[name];
                }
              }

              return null;
            },
            sendMessageToExtension: (type: string, data: any) => {
              const message: PageMessage = {
                source: "hyperviz-page",
                securityToken,
                type,
                data,
                timestamp: Date.now(),
              };
              window.postMessage(message, "*");
            },
          };

          // 메시지 리스너 설정
          window.addEventListener(
            "message",
            (event: MessageEvent<ExtensionMessage>) => {
              // 확장 프로그램에서 온 메시지만 처리
              if (
                event.source === window &&
                event.data &&
                event.data.source === "hyperviz-extension" &&
                event.data.securityToken === securityToken
              ) {
                const connector = window.__hypervizExtensionConnector;
                if (!connector) return;

                // 메시지 유형에 따른 처리
                const { type, data } = event.data;

                switch (type) {
                  case "connect":
                    handleConnect();
                    break;

                  case "disconnect":
                    handleDisconnect();
                    break;

                  case "requestData":
                    handleDataRequest();
                    break;

                  case "updateSettings":
                    handleUpdateSettings(data?.settings);
                    break;

                  case "restartWorker":
                    handleRestartWorker(data?.workerId);
                    break;

                  case "terminateWorker":
                    handleTerminateWorker(data?.workerId, data?.all);
                    break;
                }
              }
            }
          );

          // 워커풀 연결 처리
          function handleConnect() {
            const connector = window.__hypervizExtensionConnector;
            if (!connector) return;

            const pool = connector.findWorkerPool();

            const response: ConnectResponse = {
              success: false,
              exists: false,
              version: null,
              info: null,
            };

            if (pool) {
              response.exists = true;
              response.success = true;
              response.version = pool.version || "1.0.0";
              response.info = {
                version: pool.version,
                poolCount: Object.keys(pool.pools || {}).length,
                workerCount: Object.keys(pool.workers || {}).length,
              };

              connector.workerPool = pool;
            }

            connector.sendMessageToExtension("connectResponse", response);
          }

          // 연결 해제 처리
          function handleDisconnect() {
            const connector = window.__hypervizExtensionConnector;
            if (!connector) return;

            connector.workerPool = null;
            connector.sendMessageToExtension("disconnectResponse", {
              success: true,
            });
          }

          // 데이터 요청 처리
          function handleDataRequest() {
            const connector = window.__hypervizExtensionConnector;
            if (!connector) return;

            const pool = connector.workerPool || connector.findWorkerPool();

            const response: DataResponse = {
              success: false,
              data: null,
            };

            if (pool) {
              response.success = true;

              // 워커 정보 수집
              const workers = {};
              if (pool.workers) {
                Object.keys(pool.workers).forEach((id) => {
                  const worker = pool.workers[id];
                  workers[id] = {
                    id,
                    type: worker.type,
                    status: worker.status,
                    tasks: worker.tasks || {},
                    performance: worker.performance || {},
                  };
                });
              }

              // 통계 정보 수집
              const stats = {};
              if (pool.stats) {
                Object.keys(pool.stats).forEach((type) => {
                  stats[type] = pool.stats[type];
                });
              }

              // 로그 정보 수집
              const logs = Array.isArray(pool.logs) ? pool.logs : [];

              response.data = {
                workers,
                stats,
                logs,
              };
            }

            connector.sendMessageToExtension("dataResponse", response);
          }

          // 설정 업데이트 처리
          function handleUpdateSettings(settings) {
            const connector = window.__hypervizExtensionConnector;
            if (!connector) return;

            const pool = connector.workerPool || connector.findWorkerPool();

            const response: WorkerResponse = {
              success: false,
            };

            if (pool) {
              try {
                // 설정 메서드 호출
                if (typeof pool.updateSettings === "function") {
                  pool.updateSettings(settings);
                  response.success = true;
                } else if (typeof pool.setOptions === "function") {
                  pool.setOptions(settings);
                  response.success = true;
                } else {
                  // 직접 속성 설정
                  Object.keys(settings).forEach((key) => {
                    pool[key] = settings[key];
                  });
                  response.success = true;
                }
              } catch (error) {
                response.error =
                  error instanceof Error
                    ? error.message
                    : "알 수 없는 오류가 발생했습니다.";
              }
            }

            connector.sendMessageToExtension("settingsResponse", response);
          }

          // 워커 재시작 처리
          function handleRestartWorker(workerId) {
            const connector = window.__hypervizExtensionConnector;
            if (!connector) return;

            const pool = connector.workerPool || connector.findWorkerPool();

            const response: WorkerResponse = {
              success: false,
            };

            if (pool) {
              try {
                // 재시작 메서드 호출
                if (typeof pool.restartWorker === "function") {
                  pool.restartWorker(workerId);
                  response.success = true;
                } else if (
                  pool.workers &&
                  pool.workers[workerId] &&
                  typeof pool.workers[workerId].restart === "function"
                ) {
                  pool.workers[workerId].restart();
                  response.success = true;
                }
              } catch (error) {
                response.error =
                  error instanceof Error
                    ? error.message
                    : "알 수 없는 오류가 발생했습니다.";
              }
            }

            connector.sendMessageToExtension("workerResponse", response);
          }

          // 워커 종료 처리
          function handleTerminateWorker(workerId, all) {
            const connector = window.__hypervizExtensionConnector;
            if (!connector) return;

            const pool = connector.workerPool || connector.findWorkerPool();

            const response: WorkerResponse = {
              success: false,
            };

            if (pool) {
              try {
                if (all) {
                  // 모든 워커 종료
                  if (typeof pool.terminateAllWorkers === "function") {
                    pool.terminateAllWorkers();
                    response.success = true;
                  } else {
                    // 개별 워커 종료 메서드 여러 번 호출
                    let terminated = 0;
                    if (pool.workers) {
                      Object.keys(pool.workers).forEach((id) => {
                        if (typeof pool.terminateWorker === "function") {
                          pool.terminateWorker(id);
                          terminated++;
                        } else if (
                          typeof pool.workers[id].terminate === "function"
                        ) {
                          pool.workers[id].terminate();
                          terminated++;
                        }
                      });
                    }
                    response.success = terminated > 0;
                    response.terminatedCount = terminated;
                  }
                } else {
                  // 단일 워커 종료
                  if (typeof pool.terminateWorker === "function") {
                    pool.terminateWorker(workerId);
                    response.success = true;
                  } else if (
                    pool.workers &&
                    pool.workers[workerId] &&
                    typeof pool.workers[workerId].terminate === "function"
                  ) {
                    pool.workers[workerId].terminate();
                    response.success = true;
                  }
                }
              } catch (error) {
                response.error =
                  error instanceof Error
                    ? error.message
                    : "알 수 없는 오류가 발생했습니다.";
              }
            }

            connector.sendMessageToExtension("workerResponse", response);
          }

          return { success: true, exists: false };
        },
        this.securityToken
      );

      // 주입 결과 확인
      if (result && result.success) {
        this.injectionStatus.set(tabId, true);
        return true;
      }

      return false;
    } catch (error) {
      console.error("워커풀 커넥터 스크립트 주입 오류:", error);
      return false;
    }
  }

  /**
   * 메시지 수신 리스너 설정
   */
  private setupMessageListeners(): void {
    // 메시징 서비스 이벤트 리스닝
    messagingService.on(MessageType.CONNECT, (data) => {
      if (data && data.tabId) {
        this.connectToTab(data.tabId);
      }
    });

    messagingService.on(MessageType.DISCONNECT, () => {
      this.disconnect();
    });

    messagingService.on(MessageType.REQUEST_DATA, () => {
      this.requestWorkerData();
    });

    messagingService.on(MessageType.UPDATE_SETTINGS, (data) => {
      if (data && data.settings) {
        this.updateSettings(data.settings);
      }
    });

    messagingService.on(MessageType.RESTART_WORKER, (data) => {
      if (data && data.workerId) {
        this.restartWorker(data.workerId);
      }
    });

    messagingService.on(MessageType.TERMINATE_WORKER, (data) => {
      if (data && data.all) {
        this.terminateAllWorkers();
      } else if (data && data.workerId) {
        this.terminateWorker(data.workerId);
      }
    });
  }

  /**
   * 주기적 데이터 업데이트 시작
   * @param tabId 대상 탭 ID
   */
  private startUpdateTimer(tabId: number): void {
    // 이전 타이머 정리
    this.stopUpdateTimer();

    // 모니터링이 비활성화되어 있으면 타이머 시작하지 않음
    if (!this.monitoringEnabled) return;

    // 정기 업데이트 시작
    this.updateTimer = setInterval(() => {
      // 연결 상태 확인
      if (this.connected && tabId === this.currentTabId) {
        this.requestWorkerData();
      } else {
        this.stopUpdateTimer();
      }
    }, this.updateInterval);
  }

  /**
   * 주기적 데이터 업데이트 중지
   */
  private stopUpdateTimer(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * 연결 관련 오류인지 확인
   * @param error 오류 객체
   */
  private isConnectionError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message || "";
    const connectionErrors = [
      "could not establish connection",
      "connection failed",
      "no tab with id",
      "cannot access contents of url",
      "the message port closed",
      "workerPool을 찾을 수 없습니다",
    ];

    return connectionErrors.some((msg) =>
      errorMessage.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * 현재 활성화된 탭 감지
   */
  public async detectActiveTab(): Promise<number | null> {
    try {
      // DevTools 환경인지 확인
      if (
        typeof chrome.devtools !== "undefined" &&
        chrome.devtools.inspectedWindow
      ) {
        // DevTools 컨텍스트에서는 inspectedWindow.tabId 사용
        const inspectedTabId = chrome.devtools.inspectedWindow.tabId;

        if (typeof inspectedTabId === "number" && inspectedTabId > 0) {
          console.log(
            `[HyperViz] DevTools에서 검사 중인 탭 ID: ${inspectedTabId}`
          );
          return inspectedTabId;
        } else {
          console.error(
            "[HyperViz] DevTools에서 유효하지 않은 탭 ID:",
            inspectedTabId
          );
          return null;
        }
      }

      // 일반 확장 컨텍스트에서는 기존 방식 사용
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      // 명시적 검증 추가
      if (!tabs || tabs.length === 0) {
        console.error("[HyperViz] 활성 탭을 찾을 수 없음");
        return null;
      }

      const tabId = tabs[0].id;

      // 추가 검증: 탭 ID가 유효한 숫자인지 확인
      if (typeof tabId !== "number" || tabId <= 0) {
        console.error("[HyperViz] 유효하지 않은 탭 ID:", tabId);
        return null;
      }

      return tabId;
    } catch (error) {
      console.error("[HyperViz] 활성 탭 감지 오류:", error);
      return null;
    }
  }

  /**
   * 현재 탭에 연결
   */
  public async connectToCurrentTab(): Promise<boolean> {
    const tabId = await this.detectActiveTab();
    if (!tabId) {
      throw new Error("활성 탭을 찾을 수 없습니다.");
    }
    return this.connectToTab(tabId);
  }
}

// 커넥터 인스턴스 내보내기
export default WorkerConnector.getInstance();

// 전역 타입 확장
declare global {
  interface Window {
    __hypervizExtensionConnector?: {
      securityToken: string;
      initialized: boolean;
      timestamp: number;
      workerPool?: any;
      findWorkerPool: () => any;
      sendMessageToExtension: (type: string, data: any) => void;
    };
    hypervizWorkerPool?: any;
    [key: string]: any;
  }
}
