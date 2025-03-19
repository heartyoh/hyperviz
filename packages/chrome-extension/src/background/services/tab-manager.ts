/**
 * 탭 관리 서비스
 */

import { TabInfo, ConnectedTabsMap } from "../types/tab";
import iconService from "./icon-service";

class TabManager {
  private connectedTabs: ConnectedTabsMap = {};

  /**
   * 초기화 - 크롬 탭 이벤트 리스너 등록
   */
  public initialize(): void {
    // 탭 생성 이벤트
    chrome.tabs.onCreated.addListener(this.handleTabCreated.bind(this));

    // 탭 업데이트 이벤트
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));

    // 탭 제거 이벤트
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));

    console.log("[HyperViz] 탭 매니저 초기화 완료");
  }

  /**
   * 탭 추가
   */
  public addTab(tabId: number, url: string): TabInfo {
    const tabInfo: TabInfo = {
      tabId,
      url,
      hasWorkerPool: false,
      connected: false,
      lastUpdate: Date.now(),
    };

    this.connectedTabs[tabId] = tabInfo;
    return tabInfo;
  }

  /**
   * 탭 정보 가져오기
   */
  public getTab(tabId: number): TabInfo | null {
    return this.connectedTabs[tabId] || null;
  }

  /**
   * 탭 상태 업데이트
   */
  public updateTabStatus(
    tabId: number,
    hasWorkerPool: boolean,
    connected: boolean
  ): void {
    const tab = this.getTab(tabId);

    if (tab) {
      tab.hasWorkerPool = hasWorkerPool;
      tab.connected = connected;
      tab.lastUpdate = Date.now();

      // 아이콘 상태 업데이트
      iconService.updateIcon(tabId, connected);
    } else {
      // 탭 정보가 없으면 새로 생성
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          console.warn(
            `[HyperViz] 탭 정보 가져오기 실패 (${tabId}):`,
            chrome.runtime.lastError
          );
          return;
        }

        if (tab && tab.url) {
          const newTab = this.addTab(tabId, tab.url);
          newTab.hasWorkerPool = hasWorkerPool;
          newTab.connected = connected;

          // 아이콘 상태 업데이트
          iconService.updateIcon(tabId, connected);
        }
      });
    }
  }

  /**
   * 탭 제거
   */
  public removeTab(tabId: number): void {
    delete this.connectedTabs[tabId];
  }

  /**
   * 모든 연결된 탭 가져오기
   */
  public getAllConnectedTabs(): ConnectedTabsMap {
    return this.connectedTabs;
  }

  /**
   * 연결된 탭 수 가져오기
   */
  public getConnectedTabsCount(): number {
    return Object.keys(this.connectedTabs).length;
  }

  /**
   * 탭 생성 핸들러
   */
  private handleTabCreated(tab: chrome.tabs.Tab): void {
    // 새 탭이 생성되면 처리할 내용 (필요시)
    console.log(`[HyperViz] 새 탭 생성됨: ${tab.id}`);
  }

  /**
   * 탭 업데이트 핸들러
   */
  private handleTabUpdated(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ): void {
    // 탭이 완전히 로드된 경우에만 처리
    if (changeInfo.status === "complete" && tab.url) {
      // 필요한 경우 처리 로직...
    }
  }

  /**
   * 탭 제거 핸들러
   */
  private handleTabRemoved(tabId: number): void {
    // 탭이 제거되면 상태 정리
    this.removeTab(tabId);
    console.log(`[HyperViz] 탭 제거됨: ${tabId}`);
  }
}

// 싱글톤 인스턴스 내보내기
export default new TabManager();
