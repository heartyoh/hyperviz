/**
 * 워커풀 통계 대시보드 컴포넌트
 */

import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { stateManager } from "../services";
import { PoolStats, WorkerInfo, WorkerStatus } from "../types";

// 컴포넌트 속성 인터페이스
interface StatsDashboardProps {
  compact?: boolean;
  showCharts?: boolean;
}

/**
 * 워커풀 통계 대시보드 컴포넌트
 */
export function StatsDashboard({
  compact = false,
  showCharts = true,
}: StatsDashboardProps) {
  const [workers, setWorkers] = useState<Record<string, WorkerInfo>>({});
  const [stats, setStats] = useState<Record<string, PoolStats>>({});

  // 상태 구독
  useEffect(() => {
    const updateState = (state: any) => {
      if (state.workers) {
        setWorkers((prevWorkers) => ({ ...prevWorkers, ...state.workers }));
      }
      if (state.stats) {
        setStats((prevStats) => ({ ...prevStats, ...state.stats }));
      }
    };

    stateManager.subscribe("statsDashboard", updateState);

    return () => {
      stateManager.unsubscribe("statsDashboard");
    };
  }, []);

  // 워커 수 통계 계산
  const workerCounts = {
    total: Object.keys(workers).length,
    idle: Object.values(workers).filter((w) => w.status === WorkerStatus.IDLE)
      .length,
    busy: Object.values(workers).filter((w) => w.status === WorkerStatus.BUSY)
      .length,
    error: Object.values(workers).filter((w) => w.status === WorkerStatus.ERROR)
      .length,
    terminated: Object.values(workers).filter(
      (w) => w.status === WorkerStatus.TERMINATED
    ).length,
  };

  // 워커 유형별 통계
  const workerTypeStats = Object.values(workers).reduce<Record<string, number>>(
    (acc, worker) => {
      acc[worker.type] = (acc[worker.type] || 0) + 1;
      return acc;
    },
    {}
  );

  // 컴팩트 모드
  if (compact) {
    return (
      <div className="stats-dashboard-compact">
        <div className="stats-summary">
          <div className="stats-item">
            <span className="stats-value">{workerCounts.total}</span>
            <span className="stats-label">총 워커</span>
          </div>
          <div className="stats-item">
            <span className="stats-value">{workerCounts.busy}</span>
            <span className="stats-label">작업 중</span>
          </div>
          <div className="stats-item">
            <span className="stats-value">{workerCounts.idle}</span>
            <span className="stats-label">대기 중</span>
          </div>
          <div className="stats-item">
            <span className="stats-value">{workerCounts.error}</span>
            <span className="stats-label">오류</span>
          </div>
        </div>
      </div>
    );
  }

  // 전체 모드
  return (
    <div className="stats-dashboard">
      <h3 className="dashboard-title">워커풀 통계</h3>

      <div className="stats-section">
        <h4 className="section-title">워커 상태</h4>
        <div className="stats-grid">
          <div className="stats-card total">
            <div className="stats-value">{workerCounts.total}</div>
            <div className="stats-label">총 워커</div>
          </div>
          <div className="stats-card idle">
            <div className="stats-value">{workerCounts.idle}</div>
            <div className="stats-label">대기 중</div>
          </div>
          <div className="stats-card busy">
            <div className="stats-value">{workerCounts.busy}</div>
            <div className="stats-label">작업 중</div>
          </div>
          <div className="stats-card error">
            <div className="stats-value">{workerCounts.error}</div>
            <div className="stats-label">오류</div>
          </div>
        </div>
      </div>

      {Object.keys(stats).length > 0 && (
        <div className="stats-section">
          <h4 className="section-title">풀 통계</h4>
          <div className="stats-table-container">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>유형</th>
                  <th>활성화</th>
                  <th>대기</th>
                  <th>대기열</th>
                  <th>완료</th>
                  <th>실패</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats).map(([type, stat]) => (
                  <tr key={type}>
                    <td>{type}</td>
                    <td>{stat.activeWorkers}</td>
                    <td>{stat.idleWorkers}</td>
                    <td>{stat.queuedTasks}</td>
                    <td>{stat.completedTasks}</td>
                    <td>{stat.failedTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCharts && Object.keys(workerTypeStats).length > 0 && (
        <div className="stats-section">
          <h4 className="section-title">워커 유형 분포</h4>
          <div className="stats-chart">
            {Object.entries(workerTypeStats).map(([type, count]) => (
              <div className="chart-bar-container" key={type}>
                <div className="chart-label">{type}</div>
                <div
                  className="chart-bar"
                  style={{ width: `${(count / workerCounts.total) * 100}%` }}
                >
                  <span className="chart-value">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
