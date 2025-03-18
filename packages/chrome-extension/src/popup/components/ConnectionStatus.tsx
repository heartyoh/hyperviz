import { h } from "preact";

interface ConnectionStatusProps {
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
}

export function ConnectionStatus({
  connected,
  connecting,
  onConnect,
}: ConnectionStatusProps) {
  return (
    <div className="connection-status">
      <div className="status-icon">{connected ? "✅" : "❌"}</div>
      <h3>
        {connected
          ? "워커풀에 연결되었습니다"
          : connecting
          ? "연결 시도 중..."
          : "워커풀에 연결되지 않았습니다"}
      </h3>
      {!connected && !connecting && (
        <button className="connect-button" onClick={onConnect}>
          연결하기
        </button>
      )}
      <p className="status-message">
        {connecting
          ? "워커풀로부터 응답을 기다리는 중입니다..."
          : connected
          ? "정보를 로딩하는 중입니다..."
          : "계속하려면 워커풀에 연결하세요."}
      </p>
    </div>
  );
}
