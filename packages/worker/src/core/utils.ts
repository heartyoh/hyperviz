/**
 * 고유 ID 생성 함수
 * @returns 고유 ID 문자열
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .substring(2, 9)}`;
}

/**
 * 비동기 딜레이 함수
 * @param ms 지연 시간 (밀리초)
 * @returns Promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 객체 깊은 복사 함수
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

  const copied: Record<string, any> = {};
  Object.keys(obj as Record<string, any>).forEach((key) => {
    copied[key] = deepCopy((obj as Record<string, any>)[key]);
  });

  return copied as T;
}

/**
 * 현재 시간 타임스탬프(밀리초) 반환 함수
 * @returns 현재 시간 타임스탬프
 */
export function now(): number {
  return Date.now();
}

/**
 * 에러를 문자열로 변환하는 함수
 * @param error 에러 객체 또는 문자열
 * @returns 에러 문자열
 */
export function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
