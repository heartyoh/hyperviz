/**
 * HyperViz 크롬 확장 프로그램 - 배지 관리자
 */

/**
 * 배지 매니저
 *
 * 확장 프로그램 아이콘 배지 관리 모듈
 */

// 배지 설정 인터페이스
interface BadgeConfig {
  showWorkerCount: boolean;
  colorByStatus: boolean;
}

// 배지 상태 인터페이스
interface BadgeState {
  connected?: boolean;
  workerCount?: number;
  busyWorkers?: number;
  errorCount?: number;
}

/**
 * 배지 관리자 클래스
 * 탭 아이콘의 배지 텍스트와 색상을 관리
 */
class BadgeManager {
  private config: BadgeConfig = {
    showWorkerCount: true,
    colorByStatus: true,
  };

  private tabBadgeState: Map<number, BadgeState> = new Map();

  /**
   * 배지 매니저 초기화
   * @param config 배지 설정
   */
  public initialize(config: Partial<BadgeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 배지 상태 업데이트
   * @param tabId 탭 ID
   * @param state 배지 상태
   */
  public updateBadge(tabId: number, state: Partial<BadgeState>): void {
    // 기존 상태와 병합
    const currentState = this.tabBadgeState.get(tabId) || {};
    const newState = { ...currentState, ...state };
    this.tabBadgeState.set(tabId, newState);

    // 배지 텍스트 및 색상 업데이트
    this.updateBadgeText(tabId, newState);
    this.updateBadgeColor(tabId, newState);
  }

  /**
   * 배지 텍스트 업데이트
   * @param tabId 탭 ID
   * @param state 배지 상태
   */
  private updateBadgeText(tabId: number, state: BadgeState): void {
    let text = "";

    if (state.connected) {
      if (this.config.showWorkerCount && state.workerCount !== undefined) {
        text = state.workerCount.toString();
      } else {
        text = "✓";
      }
    } else {
      text = "";
    }

    try {
      chrome.action.setBadgeText({ text, tabId });
    } catch (error) {
      console.error("배지 텍스트 설정 오류:", error);
    }
  }

  /**
   * 배지 색상 업데이트
   * @param tabId 탭 ID
   * @param state 배지 상태
   */
  private updateBadgeColor(tabId: number, state: BadgeState): void {
    let color = "#5c8aff"; // 기본 파란색

    if (this.config.colorByStatus) {
      if (!state.connected) {
        color = "#888888"; // 회색 (연결 안됨)
      } else if (state.errorCount && state.errorCount > 0) {
        color = "#ff5252"; // 빨간색 (오류)
      } else if (state.busyWorkers && state.busyWorkers > 0) {
        color = "#ffa726"; // 주황색 (작업 중)
      } else {
        color = "#4caf50"; // 녹색 (정상)
      }
    }

    try {
      chrome.action.setBadgeBackgroundColor({ color, tabId });
    } catch (error) {
      console.error("배지 색상 설정 오류:", error);
    }
  }

  /**
   * 탭의 배지 상태 가져오기
   * @param tabId 탭 ID
   */
  public getBadgeState(tabId: number): BadgeState | undefined {
    return this.tabBadgeState.get(tabId);
  }

  /**
   * 탭의 배지 상태 초기화
   * @param tabId 탭 ID
   */
  public resetBadge(tabId: number): void {
    this.tabBadgeState.delete(tabId);

    try {
      chrome.action.setBadgeText({ text: "", tabId });
    } catch (error) {
      console.error("배지 초기화 오류:", error);
    }
  }

  /**
   * 유효한 탭 ID인지 확인
   */
  private isValidTabId(tabId: unknown): tabId is number {
    // 숫자 타입 확인
    if (typeof tabId !== "number") {
      return false;
    }

    // 음수 확인
    if (tabId < 0) {
      return false;
    }

    // NaN 확인
    if (isNaN(tabId)) {
      return false;
    }

    return true;
  }
}

// 싱글톤 인스턴스
export default new BadgeManager();
