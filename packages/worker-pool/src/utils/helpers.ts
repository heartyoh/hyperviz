/**
 * 유틸리티 함수 모음
 */

/**
 * 고유 ID 생성
 *
 * @returns 고유 ID 문자열
 */
export function generateId(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

/**
 * 지연 함수 (Promise 기반)
 *
 * @param ms 밀리초
 * @returns Promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 객체 깊은 복사
 *
 * @param obj 복사할 객체
 * @returns 복사된 객체
 */
export function deepCopy<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepCopy(item)) as unknown as T;
  }

  const result: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = deepCopy((obj as any)[key]);
    }
  }

  return result;
}

/**
 * 문자열 해시 코드 생성
 *
 * @param str 문자열
 * @returns 해시 코드 (숫자)
 */
export function hashString(str: string): number {
  let hash = 0;

  if (str.length === 0) {
    return hash;
  }

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 32비트 정수로 변환
  }

  return hash;
}

/**
 * 객체를 문자열로 직렬화 (순환 참조 처리)
 *
 * @param obj 직렬화할 객체
 * @returns JSON 문자열
 */
export function safeStringify(obj: any): string {
  const cache = new Set();

  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === "object" && value !== null) {
      if (cache.has(value)) {
        return "[Circular Reference]";
      }
      cache.add(value);
    }
    return value;
  });
}

/**
 * CPU 코어 수 기반 워커 수 추천
 *
 * @param fraction CPU 코어의 몇 배를 사용할지 (기본값: 0.75)
 * @param min 최소 워커 수 (기본값: 1)
 * @param max 최대 워커 수 (기본값: 무제한)
 * @returns 추천 워커 수
 */
export function recommendWorkerCount(
  fraction: number = 0.75,
  min: number = 1,
  max: number = Infinity
): number {
  try {
    // Node.js의 os 모듈을 동적으로 가져옴
    const os = require("os");
    const cpuCount = os.cpus().length;
    const recommended = Math.max(min, Math.floor(cpuCount * fraction));
    return Math.min(recommended, max);
  } catch (error) {
    // os 모듈을 사용할 수 없는 경우 (예: 브라우저 환경)
    return min;
  }
}
