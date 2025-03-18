import { h } from "preact";
import type { WorkerPoolStats, WorkerInfo } from "../types.js";

interface DashboardProps {
  stats: WorkerPoolStats;
  workers: WorkerInfo[];
}

export function Dashboard({ stats, workers }: DashboardProps) {
  return (
    <div className="dashboard">
      <h2>워커풀 상태</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <h3>활성 워커</h3>
          <div className="stat-value">{stats.activeWorkers || 0}</div>
        </div>
        <div className="stat-card">
          <h3>유휴 워커</h3>
          <div className="stat-value">{stats.idleWorkers || 0}</div>
        </div>
        <div className="stat-card">
          <h3>대기 중인 작업</h3>
          <div className="stat-value">{stats.queuedTasks || 0}</div>
        </div>
        <div className="stat-card">
          <h3>완료된 작업</h3>
          <div className="stat-value">{stats.completedTasks || 0}</div>
        </div>
      </div>
    </div>
  );
}
