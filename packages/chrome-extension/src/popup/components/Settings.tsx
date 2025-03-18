import { h } from "preact";
import type { MonitorSettings } from "../types";

interface SettingsProps {
  settings: MonitorSettings;
  onUpdate: (newSettings: Partial<MonitorSettings>) => void;
  connected: boolean;
}

export function Settings({ settings, onUpdate, connected }: SettingsProps) {
  const handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const value =
      target.type === "checkbox"
        ? (target as HTMLInputElement).checked
        : target.type === "number"
        ? parseInt(target.value, 10)
        : target.value;

    onUpdate({
      [target.name]: value,
    });
  };

  return (
    <div className="settings-panel">
      <h2>설정</h2>

      <div className="settings-group">
        <label htmlFor="logLevel">로그 레벨</label>
        <select
          id="logLevel"
          name="logLevel"
          value={settings.logLevel}
          onChange={handleChange}
        >
          <option value="debug">디버그</option>
          <option value="info">정보</option>
          <option value="warn">경고</option>
          <option value="error">오류</option>
        </select>
      </div>

      <div className="settings-group">
        <label htmlFor="updateInterval">업데이트 간격 (ms)</label>
        <input
          type="number"
          id="updateInterval"
          name="updateInterval"
          min="500"
          max="10000"
          step="100"
          value={settings.updateInterval}
          onChange={handleChange}
        />
      </div>

      <div className="settings-group">
        <label htmlFor="maxLogEntries">최대 로그 항목 수</label>
        <input
          type="number"
          id="maxLogEntries"
          name="maxLogEntries"
          min="50"
          max="1000"
          step="50"
          value={settings.maxLogEntries}
          onChange={handleChange}
        />
      </div>

      <div className="settings-group checkbox">
        <label htmlFor="autoRestart">오류 시 자동 재시작</label>
        <input
          type="checkbox"
          id="autoRestart"
          name="autoRestart"
          checked={settings.autoRestart}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
