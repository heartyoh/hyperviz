import { LocationBase, WeatherDataBase } from "../../../src/types/index.js";
import {
  DEFAULT_EXAMPLE_SETTINGS,
  ExampleSettings,
  generateMockWeatherData,
} from "../models/weather-example.js";

/**
 * 예제에서 사용할 상태 저장 클래스
 */
export class ExampleState {
  private static instance: ExampleState;

  // 상태 저장용 맵
  private state = new Map<string, any>();

  private constructor() {
    // 싱글톤 패턴
  }

  /**
   * 싱글톤 인스턴스 가져오기
   */
  public static getInstance(): ExampleState {
    if (!ExampleState.instance) {
      ExampleState.instance = new ExampleState();
    }
    return ExampleState.instance;
  }

  /**
   * 상태 값 설정
   * @param key 키
   * @param value 값
   */
  public set<T>(key: string, value: T): void {
    this.state.set(key, value);
  }

  /**
   * 상태 값 가져오기
   * @param key 키
   * @param defaultValue 기본값
   */
  public get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.state.has(key)) {
      return this.state.get(key) as T;
    }
    return defaultValue;
  }

  /**
   * 상태 초기화
   */
  public clear(): void {
    this.state.clear();
  }
}

/**
 * 상태 관리 객체
 */
export const state = ExampleState.getInstance();

/**
 * 예제 초기화 함수
 * @param settings 예제 설정
 */
export function initializeExample(
  settings: Partial<ExampleSettings> = {}
): ExampleSettings {
  // 기본 설정과 병합
  const mergedSettings: ExampleSettings = {
    ...DEFAULT_EXAMPLE_SETTINGS,
    ...settings,
  };

  // 상태에 저장
  state.set("settings", mergedSettings);

  return mergedSettings;
}

/**
 * 날씨 데이터 로드 함수
 * (실제 API 호출 대신 모의 데이터 생성)
 *
 * @param center 중심 위치
 * @param count 데이터 포인트 수
 */
export async function loadWeatherData(
  center: LocationBase = DEFAULT_EXAMPLE_SETTINGS.defaultLocation,
  count: number = 25
): Promise<WeatherDataBase[]> {
  // 모의 데이터 생성
  const gridSize = Math.ceil(Math.sqrt(count));
  return generateMockWeatherData(center, gridSize);
}

/**
 * 디버그 로그 함수
 * @param message 로그 메시지
 * @param data 로그 데이터
 */
export function logDebug(message: string, data?: any): void {
  const settings = state.get<ExampleSettings>(
    "settings",
    DEFAULT_EXAMPLE_SETTINGS
  );

  if (settings?.debug) {
    console.log(`[예제] ${message}`, data !== undefined ? data : "");
  }
}

/**
 * DOM 요소 생성 유틸리티
 * @param tag HTML 태그
 * @param attributes 속성
 * @param children 자식 요소
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  children: (string | HTMLElement)[] = []
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  // 속성 설정
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  // 자식 요소 추가
  children.forEach((child) => {
    if (typeof child === "string") {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  });

  return element;
}

/**
 * 지도 좌표 변환 유틸리티
 * @param lon 경도
 * @param lat 위도
 */
export function toWebMercator(lon: number, lat: number): [number, number] {
  const x = (lon * 20037508.34) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return [x, y];
}

/**
 * 웹 메르카토르에서 위경도 변환
 * @param x X 좌표
 * @param y Y 좌표
 */
export function fromWebMercator(x: number, y: number): [number, number] {
  const lon = (x / 20037508.34) * 180;
  let lat = (y / 20037508.34) * 180;
  lat =
    (180 / Math.PI) *
    (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  return [lon, lat];
}
