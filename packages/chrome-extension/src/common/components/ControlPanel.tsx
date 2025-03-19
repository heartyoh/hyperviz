/**
 * 워커풀 제어 패널 컴포넌트
 */

import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { stateManager, workerConnector } from "../services";
import { MonitorSettings, LogLevel } from "../types";

// 컴포넌트 속성 인터페이스
interface ControlPanelProps {
  compact?: boolean;
  onSettingsChange?: (settings: MonitorSettings) => void;
}

/**
 * 워커풀 제어 패널 컴포넌트
 */
export function ControlPanel({
  compact = false,
  onSettingsChange,
}: ControlPanelProps) {
  // 기본 설정 값으로 초기화
  const [settings, setSettings] = useState<MonitorSettings>(() => {
    const defaultSettings: MonitorSettings = {
      logLevel: "info" as LogLevel,
      updateInterval: 1000,
      maxLogEntries: 1000,
      autoRestart: true,
    };

    // 기존 저장된 설정과 병합
    const currentState = stateManager.getState();
    if (currentState.settings) {
      return {
        ...defaultSettings,
        ...currentState.settings,
        // LogLevel 타입 호환성 보장
        logLevel: currentState.settings.logLevel as LogLevel,
      };
    }

    return defaultSettings;
  });

  const [workers, setWorkers] = useState<Record<string, any>>({});
  const [isConnected, setIsConnected] = useState<boolean>(
    stateManager.getState().connected
  );
  const [isDevMode, setIsDevMode] = useState<boolean>(false);

  // 현재 탭 ID 가져오기
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);

  // 상태 구독
  useEffect(() => {
    const updateState = (state: any) => {
      if (state.settings) {
        setSettings((prevSettings) => ({
          ...prevSettings,
          ...state.settings,
          // LogLevel 타입 호환성 보장
          logLevel: state.settings.logLevel as LogLevel,
        }));
      }
      if (state.workers) {
        setWorkers((prevWorkers) => ({ ...prevWorkers, ...state.workers }));
      }
      setIsConnected(state.connected);
      setCurrentTabId(state.currentTabId);
    };

    stateManager.subscribe("controlPanel", updateState);

    // 개발 모드 감지 - chrome://extensions 페이지에서 "개발자 모드" 활성화 상태 확인
    chrome.management.getSelf((info) => {
      setIsDevMode(info.installType === "development");
    });

    return () => {
      stateManager.unsubscribe("controlPanel");
    };
  }, []);

  // 설정 변경 핸들러
  const handleSettingChange = async (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value };

    if (isConnected) {
      await workerConnector.updateSettings({
        [key]: value,
      });
    }

    stateManager.setState({
      settings: newSettings,
    });

    onSettingsChange?.(newSettings);
  };

  // 모든 워커 종료 핸들러
  const handleTerminateAll = async () => {
    if (isConnected) {
      await workerConnector.terminateAllWorkers();
    }
  };

  // 테스트 워커풀 주입 함수
  const injectTestWorkerPool = async () => {
    if (!currentTabId) {
      alert("유효한 탭 ID가 없습니다");
      return;
    }

    try {
      const response = await new Promise<any>((resolve, reject) => {
        chrome.tabs.sendMessage(
          currentTabId,
          { type: "inject_test_worker_pool", timestamp: Date.now() },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "[HyperViz] 테스트 워커풀 주입 실패:",
                chrome.runtime.lastError
              );
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response);
          }
        );
      });

      console.log("[HyperViz] 테스트 워커풀 주입 응답:", response);
      alert("테스트 워커풀이 주입되었습니다. 연결을 시도하세요.");
    } catch (error) {
      console.error("[HyperViz] 테스트 워커풀 주입 중 오류:", error);
      alert(
        `테스트 워커풀 주입 실패: ${
          error instanceof Error ? error.message : "알 수 없는 오류"
        }`
      );
    }
  };

  // 컴팩트 모드
  if (compact) {
    return (
      <div className="control-panel-compact">
        <div className="control-actions">
          <button
            className="control-btn terminate-all"
            onClick={handleTerminateAll}
            disabled={!isConnected || Object.keys(workers).length === 0}
          >
            모든 워커 종료
          </button>
          <button
            className="control-btn refresh"
            onClick={() => workerConnector.requestWorkerData()}
            disabled={!isConnected}
          >
            새로고침
          </button>
          {isDevMode && (
            <button
              className="control-btn debug"
              onClick={injectTestWorkerPool}
              title="개발 모드 전용: 테스트 워커풀을 페이지에 주입합니다"
            >
              테스트 워커풀 주입
            </button>
          )}
        </div>
      </div>
    );
  }

  // 전체 모드
  return (
    <div className="control-panel">
      <h3 className="panel-title">워커풀 제어 패널</h3>

      <div className="control-section">
        <h4 className="section-title">설정</h4>
        <div className="settings-form">
          <div className="form-group">
            <label htmlFor="logLevel">로그 레벨:</label>
            <select
              id="logLevel"
              value={settings.logLevel}
              onChange={(e) =>
                handleSettingChange(
                  "logLevel",
                  e.currentTarget.value as LogLevel
                )
              }
              disabled={!isConnected}
            >
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="updateInterval">업데이트 주기 (ms):</label>
            <input
              id="updateInterval"
              type="number"
              min="100"
              max="10000"
              step="100"
              value={settings.updateInterval}
              onChange={(e) =>
                handleSettingChange(
                  "updateInterval",
                  parseInt(e.currentTarget.value, 10)
                )
              }
              disabled={!isConnected}
            />
          </div>

          <div className="form-group">
            <label htmlFor="maxLogEntries">최대 로그 항목:</label>
            <input
              id="maxLogEntries"
              type="number"
              min="10"
              max="5000"
              step="10"
              value={settings.maxLogEntries}
              onChange={(e) =>
                handleSettingChange(
                  "maxLogEntries",
                  parseInt(e.currentTarget.value, 10)
                )
              }
              disabled={!isConnected}
            />
          </div>

          <div className="form-group checkbox">
            <input
              id="autoRestart"
              type="checkbox"
              checked={settings.autoRestart}
              onChange={(e) =>
                handleSettingChange("autoRestart", e.currentTarget.checked)
              }
              disabled={!isConnected}
            />
            <label htmlFor="autoRestart">오류 시 자동 재시작</label>
          </div>
        </div>
      </div>

      <div className="control-section">
        <h4 className="section-title">작업</h4>
        <div className="control-actions">
          <button
            className="control-btn terminate-all"
            onClick={handleTerminateAll}
            disabled={!isConnected || Object.keys(workers).length === 0}
          >
            모든 워커 종료
          </button>

          <button
            className="control-btn refresh"
            onClick={() => workerConnector.requestWorkerData()}
            disabled={!isConnected}
          >
            데이터 새로고침
          </button>
        </div>
      </div>

      {isDevMode && (
        <div className="debug-section">
          <h3>디버깅 도구</h3>
          <div className="debug-info">
            <div>현재 탭 ID: {currentTabId || "없음"}</div>
            <div>연결 상태: {isConnected ? "연결됨" : "연결 안됨"}</div>
          </div>
          <button
            className="control-btn debug"
            onClick={injectTestWorkerPool}
            title="개발 모드 전용: 테스트 워커풀을 페이지에 주입합니다"
          >
            테스트 워커풀 주입
          </button>
        </div>
      )}
    </div>
  );
}
