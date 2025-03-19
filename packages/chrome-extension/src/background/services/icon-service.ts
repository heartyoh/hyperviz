/**
 * 아이콘 및 뱃지 관리 서비스
 */

class IconService {
  /**
   * 아이콘 상태 업데이트
   * @param tabId 대상 탭 ID
   * @param isConnected 연결 상태
   */
  public updateIcon(tabId: number, isConnected: boolean): void {
    try {
      if (isConnected) {
        chrome.action.setBadgeText({ tabId, text: "ON" });
        chrome.action.setBadgeBackgroundColor({ tabId, color: "#4CAF50" });
      } else {
        chrome.action.setBadgeText({ tabId, text: "OFF" });
        chrome.action.setBadgeBackgroundColor({ tabId, color: "#F44336" });
      }
    } catch (error) {
      console.error("[HyperViz] 아이콘 업데이트 오류:", error);
    }
  }
}

// 싱글톤 인스턴스 내보내기
export default new IconService();
