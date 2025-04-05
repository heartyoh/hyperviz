import Layer from "ol/layer/Layer";
import { Map } from "ol";
import BaseLayer from "ol/layer/Base";
import { Source } from "ol/source";
import { WorkerPool } from "@hyperviz/worker";
import {
  initializeWorkerSystem,
  submitTask,
} from "../utils/worker-registry.js";

import {
  ProcessorType,
  WeatherData,
  WeatherLayerType,
} from "../types/index.js";

/**
 * 날씨 레이어의 기본 옵션
 */
export interface WeatherLayerOptions {
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
  extent?: [number, number, number, number];
  minResolution?: number;
  maxResolution?: number;
  source?: Source;
  properties?: { [key: string]: any };
  [key: string]: any;
}

/**
 * 날씨 레이어의 기본 클래스
 * 모든 레이어 타입은 이 클래스를 상속합니다.
 */
export abstract class BaseWeatherLayer<
  T extends WeatherLayerOptions = WeatherLayerOptions
> extends Layer {
  protected map?: Map;
  protected layer?: BaseLayer;
  protected weatherData: WeatherData[] = [];
  protected canvas: HTMLCanvasElement;
  protected offscreenCanvas: OffscreenCanvas | null = null;
  protected ctx: CanvasRenderingContext2D | null = null;
  protected options: T;
  protected workerPool: WorkerPool | null = null;
  protected animationFrameId?: number;
  protected needsUpdate: boolean = false;
  protected isAnimating: boolean = false;

  /**
   * 생성자
   * @param options 레이어 옵션
   */
  constructor(options: T) {
    super({
      visible: options.visible !== undefined ? options.visible : true,
      opacity: options.opacity !== undefined ? options.opacity : 1,
      zIndex: options.zIndex,
      extent: options.extent,
      minResolution: options.minResolution,
      maxResolution: options.maxResolution,
      source: options.source,
      properties: options.properties,
    });

    this.options = { ...options };

    // 캔버스 생성
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.left = "0";
    this.canvas.style.top = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";

    this.ctx = this.canvas.getContext("2d");

    // 워커 시스템 초기화
    this.initWorkers();
  }

  /**
   * 워커 시스템 초기화
   */
  protected async initWorkers() {
    try {
      this.workerPool = await initializeWorkerSystem();
      this.setupOffscreenCanvas();
    } catch (err) {
      console.error("워커 시스템 초기화 실패:", err);
    }
  }

  /**
   * 오프스크린 캔버스 설정
   */
  protected setupOffscreenCanvas() {
    if (!this.canvas) return;

    try {
      // 브라우저가 OffscreenCanvas를 지원하는지 확인
      if ("OffscreenCanvas" in window) {
        this.offscreenCanvas = this.canvas.transferControlToOffscreen();
      }
    } catch (err) {
      console.error("오프스크린 캔버스 설정 실패:", err);
    }
  }

  /**
   * 워커에 렌더링 태스크 제출
   * @param processor 프로세서 타입
   * @param data 태스크 데이터
   */
  protected async submitRenderTask(processor: ProcessorType, data: any) {
    try {
      // 캔버스 참조 포함
      const taskData = {
        ...data,
        canvas: this.offscreenCanvas,
        width: this.canvas.width,
        height: this.canvas.height,
      };

      // 태스크 제출
      const result = await submitTask(processor, taskData);
      return result;
    } catch (err) {
      console.error("렌더링 태스크 제출 실패:", err);
      throw err;
    }
  }

  /**
   * 레이어의 타입을 반환합니다.
   */
  abstract getType(): WeatherLayerType;

  /**
   * 레이어를 생성합니다. 이 메서드는 각 서브클래스에서 구현해야 합니다.
   */
  abstract createLayer(): BaseLayer;

  /**
   * 맵에 레이어를 추가합니다.
   */
  addToMap(map: Map) {
    this.map = map;
    if (!this.layer) {
      this.layer = this.createLayer();
    }

    this.map.addLayer(this.layer);
    return this.layer;
  }

  /**
   * 맵에서 레이어를 제거합니다.
   */
  removeFromMap() {
    if (this.map && this.layer) {
      this.map.removeLayer(this.layer);
    }
    this.stopAnimation();
  }

  /**
   * 레이어에 날씨 데이터를 설정합니다.
   */
  setWeatherData(data: WeatherData[]) {
    this.weatherData = data;
    this.updateLayer();
  }

  /**
   * 레이어를 업데이트합니다. 데이터가 변경된 경우 호출됩니다.
   */
  protected updateLayer() {
    this.needsUpdate = true;
    if (this.isAnimating) {
      // 다음 애니메이션 프레임에서 업데이트됨
      return;
    }

    if (this.layer) {
      this.renderWithWorker();
    }
  }

  /**
   * 레이어 리사이즈 처리
   */
  protected handleResize(width: number, height: number) {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /**
   * 워커를 사용하여 레이어를 렌더링합니다.
   */
  protected async renderWithWorker() {
    if (!this.weatherData || this.weatherData.length === 0) {
      console.warn("날씨 데이터 없음, 렌더링 건너뜀");
      return;
    }

    if (!this.map) {
      console.warn("맵이 설정되지 않음, 렌더링 건너뜀");
      return;
    }

    try {
      // 맵 뷰에서 현재 범위와 크기 가져오기
      const view = this.map.getView();
      const extent = view.calculateExtent(this.map.getSize() || [0, 0]);
      const size = this.map.getSize() || [0, 0];

      // 데이터 준비
      const data = {
        weatherData: this.weatherData,
        bounds: extent,
        resolution: view.getResolution() || 1,
        options: this.options,
        width: size[0],
        height: size[1],
      };

      // 렌더링 태스크 제출
      const result = await this.submitRenderTask(this.getType(), data);

      // 결과가 있으면 적용
      if (result && typeof result === "object" && "imageData" in result) {
        this.updateLayerWithImage(result.imageData as ImageBitmap);
      }

      this.needsUpdate = false;
    } catch (error) {
      console.error("워커로 레이어 렌더링 실패:", error);
    }
  }

  /**
   * 워커에서 받은 이미지로 레이어 업데이트
   */
  protected updateLayerWithImage(image: ImageBitmap) {
    // 이 메서드는 자식 클래스에서 구현해야 함
    // 이미지를 OpenLayers 레이어에 적용하는 방법은 레이어 유형에 따라 다름
  }

  /**
   * 레이어 인스턴스를 반환합니다.
   */
  getLayer(): BaseLayer | undefined {
    return this.layer;
  }

  /**
   * 레이어의 가시성을 설정합니다.
   */
  setVisible(visible: boolean) {
    if (this.layer) {
      this.layer.setVisible(visible);

      // 보이게 되었고 업데이트가 필요하면 업데이트
      if (visible && this.needsUpdate) {
        this.updateLayer();
      }

      // 애니메이션 상태 관리
      if (visible) {
        this.startAnimation();
      } else {
        this.stopAnimation();
      }
    }
  }

  /**
   * 레이어의 가시성 상태를 반환합니다.
   */
  isVisible(): boolean {
    if (this.layer) {
      return this.layer.getVisible();
    }
    return false;
  }

  /**
   * 애니메이션을 시작합니다. 애니메이션이 필요한 레이어에서 오버라이드합니다.
   */
  startAnimation() {
    if (this.isAnimating) return;

    this.isAnimating = true;
    this.animate();
  }

  /**
   * 애니메이션 프레임을 처리합니다.
   */
  protected animate() {
    // 자식 클래스에서 구현할 수 있음
    if (!this.isAnimating) return;

    if (this.needsUpdate) {
      this.renderWithWorker();
    }

    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }

  /**
   * 애니메이션을 중지합니다.
   */
  stopAnimation() {
    this.isAnimating = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
  }

  /**
   * 리소스를 정리합니다.
   */
  dispose() {
    this.stopAnimation();
    this.removeFromMap();
    this.weatherData = [];
    this.layer = undefined;
    this.map = undefined;
    super.dispose();

    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }

    this.ctx = null;
    this.offscreenCanvas = null;
  }
}
