/**
 * Enhanced TimeoutManager
 *
 * 고급 타임아웃 관리 시스템으로 다중 타임아웃 타이머를 처리하고 자동 재시도 기능을 제공합니다.
 * 메모리 누수를 방지하고 복잡한 비동기 워크플로우에서 타임아웃 처리를 중앙화합니다.
 */

/**
 * TimeoutManager 옵션 인터페이스
 */
export interface TimeoutManagerOptions {
  /** 기본 최대 재시도 횟수 */
  maxRetries?: number;
  /** 재시도 지연 시간 기본값 (ms) */
  retryDelayBase?: number;
  /** 지터(무작위성) 최대값 (ms) */
  maxJitter?: number;
  /** 최대 백오프 지연 시간 (ms) */
  maxBackoffDelay?: number;
  /** 디버그 모드 활성화 */
  debug?: boolean;
}

/**
 * 타임아웃 상태 열거형
 */
export enum TimeoutStatus {
  /** 활성 상태 */
  ACTIVE = "active",
  /** 완료됨 */
  COMPLETED = "completed",
  /** 취소됨 */
  CANCELLED = "cancelled",
  /** 재시도 중 */
  RETRYING = "retrying",
  /** 실패 (모든 재시도 실패) */
  FAILED = "failed",
}

/**
 * 타임아웃 정보 인터페이스
 */
export interface TimeoutInfo {
  /** 타임아웃 ID */
  id: string;
  /** 생성 시간 */
  createdAt: number;
  /** 마지막 업데이트 시간 */
  updatedAt: number;
  /** 상태 */
  status: TimeoutStatus;
  /** 현재 재시도 횟수 */
  retryCount: number;
  /** 최대 재시도 횟수 */
  maxRetries: number;
  /** 원래 지연 시간 (ms) */
  originalDelay: number;
  /** 현재 지연 시간 (ms) */
  currentDelay: number;
}

/**
 * 타임아웃 메타데이터 인터페이스 (내부용)
 */
interface TimeoutMetadata {
  /** 타이머 ID */
  timerId: number;
  /** 생성 시간 */
  createdAt: number;
  /** 마지막 업데이트 시간 */
  updatedAt: number;
  /** 상태 */
  status: TimeoutStatus;
  /** 재시도 횟수 */
  retryCount: number;
  /** 최대 재시도 횟수 */
  maxRetries: number;
  /** 원래 지연 시간 */
  originalDelay: number;
  /** 현재 지연 시간 */
  currentDelay: number;
}

/**
 * 향상된 타임아웃 관리자 클래스
 */
export class TimeoutManager {
  /** 타임아웃 타이머 맵 */
  private timeouts: Map<string, TimeoutMetadata> = new Map();
  /** 기본 최대 재시도 횟수 */
  private maxRetries: number = 3;
  /** 기본 재시도 지연 시간 (ms) */
  private retryDelayBase: number = 2000;
  /** 최대 지터(무작위성) 값 (ms) */
  private maxJitter: number = 1000;
  /** 최대 백오프 지연 시간 (ms) */
  private maxBackoffDelay: number = 60000;
  /** 디버그 모드 여부 */
  private debug: boolean = false;
  /** 성능 통계 */
  private stats = {
    created: 0,
    completed: 0,
    cancelled: 0,
    retried: 0,
    failed: 0,
  };

  /**
   * 타임아웃 관리자 생성자
   * @param options 타임아웃 관리자 옵션
   */
  constructor(options?: TimeoutManagerOptions) {
    if (options) {
      if (options.maxRetries !== undefined && options.maxRetries >= 0) {
        this.maxRetries = options.maxRetries;
      }

      if (options.retryDelayBase !== undefined && options.retryDelayBase > 0) {
        this.retryDelayBase = options.retryDelayBase;
      }

      if (options.maxJitter !== undefined && options.maxJitter >= 0) {
        this.maxJitter = options.maxJitter;
      }

      if (
        options.maxBackoffDelay !== undefined &&
        options.maxBackoffDelay > 0
      ) {
        this.maxBackoffDelay = options.maxBackoffDelay;
      }

      if (options.debug !== undefined) {
        this.debug = options.debug;
      }
    }
  }

  /**
   * 타임아웃 설정
   * 지정된 지연 시간 후 콜백을 실행합니다.
   *
   * @param id 고유 식별자
   * @param callback 타임아웃 시 실행할 콜백
   * @param delay 지연 시간 (ms)
   * @returns 타이머 ID
   */
  public set(id: string, callback: () => void, delay: number): number {
    // 기존 타임아웃 제거
    this.clear(id);

    const now = Date.now();

    // 타이머 생성
    const timerId = window.setTimeout(() => {
      // 실행 시 상태 업데이트
      const metadata = this.timeouts.get(id);
      if (metadata) {
        metadata.status = TimeoutStatus.COMPLETED;
        metadata.updatedAt = Date.now();
        this.stats.completed++;
      }

      // 맵에서 제거
      this.timeouts.delete(id);

      // 콜백 실행
      try {
        callback();
      } catch (error) {
        this.logError(`타임아웃 콜백 실행 중 오류 (ID: ${id}):`, error);
      }
    }, delay);

    // 메타데이터 저장
    this.timeouts.set(id, {
      timerId,
      createdAt: now,
      updatedAt: now,
      status: TimeoutStatus.ACTIVE,
      retryCount: 0,
      maxRetries: this.maxRetries,
      originalDelay: delay,
      currentDelay: delay,
    });

    this.stats.created++;
    this.log(`타임아웃 설정: ${id}, 지연: ${delay}ms`);

    return timerId;
  }

  /**
   * 기존 타임아웃 재설정
   * 지연 시간을 재시작합니다.
   *
   * @param id 고유 식별자
   * @param callback 타임아웃 시 실행할 콜백
   * @param delay 지연 시간 (ms, 지정하지 않으면 원래 지연 시간 사용)
   * @returns 새 타이머 ID
   */
  public reset(id: string, callback: () => void, delay?: number): number {
    const existingTimeout = this.timeouts.get(id);
    const actualDelay =
      delay || (existingTimeout ? existingTimeout.originalDelay : 2000);

    this.log(`타임아웃 재설정: ${id}, 지연: ${actualDelay}ms`);

    return this.set(id, callback, actualDelay);
  }

  /**
   * 타임아웃 제거
   *
   * @param id 고유 식별자
   * @returns 타이머가 있어서 제거했으면 true, 없었으면 false
   */
  public clear(id: string): boolean {
    const metadata = this.timeouts.get(id);
    if (metadata) {
      // 타이머 취소
      window.clearTimeout(metadata.timerId);

      // 상태 업데이트
      metadata.status = TimeoutStatus.CANCELLED;
      metadata.updatedAt = Date.now();
      this.stats.cancelled++;

      // 맵에서 제거
      this.timeouts.delete(id);

      this.log(`타임아웃 제거: ${id}`);
      return true;
    }
    return false;
  }

  /**
   * 모든 타임아웃 제거
   */
  public clearAll(): void {
    let count = 0;
    this.timeouts.forEach((metadata, id) => {
      window.clearTimeout(metadata.timerId);
      metadata.status = TimeoutStatus.CANCELLED;
      count++;
    });

    this.timeouts.clear();
    this.stats.cancelled += count;

    this.log(`모든 타임아웃 제거: ${count}개`);
  }

  /**
   * 재시도 기능이 있는 타임아웃 설정
   * 타임아웃 발생 시 지정된 횟수만큼 자동으로 재시도합니다.
   *
   * @param id 고유 식별자
   * @param timeoutCallback 최종 타임아웃 콜백 (모든 재시도 실패 시)
   * @param retryCallback 재시도 콜백 (재시도 시마다 호출)
   * @param delay 타임아웃 지연 시간 (ms)
   * @param maxRetries 최대 재시도 횟수 (기본값: 클래스에 설정된 값)
   * @returns 타이머 ID
   */
  public setWithRetry(
    id: string,
    timeoutCallback: () => void,
    retryCallback: (retryCount: number, nextDelay: number) => void,
    delay: number,
    maxRetries?: number
  ): number {
    // 기존 타임아웃 제거
    this.clear(id);

    const now = Date.now();
    const actualMaxRetries =
      maxRetries !== undefined ? maxRetries : this.maxRetries;

    // 타임아웃 핸들러
    const handleTimeout = (currentRetry: number = 0) => {
      if (currentRetry < actualMaxRetries) {
        // 재시도 가능한 경우
        const newRetryCount = currentRetry + 1;

        // 다음 지연 시간 계산 (지수적 백오프)
        const nextDelay = this.calculateBackoffDelay(newRetryCount);

        // 메타데이터 업데이트
        const metadata = this.timeouts.get(id);
        if (metadata) {
          metadata.retryCount = newRetryCount;
          metadata.status = TimeoutStatus.RETRYING;
          metadata.updatedAt = now;
          metadata.currentDelay = nextDelay;
        }

        this.stats.retried++;

        // 재시도 콜백 호출
        try {
          retryCallback(newRetryCount, nextDelay);
        } catch (error) {
          this.logError(`재시도 콜백 실행 중 오류 (ID: ${id}):`, error);
        }

        this.log(
          `타임아웃 재시도: ${id}, 횟수: ${newRetryCount}/${actualMaxRetries}, 다음 지연: ${nextDelay}ms`
        );

        // 다음 타임아웃 설정
        const timerId = window.setTimeout(
          () => handleTimeout(newRetryCount),
          nextDelay
        );

        // 메타데이터 업데이트
        if (metadata) {
          metadata.timerId = timerId;
        }

        return timerId;
      } else {
        // 최대 재시도 횟수 초과
        const metadata = this.timeouts.get(id);
        if (metadata) {
          metadata.status = TimeoutStatus.FAILED;
          metadata.updatedAt = Date.now();
        }

        this.timeouts.delete(id);
        this.stats.failed++;

        this.log(
          `타임아웃 최종 실패: ${id}, 최대 재시도 횟수(${actualMaxRetries}) 초과`
        );

        // 최종 타임아웃 콜백 실행
        try {
          timeoutCallback();
        } catch (error) {
          this.logError(`최종 타임아웃 콜백 실행 중 오류 (ID: ${id}):`, error);
        }

        return -1;
      }
    };

    // 초기 타임아웃 설정
    const timerId = window.setTimeout(() => handleTimeout(0), delay);

    // 메타데이터 저장
    this.timeouts.set(id, {
      timerId,
      createdAt: now,
      updatedAt: now,
      status: TimeoutStatus.ACTIVE,
      retryCount: 0,
      maxRetries: actualMaxRetries,
      originalDelay: delay,
      currentDelay: delay,
    });

    this.stats.created++;
    this.log(
      `재시도 타임아웃 설정: ${id}, 지연: ${delay}ms, 최대 재시도: ${actualMaxRetries}`
    );

    return timerId;
  }

  /**
   * 재시도 카운터 초기화
   *
   * @param id 고유 식별자
   * @returns 초기화 성공 여부
   */
  public resetRetryCounter(id: string): boolean {
    const metadata = this.timeouts.get(id);
    if (metadata) {
      metadata.retryCount = 0;
      metadata.updatedAt = Date.now();
      this.log(`재시도 카운터 초기화: ${id}`);
      return true;
    }
    return false;
  }

  /**
   * 현재 재시도 횟수 조회
   *
   * @param id 고유 식별자
   * @returns 현재 재시도 횟수 (없으면 0)
   */
  public getRetryCount(id: string): number {
    const metadata = this.timeouts.get(id);
    return metadata ? metadata.retryCount : 0;
  }

  /**
   * 타임아웃 상태 조회
   *
   * @param id 고유 식별자
   * @returns 타임아웃 상태 정보 (없으면 undefined)
   */
  public getTimeoutInfo(id: string): TimeoutInfo | undefined {
    const metadata = this.timeouts.get(id);
    if (!metadata) return undefined;

    return {
      id,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      status: metadata.status,
      retryCount: metadata.retryCount,
      maxRetries: metadata.maxRetries,
      originalDelay: metadata.originalDelay,
      currentDelay: metadata.currentDelay,
    };
  }

  /**
   * 모든 활성 타임아웃 ID 목록 조회
   *
   * @returns 활성 타임아웃 ID 배열
   */
  public getActiveTimeoutIds(): string[] {
    return Array.from(this.timeouts.keys());
  }

  /**
   * 활성 타임아웃 개수 조회
   *
   * @returns 활성 타임아웃 개수
   */
  public get size(): number {
    return this.timeouts.size;
  }

  /**
   * 통계 정보 조회
   *
   * @returns 타임아웃 통계 정보
   */
  public getStats(): {
    created: number;
    completed: number;
    cancelled: number;
    retried: number;
    failed: number;
    active: number;
  } {
    return {
      ...this.stats,
      active: this.timeouts.size,
    };
  }

  /**
   * 최대 재시도 횟수 설정
   *
   * @param value 최대 재시도 횟수
   */
  public setMaxRetries(value: number): void {
    if (value >= 0) {
      this.maxRetries = value;
      this.log(`최대 재시도 횟수 설정: ${value}`);
    }
  }

  /**
   * 기본 재시도 지연 시간 설정
   *
   * @param value 기본 재시도 지연 시간 (ms)
   */
  public setRetryDelayBase(value: number): void {
    if (value > 0) {
      this.retryDelayBase = value;
      this.log(`기본 재시도 지연 시간 설정: ${value}ms`);
    }
  }

  /**
   * 디버그 모드 설정
   *
   * @param enabled 디버그 모드 활성화 여부
   */
  public setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  /**
   * 지수적 백오프 지연 시간 계산
   *
   * @param retryCount 현재 재시도 횟수
   * @returns 다음 지연 시간 (ms)
   * @private
   */
  private calculateBackoffDelay(retryCount: number): number {
    // 지연 시간 = 기본 지연 시간 * 2^(재시도 횟수-1) + 랜덤 요소
    const exponentialPart = Math.pow(2, retryCount - 1);
    const jitter = Math.random() * this.maxJitter;

    // 최대 백오프 지연 시간보다 크지 않도록 제한
    return Math.min(
      Math.floor(this.retryDelayBase * exponentialPart + jitter),
      this.maxBackoffDelay
    );
  }

  /**
   * 디버그 로그 출력
   *
   * @param message 로그 메시지
   * @private
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[TimeoutManager] ${message}`);
    }
  }

  /**
   * 오류 로그 출력
   *
   * @param message 오류 메시지
   * @param error 오류 객체
   * @private
   */
  private logError(message: string, error: any): void {
    console.error(`[TimeoutManager] ${message}`, error);
  }
}
