import { Map } from "ol";
import BaseLayer from "ol/layer/Base";
import ImageLayer from "ol/layer/Image";
import ImageCanvasSource from "ol/source/ImageCanvas";
import { Extent } from "ol/extent";

import { BaseWeatherLayer } from "./base-layer.js";
import {
  WeatherData,
  WeatherLayerType,
  TemperatureRenderOptions,
} from "../types/index.js";

/**
 * 온도 시각화 레이어 옵션
 */
export type TemperatureLayerOptions = TemperatureRenderOptions;

/**
 * 온도 레이어 클래스
 * OpenLayers ImageLayer와 ImageCanvasSource를 사용하여 온도 분포를 표현합니다.
 */
export class TemperatureLayer extends BaseWeatherLayer<TemperatureLayerOptions> {
  private imageSource: ImageCanvasSource;
  private resizeTimer: number | null = null;

  /**
   * 생성자
   * @param options 온도 레이어 옵션
   */
  constructor(options: Partial<TemperatureLayerOptions> = {}) {
    // 기본 옵션 정의
    const defaultOptions: TemperatureLayerOptions = {
      colorScale: [
        "#053061", // 심한 저온 (파랑)
        "#2166ac", // 저온
        "#4393c3", // 약간 저온
        "#92c5de", // 조금 저온
        "#d1e5f0", // 약간 저온에 가까운 일반
        "#f7f7f7", // 일반
        "#fddbc7", // 약간 고온에 가까운 일반
        "#f4a582", // 조금 고온
        "#d6604d", // 약간 고온
        "#b2182b", // 고온
        "#67001f", // 심한 고온 (빨강)
      ],
      minTemperature: -10, // 섭씨 기준
      maxTemperature: 40, // 섭씨 기준
      interpolation: "bilinear", // 보간 방식
    };

    // 사용자 옵션과 기본 옵션 병합
    const mergedOptions: TemperatureLayerOptions = { ...defaultOptions };
    Object.keys(options).forEach((key) => {
      (mergedOptions as any)[key] = (options as any)[key];
    });

    super(mergedOptions);

    // ImageCanvas 소스 생성
    this.imageSource = new ImageCanvasSource({
      canvasFunction: (
        extent: Extent,
        resolution: number,
        pixelRatio: number,
        size: any
      ): HTMLCanvasElement => {
        this.handleResize(size[0], size[1]);
        return this.canvas;
      },
      ratio: 1,
    });
  }

  /**
   * 레이어 타입 반환
   */
  getType(): WeatherLayerType {
    return "temperature";
  }

  /**
   * OpenLayers 레이어 생성
   */
  createLayer(): BaseLayer {
    return new ImageLayer({
      source: this.imageSource,
      zIndex: this.options.zIndex || 5,
    });
  }

  /**
   * 캔버스 리사이즈 처리
   */
  handleResize(width: number, height: number) {
    // 리사이즈 디바운스 처리
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }

    this.resizeTimer = window.setTimeout(() => {
      super.handleResize(width, height);
      this.updateLayer();
      this.resizeTimer = null;
    }, 200);
  }

  /**
   * 레이어 렌더링
   */
  render(frameState: any): HTMLElement | null {
    // frameState가 없거나 size가 없으면 렌더링 중단
    if (!frameState || !frameState.size) {
      return null;
    }

    const size = frameState.size;

    // 캔버스가 없으면 렌더링 중단
    if (!this.canvas) {
      return null;
    }

    // 캔버스 크기 업데이트가 필요한 경우
    if (this.canvasWidth !== size[0] || this.canvasHeight !== size[1]) {
      this.handleResize(size[0], size[1]);
    }

    // 캔버스가 있고 보이는 상태인지 확인
    if (this.isVisible()) {
      // 업데이트가 필요하면 레이어 렌더링
      if (this.needsUpdate) {
        this.renderWithWorker();
      }

      return this.canvas;
    }

    return null;
  }

  /**
   * 워커로부터 받은 이미지로 레이어 업데이트
   */
  protected updateLayerWithImage(imageData: ImageBitmap) {
    if (!this.ctx || !imageData) return;

    // 이미지 표시
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.ctx.drawImage(imageData, 0, 0);

    // 캔버스 변경 알림
    this.imageSource.changed();
  }

  /**
   * 레이어 제거 시 정리
   */
  override dispose(): void {
    super.dispose();

    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
  }
}
