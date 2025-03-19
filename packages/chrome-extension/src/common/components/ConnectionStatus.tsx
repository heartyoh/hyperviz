/**
 * 연결 상태 표시 컴포넌트
 */

import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { stateManager, workerConnector } from "../services";
import { WorkerPoolState } from "../services/state-manager";

// 컴포넌트 속성 인터페이스
interface ConnectionStatusProps {
  compact?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * 연결 상태 표시 컴포넌트
 */
export function ConnectionStatus({
  compact = false,
  onConnect,
  onDisconnect,
}: ConnectionStatusProps) {
  const [state, setState] = useState<WorkerPoolState>(stateManager.getState());

  // 상태 구독
  useEffect(() => {
    stateManager.subscribe("connectionStatus", (newState) => {
      setState(newState);
    });

    return () => {
      stateManager.unsubscribe("connectionStatus");
    };
  }, []);

  // 연결 상태에 따른 클래스 및 메시지
  const getStatusClass = () => {
    if (state.connecting) return "status-connecting";
    if (state.connected) return "status-connected";
    return "status-disconnected";
  };

  const getStatusMessage = () => {
    if (state.connecting) return "연결 중...";
    if (state.connected) return "연결됨";
    return "연결 안됨";
  };

  // 연결 시간 포맷팅
  const getLastConnectionText = () => {
    if (!state.lastConnection) return "없음";

    const date = new Date(state.lastConnection);
    return date.toLocaleTimeString();
  };

  // 연결 버튼 클릭 핸들러
  const handleConnectClick = async () => {
    if (state.connected) {
      await workerConnector.disconnect();
      onDisconnect?.();
    } else {
      const tabId = await workerConnector.getCurrentTabId();
      if (tabId) {
        await workerConnector.connectToTab(tabId);
        onConnect?.();
      }
    }
  };

  // 컴팩트 모드
  if (compact) {
    return (
      <div className={`connection-status-compact ${getStatusClass()}`}>
        <span className="status-indicator"></span>
        <span className="status-text">{getStatusMessage()}</span>
        <button className="connection-btn-small" onClick={handleConnectClick}>
          {state.connected ? "연결 해제" : "연결"}
        </button>
      </div>
    );
  }

  // 전체 모드
  return (
    <div className={`connection-status ${getStatusClass()}`}>
      <div className="status-header">
        <span className="status-indicator"></span>
        <h3 className="status-title">워커풀 연결 상태</h3>
      </div>

      <div className="status-details">
        <div className="status-row">
          <span className="status-label">상태:</span>
          <span className="status-value">{getStatusMessage()}</span>
        </div>

        <div className="status-row">
          <span className="status-label">탭 ID:</span>
          <span className="status-value">{state.currentTabId || "없음"}</span>
        </div>

        <div className="status-row">
          <span className="status-label">마지막 연결:</span>
          <span className="status-value">{getLastConnectionText()}</span>
        </div>

        <div className="status-actions">
          <button
            className={`connection-btn ${
              state.connected ? "disconnect" : "connect"
            }`}
            onClick={handleConnectClick}
            disabled={state.connecting}
          >
            {state.connected ? "연결 해제" : "연결"}
          </button>
        </div>
      </div>
    </div>
  );
}
