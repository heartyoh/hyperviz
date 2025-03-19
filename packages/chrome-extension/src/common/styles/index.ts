/**
 * 공통 스타일 모듈
 *
 * 모든 공통 스타일을 내보내기
 */

// 공통 CSS 스타일
import "./common.css";

// 스타일 유틸리티 함수나 테마 상수 등을 추가할 수 있음
export const THEME = {
  light: {
    primary: "#4e6ef2",
    secondary: "#7986cb",
    background: "#ffffff",
    text: "#333333",
  },
  dark: {
    primary: "#5c7cf9",
    secondary: "#94a2e8",
    background: "#1e1e1e",
    text: "#e0e0e0",
  },
};

/**
 * 현재 시스템 테마 모드 확인 (라이트/다크)
 */
export function getThemeMode(): "light" | "dark" {
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

/**
 * 워커 상태에 따른 색상 반환
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case "idle":
      return "var(--color-success)";
    case "busy":
      return "var(--color-warning)";
    case "error":
      return "var(--color-error)";
    case "terminated":
      return "var(--color-text-secondary)";
    default:
      return "var(--color-text-secondary)";
  }
}

/**
 * 데이터 트렌드 표시용 화살표 아이콘 반환
 */
export function getTrendIcon(current: number, previous: number): string {
  if (current > previous) return "↑";
  if (current < previous) return "↓";
  return "→";
}

export default {
  THEME,
  getThemeMode,
  getStatusColor,
  getTrendIcon,
};
