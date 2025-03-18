/**
 * 애니메이션 설정 인터페이스
 */
export interface AnimationConfig {
  /**
   * 애니메이션 타입
   */
  type?: string;

  /**
   * 애니메이션 지속 시간 (ms)
   */
  duration?: number;

  /**
   * 애니메이션 시작 지연 시간 (ms)
   */
  delay?: number;

  /**
   * 애니메이션 단계 처리 함수
   */
  step?: (delta: number) => void;

  /**
   * 애니메이션 진행 함수
   */
  delta?: DeltaFunction | string;

  /**
   * 이징 함수 타입 (in, out, inout)
   */
  ease?: string;

  /**
   * 애니메이션에 필요한 추가 옵션
   */
  options?: any;

  /**
   * 애니메이션 반복 여부
   */
  repeat?: boolean;

  /**
   * 애니메이션 반복 간격 (ms)
   */
  interval?: number;
}

/**
 * 애니메이션 인터페이스
 */
export interface Animation {
  /**
   * 애니메이션 시작
   */
  start(): void;

  /**
   * 애니메이션 정지
   */
  stop(): void;

  /**
   * 자원 해제
   */
  dispose(): void;

  /**
   * 애니메이션 실행 중 여부
   */
  started: boolean;
}

/**
 * 애니메이션 속성 키 타입
 */
export type AnimationPropertyKey =
  | "tx"
  | "ty"
  | "tz"
  | "sx"
  | "sy"
  | "sz"
  | "rx"
  | "ry"
  | "rz"
  | "theta"
  | "fade";

/**
 * 속성 값 변경 객체 타입
 */
export type AnimationDeltaObject = {
  [K in AnimationPropertyKey]?: number;
};

/**
 * 애니메이션 클라이언트 인터페이스
 */
export interface AnimationClient {
  /**
   * 애니메이션 이벤트
   */
  onAnimation?(event: string): void;

  /**
   * 속성 값 변경
   * @param property 변경할 속성 이름 또는 {속성: 값} 형태의 객체
   * @param value 변경할 값 (단일 속성 이름을 사용할 경우 필요)
   */
  delta(
    property?: AnimationPropertyKey | AnimationDeltaObject,
    value?: number
  ): void;
}

/**
 * Delta 함수 타입
 */
export type DeltaFunction = (progress: number, options?: any) => number;

/**
 * 애니메이션 레지스트리 인터페이스
 */
export interface AnimationRegistry {
  [key: string]: any;
}

/**
 * Back 애니메이션 옵션
 */
export interface BackOptions {
  x: number;
}

/**
 * Elastic 애니메이션 옵션
 */
export interface ElasticOptions {
  x: number;
}
