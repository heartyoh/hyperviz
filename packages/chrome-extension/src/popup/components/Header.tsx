import { h } from "preact";

interface HeaderProps {
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function Header({
  connected,
  connecting,
  onConnect,
  onDisconnect,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="logo">
        <h1>HyperViz 워커풀 모니터</h1>
      </div>
      <div className="actions">
        {!connected ? (
          <button
            className="connect-button"
            onClick={onConnect}
            disabled={connecting}
          >
            {connecting ? "연결 중..." : "연결하기"}
          </button>
        ) : (
          <button className="disconnect-button" onClick={onDisconnect}>
            연결 해제
          </button>
        )}
      </div>
    </header>
  );
}
