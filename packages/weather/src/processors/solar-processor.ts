import { BaseProcessor } from "./base-processor.js";
import {
  WeatherDataBase,
  ProcessorType,
  SolarRenderOptions,
} from "../types/index.js";

/**
 * 일사량 시각화 프로세서
 * 날씨 데이터의 일사량 정보를 처리하고 시각화합니다.
 */
export class SolarProcessor extends BaseProcessor {
  private colorMap: string[] = [];
  private minSolar: number = 0;
  private maxSolar: number = 1000;
  private opacity: number = 0.7;

  /**
   * 프로세서 타입 반환
   */
  getType(): ProcessorType {
    return "solar";
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

    // 일사량 데이터 포인트 추출 및 시각화
    this.renderSolarRadiation(
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
  private applyOptions(options: SolarRenderOptions) {
    if (!options) return;

    if (options.colorScale) {
      this.colorMap = options.colorScale;
    }

    if (options.minSolar !== undefined) {
      this.minSolar = options.minSolar;
    }

    if (options.maxSolar !== undefined) {
      this.maxSolar = options.maxSolar;
    }

    if (options.opacity !== undefined) {
      this.opacity = options.opacity;
    }
  }

  /**
   * 일사량 렌더링
   */
  private renderSolarRadiation(
    ctx: OffscreenCanvasRenderingContext2D,
    weatherData: WeatherDataBase[],
    bounds: [number, number, number, number]
  ) {
    // 이미지 데이터 생성
    const imageData = ctx.createImageData(this.width, this.height);
    const data = imageData.data;

    // 초기화 - 모든 픽셀을 투명하게 설정
    for (let i = 0; i < data.length; i += 4) {
      data[i + 3] = 0; // 알파 채널을 0으로 설정 (완전 투명)
    }

    // 일사량 데이터 추출 및 그리드 생성
    const solarPoints = this.extractSolarData(weatherData, bounds);

    // 일사량 데이터를 그리드로 변환
    const gridSize = Math.min(Math.ceil(this.width / 30), 50); // 그리드 셀 크기 (픽셀)
    const rows = Math.ceil(this.height / gridSize);
    const columns = Math.ceil(this.width / gridSize);
    const grid = this.createSolarGrid(solarPoints, columns, rows, gridSize);

    // 보간된 그리드로 이미지 생성
    this.renderSolarGrid(ctx, grid, gridSize);

    // 이미지 데이터를 캔버스에 그리기
    // ctx.putImageData(imageData, 0, 0);
  }

  /**
   * 일사량 데이터 추출
   */
  private extractSolarData(
    weatherData: WeatherDataBase[],
    bounds: [number, number, number, number]
  ): { x: number; y: number; value: number }[] {
    const points: { x: number; y: number; value: number }[] = [];

    // 각 날씨 데이터 포인트 처리
    weatherData.forEach((point) => {
      // 일사량 데이터가 있는지 확인
      if (
        point &&
        typeof point === "object" &&
        ("solar" in point || "solarRadiation" in point) &&
        "location" in point &&
        point.location &&
        typeof point.location === "object" &&
        "longitude" in point.location &&
        "latitude" in point.location &&
        typeof point.location.longitude === "number" &&
        typeof point.location.latitude === "number"
      ) {
        // 일사량 값 가져오기
        let solarValue: number | undefined = undefined;

        if (
          "solarRadiation" in point &&
          typeof point.solarRadiation === "number"
        ) {
          solarValue = point.solarRadiation;
        } else if (
          "solar" in point &&
          point.solar &&
          typeof point.solar === "object" &&
          "radiation" in point.solar &&
          typeof point.solar.radiation === "number"
        ) {
          solarValue = point.solar.radiation;
        }

        // 일사량 값이 있으면 포인트에 추가
        if (solarValue !== undefined && solarValue >= 0) {
          // 위도/경도를 캔버스 좌표로 변환
          const [x, y] = this.mapToCanvas(
            point.location.longitude,
            point.location.latitude,
            bounds
          );

          // 유효한 좌표인 경우에만 포인트 추가
          if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            points.push({
              x,
              y,
              value: solarValue,
            });
          }
        }
      }
    });

    return points;
  }

  /**
   * 일사량 그리드 생성
   */
  private createSolarGrid(
    points: { x: number; y: number; value: number }[],
    columns: number,
    rows: number,
    gridSize: number
  ): number[][] {
    // 그리드 초기화 (NaN으로 채움)
    const grid: number[][] = Array(rows)
      .fill(0)
      .map(() => Array(columns).fill(NaN));

    // 각 데이터 포인트를 그리드에 할당
    points.forEach((point) => {
      const gridX = Math.floor(point.x / gridSize);
      const gridY = Math.floor(point.y / gridSize);

      // 그리드 범위 체크
      if (gridX >= 0 && gridX < columns && gridY >= 0 && gridY < rows) {
        // 이미 값이 있으면 평균 계산, 없으면 설정
        if (!isNaN(grid[gridY][gridX])) {
          grid[gridY][gridX] = (grid[gridY][gridX] + point.value) / 2;
        } else {
          grid[gridY][gridX] = point.value;
        }
      }
    });

    // 그리드 보간 (빈 셀 채우기)
    this.interpolateSolarGrid(grid, rows, columns);

    return grid;
  }

  /**
   * 그리드 보간 - 빈 셀을 주변 값으로 채움
   */
  private interpolateSolarGrid(
    grid: number[][],
    rows: number,
    columns: number
  ) {
    // 복사본 생성
    const tempGrid = JSON.parse(JSON.stringify(grid));

    // 여러 번 보간 반복 (더 부드러운 결과를 위해)
    for (let iteration = 0; iteration < 3; iteration++) {
      // 빈 셀 보간
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
          // 현재 셀이 비어있으면 주변 값으로 보간
          if (isNaN(grid[y][x])) {
            const neighbors: number[] = [];

            // 주변 8개 셀 검사
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;

                const nx = x + dx;
                const ny = y + dy;

                // 그리드 범위 확인
                if (nx >= 0 && nx < columns && ny >= 0 && ny < rows) {
                  // 값이 있으면 추가
                  if (!isNaN(grid[ny][nx])) {
                    neighbors.push(grid[ny][nx]);
                  }
                }
              }
            }

            // 주변에 값이 있으면 평균 적용
            if (neighbors.length > 0) {
              const sum = neighbors.reduce((a, b) => a + b, 0);
              tempGrid[y][x] = sum / neighbors.length;
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

    // 남은 빈 셀 처리 (위 보간으로 채워지지 않은 경우)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        if (isNaN(grid[y][x])) {
          grid[y][x] = 0; // 기본값 사용
        }
      }
    }
  }

  /**
   * 일사량 그리드 렌더링
   */
  private renderSolarGrid(
    ctx: OffscreenCanvasRenderingContext2D,
    grid: number[][],
    gridSize: number
  ) {
    const rows = grid.length;
    const columns = grid[0].length;

    // 부드러운 그라데이션 효과를 위한 그라데이션 크기 확대
    const enlargedSize = gridSize * 2;

    // 먼저 캔버스 지우기
    ctx.clearRect(0, 0, this.width, this.height);

    // 각 그리드 셀 사이에 부드럽게 보간된 색상으로 그리기
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < columns - 1; x++) {
        const x1 = x * gridSize;
        const y1 = y * gridSize;

        // 현재 셀 및 주변 셀 값
        const val1 = grid[y][x]; // 왼쪽 위
        const val2 = x < columns - 1 ? grid[y][x + 1] : val1; // 오른쪽 위
        const val3 = y < rows - 1 ? grid[y + 1][x] : val1; // 왼쪽 아래
        const val4 =
          x < columns - 1 && y < rows - 1 ? grid[y + 1][x + 1] : val1; // 오른쪽 아래

        // 모든 값이 유효한 경우에만 그리기
        if (!isNaN(val1) && !isNaN(val2) && !isNaN(val3) && !isNaN(val4)) {
          // 그라데이션 생성
          const gradient = ctx.createRadialGradient(
            x1 + gridSize / 2,
            y1 + gridSize / 2,
            0,
            x1 + gridSize / 2,
            y1 + gridSize / 2,
            gridSize * 1.5
          );

          // 그라데이션 색상 설정
          const centerColor = this.getSolarColor(val1);
          const edgeColor = this.getSolarColor(
            Math.min(val1, val2, val3, val4)
          );

          gradient.addColorStop(
            0,
            `rgba(${centerColor.r}, ${centerColor.g}, ${centerColor.b}, ${
              (centerColor.a / 255) * this.opacity
            })`
          );
          gradient.addColorStop(
            1,
            `rgba(${edgeColor.r}, ${edgeColor.g}, ${edgeColor.b}, 0)`
          );

          // 그라데이션 적용 및 원 그리기
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(
            x1 + gridSize / 2,
            y1 + gridSize / 2,
            gridSize * 1.5,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
    }
  }

  /**
   * 일사량에 따른 색상 계산
   */
  private getSolarColor(solarValue: number): {
    r: number;
    g: number;
    b: number;
    a: number;
  } {
    // 일사량 범위 클램핑
    const clampedValue = Math.max(
      this.minSolar,
      Math.min(this.maxSolar, solarValue)
    );

    // 색상 스케일 내에서 정규화된 위치 계산 (0-1 사이)
    const t = (clampedValue - this.minSolar) / (this.maxSolar - this.minSolar);

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

    // 기본값 반환 (노란색)
    return { r: 255, g: 255, b: 0, a: 128 };
  }
}
