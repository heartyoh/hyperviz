# Hyperviz Weather

날씨 시각화를 위한 오프스크린캔버스 및 워커 기반 렌더링 모듈입니다.

## 주요 기능

- 워커 스레드를 사용한 고성능 렌더링
- OffscreenCanvas를 활용한 메인 스레드 부하 감소
- OpenLayers 맵과 통합을 위한 레이어 제공
- IndexedDB를 활용한 데이터 캐싱
- 날씨 데이터 서비스 내장

## 지원하는 날씨 레이어 타입

- 바람 (Wind)
- 강수량 (Precipitation)
- 온도 (Temperature)
- 일사량 (Solar)
- 구름 (Cloud)

## 설치

```bash
npm install @hyperviz/weather
```

## 사용법

### 기본 설정

```typescript
import { WindLayer, initializeWorkerSystem } from "@hyperviz/weather";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";

// 워커 시스템 초기화
initializeWorkerSystem({
  poolSize: 2, // 워커 수 (기본값: 사용 가능한 CPU 코어 수)
});

// OpenLayers 맵 생성
const map = new Map({
  target: "map",
  layers: [
    new TileLayer({
      source: new OSM(),
    }),
  ],
  view: new View({
    center: [14135027.5, 4511307.6], // 서울
    zoom: 7,
  }),
});

// 바람 레이어 생성 및 추가
const windLayer = new WindLayer({
  maxSpeed: 15,
  particleDensity: 1.0,
  fadeOpacity: 0.95,
  colorScale: ["rgba(0, 191, 255, 0.8)"],
  lineWidth: 1.5,
});

// 맵에 레이어 추가
windLayer.addToMap(map);
```

### 날씨 데이터 설정

```typescript
import { WeatherService } from "@hyperviz/weather";

// 날씨 서비스 생성
const weatherService = new WeatherService({
  apiKey: "your-api-key", // 선택사항
  updateInterval: 300, // 5분 마다 업데이트 (초 단위)
});

// 지도 경계 좌표
const bounds: [[number, number], [number, number]] = [
  [124.0, 33.0], // 남서
  [132.0, 39.0], // 북동
];

// 날씨 데이터 가져오기
weatherService.fetchWeatherData(bounds).then((weatherData) => {
  // 레이어에 날씨 데이터 설정
  windLayer.setWeatherData(weatherData);
});

// 자동 업데이트 시작
weatherService.startAutoUpdate(bounds, (weatherData) => {
  windLayer.setWeatherData(weatherData);
});
```

### 리소스 정리

```typescript
// 사용 완료 후 정리
windLayer.dispose();
weatherService.stopAutoUpdate();
cleanupWorkerSystem();
```

## 오프라인 지원

IndexedDB를 사용하여 날씨 데이터를 저장하므로 오프라인 환경에서도 마지막으로 캐시된 데이터를 사용할 수 있습니다.

## 의존성

- OpenLayers (ol)
- @hyperviz/worker

## 브라우저 지원

- Chrome 69+
- Firefox 79+
- Safari 16.4+
- Edge 79+

OffscreenCanvas API를 지원하는 모든 최신 브라우저에서 작동합니다.

## 라이센스

MIT
