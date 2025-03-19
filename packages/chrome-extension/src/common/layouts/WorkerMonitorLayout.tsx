/**
 * 워커 모니터링 공통 레이아웃
 *
 * DevTools와 Popup 사이의 통합된 레이아웃 제공
 */

import { h, ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  ConnectionStatus,
  WorkerTable,
  LogViewer,
  StatsDashboard,
  ControlPanel,
  Tabs,
} from "../components";
import { stateManager, workerConnector } from "../services";
import "../styles";
import { LogEntry, WorkerInfo } from "../types";
import { Tab } from "../components/Tabs";

// 컴포넌트 속성 인터페이스
interface WorkerMonitorLayoutProps {
  compact?: boolean;
  showLogs?: boolean;
  showControls?: boolean;
  showStats?: boolean;
  maxHeight?: string;
  children?: ComponentChildren;
}

// 탭 유형
enum TabType {
  WORKERS = "workers",
  LOGS = "logs",
  STATS = "stats",
  SETTINGS = "settings",
}

/**
 * 워커 모니터링 레이아웃 컴포넌트
 */
export function WorkerMonitorLayout({
  compact = false,
  showLogs = true,
  showControls = true,
  showStats = true,
  maxHeight = "600px",
  children,
}: WorkerMonitorLayoutProps) {
  const [activeTab, setActiveTab] = useState<string>(TabType.WORKERS);
  const [workers, setWorkers] = useState<Record<string, WorkerInfo>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(
    stateManager.getState().connected
  );

  // 상태 구독
  useEffect(() => {
    stateManager.subscribe("workerMonitorLayout", (state) => {
      if (state.workers) setWorkers(state.workers);
      if (state.logs) setLogs(state.logs);
      setIsConnected(state.connected);
    });

    return () => {
      stateManager.unsubscribe("workerMonitorLayout");
    };
  }, []);

  // 워커 액션 핸들러
  const handleRestartWorker = async (workerId: string) => {
    if (isConnected) {
      await workerConnector.restartWorker(workerId);
    }
  };

  const handleTerminateWorker = async (workerId: string) => {
    if (isConnected) {
      await workerConnector.terminateWorker(workerId);
    }
  };

  // 타입 안전한 탭 배열 생성
  const getTabsForCompactView = (): Tab[] => {
    const tabs: Tab[] = [
      { id: TabType.WORKERS, label: "워커" },
      { id: TabType.LOGS, label: "로그" },
    ];

    if (showStats) {
      tabs.push({ id: TabType.STATS, label: "통계" });
    }

    if (showControls) {
      tabs.push({ id: TabType.SETTINGS, label: "설정" });
    }

    return tabs;
  };

  // 컴팩트 모드 (주로 팝업용)
  if (compact) {
    return (
      <div className="worker-monitor-compact" style={{ maxHeight }}>
        <ConnectionStatus compact />

        <Tabs
          tabs={getTabsForCompactView()}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        <div className="tab-content">
          {activeTab === TabType.WORKERS && (
            <WorkerTable
              workers={workers}
              onRestart={handleRestartWorker}
              onTerminate={handleTerminateWorker}
              compact
            />
          )}

          {activeTab === TabType.LOGS && (
            <LogViewer logs={logs} maxDisplayed={50} autoScroll />
          )}

          {activeTab === TabType.STATS && showStats && (
            <StatsDashboard compact />
          )}

          {activeTab === TabType.SETTINGS && showControls && (
            <ControlPanel compact />
          )}
        </div>

        {children}
      </div>
    );
  }

  // 전체 모드 (DevTools 패널용)
  return (
    <div className="worker-monitor" style={{ maxHeight }}>
      <div className="monitor-header">
        <ConnectionStatus />

        {showStats && <StatsDashboard compact />}
      </div>

      <div className="monitor-main">
        <div className="monitor-sidebar">
          <Tabs
            tabs={[
              { id: TabType.WORKERS, label: "워커 목록" },
              { id: TabType.LOGS, label: "로그" },
              { id: TabType.STATS, label: "통계" },
              { id: TabType.SETTINGS, label: "설정" },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
            vertical
          />

          {showControls && <ControlPanel compact />}
        </div>

        <div className="monitor-content">
          {activeTab === TabType.WORKERS && (
            <div className="section">
              <h2 className="section-heading">워커 목록</h2>
              <WorkerTable
                workers={workers}
                onRestart={handleRestartWorker}
                onTerminate={handleTerminateWorker}
              />
            </div>
          )}

          {activeTab === TabType.LOGS && (
            <div className="section">
              <h2 className="section-heading">워커풀 로그</h2>
              <LogViewer logs={logs} maxDisplayed={200} autoScroll />
            </div>
          )}

          {activeTab === TabType.STATS && (
            <div className="section">
              <h2 className="section-heading">통계 대시보드</h2>
              <StatsDashboard showCharts />
            </div>
          )}

          {activeTab === TabType.SETTINGS && (
            <div className="section">
              <h2 className="section-heading">설정 및 제어</h2>
              <ControlPanel />
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
