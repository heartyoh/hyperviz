import { WeatherLayerOptions } from "../layers/base-weather-layer.js";
import {
  WeatherData as OriginalWeatherData,
  WeatherGridData as OriginalWeatherGridData,
  Location as OriginalLocation,
} from "./weather-types.js";

/**
 * 날씨 레이어 타입 정의
 */
export type WeatherLayerType =
  | "wind"
  | "temperature"
  | "precipitation"
  | "solar"
  | "cloud";

/**
 * 프로세서 타입 정의
 */
export type ProcessorType = WeatherLayerType;

/**
 * 위치 인터페이스 (단순화된 버전)
 */
export interface LocationBase {
  lat: number;
  lon: number;
}

/**
 * 날씨 데이터 기본 인터페이스
 */
export interface WeatherDataBase {
  timestamp: number;
  location: LocationBase;
  [key: string]: any;
}

/**
 * 날씨 그리드 데이터 인터페이스 (단순화된 버전)
 */
export interface WeatherGridDataBase {
  centerLocation: LocationBase;
  width: number;
  height: number;
  resolution: number;
  timestamp: number;
  data: WeatherDataBase[][];
}

// 기존 타입들 재정의 (원본 타입과 새 타입 간의 호환성)
export type Location = OriginalLocation;
export type WeatherData = OriginalWeatherData;
export type WeatherGridData = OriginalWeatherGridData;

/**
 * 바람 렌더링 옵션
 */
export interface WindRenderOptions extends WeatherLayerOptions {
  colorScale: string[];
  particleCount: number;
  particleAge: number;
  lineWidth: number;
  velocityScale: number;
  minVelocity: number;
  maxVelocity: number;
  fadeOpacity: number;
  dropRate: number;
  dropRateBump: number;
  speedFactor: number;
  [key: string]: any;
}

/**
 * 기온 렌더링 옵션
 */
export interface TemperatureRenderOptions extends WeatherLayerOptions {
  colorScale: string[];
  minTemperature: number;
  maxTemperature: number;
  interpolation: "linear" | "bilinear" | "bicubic";
  [key: string]: any;
}

/**
 * 강수량 렌더링 옵션
 */
export interface PrecipitationRenderOptions extends WeatherLayerOptions {
  colorScale: string[];
  minPrecipitation: number;
  maxPrecipitation: number;
  opacity: number;
  [key: string]: any;
}

/**
 * 일사량 렌더링 옵션
 */
export interface SolarRenderOptions extends WeatherLayerOptions {
  colorScale: string[];
  minSolar: number;
  maxSolar: number;
  opacity: number;
  [key: string]: any;
}

/**
 * 구름량 렌더링 옵션
 */
export interface CloudRenderOptions extends WeatherLayerOptions {
  colorScale: string[];
  minCloud: number;
  maxCloud: number;
  opacity: number;
  [key: string]: any;
}

export * from "./weather-types.js";
export * from "./worker-types.js";
