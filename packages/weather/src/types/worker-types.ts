import { WeatherData, WeatherLayerType } from "./weather-types";

/**
 * 워커 프로세서 타입
 */
export type ProcessorType = WeatherLayerType;

/**
 * 메인 스레드에서 워커로 전송되는 메시지 타입
 */
export interface WorkerMessageData {
  // 공통 필드
  processorType: ProcessorType;
  operation: "render" | "process" | "initialize";
  taskId: string;

  // 작업 관련 데이터
  weatherData?: WeatherData[];
  bounds?: [number, number, number, number]; // [minX, minY, maxX, maxY]
  width?: number;
  height?: number;
  resolution?: number;
  options?: any;
}

/**
 * 바람 레이어 렌더링 옵션
 */
export interface WindRenderOptions {
  maxSpeed: number;
  particleDensity: number;
  fadeOpacity: number;
  colorScale: string[];
  lineWidth: number;
}

/**
 * 온도 레이어 렌더링 옵션
 */
export interface TemperatureRenderOptions {
  minTemperature: number;
  maxTemperature: number;
  colorScale: string[];
  opacity: number;
}

/**
 * 강수량 레이어 렌더링 옵션
 */
export interface PrecipitationRenderOptions {
  maxAmount: number;
  colorScale: string[];
  opacity: number;
}

/**
 * 일사량 레이어 렌더링 옵션
 */
export interface SolarRenderOptions {
  maxRadiation: number;
  colorScale: string[];
  opacity: number;
}

/**
 * 구름 레이어 렌더링 옵션
 */
export interface CloudRenderOptions {
  opacity: number;
  colorScale: string[];
}

/**
 * 워커에서 메인 스레드로 전송되는 메시지 타입
 */
export interface WorkerResultData {
  taskId: string;
  processorType: ProcessorType;
  status: "success" | "error";
  result?: {
    imageData?: ImageBitmap;
    metadata?: any;
  };
  error?: string;
}
