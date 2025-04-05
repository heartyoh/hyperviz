/**
 * 날씨 레이어 타입 정의
 */
export type WeatherLayerType =
  | "wind"
  | "cloud"
  | "solar"
  | "temperature"
  | "precipitation";

/**
 * 위치 인터페이스
 */
export interface Location {
  latitude: number;
  longitude: number;
}

/**
 * 온도 인터페이스
 */
export interface Temperature {
  current: number;
  value?: number; // 호환성을 위해 추가
  unit: string;
}

/**
 * 바람 인터페이스
 */
export interface Wind {
  speed: number;
  unit: string;
  direction: number;
}

/**
 * 강수량 인터페이스
 */
export interface Precipitation {
  amount: number; // mm
  probability: number; // %
  unit?: string; // 호환성을 위해 추가
}

/**
 * 구름 인터페이스
 */
export interface Cloud {
  coverage: number; // %
  height: number; // m
}

/**
 * 일사량 인터페이스
 */
export interface Solar {
  radiation: number;
  unit: string;
}

/**
 * 날씨 데이터 인터페이스
 */
export interface WeatherData {
  location: Location;
  temperature: Temperature;
  wind: Wind;
  humidity?: number;
  cloud: Cloud;
  cloudCoverage?: number; // 이전 버전과의 호환성을 위해 유지
  solar: Solar;
  solarRadiation?: number; // 이전 버전과의 호환성을 위해 유지
  precipitation: Precipitation;
  weatherDescription?: string;
  time: Date;
  timestamp?: string; // 이전 버전과의 호환성을 위해 유지
}

/**
 * 날씨 그리드 데이터 인터페이스
 */
export interface WeatherGridData {
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  gridSize: {
    rows: number;
    cols: number;
  };
  data: WeatherData[][];
}

/**
 * 날씨 서비스 옵션 인터페이스
 */
export interface WeatherServiceOptions {
  apiKey?: string;
  endpoint?: string;
  updateInterval?: number; // 초 단위
  mockData?: WeatherData[];
}
