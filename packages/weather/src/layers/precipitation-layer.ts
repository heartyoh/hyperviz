import { Map } from "ol";
import BaseLayer from "ol/layer/Base";
import ImageLayer from "ol/layer/Image";
import ImageCanvasSource from "ol/source/ImageCanvas";
import { Extent } from "ol/extent";

import { BaseWeatherLayer } from "./base-weather-layer.js";
import {
  WeatherData,
  WeatherLayerType,
  PrecipitationRenderOptions,
} from "../types/index.js";

/**
 * 강수량 시각화 레이어 옵션
 */
export type PrecipitationLayerOptions = PrecipitationRenderOptions;

/**
 * 강수량 레이어 클래스
 * OpenLayers ImageLayer와 ImageCanvasSource를 사용하여 강수량 분포를 표현합니다.
 */
export class PrecipitationLayer extends BaseWeatherLayer<PrecipitationLayerOptions> {
  private imageSource: ImageCanvasSource;
  private resizeTimer: number | null = null;

  /**
   * 생성자
   * @param options 강수량 레이어 옵션
   */
  constructor(options: Partial<PrecipitationLayerOptions> = {}) {
    // 기본 옵션 정의
    const defaultOptions: PrecipitationLayerOptions = {
      colorScale: [
        "rgba(255, 255, 255, 0)", // 투명 (비 없음)
        "rgba(200, 200, 255, 0.3)", // 매우 약한 비
        "rgba(100, 100, 255, 0.5)", // 약한 비
        "rgba(0, 0, 255, 0.7)", // 중간 비
        "rgba(0, 255, 0, 0.7)", // 강한 비
        "rgba(255, 255, 0, 0.7)", // 매우 강한 비
        "rgba(255, 0, 0, 0.7)", // 폭우
      ],
      minPrecipitation: 0, // mm/h
      maxPrecipitation: 50, // mm/h
      opacity: 0.7,
    };

    // 사용자 옵션과 기본 옵션 병합
    const mergedOptions: PrecipitationLayerOptions = { ...defaultOptions };
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
    return "precipitation";
  }

  /**
   * OpenLayers 레이어 생성
   */
  createLayer(): BaseLayer {
    return new ImageLayer({
      source: this.imageSource,
      zIndex: this.options.zIndex || 6,
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
