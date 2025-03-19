/**
 * HyperViz 크롬 확장 프로그램 - 배지 관리자
 */

import logger from "./utils/logger";

/**
 * 배지 관리자 클래스
 * 탭 아이콘의 배지 텍스트와 색상을 관리
 */
class BadgeManager {
  /**
   * 배지 텍스트 설정
   */
  public setBadgeText(tabId: number, text: string): void {
    try {
      // 유효한 탭 ID 검증
      if (!this.isValidTabId(tabId)) {
        logger.warn(
          "유효하지 않은 탭 ID로 배지 텍스트 설정 시도",
          "BadgeManager",
          {
            tabId,
            text,
          }
        );
        return;
      }

      chrome.action.setBadgeText({
        tabId,
        text,
      });
    } catch (error) {
      logger.error("배지 텍스트 설정 중 오류", "BadgeManager", {
        tabId,
        text,
        error,
      });
    }
  }

  /**
   * 배지 배경색 설정
   */
  public setBadgeBackgroundColor(
    tabId: number,
    color: string | chrome.action.ColorArray
  ): void {
    try {
      // 유효한 탭 ID 검증
      if (!this.isValidTabId(tabId)) {
        logger.warn(
          "유효하지 않은 탭 ID로 배지 배경색 설정 시도",
          "BadgeManager",
          {
            tabId,
            color,
          }
        );
        return;
      }

      chrome.action.setBadgeBackgroundColor({
        tabId,
        color,
      });
    } catch (error) {
      logger.error("배지 배경색 설정 중 오류", "BadgeManager", {
        tabId,
        color,
        error,
      });
    }
  }

  /**
   * 배지 초기화 (텍스트 제거 및 기본 색상으로 변경)
   */
  public clearBadge(tabId: number): void {
    try {
      // 유효한 탭 ID 검증
      if (!this.isValidTabId(tabId)) {
        logger.warn("유효하지 않은 탭 ID로 배지 초기화 시도", "BadgeManager", {
          tabId,
        });
        return;
      }

      chrome.action.setBadgeText({
        tabId,
        text: "",
      });
      chrome.action.setBadgeBackgroundColor({
        tabId,
        color: "#5cb85c", // 기본 녹색
      });
    } catch (error) {
      logger.error("배지 초기화 중 오류", "BadgeManager", {
        tabId,
        error,
      });
    }
  }

  /**
   * 워커 수에 따른 배지 업데이트
   */
  public updateWorkerCountBadge(tabId: number, workerCount: number): void {
    try {
      // 유효한 탭 ID 검증
      if (!this.isValidTabId(tabId)) {
        logger.warn(
          "유효하지 않은 탭 ID로 워커 수 배지 업데이트 시도",
          "BadgeManager",
          {
            tabId,
            workerCount,
          }
        );
        return;
      }

      // 워커 수 텍스트 설정
      const text = workerCount > 0 ? workerCount.toString() : "";
      this.setBadgeText(tabId, text);

      // 워커 수에 따라 색상 변경
      let color = "#5cb85c"; // 녹색 (기본)

      if (workerCount > 10) {
        color = "#d9534f"; // 빨간색 (많은 워커)
      } else if (workerCount > 5) {
        color = "#f0ad4e"; // 노란색 (중간 워커 수)
      }

      this.setBadgeBackgroundColor(tabId, color);
    } catch (error) {
      logger.error("워커 수 배지 업데이트 중 오류", "BadgeManager", {
        tabId,
        workerCount,
        error,
      });
    }
  }

  /**
   * 오류 배지 표시
   */
  public showErrorBadge(tabId: number): void {
    try {
      // 유효한 탭 ID 검증
      if (!this.isValidTabId(tabId)) {
        logger.warn(
          "유효하지 않은 탭 ID로 오류 배지 표시 시도",
          "BadgeManager",
          {
            tabId,
          }
        );
        return;
      }

      this.setBadgeText(tabId, "!");
      this.setBadgeBackgroundColor(tabId, "#d9534f"); // 빨간색
    } catch (error) {
      logger.error("오류 배지 표시 중 오류", "BadgeManager", {
        tabId,
        error,
      });
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
