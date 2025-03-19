/**
 * 워커풀 제어 패널 컴포넌트
 */

import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { stateManager, workerConnector } from "../services";
import { MonitorSettings } from "../types";

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
  const [settings, setSettings] = useState<MonitorSettings>(
    stateManager.getState().settings
  );
  const [workers, setWorkers] = useState<Record<string, any>>(
    stateManager.getState().workers
  );
  const [isConnected, setIsConnected] = useState<boolean>(
    stateManager.getState().connected
  );

  // 상태 구독
  useEffect(() => {
    stateManager.subscribe("controlPanel", (state) => {
      if (state.settings) {
        setSettings(state.settings);
      }
      if (state.workers) {
        setWorkers(state.workers);
      }
      setIsConnected(state.connected);
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
                handleSettingChange("logLevel", e.currentTarget.value)
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
    </div>
  );
}
