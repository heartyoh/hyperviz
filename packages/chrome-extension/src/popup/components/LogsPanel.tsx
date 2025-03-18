import { h } from "preact";
import type { LogEntry } from "../types";

interface LogsPanelProps {
  logs: LogEntry[];
  onRefresh: () => void;
}

export function LogsPanel({ logs, onRefresh }: LogsPanelProps) {
  return (
    <div className="logs-panel">
      <div className="logs-header">
        <h2>로그 ({logs.length})</h2>
        <button className="refresh-button" onClick={onRefresh}>
          새로고침
        </button>
      </div>
      <div className="logs-list">
        {logs.length === 0 ? (
          <div className="empty-logs">로그가 없습니다.</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`log-item ${log.level.toLowerCase()}`}>
              <div className="log-time">
                {new Date(log.timestamp).toLocaleTimeString()}
              </div>
              <div className={`log-level ${log.level.toLowerCase()}`}>
                {log.level.toUpperCase()}
              </div>
              <div className="log-message">{log.message}</div>
              {log.workerType && (
                <div className="log-worker-type">{log.workerType}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
