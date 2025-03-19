/**
 * 메시징 서비스
 *
 * 크롬 확장 프로그램 내부 컴포넌트 간 통신을 위한 통합 메시징 서비스
 * 백그라운드, 콘텐츠 스크립트, 팝업, DevTools 간의 일관된 통신 인터페이스 제공
 */

import { EventEmitter } from "events";
import stateManager, { WorkerPoolState } from "./state-manager";

// 메시지 타입 정의
export enum MessageType {
  // 연결 관련
  CONNECT = "connect",
  DISCONNECT = "disconnect",
  CONNECTION_STATUS = "connectionStatus",

  // 데이터 요청 및 응답
  REQUEST_DATA = "requestData",
  WORKER_STATS = "workerStats",
  WORKER_LOGS = "workerLogs",

  // 설정 관련
  UPDATE_SETTINGS = "updateSettings",
  SETTINGS_UPDATED = "settingsUpdated",

  // 제어 명령
  RESTART_WORKER = "restartWorker",
  TERMINATE_WORKER = "terminateWorker",
  COMMAND_RESULT = "commandResult",

  // 보안 관련
  AUTH_REQUEST = "authRequest",
  AUTH_RESPONSE = "authResponse",

  // 기타
  PING = "ping",
  PONG = "pong",
  ERROR = "error",
}

// 메시지 인터페이스
export interface Message {
  type: MessageType | string;
  data?: any;
  tabId?: number;
  origin?: string;
  timestamp?: number;
  token?: string; // 보안 토큰
}

/**
 * 메시징 서비스 클래스
 * 싱글톤 패턴으로 구현
 */
export class MessagingService extends EventEmitter {
  private static instance: MessagingService;
  private port: chrome.runtime.Port | null = null;
  private connectionName: string = "";
  private securityToken: string = "";
  private pendingRequests: Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();

  private constructor() {
    super();

    // 일반 메시지 리스너 등록
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.onMessage.addListener(
        this.handleRuntimeMessage.bind(this)
      );
    }

    // 보안 토큰 생성
    this.generateSecurityToken();
  }

  /**
   * 싱글톤 인스턴스 접근자
   */
  public static getInstance(): MessagingService {
    if (!this.instance) {
      this.instance = new MessagingService();
    }
    return this.instance;
  }

  /**
   * 포트 연결 설정
   * @param name 연결 이름
   */
  public connect(name: string): boolean {
    if (this.port) {
      this.disconnect();
    }

    try {
      this.connectionName = name;
      this.port = chrome.runtime.connect({ name });

      // 포트 메시지 리스너 설정
      this.port.onMessage.addListener(this.handlePortMessage.bind(this));

      // 연결 해제 리스너 설정
      this.port.onDisconnect.addListener(() => {
        this.port = null;
        this.emit("disconnected", { reason: "Port disconnected" });

        // 대기 중인 모든 요청 거부
        this.rejectAllPendingRequests("연결이 해제되었습니다");
      });

      this.emit("connected", { name });
      return true;
    } catch (error) {
      console.error("포트 연결 오류:", error);
      this.emit("error", { error, message: "포트 연결 실패" });
      return false;
    }
  }

  /**
   * 연결 해제
   */
  public disconnect(): void {
    if (this.port) {
      try {
        this.port.disconnect();
      } catch (error) {
        console.error("포트 연결 해제 오류:", error);
      } finally {
        this.port = null;
        this.connectionName = "";
      }
    }

    // 대기 중인 모든 요청 거부
    this.rejectAllPendingRequests("연결이 해제되었습니다");
  }

  /**
   * 포트를 통한 메시지 전송
   * @param type 메시지 타입
   * @param data 메시지 데이터
   */
  public sendMessage(type: MessageType | string, data: any = {}): void {
    const message: Message = {
      type,
      data,
      timestamp: Date.now(),
      token: this.securityToken,
    };

    // 현재 탭 ID 추가
    const currentTabId = stateManager.getState().currentTabId;
    if (currentTabId !== null && currentTabId !== undefined) {
      message.tabId = currentTabId;
    }

    try {
      if (this.port) {
        // 포트를 통한 전송
        this.port.postMessage(message);
      } else {
        // 일반 메시지 전송으로 폴백
        chrome.runtime.sendMessage(message);
      }
    } catch (error) {
      console.error("메시지 전송 오류:", error);
      this.emit("error", { error, message: "메시지 전송 실패" });

      // 일반 메시지 전송으로 재시도
      try {
        chrome.runtime.sendMessage(message);
      } catch (retryError) {
        console.error("메시지 재전송 오류:", retryError);
      }
    }
  }

  /**
   * 응답을 기다리는 메시지 전송
   * @param type 메시지 타입
   * @param data 메시지 데이터
   * @param timeout 타임아웃(ms)
   */
  public async sendMessageWithResponse(
    type: MessageType | string,
    data: any = {},
    timeout: number = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // 고유 요청 ID 생성
      const requestId = this.generateRequestId();

      // 타임아웃 설정
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error("요청 시간 초과"));
        }
      }, timeout);

      // 요청 등록
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      // 요청 ID 포함하여 메시지 전송
      this.sendMessage(type, {
        ...data,
        requestId,
      });
    });
  }

  /**
   * 콘텐츠 스크립트에 메시지 전송
   * @param tabId 대상 탭 ID
   * @param type 메시지 타입
   * @param data 메시지 데이터
   */
  public async sendToContentScript(
    tabId: number,
    type: MessageType | string,
    data: any = {}
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // 확장 프로그램 컨텍스트 유효성 확인
      try {
        if (!chrome.runtime || chrome.runtime.id === undefined) {
          reject(new Error("Extension context invalidated"));
          return;
        }
      } catch (error) {
        console.error("[HyperViz] 확장 프로그램 컨텍스트 확인 오류:", error);
        reject(new Error("Extension context invalidated"));
        return;
      }

      // 탭 ID 유효성 검증
      if (typeof tabId !== "number" || tabId <= 0) {
        reject(new Error("유효하지 않은 탭 ID입니다."));
        return;
      }

      // 데이터 직렬화 가능 여부 확인
      try {
        // 직렬화 테스트 (JSON 변환 후 다시 객체로)
        const testSerialize = JSON.parse(JSON.stringify({ type, data }));
        if (!testSerialize) {
          throw new Error("직렬화할 수 없는 데이터입니다.");
        }
      } catch (error) {
        console.error("[HyperViz] 메시지 직렬화 오류:", error);
        reject(new Error("직렬화할 수 없는 데이터입니다."));
        return;
      }

      // 시간 초과 처리를 위한 타이머
      const messageTimeout = setTimeout(() => {
        console.warn(
          `[HyperViz] 메시지 응답 시간 초과 (tabId: ${tabId}, type: ${type})`
        );
        reject(new Error("메시지 응답 시간 초과"));
      }, 5000);

      try {
        chrome.tabs.sendMessage(
          tabId,
          {
            type,
            data,
            timestamp: Date.now(),
            token: this.securityToken,
          },
          (response) => {
            clearTimeout(messageTimeout);

            // 런타임 오류 확인
            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message || "";
              console.error("[HyperViz] 메시지 전송 오류:", errorMsg);

              // 특정 오류 메시지에 대한 사용자 친화적인 처리
              if (errorMsg.includes("message port closed")) {
                reject(
                  new Error(
                    "통신 채널이 닫혔습니다. 페이지를 새로고침하거나 확장 프로그램을 다시 로드하세요."
                  )
                );
              } else if (errorMsg.includes("Extension context invalidated")) {
                reject(
                  new Error(
                    "확장 프로그램 컨텍스트가 무효화되었습니다. 페이지를 새로고침하세요."
                  )
                );
              } else if (errorMsg.includes("Receiving end does not exist")) {
                reject(
                  new Error(
                    "콘텐츠 스크립트가 로드되지 않았습니다. 페이지를 새로고침하세요."
                  )
                );
              } else {
                reject(new Error(errorMsg));
              }
              return;
            }

            // 응답이 없는 경우 처리
            if (response === undefined) {
              console.warn(
                "[HyperViz] 메시지 응답이 없습니다. 탭이 응답하지 않을 수 있습니다."
              );
              resolve(null); // 응답이 없는 경우에도 처리 가능하도록 null 반환
              return;
            }

            resolve(response);
          }
        );
      } catch (error) {
        clearTimeout(messageTimeout);

        console.error("[HyperViz] 메시지 전송 오류:", error);

        // 확장 프로그램 컨텍스트 무효화 확인
        try {
          if (!chrome.runtime || chrome.runtime.id === undefined) {
            reject(
              new Error(
                "확장 프로그램 컨텍스트가 무효화되었습니다. 페이지를 새로고침하세요."
              )
            );
            return;
          }
        } catch (contextError) {
          reject(
            new Error(
              "확장 프로그램 컨텍스트가 무효화되었습니다. 페이지를 새로고침하세요."
            )
          );
          return;
        }

        reject(error);
      }
    });
  }

  /**
   * 스크립트 실행을 통한 페이지와 통신
   * @param tabId 대상 탭 ID
   * @param func 실행할 함수
   * @param args 함수 인자
   */
  public async executeScriptInPage(
    tabId: number,
    func: Function,
    ...args: any[]
  ): Promise<any> {
    try {
      // 확장 프로그램 컨텍스트 유효성 확인
      if (!chrome.runtime || chrome.runtime.id === undefined) {
        throw new Error("Extension context invalidated");
      }

      // 탭 ID 유효성 검증
      if (typeof tabId !== "number" || tabId <= 0) {
        throw new Error("유효하지 않은 탭 ID입니다.");
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: func as any,
        args: args,
      });

      if (results && results[0]) {
        return results[0].result;
      }

      throw new Error("스크립트 실행 결과가 없습니다");
    } catch (error) {
      console.error("[HyperViz] 스크립트 실행 오류:", error);

      // 특정 오류 메시지에 대한 더 자세한 로그
      if (error instanceof Error) {
        if (error.message.includes("Cannot access contents of url")) {
          console.error(
            "[HyperViz] 탭에 접근 권한이 없습니다. 확장 프로그램 권한을 확인하세요."
          );
        } else if (error.message.includes("Extension context invalidated")) {
          console.error(
            "[HyperViz] 확장 프로그램 컨텍스트가 무효화되었습니다. 페이지를 새로고침하세요."
          );
        }
      }

      throw error;
    }
  }

  /**
   * 포트 메시지 핸들러
   * @param message 수신 메시지
   */
  private handlePortMessage(message: Message): void {
    // 기본 보안 검증
    if (!this.validateMessage(message)) {
      console.warn("유효하지 않은 메시지:", message);
      return;
    }

    // 응답 메시지인 경우
    if (
      message.data?.requestId &&
      this.pendingRequests.has(message.data.requestId)
    ) {
      const request = this.pendingRequests.get(message.data.requestId)!;
      clearTimeout(request.timeout);
      this.pendingRequests.delete(message.data.requestId);

      if (message.type === MessageType.ERROR) {
        request.reject(new Error(message.data.error || "알 수 없는 오류"));
      } else {
        request.resolve(message.data);
      }
      return;
    }

    // 이벤트 발행
    this.emit(message.type, message.data);

    // 상태 업데이트 메시지 처리
    this.updateStateFromMessage(message);
  }

  /**
   * 일반 런타임 메시지 핸들러
   * @param message 수신 메시지
   * @param sender 발신자 정보
   * @param sendResponse 응답 콜백
   */
  private handleRuntimeMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): boolean {
    // 기본 타입 검증
    if (!message || typeof message !== "object") {
      console.warn("[HyperViz] 유효하지 않은 메시지 형식:", message);
      sendResponse({ error: "유효하지 않은 메시지 형식" });
      return false;
    }

    // 메시지 직렬화 검증
    try {
      // 직렬화 테스트 (실제로 직렬화 수행)
      JSON.stringify(message);
    } catch (error) {
      console.error("[HyperViz] 직렬화할 수 없는 메시지 수신:", error);
      sendResponse({ error: "직렬화할 수 없는 메시지" });
      return false;
    }

    // 기본 보안 검증
    if (!this.validateMessage(message)) {
      console.warn("[HyperViz] 유효하지 않은 런타임 메시지:", message);
      sendResponse({ error: "유효하지 않은 메시지" });
      return false;
    }

    try {
      // 이벤트 발행
      this.emit(message.type, {
        ...message.data,
        sender,
      });

      // 상태 업데이트 메시지 처리
      this.updateStateFromMessage(message);

      // 응답이 필요한 메시지 처리
      if (message.data?.requestId) {
        // 비동기 처리가 필요한 경우는 true 반환하여 sendResponse 콜백 유지
        return true;
      }

      // 처리 성공 응답
      sendResponse({ success: true });
      return false;
    } catch (error) {
      console.error("[HyperViz] 메시지 처리 오류:", error);
      sendResponse({ error: "메시지 처리 중 오류 발생" });
      return false;
    }
  }

  /**
   * 메시지 기반 상태 업데이트
   * @param message 메시지
   */
  private updateStateFromMessage(message: Message): void {
    switch (message.type) {
      case MessageType.CONNECTION_STATUS:
        stateManager.setState({
          connected: message.data?.connected || false,
          connecting: message.data?.connecting || false,
          lastConnection: message.data?.timestamp || undefined,
        });
        break;

      case MessageType.WORKER_STATS:
        if (message.tabId) {
          stateManager.updateTabState(message.tabId, {
            workers: message.data?.workers || {},
            stats: message.data?.stats || {},
          });
        }
        break;

      case MessageType.WORKER_LOGS:
        if (message.tabId && message.data?.logs) {
          stateManager.updateTabState(message.tabId, {
            logs: message.data.logs,
          });
        }
        break;

      case MessageType.SETTINGS_UPDATED:
        if (message.data?.settings) {
          stateManager.setState({
            settings: message.data.settings,
          });
        }
        break;
    }
  }

  /**
   * 메시지 유효성 검증
   * @param message 검증할 메시지
   */
  private validateMessage(message: any): boolean {
    if (!message || typeof message !== "object") return false;
    if (!message.type || typeof message.type !== "string") return false;

    // 보안 토큰이 설정된 경우, 토큰 검증 (단, 시스템 메시지는 제외)
    const systemMessages = [
      MessageType.AUTH_REQUEST,
      MessageType.AUTH_RESPONSE,
      MessageType.PING,
      MessageType.PONG,
    ];
    if (
      this.securityToken &&
      !systemMessages.includes(message.type as MessageType) &&
      message.token !== this.securityToken
    ) {
      // 토큰 불일치시 인증 요청
      this.emit(MessageType.AUTH_REQUEST, {});
      return false;
    }

    return true;
  }

  /**
   * 보안 토큰 생성
   * @returns 생성된 토큰
   */
  private generateSecurityToken(): string {
    // 간단한 토큰 생성 구현
    const tokenParts = [
      Date.now().toString(36),
      Math.random().toString(36).substring(2),
      navigator.userAgent
        .split("")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0)
        .toString(36),
    ];

    this.securityToken = tokenParts.join("-");
    return this.securityToken;
  }

  /**
   * 요청 ID 생성
   * @returns 고유 요청 ID
   */
  private generateRequestId(): string {
    return [
      Date.now().toString(36),
      Math.random().toString(36).substring(2),
    ].join("-");
  }

  /**
   * 모든 대기 중인 요청 거부
   * @param reason 거부 이유
   */
  private rejectAllPendingRequests(reason: string): void {
    if (this.pendingRequests.size > 0) {
      console.warn(
        `[HyperViz] ${this.pendingRequests.size}개의 대기 중인 요청이 취소됨: ${reason}`
      );

      for (const [requestId, request] of this.pendingRequests.entries()) {
        clearTimeout(request.timeout);
        request.reject(new Error(reason));
        this.pendingRequests.delete(requestId);
      }
    }
  }
}

// 기본 인스턴스 내보내기
export default MessagingService.getInstance();
