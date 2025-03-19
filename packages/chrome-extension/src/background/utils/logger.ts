/**
 * HyperViz Chrome Extension - 로깅 유틸리티
 */

// 개발 환경 여부 (빌드 시 webpack에서 설정)
declare const __DEV__: boolean;

// 로그 레벨 타입
export type LogLevel = "debug" | "info" | "warn" | "error";

// 로그 레벨 가중치 (필터링용)
const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// 현재 로그 레벨 (환경에 따라 조정)
// 개발 환경에서는 undefined일 수 있으므로 기본값으로 "info" 사용
const CURRENT_LOG_LEVEL: LogLevel =
  typeof __DEV__ !== "undefined" && __DEV__ ? "debug" : "info";

/**
 * 안전한 객체 직렬화 함수
 * 순환 참조와 함수, Error 객체 등을 처리
 */
function safeStringify(obj: any, indent: number = 2): string {
  if (obj === undefined) return "undefined";
  if (obj === null) return "null";

  // Error 객체 특별 처리
  if (obj instanceof Error) {
    const errorObj: Record<string, any> = {
      errorName: obj.name,
      errorMessage: obj.message,
      stack: obj.stack,
    };

    // 추가 속성 복사
    Object.getOwnPropertyNames(obj).forEach((prop) => {
      if (prop !== "name" && prop !== "message" && prop !== "stack") {
        errorObj[prop] = obj[prop];
      }
    });

    return JSON.stringify(errorObj, replacer, indent);
  }

  // DOM 요소 또는 순환 참조가 있는 객체 처리
  const seen = new WeakSet();

  // 순환 참조 처리를 위한 JSON replacer 함수
  function replacer(key: string, value: any) {
    // 함수는 함수 이름이나 '함수'로 표현
    if (typeof value === "function") {
      return `[Function: ${value.name || "anonymous"}]`;
    }

    // 기본 타입은 그대로 반환
    if (typeof value !== "object" || value === null) {
      return value;
    }

    // DOM 요소 등의 처리
    if (
      value.toString &&
      typeof value.toString === "function" &&
      value.toString() !== "[object Object]"
    ) {
      return value.toString();
    }

    // 순환 참조 감지
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    return value;
  }

  try {
    return JSON.stringify(obj, replacer, indent);
  } catch (err) {
    return `[직렬화 불가능 객체: ${typeof obj}]`;
  }
}

/**
 * 로거 객체
 */
const logger = {
  /**
   * 디버그 로그
   */
  debug(message: string, module?: string, data?: any) {
    this._log("debug", message, module, data);
  },

  /**
   * 정보 로그
   */
  info(message: string, module?: string, data?: any) {
    this._log("info", message, module, data);
  },

  /**
   * 경고 로그
   */
  warn(message: string, module?: string, data?: any) {
    this._log("warn", message, module, data);
  },

  /**
   * 오류 로그
   */
  error(message: string, module?: string, data?: any) {
    this._log("error", message, module, data);
  },

  /**
   * 내부 로깅 함수
   */
  _log(level: LogLevel, message: string, module?: string, data?: any) {
    // 로그 레벨 필터링
    if (LOG_LEVEL_WEIGHT[level] < LOG_LEVEL_WEIGHT[CURRENT_LOG_LEVEL]) {
      return;
    }

    // 모듈 정보 추가
    const modulePrefix = module ? `[${module}] ` : "";
    const formattedMsg = modulePrefix + message;

    // 로그 레벨에 따라 적절한 콘솔 함수 사용
    if (data !== undefined) {
      // 객체를 안전하게 직렬화
      const safeData = typeof data === "object" ? safeStringify(data) : data;
      console[level](formattedMsg, safeData);
    } else {
      console[level](formattedMsg);
    }

    // 오류 로그는 백그라운드 콘솔뿐만 아니라 팝업에서도 볼 수 있도록 저장
    if (level === "error") {
      this._storeError(formattedMsg, data);
    }
  },

  /**
   * 오류 로그 저장 (팝업 UI에서 확인 가능)
   */
  _storeError(message: string, data?: any) {
    const errorLog = {
      message,
      data: data ? safeStringify(data) : undefined,
      timestamp: new Date().toISOString(),
    };

    // 스토리지에 오류 저장
    chrome.storage.local.get(["errorLogs"], (result) => {
      const logs = result.errorLogs || [];
      logs.push(errorLog);

      // 최대 50개의 오류 로그만 유지
      if (logs.length > 50) {
        logs.shift();
      }

      chrome.storage.local.set({ errorLogs: logs });
    });
  },
};

export default logger;
