import { BaseProcessor } from "./base-processor.js";
import {
  WeatherDataBase,
  ProcessorType,
  PrecipitationRenderOptions,
} from "../types/index.js";

/**
 * 강수량 시각화 프로세서
 * 날씨 데이터의 강수량 정보를 처리하고 시각화합니다.
 */
export class PrecipitationProcessor extends BaseProcessor {
  private colorMap: string[] = [];
  private minPrecipitation: number = 0;
  private maxPrecipitation: number = 50;
  private opacity: number = 0.7;

  /**
   * 프로세서 타입 반환
   */
  getType(): ProcessorType {
    return "precipitation";
  }

  /**
   * 데이터 처리 메서드 - 기본 구현
   */
  async process(data: any): Promise<any> {
    // 간단한 데이터 전처리
    return data;
  }

  /**
   * 오프스크린 캔버스에 렌더링
   */
  async render(
    canvas: OffscreenCanvas,
    weatherData: WeatherDataBase[],
    options: any
  ): Promise<any> {
    // 캔버스 크기 설정
    canvas.width = this.width;
    canvas.height = this.height;

    // 옵션 적용
    this.applyOptions(options);

    // 컨텍스트 가져오기
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("캔버스 컨텍스트를 가져올 수 없습니다.");
    }

    // 캔버스 초기화
    ctx.clearRect(0, 0, this.width, this.height);

    // 데이터 포인트가 없으면 빈 이미지 반환
    if (!weatherData || weatherData.length === 0) {
      return { imageData: await createImageBitmap(canvas) };
    }

    const bounds = options.bounds || [0, 0, 1, 1];

    // 강수량 데이터 포인트 추출 및 시각화
    this.renderPrecipitation(
      ctx,
      weatherData,
      bounds as [number, number, number, number]
    );

    // 이미지 비트맵 생성 및 반환
    const imageBitmap = await createImageBitmap(canvas);
    return { imageData: imageBitmap };
  }

  /**
   * 옵션 적용
   */
  private applyOptions(options: PrecipitationRenderOptions) {
    if (!options) return;

    if (options.colorScale) {
      this.colorMap = options.colorScale;
    }

    if (options.minPrecipitation !== undefined) {
      this.minPrecipitation = options.minPrecipitation;
    }

    if (options.maxPrecipitation !== undefined) {
      this.maxPrecipitation = options.maxPrecipitation;
    }

    if (options.opacity !== undefined) {
      this.opacity = options.opacity;
    }
  }

  /**
   * 강수량 렌더링
   */
  private renderPrecipitation(
    ctx: OffscreenCanvasRenderingContext2D,
    weatherData: WeatherDataBase[],
    bounds: number[]
  ) {
    // 이미지 데이터 생성
    const imageData = ctx.createImageData(this.width, this.height);
    const data = imageData.data;

    // 초기화 - 모든 픽셀을 투명하게 설정
    for (let i = 0; i < data.length; i += 4) {
      data[i + 3] = 0; // 알파 채널을 0으로 설정 (완전 투명)
    }

    // 각 날씨 데이터 포인트 처리
    weatherData.forEach((point) => {
      // 강수량 데이터가 있는지 확인
      if (
        point &&
        typeof point === "object" &&
        "precipitation" in point &&
        point.precipitation &&
        typeof point.precipitation === "object" &&
        "amount" in point.precipitation &&
        typeof point.precipitation.amount === "number" &&
        "location" in point &&
        point.location &&
        typeof point.location === "object" &&
        "longitude" in point.location &&
        "latitude" in point.location &&
        typeof point.location.longitude === "number" &&
        typeof point.location.latitude === "number"
      ) {
        // 강수량 값 가져오기
        const precipAmount = point.precipitation.amount;

        // 강수량이 0보다 크면 렌더링
        if (precipAmount > 0) {
          // 위도/경도를 캔버스 좌표로 변환
          const [x, y] = this.mapToCanvas(
            point.location.longitude,
            point.location.latitude,
            bounds as [number, number, number, number]
          );

          // 반경 계산 - 강수량이 많을수록 더 넓게 표시
          const radius = this.calculateRadius(precipAmount);

          // 색상 계산
          const color = this.getPrecipitationColor(precipAmount);

          // 원형 강수 패턴 그리기
          this.drawPrecipitationPattern(data, x, y, radius, color);
        }
      }
    });

    // 이미지 데이터를 캔버스에 그리기
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * 강수량에 따른 반경 계산
   */
  private calculateRadius(precipitation: number): number {
    // 기본 반경
    const baseRadius = 15;

    // 강수량이 많을수록 더 큰 반경 사용
    const scaleFactor = Math.min(
      1.0,
      Math.max(0.2, precipitation / this.maxPrecipitation)
    );

    return baseRadius * (0.5 + scaleFactor);
  }

  /**
   * 강수량에 따른 색상 계산
   */
  private getPrecipitationColor(precipitation: number): {
    r: number;
    g: number;
    b: number;
    a: number;
  } {
    // 강수량 범위 클램핑
    const clampedPrecip = Math.max(
      this.minPrecipitation,
      Math.min(this.maxPrecipitation, precipitation)
    );

    // 색상 스케일 내에서 정규화된 위치 계산 (0-1 사이)
    const t =
      (clampedPrecip - this.minPrecipitation) /
      (this.maxPrecipitation - this.minPrecipitation);

    // 위치에 해당하는 색상 인덱스 계산
    const index = Math.min(
      Math.floor(t * (this.colorMap.length - 1)),
      this.colorMap.length - 2
    );
    const nextIndex = index + 1;

    // 두 색상 사이의 보간 비율 계산
    const ratio = t * (this.colorMap.length - 1) - index;

    // 색상 문자열에서 RGBA 추출
    const color1 = this.parseColor(this.colorMap[index]);
    const color2 = this.parseColor(this.colorMap[nextIndex]);

    // 선형 보간으로 최종 색상 계산
    return {
      r: Math.round(color1.r * (1 - ratio) + color2.r * ratio),
      g: Math.round(color1.g * (1 - ratio) + color2.g * ratio),
      b: Math.round(color1.b * (1 - ratio) + color2.b * ratio),
      a: Math.round(color1.a * (1 - ratio) + color2.a * ratio),
    };
  }

  /**
   * 색상 문자열을 RGBA 값으로 파싱
   */
  private parseColor(color: string): {
    r: number;
    g: number;
    b: number;
    a: number;
  } {
    // RGBA 문자열 처리 (rgba(R, G, B, A))
    if (color.startsWith("rgba")) {
      const match = color.match(
        /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/i
      );
      if (match && match.length >= 5) {
        return {
          r: parseInt(match[1], 10),
          g: parseInt(match[2], 10),
          b: parseInt(match[3], 10),
          a: parseFloat(match[4]) * 255,
        };
      }
    }

    // RGB 문자열 처리 (rgb(R, G, B))
    if (color.startsWith("rgb")) {
      const match = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
      if (match && match.length >= 4) {
        return {
          r: parseInt(match[1], 10),
          g: parseInt(match[2], 10),
          b: parseInt(match[3], 10),
          a: 255,
        };
      }
    }

    // 헥스 컬러 문자열 처리 (#RRGGBB)
    if (color.startsWith("#")) {
      const r = parseInt(color.substring(1, 3), 16);
      const g = parseInt(color.substring(3, 5), 16);
      const b = parseInt(color.substring(5, 7), 16);
      return { r, g, b, a: 255 };
    }

    // 기본값 반환 (반투명 파랑)
    return { r: 0, g: 0, b: 255, a: 128 };
  }

  /**
   * 강수 패턴 그리기 (원형 그라데이션)
   */
  private drawPrecipitationPattern(
    imageData: Uint8ClampedArray,
    centerX: number,
    centerY: number,
    radius: number,
    color: { r: number; g: number; b: number; a: number }
  ) {
    // 원형 패턴의 경계 상자 계산
    const left = Math.max(0, Math.floor(centerX - radius));
    const top = Math.max(0, Math.floor(centerY - radius));
    const right = Math.min(this.width - 1, Math.ceil(centerX + radius));
    const bottom = Math.min(this.height - 1, Math.ceil(centerY + radius));

    // 각 픽셀 처리
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        // 중심으로부터의 거리 계산
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

        // 원 내부인 경우에만 처리
        if (distance <= radius) {
          // 가장자리로 갈수록 투명해지는 효과
          const alpha =
            Math.max(0, 1 - distance / radius) * (color.a / 255) * this.opacity;

          // 현재 픽셀의 인덱스 계산
          const idx = (y * this.width + x) * 4;

          // 기존 색상과 새 색상 혼합 (알파 블렌딩)
          // 현재 픽셀에 이미 색상이 있는 경우 더 강한 색상 사용
          const currentAlpha = imageData[idx + 3] / 255;
          if (currentAlpha < alpha) {
            imageData[idx] = color.r;
            imageData[idx + 1] = color.g;
            imageData[idx + 2] = color.b;
            imageData[idx + 3] = alpha * 255;
          }
        }
      }
    }
  }
}
