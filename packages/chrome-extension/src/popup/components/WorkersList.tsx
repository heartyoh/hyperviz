import { h } from "preact";
import type { WorkerInfo } from "../types.js";

interface WorkersListProps {
  workers: WorkerInfo[];
  onRestartWorker: (workerId: string, workerType: string) => void;
}

export function WorkersList({ workers, onRestartWorker }: WorkersListProps) {
  return (
    <div className="workers-list">
      <h2>워커 목록 ({workers.length})</h2>
      <div className="worker-items">
        {workers.map((worker) => (
          <div
            key={worker.id}
            className={`worker-item ${worker.status.toLowerCase()}`}
          >
            <div className="worker-header">
              <h3>
                {worker.type} 워커 - {worker.id}
              </h3>
              <div className={`status-badge ${worker.status.toLowerCase()}`}>
                {worker.status}
              </div>
            </div>
            <div className="worker-details">
              <div className="worker-stat">
                <label>처리한 작업:</label>
                <span>{worker.performance?.completedTasks || 0}</span>
              </div>
              <div className="worker-stat">
                <label>평균 처리 시간:</label>
                <span>{worker.performance?.averageTaskTime || 0}ms</span>
              </div>
              <div className="worker-stat">
                <label>오류:</label>
                <span>{worker.performance?.errors || 0}</span>
              </div>
            </div>
            <div className="worker-actions">
              <button
                className="restart-button"
                onClick={() => onRestartWorker(worker.id, worker.type)}
              >
                재시작
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
