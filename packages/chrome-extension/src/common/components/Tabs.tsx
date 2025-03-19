/**
 * 탭 컴포넌트
 */

import { h } from "preact";
import { useState, useEffect } from "preact/hooks";

// 탭 인터페이스
export interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
}

// 컴포넌트 속성 인터페이스
interface TabsProps {
  tabs: Tab[];
  activeTab?: string;
  onChange?: (tabId: string) => void;
  vertical?: boolean;
}

/**
 * 탭 컴포넌트
 */
export function Tabs({
  tabs,
  activeTab: externalActiveTab,
  onChange,
  vertical = false,
}: TabsProps) {
  const [activeTab, setActiveTab] = useState<string>(
    externalActiveTab || (tabs.length > 0 ? tabs[0].id : "")
  );

  // 외부 activeTab 변경 시 상태 업데이트
  useEffect(() => {
    if (externalActiveTab && externalActiveTab !== activeTab) {
      setActiveTab(externalActiveTab);
    }
  }, [externalActiveTab]);

  // 탭 변경 핸들러
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (onChange) {
      onChange(tabId);
    }
  };

  return (
    <div className={`tabs ${vertical ? "vertical" : ""}`}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab-item ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => !tab.disabled && handleTabChange(tab.id)}
          style={{ opacity: tab.disabled ? 0.5 : 1 }}
        >
          {tab.label}
        </div>
      ))}
    </div>
  );
}
