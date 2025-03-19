/**
 * 워커 테이블 컴포넌트
 */

import { h } from "preact";
import { useState } from "preact/hooks";
import { WorkerInfo } from "../services";
import { WorkerStatus } from "../types";

// 컴포넌트 속성 인터페이스
interface WorkerTableProps {
  workers: Record<string, WorkerInfo>;
  onRestart?: (workerId: string) => void;
  onTerminate?: (workerId: string) => void;
  compact?: boolean;
}

/**
 * 워커 테이블 컴포넌트
 */
export function WorkerTable({
  workers,
  onRestart,
  onTerminate,
  compact = false,
}: WorkerTableProps) {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  // 워커 상태에 따른 클래스 이름 결정
  const getStatusClass = (status: WorkerStatus): string => {
    switch (status) {
      case WorkerStatus.IDLE:
        return "status-idle";
      case WorkerStatus.BUSY:
        return "status-busy";
      case WorkerStatus.ERROR:
        return "status-error";
      case WorkerStatus.TERMINATED:
        return "status-terminated";
      default:
        return "status-unknown";
    }
  };

  // 워커 목록이 비어 있는 경우
  if (Object.keys(workers).length === 0) {
    return (
      <div className="empty-state">
        <p>워커가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="worker-table-container">
      <table className={`worker-table ${compact ? "compact" : ""}`}>
        <thead>
          <tr>
            <th>ID</th>
            <th>유형</th>
            <th>상태</th>
            {!compact && <th>태스크</th>}
            {!compact && <th>CPU</th>}
            {!compact && <th>메모리</th>}
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(workers).map((worker) => (
            <tr
              key={worker.id}
              className={`${selectedWorkerId === worker.id ? "selected" : ""}`}
              onClick={() => setSelectedWorkerId(worker.id)}
            >
              <td className="worker-id" title={worker.id}>
                {worker.id.slice(0, 8)}...
              </td>
              <td>{worker.type}</td>
              <td>
                <span
                  className={`status-badge ${getStatusClass(worker.status)}`}
                >
                  {worker.status}
                </span>
              </td>
              {!compact && (
                <td>
                  {Object.keys(worker.tasks).length > 0
                    ? Object.keys(worker.tasks).length
                    : "없음"}
                </td>
              )}
              {!compact && (
                <td>
                  {worker.performance.cpu !== undefined
                    ? `${Math.round(worker.performance.cpu)}%`
                    : "-"}
                </td>
              )}
              {!compact && (
                <td>
                  {worker.performance.memory !== undefined
                    ? `${Math.round(worker.performance.memory / 1024 / 1024)}MB`
                    : "-"}
                </td>
              )}
              <td className="actions">
                {onRestart && worker.status !== WorkerStatus.TERMINATED && (
                  <button
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestart(worker.id);
                    }}
                    title="워커 재시작"
                  >
                    🔄
                  </button>
                )}
                {onTerminate && worker.status !== WorkerStatus.TERMINATED && (
                  <button
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTerminate(worker.id);
                    }}
                    title="워커 종료"
                  >
                    ⛔
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
