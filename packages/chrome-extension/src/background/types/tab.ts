/**
 * 탭 관련 타입 정의
 */

// 워커풀이 탐지된 탭 정보
export interface TabInfo {
  tabId: number;
  url: string;
  hasWorkerPool: boolean;
  connected: boolean;
  lastUpdate: number;
}

// 연결된 탭 매핑
export type ConnectedTabsMap = Record<number, TabInfo>;
