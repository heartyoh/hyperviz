/**
 * UUID v4 생성 함수
 */
export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 두 값 사이의 선형 보간 함수
 */
export function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

/**
 * 배열을 특정 크기의 청크로 나누는 함수
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunked = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

/**
 * 디바운스 함수
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * 스로틀 함수
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  return function (...args: Parameters<T>) {
    lastArgs = args;

    if (!timeout) {
      timeout = setTimeout(() => {
        if (lastArgs) func(...lastArgs);
        timeout = null;
      }, wait);
    }
  };
}

/**
 * 브라우저 성능과 기능 지원 여부를 체크하는 함수
 */
export function detectPerformanceCapabilities(): {
  offscreenCanvasSupported: boolean;
  webWorkerSupported: boolean;
  hardwareConcurrency: number;
  devicePixelRatio: number;
} {
  return {
    offscreenCanvasSupported: typeof OffscreenCanvas !== "undefined",
    webWorkerSupported: typeof Worker !== "undefined",
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}
