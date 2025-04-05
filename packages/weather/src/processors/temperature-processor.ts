import { BaseProcessor } from "./base-processor.js";
import {
  WeatherData,
  TemperatureRenderOptions,
  ProcessorType,
  WeatherDataBase,
} from "../types/index.js";

/**
 * 온도 시각화 프로세서
 * 날씨 데이터의 온도 정보를 처리하고 시각화합니다.
 */
export class TemperatureProcessor extends BaseProcessor {
  private colorMap: string[] = [];
  private minTemperature: number = -10;
  private maxTemperature: number = 40;
  private interpolationMethod: "linear" | "bilinear" | "bicubic" = "bilinear";

  /**
   * 프로세서 타입 반환
   */
  getType(): ProcessorType {
    return "temperature";
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

    // 타입 변환 없이 weatherData를 직접 사용
    const points = this.extractTemperaturePoints(
      weatherData,
      bounds,
      this.width,
      this.height
    );
    const grid = this.createTemperatureGrid(points, this.width, this.height);

    // 온도 데이터 시각화
    this.renderTemperatureGrid(ctx, grid, this.width, this.height);

    // 이미지 비트맵 생성 및 반환
    const imageBitmap = await createImageBitmap(canvas);
    return { imageData: imageBitmap };
  }

  /**
   * 옵션 적용
   */
  private applyOptions(options: TemperatureRenderOptions) {
    if (!options) return;

    if (options.colorScale) {
      this.colorMap = options.colorScale;
    }

    if (options.minTemperature !== undefined) {
      this.minTemperature = options.minTemperature;
    }

    if (options.maxTemperature !== undefined) {
      this.maxTemperature = options.maxTemperature;
    }

    if (options.interpolation) {
      this.interpolationMethod = options.interpolation;
    }
  }

  /**
   * 온도 데이터 포인트 추출
   * 날씨 데이터에서 온도 값과 위치 정보를 추출하여 캔버스 좌표로 변환
   */
  private extractTemperaturePoints(
    weatherData: WeatherDataBase[],
    bounds: number[],
    width: number,
    height: number
  ): { x: number; y: number; temperature: number }[] {
    const points: { x: number; y: number; temperature: number }[] = [];

    weatherData.forEach((data) => {
      // temperature 필드가 있고, current 속성이 있는지 확인 (타입 안전하게 처리)
      if (
        data &&
        typeof data === "object" &&
        "temperature" in data &&
        data.temperature &&
        typeof data.temperature === "object" &&
        "current" in data.temperature &&
        typeof data.temperature.current === "number" &&
        "location" in data &&
        data.location &&
        typeof data.location === "object" &&
        "longitude" in data.location &&
        "latitude" in data.location &&
        typeof data.location.longitude === "number" &&
        typeof data.location.latitude === "number"
      ) {
        // 위도/경도를 캔버스 좌표로 변환
        const x = this.mapLongitudeToX(data.location.longitude, bounds, width);
        const y = this.mapLatitudeToY(data.location.latitude, bounds, height);

        // 유효한 좌표인 경우에만 포인트 추가
        if (x >= 0 && x < width && y >= 0 && y < height) {
          points.push({
            x,
            y,
            temperature: data.temperature.current,
          });
        }
      }
    });

    return points;
  }

  /**
   * 온도 그리드 생성
   * 데이터 포인트를 기반으로 그리드 형태의 온도 데이터 생성
   */
  private createTemperatureGrid(
    points: { x: number; y: number; temperature: number }[],
    width: number,
    height: number
  ): number[][] {
    // 그리드 초기화 (초기값은 NaN으로 설정)
    const grid: number[][] = Array(height)
      .fill(0)
      .map(() => Array(width).fill(NaN));

    // 직접 데이터 포인트 값 할당
    points.forEach((point) => {
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);

      if (x >= 0 && x < width && y >= 0 && y < height) {
        grid[y][x] = point.temperature;
      }
    });

    // 보간법에 따라 그리드 채우기
    this.interpolateGrid(grid, width, height);

    return grid;
  }

  /**
   * 그리드 데이터 보간
   * 빈 그리드 셀을 주변 값을 사용하여 보간
   */
  private interpolateGrid(grid: number[][], width: number, height: number) {
    switch (this.interpolationMethod) {
      case "linear":
        this.linearInterpolation(grid, width, height);
        break;
      case "bilinear":
        this.bilinearInterpolation(grid, width, height);
        break;
      case "bicubic":
        // 실제로는 더 복잡한 구현이 필요하나, 간단한 구현으로 대체
        this.bilinearInterpolation(grid, width, height);
        break;
      default:
        this.linearInterpolation(grid, width, height);
    }
  }

  /**
   * 선형 보간법
   * 가장 가까운 값을 찾아 거리에 따라 가중치를 적용하여 보간
   */
  private linearInterpolation(grid: number[][], width: number, height: number) {
    // 보간용 임시 그리드 생성
    const result = Array(height)
      .fill(0)
      .map(() => Array(width).fill(NaN));

    // 모든 셀에 대해 반복
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // 이미 값이 있으면 그대로 유지
        if (!isNaN(grid[y][x])) {
          result[y][x] = grid[y][x];
          continue;
        }

        // 가장 가까운 값을 찾기 위한 변수
        let minDistance = Infinity;
        let value = NaN;

        // 모든 유효한 데이터 포인트 검사
        for (let ny = 0; ny < height; ny++) {
          for (let nx = 0; nx < width; nx++) {
            if (!isNaN(grid[ny][nx])) {
              // 거리 계산
              const distance = Math.sqrt((nx - x) ** 2 + (ny - y) ** 2);

              // 더 가까운 포인트를 찾으면 업데이트
              if (distance < minDistance) {
                minDistance = distance;
                value = grid[ny][nx];
              }
            }
          }
        }

        // 유효한 값이 있으면 할당
        if (!isNaN(value)) {
          result[y][x] = value;
        }
      }
    }

    // 결과를 원래 그리드에 복사
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        grid[y][x] = result[y][x];
      }
    }
  }

  /**
   * 쌍선형 보간법
   * 주변 4개의 점을 사용하여 보간
   */
  private bilinearInterpolation(
    grid: number[][],
    width: number,
    height: number
  ) {
    // 유효한 데이터 포인트 찾기
    const validPoints: { x: number; y: number; value: number }[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isNaN(grid[y][x])) {
          validPoints.push({ x, y, value: grid[y][x] });
        }
      }
    }

    // 보간용 임시 그리드 생성
    const result = Array(height)
      .fill(0)
      .map(() => Array(width).fill(NaN));

    // IDW(Inverse Distance Weighted) 보간법 적용
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // 이미 값이 있으면 그대로 유지
        if (!isNaN(grid[y][x])) {
          result[y][x] = grid[y][x];
          continue;
        }

        let weightSum = 0;
        let valueSum = 0;

        // 모든 유효한 포인트 사용
        for (const point of validPoints) {
          const distance = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);

          // 같은 위치에 있으면 해당 값 사용
          if (distance === 0) {
            weightSum = 1;
            valueSum = point.value;
            break;
          }

          // 거리의 제곱에 반비례하는 가중치 계산
          const weight = 1 / distance ** 2;
          weightSum += weight;
          valueSum += weight * point.value;
        }

        // 가중 평균 계산
        if (weightSum > 0) {
          result[y][x] = valueSum / weightSum;
        }
      }
    }

    // 결과를 원래 그리드에 복사
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        grid[y][x] = result[y][x];
      }
    }
  }

  /**
   * 온도 그리드 렌더링
   * 그리드 데이터를 색상으로 변환하여 캔버스에 렌더링
   */
  private renderTemperatureGrid(
    ctx: OffscreenCanvasRenderingContext2D,
    grid: number[][],
    width: number,
    height: number
  ) {
    // 캔버스에 직접 픽셀 그리기
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const temperature = grid[y][x];
        const index = (y * width + x) * 4;

        if (isNaN(temperature)) {
          // 데이터가 없는 영역은 투명하게 처리
          data[index + 3] = 0; // 알파 채널 0 (완전 투명)
        } else {
          // 온도 값에 따라 색상 계산
          const color = this.getTemperatureColor(temperature);
          data[index] = color.r; // R
          data[index + 1] = color.g; // G
          data[index + 2] = color.b; // B
          data[index + 3] = 220; // 알파 채널 (약간 투명)
        }
      }
    }

    // 이미지 데이터 적용
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * 온도에 해당하는 색상 계산
   */
  private getTemperatureColor(temperature: number): {
    r: number;
    g: number;
    b: number;
  } {
    // 온도 범위 클램핑
    const clampedTemperature = Math.max(
      this.minTemperature,
      Math.min(this.maxTemperature, temperature)
    );

    // 색상 스케일 내에서 정규화된 위치 계산 (0-1 사이)
    const t =
      (clampedTemperature - this.minTemperature) /
      (this.maxTemperature - this.minTemperature);

    // 위치에 해당하는 색상 인덱스 계산
    const index = Math.min(
      Math.floor(t * (this.colorMap.length - 1)),
      this.colorMap.length - 2
    );
    const nextIndex = index + 1;

    // 두 색상 사이의 보간 비율 계산
    const ratio = t * (this.colorMap.length - 1) - index;

    // 색상 문자열에서 RGB 추출
    const color1 = this.parseColor(this.colorMap[index]);
    const color2 = this.parseColor(this.colorMap[nextIndex]);

    // 선형 보간으로 최종 색상 계산
    return {
      r: Math.round(color1.r * (1 - ratio) + color2.r * ratio),
      g: Math.round(color1.g * (1 - ratio) + color2.g * ratio),
      b: Math.round(color1.b * (1 - ratio) + color2.b * ratio),
    };
  }

  /**
   * 색상 문자열을 RGB 값으로 파싱
   */
  private parseColor(color: string): { r: number; g: number; b: number } {
    // 헥스 컬러 문자열 처리 (#RRGGBB)
    if (color.startsWith("#")) {
      const r = parseInt(color.substring(1, 3), 16);
      const g = parseInt(color.substring(3, 5), 16);
      const b = parseInt(color.substring(5, 7), 16);
      return { r, g, b };
    }
    // RGB 문자열 처리 (rgb(R, G, B))
    else if (color.startsWith("rgb")) {
      const match = color.match(/\d+/g);
      if (match && match.length >= 3) {
        return {
          r: parseInt(match[0], 10),
          g: parseInt(match[1], 10),
          b: parseInt(match[2], 10),
        };
      }
    }

    // 기본값 반환 (회색)
    return { r: 128, g: 128, b: 128 };
  }

  /**
   * 경도를 X 좌표로 변환
   */
  private mapLongitudeToX(
    longitude: number,
    bounds: number[],
    width: number
  ): number {
    const [minX, minY, maxX, maxY] = bounds;
    return ((longitude - minX) / (maxX - minX)) * width;
  }

  /**
   * 위도를 Y 좌표로 변환
   */
  private mapLatitudeToY(
    latitude: number,
    bounds: number[],
    height: number
  ): number {
    const [minX, minY, maxX, maxY] = bounds;
    return ((maxY - latitude) / (maxY - minY)) * height;
  }
}
