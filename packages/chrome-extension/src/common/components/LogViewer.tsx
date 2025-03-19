/**
 * 로그 뷰어 컴포넌트
 */

import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { LogEntry } from "../types";

// 컴포넌트 속성 인터페이스
interface LogViewerProps {
  logs: LogEntry[];
  maxDisplayed?: number;
  autoScroll?: boolean;
  filter?: {
    level?: string;
    workerType?: string;
    workerId?: string;
    search?: string;
  };
}

/**
 * 로그 뷰어 컴포넌트
 */
export function LogViewer({
  logs,
  maxDisplayed = 100,
  autoScroll = true,
  filter,
}: LogViewerProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);

  // 필터링 및 정렬된 로그 처리
  useEffect(() => {
    // 로그 필터링
    let filtered = [...logs];

    if (filter) {
      if (filter.level) {
        filtered = filtered.filter((log) => log.level === filter.level);
      }

      if (filter.workerType) {
        filtered = filtered.filter(
          (log) => log.workerType === filter.workerType
        );
      }

      if (filter.workerId) {
        filtered = filtered.filter((log) => log.workerId === filter.workerId);
      }

      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        filtered = filtered.filter(
          (log) =>
            log.message.toLowerCase().includes(searchLower) ||
            (log.workerType &&
              log.workerType.toLowerCase().includes(searchLower)) ||
            (log.workerId && log.workerId.toLowerCase().includes(searchLower))
        );
      }
    }

    // 시간순 정렬
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    // 최대 표시 개수 제한
    if (filtered.length > maxDisplayed) {
      filtered = filtered.slice(0, maxDisplayed);
    }

    setFilteredLogs(filtered);
  }, [logs, filter, maxDisplayed]);

  // 자동 스크롤 처리
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  // 로그 레벨에 따른 클래스 이름 결정
  const getLevelClass = (level: string): string => {
    switch (level) {
      case "debug":
        return "log-debug";
      case "info":
        return "log-info";
      case "warn":
        return "log-warn";
      case "error":
        return "log-error";
      default:
        return "log-default";
    }
  };

  // 타임스탬프 포맷팅
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}.${date
      .getMilliseconds()
      .toString()
      .padStart(3, "0")}`;
  };

  // 로그가 없는 경우
  if (filteredLogs.length === 0) {
    return (
      <div className="empty-state">
        <p>로그가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="log-viewer-container" ref={logContainerRef}>
      {filteredLogs.map((log, index) => (
        <div key={index} className={`log-item ${getLevelClass(log.level)}`}>
          <span className="log-timestamp">
            {formatTimestamp(log.timestamp)}
          </span>
          <span className="log-level">[{log.level.toUpperCase()}]</span>
          {log.workerType && (
            <span className="log-worker-type">[{log.workerType}]</span>
          )}
          {log.workerId && (
            <span className="log-worker-id">[{log.workerId.slice(0, 8)}]</span>
          )}
          <span className="log-message">{log.message}</span>
        </div>
      ))}
    </div>
  );
}
