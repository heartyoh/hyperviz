/**
 * 환경 감지 유틸리티
 *
 * 브라우저와 Node.js 환경을 감지하고 적절한 API를 제공합니다.
 */

/**
 * 브라우저 환경인지 확인
 * @returns 브라우저 환경이면 true, 아니면 false
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Node.js 환경인지 확인
 * @returns Node.js 환경이면 true, 아니면 false
 */
export function isNode(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions !== "undefined" &&
    typeof process.versions.node !== "undefined"
  );
}

/**
 * Web Worker 지원 여부 확인
 * @returns Web Worker를 지원하면 true, 아니면 false
 */
export function supportsWebWorker(): boolean {
  return isBrowser() && typeof Worker !== "undefined";
}

/**
 * 상대 경로를 절대 URL로 변환
 * @param relativePath 상대 경로
 * @returns 절대 URL
 */
export function resolveWorkerPath(relativePath: string): string {
  if (isBrowser()) {
    // 브라우저 환경에서는 URL 객체를 사용하여 상대 경로를 절대 경로로 변환
    // location.href를 기준으로 상대 경로를 해석
    const base = new URL(window.location.href);
    return new URL(relativePath, base).href;
  }
  // Node.js 환경에서는 그대로 반환
  return relativePath;
}

/**
 * Worker 스크립트 URL 생성
 * @param scriptPath Worker 스크립트 경로
 * @returns 브라우저에서는 Blob URL, Node.js에서는 스크립트 경로
 */
export function createWorkerURL(scriptPath: string): string {
  if (isBrowser()) {
    // 경로 해석
    const resolvedPath = resolveWorkerPath(scriptPath);

    // 동적 가져오기를 위해 Worker Wrapper 코드 생성
    const workerWrapper = `
      // Web Worker Wrapper
      self.addEventListener('message', function(e) {
        // 초기 워커 데이터 처리
        if (e.data && e.data.__workerInit) {
          self.workerData = e.data.workerData;
          return;
        }
        
        // Dynamic import for the worker script
        importScripts('${resolvedPath}');
      });
    `;

    // Blob URL 생성
    const blob = new Blob([workerWrapper], { type: "application/javascript" });
    return URL.createObjectURL(blob);
  }

  // Node.js 환경이면 스크립트 경로 그대로 반환
  return scriptPath;
}

/**
 * Worker URL 해제
 * @param url 해제할 URL
 */
export function revokeWorkerURL(url: string): void {
  if (isBrowser() && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}
