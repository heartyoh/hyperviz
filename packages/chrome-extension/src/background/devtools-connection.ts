/**
 * HyperViz 크롬 확장 프로그램 - 개발자 도구 연결 처리
 */

// DevTools 연결 관리를 위한 인터페이스
interface DevToolsConnection {
  port: chrome.runtime.Port;
  tabId: number;
  lastActive: number;
}

// DevTools 연결 저장소
const devToolsConnections = new Map<number, DevToolsConnection>();

// DevTools 연결 리스너
export function setupDevToolsConnectionListeners() {
  // DevTools에서 연결 요청이 왔을 때
  chrome.runtime.onConnect.addListener((port) => {
    // DevTools 연결인지 확인
    if (port.name !== "devtools-connection") {
      return;
    }

    console.log("DevTools 연결이 시작되었습니다.");

    let devToolsConnection: DevToolsConnection | null = null;

    // DevTools로부터 메시지 수신
    port.onMessage.addListener((message) => {
      // 초기화 메시지인 경우
      if (message.type === "devtools-init" && message.tabId) {
        const tabId = message.tabId;

        // 연결 정보 저장
        devToolsConnection = {
          port,
          tabId,
          lastActive: Date.now(),
        };

        devToolsConnections.set(tabId, devToolsConnection);
        console.log(`탭 ${tabId}에 대한 DevTools 연결이 등록되었습니다.`);

        // 연결 확인 응답
        port.postMessage({
          type: "connection-established",
          tabId: tabId,
        });
      }
    });

    // 연결 해제 시
    port.onDisconnect.addListener(() => {
      if (devToolsConnection) {
        devToolsConnections.delete(devToolsConnection.tabId);
        console.log(
          `탭 ${devToolsConnection.tabId}에 대한 DevTools 연결이 해제되었습니다.`
        );
      }
    });
  });
}

// 특정 탭의 DevTools로 메시지 전송
export function sendMessageToDevTools(tabId: number, message: any) {
  const connection = devToolsConnections.get(tabId);

  if (connection) {
    try {
      connection.port.postMessage(message);
      connection.lastActive = Date.now();
      return true;
    } catch (error) {
      console.error(`DevTools로 메시지 전송 실패 (탭 ${tabId}):`, error);
      // 연결 오류 시 연결 제거
      devToolsConnections.delete(tabId);
      return false;
    }
  }

  return false;
}

// 모든 DevTools로 메시지 전송
export function broadcastToDevTools(message: any) {
  let successCount = 0;

  devToolsConnections.forEach((connection, tabId) => {
    if (sendMessageToDevTools(tabId, message)) {
      successCount++;
    }
  });

  return successCount;
}

// 워커풀 데이터 DevTools로 전송
export function sendWorkerPoolDataToDevTools(tabId: number, data: any) {
  return sendMessageToDevTools(tabId, {
    type: "worker-pool-data",
    data: data,
  });
}

// 특정 탭에 DevTools가 연결되어 있는지 확인
export function isDevToolsConnected(tabId: number): boolean {
  return devToolsConnections.has(tabId);
}

// 모든 DevTools 연결 정보 가져오기
export function getAllDevToolsConnections(): Map<number, DevToolsConnection> {
  return devToolsConnections;
}

// 비활성 DevTools 연결 정리 (주기적으로 호출 가능)
export function cleanupInactiveDevToolsConnections(
  maxInactiveTime: number = 30 * 60 * 1000
) {
  const now = Date.now();

  devToolsConnections.forEach((connection, tabId) => {
    if (now - connection.lastActive > maxInactiveTime) {
      devToolsConnections.delete(tabId);
      console.log(
        `비활성 상태로 인해 탭 ${tabId}의 DevTools 연결이 제거되었습니다.`
      );
    }
  });
}
