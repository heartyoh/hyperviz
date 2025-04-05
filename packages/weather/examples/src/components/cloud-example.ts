import {
  WeatherDataBase,
  LocationBase,
  WeatherData,
} from "../../../src/types/index.js";
import { CloudLayer } from "../../../src/layers/cloud-layer.js";
import { WeatherService } from "../../../src/services/weather-service.js";
import {
  initializeWorkerSystem,
  cleanupWorkerSystem,
} from "../../../src/utils/worker-registry.js";
import { ExampleSettings } from "../models/weather-example.js";
import { createElement, logDebug } from "../utils/example-utils.js";

// OpenLayers 모듈 직접 가져오기
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import * as olProj from "ol/proj";
import * as olControl from "ol/control";

/**
 * 구름 예제 컴포넌트
 */
export class CloudExample {
  // OpenLayers 지도 객체
  private map: Map | null = null;
  // 구름 레이어
  private cloudLayer: CloudLayer | null = null;
  // 날씨 서비스
  private weatherService: WeatherService | null = null;
  // 구름 레이어 옵션
  private cloudOptions = {
    minCloud: 0,
    maxCloud: 100,
    opacity: 0.8,
    interpolation: "bilinear" as "linear" | "bilinear" | "bicubic" | undefined,
    colorScale: [
      "rgba(255, 255, 255, 0.0)", // 맑음
      "rgba(255, 255, 255, 0.3)", // 구름 조금
      "rgba(220, 220, 220, 0.5)", // 구름 많음
      "rgba(200, 200, 200, 0.7)", // 흐림
      "rgba(180, 180, 180, 0.9)", // 매우 흐림
    ],
  };
  // 상태 표시 요소
  private statusElement: HTMLElement | null = null;
  // 설정
  private settings: ExampleSettings;
  // 현재 날씨 데이터
  private currentWeatherData: WeatherDataBase[] = [];

  /**
   * 생성자
   * @param containerId 지도를 표시할 컨테이너 ID
   * @param settings 예제 설정
   */
  constructor(
    private containerId: string,
    settings: ExampleSettings,
    options: any = {}
  ) {
    this.settings = settings;

    // 옵션 병합
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined) {
        (this.cloudOptions as any)[key] = value;
      }
    });

    logDebug("구름 예제 생성됨", { settings, options: this.cloudOptions });
  }

  /**
   * 예제 초기화
   */
  public async initialize(): Promise<void> {
    try {
      // 상태 표시 요소 생성
      this.createStatusElement();

      // 워커 시스템 초기화
      await this.initializeWorkerSystem();

      // 지도 초기화
      this.initializeMap();

      // 날씨 서비스 초기화
      this.initializeWeatherService();

      logDebug("구름 예제 초기화 완료");
    } catch (error) {
      console.error("구름 예제 초기화 실패:", error);
      this.showError("구름 예제 초기화 실패");
    }
  }

  /**
   * 워커 시스템 초기화
   */
  private async initializeWorkerSystem(): Promise<void> {
    this.showStatus("워커 시스템 초기화 중...");

    try {
      await initializeWorkerSystem();
      logDebug("워커 시스템 초기화 완료");
    } catch (error) {
      logDebug("워커 시스템 초기화 실패", error);
      throw new Error("워커 시스템 초기화 실패: " + error);
    }
  }

  /**
   * 상태 표시 요소 생성
   */
  private createStatusElement(): void {
    const container = document.getElementById(this.containerId);
    if (!container) {
      throw new Error(`컨테이너 요소를 찾을 수 없음: ${this.containerId}`);
    }

    // 기존 상태 요소 확인
    this.statusElement = document.getElementById("status");

    // 없으면 생성
    if (!this.statusElement) {
      this.statusElement = createElement(
        "div",
        {
          class: "status",
          id: "status",
        },
        ["로딩 중..."]
      );

      container.appendChild(this.statusElement);
    }
  }

  /**
   * 지도 초기화
   */
  private initializeMap(): void {
    this.showStatus("지도 초기화 중...");

    try {
      // 기본 타일 레이어 (지도 배경)
      const baseLayer = new TileLayer({
        source: new OSM({
          // 어두운 스타일의 맵 타일
          url: "https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        }),
      });

      // 지도 뷰 생성
      const view = new View({
        // 중심 좌표 (EPSG:3857, 웹 메르카토르 좌표계)
        center: olProj.fromLonLat([
          this.settings.defaultLocation.lon,
          this.settings.defaultLocation.lat,
        ]),
        zoom: this.settings.defaultZoom,
        maxZoom: 12,
        minZoom: 4,
      });

      // 지도 생성
      this.map = new Map({
        target: this.containerId,
        layers: [baseLayer],
        view: view,
        controls: olControl.defaults({
          attribution: false,
          zoom: true,
          rotate: false,
        }),
      });

      logDebug("지도 초기화 완료");
    } catch (error) {
      logDebug("지도 초기화 실패", error);
      throw new Error("지도 초기화 실패: " + error);
    }
  }

  /**
   * 날씨 서비스 초기화
   */
  private initializeWeatherService(): void {
    this.showStatus("날씨 데이터 로딩 중...");

    try {
      // 날씨 서비스 생성
      this.weatherService = new WeatherService({
        updateInterval: this.settings.refreshInterval, // 초 단위
      });

      // 날씨 서비스가 null인 경우 중단
      if (!this.weatherService) {
        throw new Error("날씨 서비스 생성 실패");
      }

      // 현재 지도 영역 가져오기
      if (!this.map) {
        throw new Error("지도가 초기화되지 않았습니다");
      }

      const extent = this.map.getView().calculateExtent(this.map.getSize());
      const bottomLeft = olProj.toLonLat([extent[0], extent[1]]);
      const topRight = olProj.toLonLat([extent[2], extent[3]]);

      // 중심 위치 계산
      const centerLocation: LocationBase = {
        lat: (bottomLeft[1] + topRight[1]) / 2,
        lon: (bottomLeft[0] + topRight[0]) / 2,
      };

      // 날씨 서비스 객체 로컬 참조 생성
      const weatherService = this.weatherService;

      // 날씨 데이터 가져오기
      weatherService
        .updateWeatherData(centerLocation)
        .then((weatherData) => {
          logDebug(`${weatherData.length}개 날씨 데이터 로드됨`);
          this.showStatus(`${weatherData.length}개 날씨 데이터 로드됨`);

          // 구름 레이어 생성 및 추가
          this.initializeCloudLayer(weatherData);

          // 자동 업데이트 시작
          weatherService.startAutoUpdate(
            centerLocation,
            this.settings.refreshInterval
          );

          // 데이터 업데이트 콜백 설정
          weatherService.subscribe((newWeatherData) => {
            logDebug("날씨 데이터 업데이트됨", {
              count: newWeatherData.length,
            });
            this.showStatus(
              `데이터 업데이트됨: ${new Date().toLocaleTimeString()}`
            );

            // 최신 데이터 저장
            this.currentWeatherData = newWeatherData;

            // 레이어에 새 데이터 설정
            if (this.cloudLayer) {
              this.cloudLayer.setWeatherData(
                newWeatherData as unknown as WeatherData[]
              );
            }
          });
        })
        .catch((err) => {
          logDebug("날씨 데이터 로드 실패", err);
          this.showError("날씨 데이터 로드 실패");
        });
    } catch (error) {
      logDebug("날씨 서비스 초기화 실패", error);
      throw new Error("날씨 서비스 초기화 실패: " + error);
    }
  }

  /**
   * 구름 레이어 초기화
   */
  private initializeCloudLayer(weatherData: WeatherDataBase[]): void {
    try {
      // 이전 레이어가 있으면 제거
      if (this.cloudLayer) {
        this.cloudLayer.dispose();
        this.cloudLayer = null;
      }

      // 최신 데이터 저장
      this.currentWeatherData = weatherData;

      // 구름 레이어 생성
      this.cloudLayer = new CloudLayer({
        colorScale: this.cloudOptions.colorScale,
        minCloud: this.cloudOptions.minCloud,
        maxCloud: this.cloudOptions.maxCloud,
        opacity: this.cloudOptions.opacity,
        interpolation: this.cloudOptions.interpolation,
      });

      // 맵에 레이어 추가
      if (!this.map) {
        throw new Error("지도가 초기화되지 않았습니다");
      }
      this.cloudLayer.addToMap(this.map);

      // 날씨 데이터 설정
      this.cloudLayer.setWeatherData(weatherData as unknown as WeatherData[]);

      logDebug("구름 레이어 초기화 완료");

      // UI 컨트롤 생성
      this.createControls();
    } catch (error) {
      logDebug("구름 레이어 초기화 실패", error);
      throw new Error("구름 레이어 초기화 실패: " + error);
    }
  }

  /**
   * UI 컨트롤 생성
   */
  private createControls(): void {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // 컨트롤 컨테이너 생성
    const controlsContainer = createElement("div", { class: "controls" }, [
      createElement("h3", {}, [this.settings.title]),

      // 레이어 표시/숨김 토글
      this.createControlGroup(
        "구름 레이어 표시",
        "checkbox",
        "cloudLayerToggle",
        "true",
        (value) => {
          if (this.cloudLayer) {
            this.cloudLayer.setVisible(value === "true");
          }
        }
      ),

      // 최소 구름량 조절
      this.createSliderGroup(
        "최소 구름량",
        "minCloud",
        this.cloudOptions.minCloud.toString(),
        "0",
        "50",
        "1",
        " %",
        (value) => {
          this.cloudOptions.minCloud = parseFloat(value);
          this.updateCloudLayer();
        }
      ),

      // 최대 구름량 조절
      this.createSliderGroup(
        "최대 구름량",
        "maxCloud",
        this.cloudOptions.maxCloud.toString(),
        "50",
        "100",
        "1",
        " %",
        (value) => {
          this.cloudOptions.maxCloud = parseFloat(value);
          this.updateCloudLayer();
        }
      ),

      // 불투명도 조절
      this.createSliderGroup(
        "불투명도",
        "opacity",
        this.cloudOptions.opacity.toString(),
        "0.1",
        "1",
        "0.05",
        "",
        (value) => {
          this.cloudOptions.opacity = parseFloat(value);
          this.updateCloudLayer();
        }
      ),

      // 보간법 선택
      this.createControlGroup(
        "보간법",
        "select",
        "interpolation",
        this.cloudOptions.interpolation || "bilinear",
        (value) => {
          this.cloudOptions.interpolation = value as
            | "linear"
            | "bilinear"
            | "bicubic"
            | undefined;
          this.updateCloudLayer();
        },
        [
          { value: "linear", label: "선형" },
          { value: "bilinear", label: "이중선형" },
          { value: "bicubic", label: "이중3차" },
        ]
      ),

      // 버튼들
      createElement("button", { id: "resetView" }, ["지도 초기화"]),
      createElement("button", { id: "refreshData" }, ["데이터 새로고침"]),
    ]);

    container.appendChild(controlsContainer);

    // 버튼 이벤트 처리
    document.getElementById("resetView")?.addEventListener("click", () => {
      this.resetView();
    });

    document.getElementById("refreshData")?.addEventListener("click", () => {
      this.refreshData();
    });
  }

  /**
   * 컨트롤 그룹 생성
   */
  private createControlGroup(
    label: string,
    type: string,
    id: string,
    value: string,
    onChange: (value: string) => void,
    options?: { value: string; label: string }[]
  ): HTMLElement {
    const group = createElement("div", { class: "control-group" }, []);

    const labelEl = createElement("label", {}, []);

    if (type === "select" && options) {
      const select = createElement(
        "select",
        {
          id,
        },
        []
      );

      // 옵션 추가
      options.forEach((opt) => {
        const option = createElement(
          "option",
          {
            value: opt.value,
            selected: value === opt.value ? "selected" : "",
          },
          [opt.label]
        );
        select.appendChild(option);
      });

      // 이벤트 리스너
      select.addEventListener("change", (e) => {
        const target = e.target as HTMLSelectElement;
        onChange(target.value);
      });

      labelEl.appendChild(document.createTextNode(label + " "));
      group.appendChild(labelEl);
      group.appendChild(select);

      return group;
    }

    // 기존 체크박스 및 다른 입력 처리
    const input = createElement(
      "input",
      {
        type,
        id,
        value,
        checked: type === "checkbox" && value === "true" ? "checked" : "",
      },
      []
    );

    labelEl.appendChild(input);
    labelEl.appendChild(document.createTextNode(" " + label));

    group.appendChild(labelEl);

    // 이벤트 리스너
    input.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      onChange(type === "checkbox" ? String(target.checked) : target.value);
    });

    return group;
  }

  /**
   * 슬라이더 컨트롤 그룹 생성
   */
  private createSliderGroup(
    label: string,
    id: string,
    value: string,
    min: string,
    max: string,
    step: string,
    unit: string,
    onChange: (value: string) => void
  ): HTMLElement {
    const group = createElement("div", { class: "control-group" }, []);

    const labelEl = createElement("label", {}, [
      `${label} `,
      createElement("span", { id: `${id}Value`, class: "value" }, [
        `${value}${unit}`,
      ]),
    ]);

    const input = createElement(
      "input",
      {
        type: "range",
        id,
        min,
        max,
        value,
        step,
      },
      []
    );

    group.appendChild(labelEl);
    group.appendChild(input);

    // 이벤트 리스너
    input.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const valueElement = document.getElementById(`${id}Value`);
      if (valueElement) {
        valueElement.textContent = `${target.value}${unit}`;
      }
      onChange(target.value);
    });

    return group;
  }

  /**
   * 구름 레이어 업데이트
   */
  private updateCloudLayer(): void {
    if (!this.cloudLayer || !this.map) return;

    logDebug("구름 레이어 옵션 업데이트", this.cloudOptions);

    // 현재 레이어 로컬 참조 생성
    const currentLayer = this.cloudLayer;

    // 새 레이어로 교체 (옵션 변경을 적용하기 위해)
    currentLayer.removeFromMap();
    this.cloudLayer = null;

    // 새 레이어 생성
    this.cloudLayer = new CloudLayer({
      colorScale: this.cloudOptions.colorScale,
      minCloud: this.cloudOptions.minCloud,
      maxCloud: this.cloudOptions.maxCloud,
      opacity: this.cloudOptions.opacity,
      interpolation: this.cloudOptions.interpolation,
    });

    // 맵에 레이어 추가
    this.cloudLayer.addToMap(this.map);

    // 데이터가 있으면 다시 설정
    if (this.currentWeatherData.length > 0) {
      this.cloudLayer.setWeatherData(
        this.currentWeatherData as unknown as WeatherData[]
      );
    }
  }

  /**
   * 지도 뷰 초기화
   */
  private resetView(): void {
    if (this.map) {
      this.map.getView().animate({
        center: olProj.fromLonLat([
          this.settings.defaultLocation.lon,
          this.settings.defaultLocation.lat,
        ]),
        zoom: this.settings.defaultZoom,
        duration: 1000,
      });
    }
  }

  /**
   * 데이터 새로고침
   */
  private refreshData(): void {
    if (!this.map || !this.weatherService) return;

    // 현재 지도 영역 가져오기
    const extent = this.map.getView().calculateExtent(this.map.getSize());
    const bottomLeft = olProj.toLonLat([extent[0], extent[1]]);
    const topRight = olProj.toLonLat([extent[2], extent[3]]);

    // 중심 위치 계산
    const centerLocation: LocationBase = {
      lat: (bottomLeft[1] + topRight[1]) / 2,
      lon: (bottomLeft[0] + topRight[0]) / 2,
    };

    this.showStatus("데이터 새로고침 중...");

    // 날씨 서비스 참조 생성
    const weatherService = this.weatherService;

    // 날씨 데이터 가져오기
    weatherService
      .updateWeatherData(centerLocation, true)
      .then((weatherData) => {
        logDebug(`${weatherData.length}개 날씨 데이터 새로고침됨`);
        this.showStatus(`${weatherData.length}개 날씨 데이터 새로고침됨`);

        // 최신 데이터 저장
        this.currentWeatherData = weatherData;

        // 레이어에 새 데이터 설정
        if (this.cloudLayer) {
          this.cloudLayer.setWeatherData(
            weatherData as unknown as WeatherData[]
          );
        }
      })
      .catch((err) => {
        logDebug("날씨 데이터 새로고침 실패", err);
        this.showError("데이터 새로고침 실패");
      });
  }

  /**
   * 상태 표시
   */
  private showStatus(message: string): void {
    if (this.statusElement) {
      this.statusElement.textContent = message;
      this.statusElement.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    }
  }

  /**
   * 오류 표시
   */
  private showError(message: string): void {
    if (this.statusElement) {
      this.statusElement.textContent = message;
      this.statusElement.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
    }
  }

  /**
   * 리소스 정리
   */
  public dispose(): void {
    // 구름 레이어 정리
    if (this.cloudLayer) {
      this.cloudLayer.dispose();
      this.cloudLayer = null;
    }

    // 날씨 서비스 정리
    if (this.weatherService) {
      this.weatherService.dispose();
      this.weatherService = null;
    }

    // 워커 시스템 정리
    cleanupWorkerSystem().catch((err) => {
      console.error("워커 시스템 정리 실패:", err);
    });

    logDebug("구름 예제 리소스 정리 완료");
  }
}
