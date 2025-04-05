import { WindExample } from "./components/wind-example.js";
import { TemperatureExample } from "./components/temperature-example.js";
import { PrecipitationExample } from "./components/precipitation-example.js";
import { CloudExample } from "./components/cloud-example.js";
import { SolarExample } from "./components/solar-example.js";
import {
  ExampleSettings,
  DEFAULT_EXAMPLE_SETTINGS,
  WeatherExampleType,
} from "./models/weather-example.js";
import {
  initializeExample,
  createElement,
  logDebug,
} from "./utils/example-utils.js";

/**
 * 예제 애플리케이션 시작점
 */
async function main() {
  try {
    // 설정 초기화
    const settings = initializeExample(DEFAULT_EXAMPLE_SETTINGS);
    logDebug("예제 설정 초기화됨", settings);

    // 예제 유형에 따라 다른 컴포넌트 생성
    switch (settings.type) {
      case WeatherExampleType.WIND:
        await initializeWindExample(settings);
        break;
      case WeatherExampleType.TEMPERATURE:
        await initializeTemperatureExample(settings);
        break;
      case WeatherExampleType.PRECIPITATION:
        await initializePrecipitationExample(settings);
        break;
      case WeatherExampleType.CLOUD:
        await initializeCloudExample(settings);
        break;
      case WeatherExampleType.SOLAR:
        await initializeSolarExample(settings);
        break;
      default:
        showError(`지원되지 않는 예제 유형: ${settings.type}`);
    }
  } catch (error) {
    console.error("예제 초기화 중 오류 발생:", error);
    showError("예제 초기화 실패");
  }
}

/**
 * 바람 예제 초기화
 */
async function initializeWindExample(settings: ExampleSettings): Promise<void> {
  // 컨테이너 확인
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("애플리케이션 컨테이너를 찾을 수 없습니다.");
  }

  // 로딩 표시
  showLoading(container);

  try {
    // 바람 예제 인스턴스 생성
    const windExample = new WindExample("map", settings);

    // 맵 컨테이너 생성
    const mapContainer = createElement("div", {
      id: "map",
      class: "map-container",
    });

    // 콘텐츠 영역에 맵 컨테이너 추가
    const content = createElement("div", { class: "content" }, [mapContainer]);
    container.innerHTML = "";
    container.appendChild(content);

    // 오류 발생 시 처리
    window.addEventListener("error", (event) => {
      console.error("애플리케이션 오류:", event.error);
      showError("예제 실행 중 오류 발생");
    });

    // 페이지 종료 시 리소스 정리
    window.addEventListener("beforeunload", () => {
      windExample.dispose();
    });

    // 예제 초기화
    await windExample.initialize();

    // 전역 변수에 저장 (디버깅용)
    (window as any).example = windExample;
  } catch (error) {
    console.error("바람 예제 초기화 실패:", error);
    showError("바람 예제 초기화 중 오류 발생");
  }
}

/**
 * 온도 예제 초기화
 */
async function initializeTemperatureExample(
  settings: ExampleSettings
): Promise<void> {
  // 컨테이너 확인
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("애플리케이션 컨테이너를 찾을 수 없습니다.");
  }

  // 로딩 표시
  showLoading(container);

  try {
    // 온도 예제 인스턴스 생성
    const temperatureExample = new TemperatureExample("map", settings);

    // 맵 컨테이너 생성
    const mapContainer = createElement("div", {
      id: "map",
      class: "map-container",
    });

    // 콘텐츠 영역에 맵 컨테이너 추가
    const content = createElement("div", { class: "content" }, [mapContainer]);
    container.innerHTML = "";
    container.appendChild(content);

    // 오류 발생 시 처리
    window.addEventListener("error", (event) => {
      console.error("애플리케이션 오류:", event.error);
      showError("예제 실행 중 오류 발생");
    });

    // 페이지 종료 시 리소스 정리
    window.addEventListener("beforeunload", () => {
      temperatureExample.dispose();
    });

    // 예제 초기화
    await temperatureExample.initialize();

    // 전역 변수에 저장 (디버깅용)
    (window as any).example = temperatureExample;
  } catch (error) {
    console.error("온도 예제 초기화 실패:", error);
    showError("온도 예제 초기화 중 오류 발생");
  }
}

/**
 * 강수량 예제 초기화
 */
async function initializePrecipitationExample(
  settings: ExampleSettings
): Promise<void> {
  // 컨테이너 확인
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("애플리케이션 컨테이너를 찾을 수 없습니다.");
  }

  // 로딩 표시
  showLoading(container);

  try {
    // 강수량 예제 인스턴스 생성
    const precipitationExample = new PrecipitationExample("map", settings);

    // 맵 컨테이너 생성
    const mapContainer = createElement("div", {
      id: "map",
      class: "map-container",
    });

    // 콘텐츠 영역에 맵 컨테이너 추가
    const content = createElement("div", { class: "content" }, [mapContainer]);
    container.innerHTML = "";
    container.appendChild(content);

    // 오류 발생 시 처리
    window.addEventListener("error", (event) => {
      console.error("애플리케이션 오류:", event.error);
      showError("예제 실행 중 오류 발생");
    });

    // 페이지 종료 시 리소스 정리
    window.addEventListener("beforeunload", () => {
      precipitationExample.dispose();
    });

    // 예제 초기화
    await precipitationExample.initialize();

    // 전역 변수에 저장 (디버깅용)
    (window as any).example = precipitationExample;
  } catch (error) {
    console.error("강수량 예제 초기화 실패:", error);
    showError("강수량 예제 초기화 중 오류 발생");
  }
}

/**
 * 구름 예제 초기화
 */
async function initializeCloudExample(
  settings: ExampleSettings
): Promise<void> {
  // 컨테이너 확인
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("애플리케이션 컨테이너를 찾을 수 없습니다.");
  }

  // 로딩 표시
  showLoading(container);

  try {
    // 구름 예제 인스턴스 생성
    const cloudExample = new CloudExample("map", settings);

    // 맵 컨테이너 생성
    const mapContainer = createElement("div", {
      id: "map",
      class: "map-container",
    });

    // 콘텐츠 영역에 맵 컨테이너 추가
    const content = createElement("div", { class: "content" }, [mapContainer]);
    container.innerHTML = "";
    container.appendChild(content);

    // 오류 발생 시 처리
    window.addEventListener("error", (event) => {
      console.error("애플리케이션 오류:", event.error);
      showError("예제 실행 중 오류 발생");
    });

    // 페이지 종료 시 리소스 정리
    window.addEventListener("beforeunload", () => {
      cloudExample.dispose();
    });

    // 예제 초기화
    await cloudExample.initialize();

    // 전역 변수에 저장 (디버깅용)
    (window as any).example = cloudExample;
  } catch (error) {
    console.error("구름 예제 초기화 실패:", error);
    showError("구름 예제 초기화 중 오류 발생");
  }
}

/**
 * 일사량 예제 초기화
 */
async function initializeSolarExample(
  settings: ExampleSettings
): Promise<void> {
  // 컨테이너 확인
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("애플리케이션 컨테이너를 찾을 수 없습니다.");
  }

  // 로딩 표시
  showLoading(container);

  try {
    // 일사량 예제 인스턴스 생성
    const solarExample = new SolarExample("map", settings);

    // 맵 컨테이너 생성
    const mapContainer = createElement("div", {
      id: "map",
      class: "map-container",
    });

    // 콘텐츠 영역에 맵 컨테이너 추가
    const content = createElement("div", { class: "content" }, [mapContainer]);
    container.innerHTML = "";
    container.appendChild(content);

    // 오류 발생 시 처리
    window.addEventListener("error", (event) => {
      console.error("애플리케이션 오류:", event.error);
      showError("예제 실행 중 오류 발생");
    });

    // 페이지 종료 시 리소스 정리
    window.addEventListener("beforeunload", () => {
      solarExample.dispose();
    });

    // 예제 초기화
    await solarExample.initialize();

    // 전역 변수에 저장 (디버깅용)
    (window as any).example = solarExample;
  } catch (error) {
    console.error("일사량 예제 초기화 실패:", error);
    showError("일사량 예제 초기화 중 오류 발생");
  }
}

/**
 * 로딩 화면 표시
 */
function showLoading(container: HTMLElement): void {
  container.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div class="message">예제 로딩 중...</div>
    </div>
  `;
}

/**
 * 오류 메시지 표시
 */
function showError(message: string): void {
  const container = document.getElementById("app");
  if (!container) return;

  container.innerHTML = `
    <div class="error">
      <div class="message">${message}</div>
      <button id="retryButton">다시 시도</button>
    </div>
  `;

  document.getElementById("retryButton")?.addEventListener("click", () => {
    window.location.reload();
  });
}

// 앱 시작
document.addEventListener("DOMContentLoaded", main);

// 이 파일을 모듈로 만들기 위해 빈 export 추가
export {};
