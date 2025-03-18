import { h, Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { Header } from "./Header";
import { Tabs } from "./Tabs";
import { Dashboard } from "./Dashboard";
import { WorkersList } from "./WorkersList";
import { LogsPanel } from "./LogsPanel";
import { Settings } from "./Settings";
import { ConnectionStatus } from "./ConnectionStatus";
import { EmptyState } from "./EmptyState";
import type {
  WorkerPoolStats,
  LogEntry,
  WorkerInfo,
  MonitorSettings,
} from "../types.js";

export function App() {
  // 탭 상태 관리
  const [activeTab, setActiveTab] = useState("dashboard");

  // 연결 상태 관리
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // 데이터 상태 관리
  const [stats, setStats] = useState<WorkerPoolStats | null>(null);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<MonitorSettings>({
    logLevel: "info",
    updateInterval: 1000,
    maxLogEntries: 1000,
    autoRestart: true,
  });

  // 백그라운드 페이지와의 연결 포트
  const portRef = useRef<chrome.runtime.Port | null>(null);

  // 탭 설정
  const tabs = [
    { id: "dashboard", label: "대시보드" },
    { id: "workers", label: "워커 목록" },
    { id: "logs", label: "로그" },
    { id: "settings", label: "설정" },
  ];

  // 초기화 및 메시지 리스너 설정
  useEffect(() => {
    // 포트 연결 생성
    try {
      portRef.current = chrome.runtime.connect({ name: "popup" });

      // 포트 메시지 리스너
      portRef.current.onMessage.addListener((message) => {
        console.log("포트 메시지 수신:", message);

        if (!message || !message.type) return;

        switch (message.type) {
          case "connectionStatus":
            setConnected(message.data.connected);
            setConnecting(false);
            break;

          case "stats":
            setStats(message.data.metrics);
            setWorkers(Object.values(message.data.workers || {}));
            break;

          case "logs":
            setLogs(message.data.logs || []);
            break;

          case "settingsUpdated":
            setSettings(message.data.settings);
            break;

          default:
            break;
        }
      });

      // 연결 해제 리스너
      portRef.current.onDisconnect.addListener(() => {
        console.log("포트 연결 해제됨");
        portRef.current = null;
        setConnected(false);
        setConnecting(false);
      });

      // 초기 상태 요청
      checkConnectionStatus();
    } catch (error) {
      console.error("포트 연결 오류:", error);
    }

    // 일반 메시지 리스너도 등록 (백업용)
    chrome.runtime.onMessage.addListener(handleMessage);

    // 컴포넌트 언마운트 시 정리
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);

      // 포트 연결 해제
      if (portRef.current) {
        try {
          portRef.current.disconnect();
          portRef.current = null;
        } catch (error) {
          console.error("포트 연결 해제 오류:", error);
        }
      }
    };
  }, []);

  // 포트를 통한 메시지 전송
  const sendPortMessage = (type: string, data: any = {}) => {
    if (!portRef.current) {
      console.warn("포트 연결이 없습니다. 일반 메시지로 대체합니다.");
      chrome.runtime.sendMessage({ type, data });
      return;
    }

    try {
      portRef.current.postMessage({ type, data });
    } catch (error) {
      console.error("포트 메시지 전송 오류:", error);
      // 포트 연결이 끊어진 경우 일반 메시지로 대체
      chrome.runtime.sendMessage({ type, data });
    }
  };

  // 연결 상태 확인 함수
  const checkConnectionStatus = () => {
    sendPortMessage("getConnectionStatus");
  };

  // 일반 메시지 핸들러 (백업용)
  const handleMessage = (
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) => {
    if (!message || !message.type) return;

    switch (message.type) {
      case "stats":
        setStats(message.data.metrics);
        setWorkers(Object.values(message.data.workers || {}));
        break;

      case "logs":
        setLogs(message.data.logs || []);
        break;

      case "connectionChanged":
        setConnected(message.data.connected);
        setConnecting(false);
        break;

      case "settingsUpdated":
        setSettings(message.data.settings);
        break;

      default:
        break;
    }

    sendResponse({ received: true });
    return true;
  };

  // 워커풀에 연결 시도
  const connectToWorkerPool = () => {
    setConnecting(true);
    sendPortMessage("connect");
  };

  // 워커풀 연결 해제
  const disconnectFromWorkerPool = () => {
    sendPortMessage("disconnect");
  };

  // 워커 재시작 요청
  const restartWorker = (workerId: string, workerType: string) => {
    sendPortMessage("restartWorker", { workerId, workerType });
  };

  // 설정 업데이트 요청
  const updateSettings = (newSettings: Partial<MonitorSettings>) => {
    sendPortMessage("updateSettings", newSettings);
  };

  // 로그 요청
  const requestLogs = (options: any = {}) => {
    sendPortMessage("requestLogs", options);
  };

  return (
    <>
      <Header
        connected={connected}
        onConnect={connectToWorkerPool}
        onDisconnect={disconnectFromWorkerPool}
        connecting={connecting}
      />

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <main className="main-container">
        {!connected && (
          <ConnectionStatus
            connected={connected}
            connecting={connecting}
            onConnect={connectToWorkerPool}
          />
        )}

        {connected && activeTab === "dashboard" && stats ? (
          <Dashboard stats={stats} workers={workers} />
        ) : connected && activeTab === "dashboard" ? (
          <EmptyState message="로딩 중..." icon="🔄" />
        ) : null}

        {connected && activeTab === "workers" && workers.length > 0 ? (
          <WorkersList workers={workers} onRestartWorker={restartWorker} />
        ) : connected && activeTab === "workers" ? (
          <EmptyState message="워커 정보가 없습니다." icon="👻" />
        ) : null}

        {connected && activeTab === "logs" ? (
          <LogsPanel logs={logs} onRefresh={requestLogs} />
        ) : null}

        {activeTab === "settings" && (
          <Settings
            settings={settings}
            onUpdate={updateSettings}
            connected={connected}
          />
        )}
      </main>
    </>
  );
}
