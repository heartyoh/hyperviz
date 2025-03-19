import { h, Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { Tabs } from "../../../common/components/Tabs";
import type {
  WorkerPoolStats,
  LogEntry,
  WorkerInfo,
  MonitorSettings,
  Tab,
} from "../../../common/types";

export function App() {
  // 탭 상태 관리
  const [activeTab, setActiveTab] = useState("workers");

  // 연결 상태 관리
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);

  // 데이터 상태 관리
  const [stats, setStats] = useState<WorkerPoolStats | null>(null);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<MonitorSettings>({
    logLevel: "info",
    updateInterval: 2000,
    maxLogEntries: 100,
    autoRestart: true,
  });

  // 탭 정의
  const tabs: Tab[] = [
    { id: "workers", label: "워커 목록" },
    { id: "tasks", label: "태스크 목록" },
    { id: "logs", label: "로그" },
    { id: "settings", label: "설정" },
  ];

  // 연결 상태 업데이트 이펙트
  useEffect(() => {
    // 여기에 통신 로직 구현
    const connectToBackend = async () => {
      try {
        // 실제로 구현할 때는 백그라운드 페이지와의 통신 구현
        setConnecting(false);
        setConnected(true);
      } catch (error) {
        console.error("연결 실패:", error);
        setConnecting(false);
        setConnected(false);
      }
    };

    connectToBackend();
  }, []);

  return (
    <div className="devtools-panel">
      <header className="panel-header">
        <h1>HyperViz WorkerPool 모니터링</h1>
        <div className="connection-status">
          {connecting ? (
            <span className="status-badge status-connecting">연결 중...</span>
          ) : connected ? (
            <span className="status-badge status-online">연결됨</span>
          ) : (
            <span className="status-badge status-offline">연결 끊김</span>
          )}
        </div>
      </header>

      <div className="dashboard">
        <div className="panel">
          <h2>워커풀 상태</h2>
          <div>여기에 워커풀 상태를 표시할 내용이 들어갑니다.</div>
        </div>

        <div className="panel">
          <h2>태스크 통계</h2>
          <div>여기에 태스크 통계를 표시할 내용이 들어갑니다.</div>
        </div>

        <div className="panel span-full">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

          <div className="tab-content">
            {activeTab === "workers" && (
              <div>워커 목록이 표시될 영역입니다.</div>
            )}

            {activeTab === "tasks" && (
              <div>태스크 목록이 표시될 영역입니다.</div>
            )}

            {activeTab === "logs" && (
              <div className="logs-container">
                {logs.length === 0 ? (
                  <div className="log-item">로그가 없습니다.</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className={`log-item log-${log.level}`}>
                      <span className="log-timestamp">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      {log.message}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "settings" && <div>설정이 표시될 영역입니다.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
