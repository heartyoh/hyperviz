/**
 * 로깅 유틸리티
 * 워커 풀 시스템에서 사용되는 로깅 유틸리티
 */

import { LogLevel } from "../types/index.js";

/**
 * 로거 설정 인터페이스
 */
export interface LoggerConfig {
  /** 로깅 활성화 여부 */
  enabled: boolean;
  /** 로그 레벨 */
  level: LogLevel;
  /** 콘솔 출력 여부 */
  console: boolean;
  /** 사용자 정의 로그 핸들러 */
  customHandler?: (level: LogLevel, message: string, ...args: any[]) => void;
}

/**
 * 기본 로거 설정
 */
const defaultConfig: LoggerConfig = {
  enabled: true,
  level: LogLevel.INFO,
  console: true,
};

/**
 * 로거 클래스
 */
class Logger {
  /** 로거 설정 */
  private config: LoggerConfig;

  /**
   * 로거 생성자
   * @param config 로거 설정
   */
  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      ...defaultConfig,
      ...config,
    };
  }

  /**
   * 로거 설정 업데이트
   * @param config 로거 설정
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * 디버그 레벨 로그
   * @param message 메시지
   * @param args 추가 인자
   */
  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  /**
   * 정보 레벨 로그
   * @param message 메시지
   * @param args 추가 인자
   */
  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  /**
   * 경고 레벨 로그
   * @param message 메시지
   * @param args 추가 인자
   */
  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  /**
   * 오류 레벨 로그
   * @param message 메시지
   * @param args 추가 인자
   */
  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  /**
   * 로그 출력
   * @param level 로그 레벨
   * @param message 메시지
   * @param args 추가 인자
   */
  private log(level: LogLevel, message: string, ...args: any[]): void {
    // 로깅이 비활성화되었거나 설정된 레벨보다 낮은 레벨이면 무시
    if (!this.config.enabled || !this.shouldLog(level)) {
      return;
    }

    // 타임스탬프 추가
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] ${message}`;

    // 사용자 정의 핸들러가 있으면 호출
    if (this.config.customHandler) {
      this.config.customHandler(level, formattedMessage, ...args);
    }

    // 콘솔 출력이 활성화되어 있으면 콘솔에 출력
    if (this.config.console) {
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage, ...args);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage, ...args);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage, ...args);
          break;
        case LogLevel.ERROR:
          console.error(formattedMessage, ...args);
          break;
      }
    }
  }

  /**
   * 로그 레벨이 출력 가능한지 확인
   * @param level 로그 레벨
   * @returns 출력 가능 여부
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
    };

    return levels[level] >= levels[this.config.level];
  }
}

/**
 * 로거 인스턴스
 */
export const logger = new Logger();
