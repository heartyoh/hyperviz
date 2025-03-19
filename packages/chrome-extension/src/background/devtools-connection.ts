/**
 * HyperViz 크롬 확장 프로그램 - DevTools 연결 관리
 */

import logger from "./utils/logger";

// DevTools 세션 정보 관리를 위한 인터페이스
interface DevToolsSession {
  port: chrome.runtime.Port;
  tabId: number;
  sessionId: string;
  connected: boolean;
  lastActive: number;
  pendingRequests: Map<
    string,
    {
      resolve: (response: any) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >;
}

// DevTools 연결 추적을 위한 맵
// 키: 탭 ID, 값: 해당 탭의 DevTools 세션 배열
const devToolsConnections = new Map<number, DevToolsSession[]>();

// 확장 프로그램 세션 ID와 포트 연결 매핑
const portToSessionMap = new Map<chrome.runtime.Port, DevToolsSession>();

/**
 * 포트 이름이 유효한지 확인
 */
function isValidPortName(portName: unknown): portName is string {
  // 기본 타입 체크
  if (typeof portName !== "string") {
    logger.error("유효하지 않은 포트 이름 타입", "DevToolsConnection", {
      type: typeof portName,
      value: String(portName),
    });
    return false;
  }

  // 형식 체크 (devtools-숫자-세션ID)
  if (!portName.startsWith("devtools-")) {
    return false; // DevTools 연결이 아님 (오류 아님)
  }

  const parts = portName.split("-");
  if (parts.length < 3) {
    logger.error("잘못된 DevTools 포트 이름 형식", "DevToolsConnection", {
      name: portName,
    });
    return false;
  }

  const tabIdStr = parts[1];
  const tabId = parseInt(tabIdStr, 10);

  if (isNaN(tabId) || tabId < 0) {
    logger.error("유효하지 않은 DevTools 탭 ID", "DevToolsConnection", {
      name: portName,
      tabIdStr,
    });
    return false;
  }

  return true;
}

/**
 * 포트 이름에서 정보 추출
 */
function extractPortInfo(
  portName: string
): { tabId: number; sessionId: string } | null {
  try {
    const parts = portName.split("-");
    const tabIdStr = parts[1];
    const tabId = parseInt(tabIdStr, 10);
    const sessionId = parts.slice(2).join("-"); // 세션 ID에 하이픈이 포함될 수 있음

    if (isNaN(tabId) || tabId < 0 || !sessionId) {
      return null;
    }

    return { tabId, sessionId };
  } catch (error) {
    logger.error("포트 정보 추출 중 오류", "DevToolsConnection", error);
    return null;
  }
}

/**
 * DevTools 연결 리스너 설정
 */
export function setupDevToolsConnectionListeners() {
  logger.info("DevTools 연결 리스너 설정 중...", "DevToolsConnection");

  // 연결 리스너
  chrome.runtime.onConnect.addListener((port) => {
    try {
      // 포트 이름이 올바른 형식인지 확인 ("devtools-숫자-세션ID" 형식)
      if (!isValidPortName(port.name)) {
        return; // 유효하지 않은 포트 이름
      }

      logger.debug(`포트 연결 요청 수신: ${port.name}`, "DevToolsConnection");

      // 포트 정보 추출
      const portInfo = extractPortInfo(port.name);
      if (!portInfo) {
        logger.error("포트 정보 추출 실패", "DevToolsConnection", {
          name: port.name,
        });
        return;
      }

      const { tabId, sessionId } = portInfo;

      logger.info(
        `DevTools 연결됨: 탭 ID ${tabId}, 세션 ID ${sessionId}`,
        "DevToolsConnection"
      );

      // 새 DevTools 세션 생성
      const session: DevToolsSession = {
        port,
        tabId,
        sessionId,
        connected: true,
        lastActive: Date.now(),
        pendingRequests: new Map(),
      };

      // 포트와 세션 매핑
      portToSessionMap.set(port, session);

      // 탭 ID에 해당하는 세션 배열 가져오기 또는 생성
      if (!devToolsConnections.has(tabId)) {
        devToolsConnections.set(tabId, []);
      }

      // 기존 세션 확인 및 업데이트
      const sessions = devToolsConnections.get(tabId);
      if (!sessions) {
        logger.error("세션 배열 가져오기 실패", "DevToolsConnection", {
          tabId,
        });
        return;
      }

      const existingSessionIndex = sessions.findIndex(
        (s) => s.sessionId === sessionId
      );

      if (existingSessionIndex >= 0) {
        // 기존 세션 연결 해제
        const existingSession = sessions[existingSessionIndex];
        try {
          existingSession.port.disconnect();
          portToSessionMap.delete(existingSession.port);
        } catch (e) {
          logger.warn("기존 연결 해제 중 오류", "DevToolsConnection", e);
        }

        // 세션 업데이트
        sessions[existingSessionIndex] = session;
      } else {
        // 새 세션 추가
        sessions.push(session);
      }

      // 연결 해제 리스너
      port.onDisconnect.addListener((disconnectedPort) => {
        handlePortDisconnect(disconnectedPort);
      });

      // 메시지 리스너
      port.onMessage.addListener((message, senderPort) => {
        handlePortMessage(message, senderPort);
      });
    } catch (error) {
      logger.error("DevTools 연결 처리 중 오류 발생", "DevToolsConnection", {
        error: error instanceof Error ? error.message : "알 수 없는 오류",
        stack: error instanceof Error ? error.stack : null,
        portName: port.name,
      });
    }
  });

  // 세션 정리 스케줄러 시작
  startSessionCleanupScheduler();

  logger.info("DevTools 연결 리스너 설정 완료", "DevToolsConnection");
}

/**
 * 포트 연결 해제 처리
 */
function handlePortDisconnect(port: chrome.runtime.Port) {
  try {
    // 세션 정보 조회
    const session = portToSessionMap.get(port);
    if (!session) {
      return;
    }

    logger.info(
      `DevTools 연결 해제됨: 탭 ID ${session.tabId}, 세션 ID ${session.sessionId}`,
      "DevToolsConnection"
    );

    // 세션 상태 업데이트
    session.connected = false;

    // 포트-세션 매핑에서 제거
    portToSessionMap.delete(port);

    // 모든 대기 중인 요청 취소
    session.pendingRequests.forEach((request, requestId) => {
      clearTimeout(request.timer);
      request.reject(new Error("연결이 끊어졌습니다"));
    });
    session.pendingRequests.clear();

    // 주기적 정리 작업에서 처리되므로 여기서는 세션 배열에서 제거하지 않음
  } catch (error) {
    logger.error("포트 연결 해제 처리 중 오류", "DevToolsConnection", error);
  }
}

/**
 * 포트 메시지 처리
 */
function handlePortMessage(message: any, port: chrome.runtime.Port) {
  try {
    // 세션 정보 조회
    const session = portToSessionMap.get(port);
    if (!session) {
      logger.warn("알 수 없는 포트에서 메시지 수신", "DevToolsConnection", {
        message,
        portName: port.name,
      });
      return;
    }

    // 세션 활성 시간 업데이트
    session.lastActive = Date.now();

    logger.debug(
      `DevTools 메시지 수신: 탭 ID ${session.tabId}, 세션 ID ${session.sessionId}`,
      "DevToolsConnection",
      message
    );

    // 초기화 메시지 처리
    if (message.type === "devtools-init") {
      // 초기화 확인 응답
      sendResponse(port, {
        requestId: message.requestId,
        type: "devtools-init-response",
        success: true,
        sessionId: session.sessionId,
        timestamp: Date.now(),
      });
      return;
    }

    // ping 메시지 처리
    if (message.type === "ping") {
      sendResponse(port, {
        requestId: message.requestId,
        type: "pong",
        success: true,
        timestamp: Date.now(),
      });
      return;
    }

    // 요청 메시지 처리 및 응답 전송
    processDevToolsRequest(message, session);
  } catch (error) {
    logger.error("포트 메시지 처리 중 오류", "DevToolsConnection", {
      error: error instanceof Error ? error.message : "알 수 없는 오류",
      stack: error instanceof Error ? error.stack : null,
      message,
      portName: port.name,
    });

    // 오류 응답 전송 시도
    try {
      if (message.requestId) {
        sendResponse(port, {
          requestId: message.requestId,
          error: error instanceof Error ? error.message : "알 수 없는 오류",
          success: false,
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      // 응답 전송 중 추가 오류 무시
    }
  }
}

/**
 * DevTools 요청 처리
 */
function processDevToolsRequest(message: any, session: DevToolsSession) {
  const { tabId, port } = session;

  // DevTools 메시지 타입에 따른 처리
  switch (message.type) {
    case "devtools_connect_request":
      // 워커풀 연결 요청
      // 여기서 메시지 처리 구현 (기존 코드 참조)
      // 결과를 sendResponse를 통해 전송
      // 예: DevToolsBridge.handleConnectRequest 호출 후 결과 전송
      const responseData = {
        success: true,
        exists: true, // 실제 구현에서는 워커풀 검사 결과에 따라 설정
        version: "1.0.0", // 실제 구현에서는 실제 버전
        timestamp: Date.now(),
      };

      sendResponse(port, {
        requestId: message.requestId,
        ...responseData,
      });
      break;

    case "devtools_fetch_data":
      // 워커풀 데이터 요청
      // 예: workerPoolService.fetchWorkerPoolData(tabId) 호출 후 결과 전송
      // 임시 데이터로 응답
      sendResponse(port, {
        requestId: message.requestId,
        success: true,
        data: {
          workers: [
            { id: "worker-1", status: "active", tasks: ["task-1"] },
            { id: "worker-2", status: "idle", tasks: [] },
          ],
          tasks: {
            total: 10,
            active: 1,
            waiting: 3,
            completed: 5,
            failed: 1,
          },
          timestamp: Date.now(),
        },
      });
      break;

    // 다른 메시지 타입 처리 추가
    // ...

    default:
      logger.warn(
        `처리되지 않은 DevTools 메시지 타입: ${message.type}`,
        "DevToolsConnection"
      );
      sendResponse(port, {
        requestId: message.requestId,
        error: `지원되지 않는 메시지 타입: ${message.type}`,
        success: false,
        timestamp: Date.now(),
      });
  }
}

/**
 * 포트로 응답 전송
 */
function sendResponse(port: chrome.runtime.Port, response: any) {
  try {
    port.postMessage(response);
  } catch (error) {
    logger.error("응답 전송 중 오류", "DevToolsConnection", {
      error: error instanceof Error ? error.message : "알 수 없는 오류",
      stack: error instanceof Error ? error.stack : null,
      response,
    });

    // 포트 매핑에서 제거 (연결이 끊어진 것으로 간주)
    const session = portToSessionMap.get(port);
    if (session) {
      session.connected = false;
      portToSessionMap.delete(port);
    }
  }
}

/**
 * 세션 정리 스케줄러 시작
 */
function startSessionCleanupScheduler() {
  // 30초마다 비활성 세션 정리
  setInterval(() => {
    cleanupInactiveSessions();
  }, 30000);
}

/**
 * 비활성 세션 정리
 */
function cleanupInactiveSessions() {
  const now = Date.now();
  const inactivityThreshold = 5 * 60 * 1000; // 5분

  devToolsConnections.forEach((sessions, tabId) => {
    // 연결 끊어진 세션 또는 오래된 세션 필터링
    const activeSessions = sessions.filter((session) => {
      const isActive =
        session.connected && now - session.lastActive < inactivityThreshold;

      if (!isActive && session.connected) {
        // 연결은 되어 있지만 오래 비활성 상태인 경우 연결 해제
        try {
          session.port.disconnect();
          portToSessionMap.delete(session.port);
        } catch (e) {
          // 연결 해제 중 오류 무시
        }
      }

      return isActive;
    });

    if (activeSessions.length === 0) {
      // 활성 세션이 없으면 탭 항목 삭제
      devToolsConnections.delete(tabId);
    } else if (activeSessions.length !== sessions.length) {
      // 활성 세션만 유지
      devToolsConnections.set(tabId, activeSessions);
    }
  });
}

/**
 * DevTools에 워커풀 데이터 전송
 */
export function sendWorkerPoolDataToDevTools(tabId: number, data: any) {
  if (!devToolsConnections.has(tabId)) {
    return;
  }

  const sessions = devToolsConnections.get(tabId);
  if (!sessions) {
    logger.warn(`세션 배열 없음: 탭 ID ${tabId}`, "DevToolsConnection");
    return;
  }

  const activeSessions = sessions.filter((session) => session.connected);

  if (activeSessions.length === 0) {
    return;
  }

  const dataMessage = {
    type: "workerPoolDataUpdate",
    data,
    timestamp: Date.now(),
  };

  // 모든 활성 세션에 데이터 전송
  activeSessions.forEach((session) => {
    try {
      session.port.postMessage(dataMessage);
    } catch (error) {
      logger.error(
        `DevTools 데이터 전송 오류: 탭 ID ${tabId}`,
        "DevToolsConnection",
        error
      );

      // 오류 발생 시 연결 상태 업데이트
      session.connected = false;
      portToSessionMap.delete(session.port);
    }
  });
}

/**
 * DevTools 연결 여부 확인
 */
export function isDevToolsConnected(tabId: number): boolean {
  if (!devToolsConnections.has(tabId)) {
    return false;
  }

  const sessions = devToolsConnections.get(tabId);
  if (!sessions) {
    return false;
  }

  return sessions.some((session) => session.connected);
}

/**
 * 모든 DevTools 연결 해제
 */
export function disconnectAllDevTools() {
  // 모든 탭의 모든 세션 연결 해제
  devToolsConnections.forEach((sessions) => {
    sessions.forEach((session) => {
      if (session.connected) {
        try {
          session.port.disconnect();
          portToSessionMap.delete(session.port);
          session.connected = false;
        } catch (error) {
          logger.warn(
            `DevTools 연결 해제 오류: 탭 ID ${session.tabId}`,
            "DevToolsConnection",
            error
          );
        }
      }
    });
  });

  // 모든 맵 초기화
  devToolsConnections.clear();
  portToSessionMap.clear();

  logger.info("모든 DevTools 연결이 해제되었습니다", "DevToolsConnection");
}

// DevTools 연결 리스너 설정
setupDevToolsConnectionListeners();
