import { BaseProcessor } from "./base-processor.js";
import {
  WeatherDataBase,
  ProcessorType,
  CloudRenderOptions,
} from "../types/index.js";

/**
 * 구름 시각화 프로세서
 * 날씨 데이터의 구름 정보를 처리하고 시각화합니다.
 */
export class CloudProcessor extends BaseProcessor {
  private colorMap: string[] = [];
  private minCloud: number = 0;
  private maxCloud: number = 100;
  private opacity: number = 0.7;

  /**
   * 프로세서 타입 반환
   */
  getType(): ProcessorType {
    return "cloud";
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

    // 구름 데이터 포인트 추출 및 시각화
    this.renderCloud(
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
  private applyOptions(options: CloudRenderOptions) {
    if (!options) return;

    if (options.colorScale) {
      this.colorMap = options.colorScale;
    }

    if (options.minCloud !== undefined) {
      this.minCloud = options.minCloud;
    }

    if (options.maxCloud !== undefined) {
      this.maxCloud = options.maxCloud;
    }

    if (options.opacity !== undefined) {
      this.opacity = options.opacity;
    }
  }

  /**
   * 구름 렌더링
   */
  private renderCloud(
    ctx: OffscreenCanvasRenderingContext2D,
    weatherData: WeatherDataBase[],
    bounds: [number, number, number, number]
  ) {
    // 이미지 데이터 생성
    const imageData = ctx.createImageData(this.width, this.height);
    const data = imageData.data;

    // 그리드 생성
    const gridSize = 32; // 그리드 셀 크기
    const grid = this.createCloudGrid(weatherData, bounds, gridSize);

    // 구름 이미지 렌더링
    this.renderCloudGrid(ctx, data, grid, gridSize);

    // 이미지 데이터를 캔버스에 그리기
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * 구름 그리드 생성
   */
  private createCloudGrid(
    weatherData: WeatherDataBase[],
    bounds: [number, number, number, number],
    gridSize: number
  ): number[][] {
    // 그리드 초기화
    const rows = Math.ceil(this.height / gridSize);
    const columns = Math.ceil(this.width / gridSize);
    const grid: number[][] = Array(rows)
      .fill(0)
      .map(() => Array(columns).fill(NaN));

    // 각 날씨 데이터 포인트 처리
    weatherData.forEach((point) => {
      // 구름 데이터가 있는지 확인
      if (
        point &&
        typeof point === "object" &&
        ("cloud" in point || "cloudCoverage" in point) &&
        "location" in point &&
        point.location &&
        typeof point.location === "object" &&
        "longitude" in point.location &&
        "latitude" in point.location &&
        typeof point.location.longitude === "number" &&
        typeof point.location.latitude === "number"
      ) {
        // 구름 커버리지 값 가져오기
        let cloudCoverage: number | undefined = undefined;

        if (
          "cloudCoverage" in point &&
          typeof point.cloudCoverage === "number"
        ) {
          cloudCoverage = point.cloudCoverage;
        } else if (
          "cloud" in point &&
          point.cloud &&
          typeof point.cloud === "object" &&
          "coverage" in point.cloud &&
          typeof point.cloud.coverage === "number"
        ) {
          cloudCoverage = point.cloud.coverage;
        }

        // 구름 값이 있으면 그리드에 추가
        if (cloudCoverage !== undefined) {
          // 위도/경도를 캔버스 좌표로 변환
          const [x, y] = this.mapToCanvas(
            point.location.longitude,
            point.location.latitude,
            bounds
          );

          // 그리드 인덱스 계산
          const gridX = Math.floor(x / gridSize);
          const gridY = Math.floor(y / gridSize);

          // 유효한 그리드 위치인지 확인
          if (gridX >= 0 && gridX < columns && gridY >= 0 && gridY < rows) {
            // 이미 값이 있으면 평균 계산, 없으면 설정
            if (!isNaN(grid[gridY][gridX])) {
              grid[gridY][gridX] = (grid[gridY][gridX] + cloudCoverage) / 2;
            } else {
              grid[gridY][gridX] = cloudCoverage;
            }
          }
        }
      }
    });

    // 빈 셀 보간
    this.interpolateCloudGrid(grid, rows, columns);

    return grid;
  }

  /**
   * 그리드 보간 - 빈 셀을 주변 값으로 채움
   */
  private interpolateCloudGrid(
    grid: number[][],
    rows: number,
    columns: number
  ) {
    // 임시 그리드 생성 (복사)
    const tempGrid = JSON.parse(JSON.stringify(grid));

    // 빈 셀 보간
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        // 현재 셀이 비어있으면 주변 값으로 보간
        if (isNaN(grid[y][x])) {
          const neighbors: number[] = [];
          let sum = 0;

          // 주변 8개 셀 검사
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;

              const nx = x + dx;
              const ny = y + dy;

              // 그리드 경계 확인
              if (nx >= 0 && nx < columns && ny >= 0 && ny < rows) {
                // 값이 있으면 추가
                if (!isNaN(grid[ny][nx])) {
                  neighbors.push(grid[ny][nx]);
                  sum += grid[ny][nx];
                }
              }
            }
          }

          // 주변에 값이 있으면 평균 적용
          if (neighbors.length > 0) {
            tempGrid[y][x] = sum / neighbors.length;
          } else {
            // 주변에 값이 없으면 기본값 (0) 사용
            tempGrid[y][x] = 0;
          }
        }
      }
    }

    // 업데이트된 값 반영
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        grid[y][x] = tempGrid[y][x];
      }
    }
  }

  /**
   * 구름 그리드 렌더링
   */
  private renderCloudGrid(
    ctx: OffscreenCanvasRenderingContext2D,
    imageData: Uint8ClampedArray,
    grid: number[][],
    gridSize: number
  ) {
    const rows = grid.length;
    const columns = grid[0].length;

    // 각 그리드 셀 그리기
    for (let gridY = 0; gridY < rows; gridY++) {
      for (let gridX = 0; gridX < columns; gridX++) {
        const cloudValue = grid[gridY][gridX];

        // 구름 값이 유효하면 렌더링
        if (!isNaN(cloudValue)) {
          // 색상 계산
          const color = this.getCloudColor(cloudValue);

          // 그리드 셀의 경계 계산
          const startX = gridX * gridSize;
          const startY = gridY * gridSize;
          const endX = Math.min(startX + gridSize, this.width);
          const endY = Math.min(startY + gridSize, this.height);

          // 그리드 셀 내의 각 픽셀 그리기
          for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
              // 클라우드 패턴에 변화 추가 (약간의 랜덤성)
              const distFromCenter = Math.sqrt(
                Math.pow((x - (startX + endX) / 2) / gridSize, 2) +
                  Math.pow((y - (startY + endY) / 2) / gridSize, 2)
              );

              // 셀 가장자리로 갈수록 투명도 증가
              const fadeOut = Math.max(0, 1 - distFromCenter * 1.2);

              // 그리드 사이의 부드러운 전환을 위한 계수
              const alpha = (color.a / 255) * fadeOut * this.opacity;

              // 픽셀 인덱스 계산
              const idx = (y * this.width + x) * 4;

              // 픽셀이 캔버스 범위 내에 있는지 확인
              if (
                x >= 0 &&
                x < this.width &&
                y >= 0 &&
                y < this.height &&
                alpha > 0
              ) {
                // 알파 블렌딩 - 기존 픽셀과 새 픽셀을 알파값에 따라 혼합
                const existingAlpha = imageData[idx + 3] / 255;

                // 알파 블렌딩
                if (existingAlpha < alpha) {
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
    }
  }

  /**
   * 구름 커버리지에 따른 색상 계산
   */
  private getCloudColor(cloudCoverage: number): {
    r: number;
    g: number;
    b: number;
    a: number;
  } {
    // 구름 커버리지 범위 클램핑
    const clampedValue = Math.max(
      this.minCloud,
      Math.min(this.maxCloud, cloudCoverage)
    );

    // 색상 스케일 내에서 정규화된 위치 계산 (0-1 사이)
    const t = (clampedValue - this.minCloud) / (this.maxCloud - this.minCloud);

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

    // 기본값 반환 (흰색)
    return { r: 255, g: 255, b: 255, a: 128 };
  }
}
