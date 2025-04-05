import { LocationBase } from "../../../src/types/index.js";

/**
 * 날씨 예제 타입
 */
export enum WeatherExampleType {
  WIND = "wind",
  TEMPERATURE = "temperature",
  PRECIPITATION = "precipitation",
  CLOUD = "cloud",
  SOLAR = "solar",
}

/**
 * 예제 설정 인터페이스
 */
export interface ExampleSettings {
  // 예제 타입
  type: WeatherExampleType;
  // 예제 제목
  title: string;
  // 예제 설명
  description: string;
  // 기본 위치
  defaultLocation: LocationBase;
  // 기본 줌 레벨
  defaultZoom: number;
  // 새로고침 주기 (초)
  refreshInterval: number;
  // 최대 데이터 포인트 수
  maxDataPoints?: number;
  // 디버그 모드 활성화
  debug?: boolean;
}

/**
 * 예제 옵션 인터페이스
 */
export interface ExampleOptions {
  // 워커 풀 크기
  poolSize?: number;
  // 기본 설정
  defaultSettings?: Partial<ExampleSettings>;
  // 디버그 모드
  debug?: boolean;
}

/**
 * 바람 예제 옵션 인터페이스
 */
export interface WindExampleOptions {
  // 최대 풍속 (m/s)
  maxSpeed?: number;
  // 입자 밀도 (0.1~2.0)
  particleDensity?: number;
  // 페이드 효과 (0.8~0.98)
  fadeOpacity?: number;
  // 색상 스케일
  colorScale?: string[];
  // 선 두께
  lineWidth?: number;
}

/**
 * 모의 날씨 데이터 생성
 * @param center 중심 위치
 * @param gridSize 그리드 크기
 * @param spacing 간격
 */
export function generateMockWeatherData(
  center: LocationBase,
  gridSize: number = 10,
  spacing: number = 0.1
) {
  const weatherData = [];
  const startLat = center.lat - (gridSize * spacing) / 2;
  const startLon = center.lon - (gridSize * spacing) / 2;

  // 현재 시간
  const timestamp = Date.now();

  // 랜덤 값 생성
  const randomValue = (min: number, max: number) =>
    Math.random() * (max - min) + min;

  // 위도/경도 격자 생성
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const lat = startLat + y * spacing;
      const lon = startLon + x * spacing;

      // 중심으로부터의 거리 계산 (0~1)
      const dx = x - gridSize / 2;
      const dy = y - gridSize / 2;
      const distFactor = Math.sqrt(dx * dx + dy * dy) / (gridSize / 2);

      // 랜덤 풍향 (-π ~ π)
      const windDirection = randomValue(-Math.PI, Math.PI);

      // 랜덤 풍속 (0~15m/s, 중심에서 멀어질수록 강해짐)
      const windSpeed = randomValue(2, 15) * (0.5 + 0.5 * distFactor);

      // 풍속의 x, y 성분 계산
      const u = Math.cos(windDirection) * windSpeed;
      const v = Math.sin(windDirection) * windSpeed;

      // 온도 (-10~35°C, 중심에서 멀어질수록 낮아짐)
      const temperature = randomValue(15, 35) * (1 - 0.3 * distFactor);

      // 습도 (30~90%)
      const humidity = randomValue(30, 90);

      // 구름 (0~100%)
      const cloudCoverage = randomValue(0, 100) * distFactor;

      // 강수량 (0~5mm, 구름이 많을수록 높아짐)
      const precipitation =
        cloudCoverage > 60
          ? (randomValue(0, 5) * (cloudCoverage - 60)) / 40
          : 0;

      // 일사량 (0~1000, 구름이 적을수록 높아짐)
      const solarRadiation = randomValue(200, 1000) * (1 - cloudCoverage / 100);

      // 날씨 데이터 추가
      weatherData.push({
        timestamp,
        location: { lat, lon },
        wind: {
          u,
          v,
          speed: windSpeed,
          direction: (windDirection * 180) / Math.PI, // 라디안을 도로 변환
        },
        temperature: {
          value: temperature,
          unit: "celsius",
        },
        humidity,
        cloud: {
          coverage: cloudCoverage,
          height: randomValue(500, 3000),
        },
        precipitation: {
          amount: precipitation,
          probability: cloudCoverage,
        },
        solar: {
          radiation: solarRadiation,
          unit: "W/m²",
        },
      });
    }
  }

  return weatherData;
}

/**
 * 기본 예제 설정
 */
export const DEFAULT_EXAMPLE_SETTINGS: ExampleSettings = {
  type: WeatherExampleType.WIND,
  title: "한국 주변 바람 흐름 시각화",
  description:
    "한국 주변 지역의 바람 흐름을 시각화하는 예제입니다. 파티클 효과를 통해 풍향과 풍속을 표현합니다.",
  defaultLocation: { lat: 36.5, lon: 128.0 }, // 한국 중부 지역
  defaultZoom: 7,
  refreshInterval: 300, // 5분
  maxDataPoints: 1000,
  debug: false,
};
