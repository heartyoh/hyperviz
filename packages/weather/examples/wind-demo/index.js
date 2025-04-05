// 실제 환경에서는 npm 패키지로부터 불러오지만, 데모에서는 직접 소스 참조
// import { WindLayer, initializeWorkerSystem, WeatherService, cleanupWorkerSystem } from '@hyperviz/weather';

// 데모를 위한 직접 소스 참조
// 참고: 실제 구현에서는 빌드된 패키지에서 import 해야 함
import { WindLayer } from "../../src/layers/wind-layer.js";
import {
  initializeWorkerSystem,
  cleanupWorkerSystem,
} from "../../src/utils/worker-registry.js";
import { WeatherService } from "../../src/services/weather-service.js";

// 상태 및 전역 변수
let map;
let windLayer;
let weatherService;
const statusElement = document.getElementById("status");

// 바람 레이어 옵션
const windOptions = {
  maxSpeed: 15,
  particleDensity: 0.8,
  fadeOpacity: 0.92,
  colorScale: ["rgba(0, 191, 255, 0.8)"],
  lineWidth: 1.5,
};

// 워커 시스템 초기화
initializeWorkerSystem({
  poolSize: 2, // 워커 수 (기본값: 사용 가능한 CPU 코어 수)
})
  .then(() => {
    console.log("워커 시스템 초기화 완료");
    initializeMap();
  })
  .catch((err) => {
    console.error("워커 시스템 초기화 실패:", err);
    statusElement.textContent = "워커 시스템 초기화 실패";
    statusElement.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
  });

// 지도 초기화
function initializeMap() {
  // 기본 타일 레이어 (지도 배경)
  const baseLayer = new ol.layer.Tile({
    source: new ol.source.OSM({
      // 어두운 스타일의 맵 타일
      url: "https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    }),
  });

  // 지도 뷰 생성
  const view = new ol.View({
    // 한국 중심 좌표 (EPSG:3857, 웹 메르카토르 좌표계)
    center: ol.proj.fromLonLat([127.5, 36.0]), // 대한민국 중심 부근
    zoom: 6,
    maxZoom: 12,
    minZoom: 4,
  });

  // 지도 생성
  map = new ol.Map({
    target: "map",
    layers: [baseLayer],
    view: view,
    controls: ol.control.defaults({
      attribution: false,
      zoom: true,
      rotate: false,
    }),
  });

  // 맵 로드 후 바람 레이어 초기화
  map.once("rendercomplete", () => {
    initializeWeatherService();
  });
}

// 날씨 서비스 초기화
function initializeWeatherService() {
  // 날씨 서비스 생성
  weatherService = new WeatherService({
    updateInterval: 300, // 5분 마다 업데이트 (초 단위)
  });

  // 현재 지도 영역 가져오기
  const extent = map.getView().calculateExtent(map.getSize());
  const bottomLeft = ol.proj.toLonLat([extent[0], extent[1]]);
  const topRight = ol.proj.toLonLat([extent[2], extent[3]]);

  // 지도 경계 좌표
  const bounds = [
    [bottomLeft[0], bottomLeft[1]], // 남서
    [topRight[0], topRight[1]], // 북동
  ];

  statusElement.textContent = "날씨 데이터 로딩 중...";

  // 날씨 데이터 가져오기
  weatherService
    .updateWeatherData({
      lat: (bottomLeft[1] + topRight[1]) / 2,
      lon: (bottomLeft[0] + topRight[0]) / 2,
    })
    .then((weatherData) => {
      console.log(`${weatherData.length}개 날씨 데이터 로드됨`);
      statusElement.textContent = `${weatherData.length}개 날씨 데이터 로드됨`;

      // 바람 레이어 생성 및 추가
      initializeWindLayer(weatherData);

      // 자동 업데이트 시작
      weatherService.startAutoUpdate(
        {
          lat: (bottomLeft[1] + topRight[1]) / 2,
          lon: (bottomLeft[0] + topRight[0]) / 2,
        },
        300
      );

      // 데이터 업데이트 콜백 설정
      weatherService.subscribe((newWeatherData) => {
        console.log("날씨 데이터 업데이트됨");
        statusElement.textContent = `데이터 업데이트됨: ${new Date().toLocaleTimeString()}`;

        // 레이어에 새 데이터 설정
        if (windLayer) {
          windLayer.setWeatherData(newWeatherData);
        }
      });
    })
    .catch((err) => {
      console.error("날씨 데이터 로드 실패:", err);
      statusElement.textContent = "날씨 데이터 로드 실패";
      statusElement.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
    });
}

// 바람 레이어 초기화
function initializeWindLayer(weatherData) {
  // 이전 레이어가 있으면 제거
  if (windLayer) {
    windLayer.dispose();
  }

  // 바람 레이어 생성
  windLayer = new WindLayer(windOptions);

  // 맵에 레이어 추가
  windLayer.addToMap(map);

  // 날씨 데이터 설정
  windLayer.setWeatherData(weatherData);

  console.log("바람 레이어 초기화 완료");

  // UI 이벤트 핸들러 설정
  setupEventHandlers();
}

// UI 이벤트 핸들러 설정
function setupEventHandlers() {
  // 레이어 표시/숨김 토글
  document.getElementById("windLayerToggle").addEventListener("change", (e) => {
    if (windLayer) {
      windLayer.setVisible(e.target.checked);
    }
  });

  // 최대 풍속 조절
  document.getElementById("maxSpeed").addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("maxSpeedValue").textContent = `${value} m/s`;

    windOptions.maxSpeed = value;
    updateWindLayer();
  });

  // 파티클 밀도 조절
  document.getElementById("density").addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("densityValue").textContent = value.toFixed(1);

    windOptions.particleDensity = value;
    updateWindLayer();
  });

  // 페이드 효과 조절
  document.getElementById("fade").addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("fadeValue").textContent = value.toFixed(2);

    windOptions.fadeOpacity = value;
    updateWindLayer();
  });

  // 선 두께 조절
  document.getElementById("lineWidth").addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("lineWidthValue").textContent = value.toFixed(1);

    windOptions.lineWidth = value;
    updateWindLayer();
  });

  // 지도 초기화 버튼
  document.getElementById("resetView").addEventListener("click", () => {
    map.getView().animate({
      center: ol.proj.fromLonLat([127.5, 36.0]),
      zoom: 6,
      duration: 1000,
    });
  });

  // 데이터 새로고침 버튼
  document.getElementById("refreshData").addEventListener("click", () => {
    statusElement.textContent = "데이터 새로고침 중...";

    if (weatherService) {
      // 현재 지도 영역 가져오기
      const extent = map.getView().calculateExtent(map.getSize());
      const bottomLeft = ol.proj.toLonLat([extent[0], extent[1]]);
      const topRight = ol.proj.toLonLat([extent[2], extent[3]]);

      // 지도 경계 좌표
      const bounds = [
        [bottomLeft[0], bottomLeft[1]], // 남서
        [topRight[0], topRight[1]], // 북동
      ];

      // 강제 업데이트
      weatherService
        .fetchWeatherData(bounds, true)
        .then((weatherData) => {
          statusElement.textContent = `${weatherData.length}개 날씨 데이터 갱신됨`;

          // 레이어에 새 데이터 설정
          if (windLayer) {
            windLayer.setWeatherData(weatherData);
          }
        })
        .catch((err) => {
          console.error("날씨 데이터 새로고침 실패:", err);
          statusElement.textContent = "데이터 새로고침 실패";
        });
    }
  });

  // 지도 이동 시 영역 업데이트
  let moveEndTimeout;
  map.on("moveend", () => {
    if (moveEndTimeout) clearTimeout(moveEndTimeout);

    moveEndTimeout = setTimeout(() => {
      const extent = map.getView().calculateExtent(map.getSize());
      const bottomLeft = ol.proj.toLonLat([extent[0], extent[1]]);
      const topRight = ol.proj.toLonLat([extent[2], extent[3]]);

      // 새 지도 경계 좌표
      const bounds = [
        [bottomLeft[0], bottomLeft[1]], // 남서
        [topRight[0], topRight[1]], // 북동
      ];

      statusElement.textContent = "지도 영역 변경, 데이터 업데이트 중...";

      // 날씨 데이터 업데이트
      if (weatherService) {
        weatherService.fetchWeatherData(bounds).then((weatherData) => {
          statusElement.textContent = `${weatherData.length}개 날씨 데이터 로드됨`;

          // 레이어에 새 데이터 설정
          if (windLayer) {
            windLayer.setWeatherData(weatherData);
          }
        });
      }
    }, 500);
  });
}

// 바람 레이어 옵션 업데이트 및 재생성
function updateWindLayer() {
  if (!windLayer || !map) return;

  // 현재 데이터 백업
  const currentData = [...(windLayer.weatherData || [])];

  // 레이어 재생성
  windLayer.dispose();
  windLayer = new WindLayer(windOptions);
  windLayer.addToMap(map);

  // 데이터 복원
  if (currentData.length > 0) {
    windLayer.setWeatherData(currentData);
  }
}

// 페이지 언로드 시 정리
window.addEventListener("beforeunload", () => {
  if (windLayer) {
    windLayer.dispose();
  }

  if (weatherService) {
    weatherService.stopAutoUpdate();
  }

  cleanupWorkerSystem();
});
