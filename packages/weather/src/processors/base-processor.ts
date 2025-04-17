import { WeatherDataBase, ProcessorType } from "../types/index.js";

/**
 * 날씨 프로세서의 기본 클래스
 * 모든 레이어별 프로세서는 이 클래스를 상속합니다.
 */
export abstract class BaseProcessor {
  protected width = 0;
  protected height = 0;

  /**
   * 생성자
   */
  constructor() {
    // 초기화 로직
  }

  /**
   * 프로세서 타입을 반환합니다.
   */
  abstract getType(): ProcessorType;

  /**
   * 데이터 처리 메서드
   * @param data 처리할 데이터
   */
  abstract process(data: any): Promise<any>;

  /**
   * 오프스크린 캔버스에 렌더링
   * @param canvas 오프스크린 캔버스
   * @param data 날씨 데이터
   * @param options 렌더링 옵션
   */
  abstract render(
    canvas: OffscreenCanvas,
    data: WeatherDataBase[],
    options: any
  ): Promise<any>;

  /**
   * 메시지 핸들러 - 워커에서 호출
   * @param data 메시지 데이터
   */
  async handleMessage(data: any): Promise<any> {
    try {
      // 메시지 타입에 따라 적절한 처리
      if (data.canvas) {
        // 캔버스 크기 업데이트
        this.width = data.width || 0;
        this.height = data.height || 0;

        // 렌더링 요청
        return this.render(data.canvas, data.weatherData, data.options);
      } else {
        // 데이터 처리 요청
        return this.process(data);
      }
    } catch (err) {
      console.error(`프로세서 오류 (${this.getType()}):`, err);
      throw err;
    }
  }

  /**
   * 지도 좌표를 캔버스 좌표로 변환
   * @param lon 경도
   * @param lat 위도
   * @param bounds 지도 경계 [minX, minY, maxX, maxY]
   */
  protected mapToCanvas(
    lon: number,
    lat: number,
    bounds: [number, number, number, number]
  ): [number, number] {
    const [minX, minY, maxX, maxY] = bounds;

    // 지도의 가로/세로 범위
    const mapWidth = maxX - minX;
    const mapHeight = maxY - minY;

    // 0~1 사이의 비율로 위치 계산
    const xRatio = (lon - minX) / mapWidth;
    const yRatio = (lat - minY) / mapHeight;

    // 캔버스 좌표로 변환 (y축은 반전)
    const canvasX = xRatio * this.width;
    const canvasY = (1 - yRatio) * this.height;

    return [canvasX, canvasY];
  }

  /**
   * 선형 보간 유틸리티 함수
   * @param value 보간할 값
   * @param min 최소값
   * @param max 최대값
   * @param newMin 새 범위 최소값
   * @param newMax 새 범위 최대값
   */
  protected linearInterpolate(
    value: number,
    min: number,
    max: number,
    newMin: number,
    newMax: number
  ): number {
    // 입력 값이 범위를 벗어나면 제한
    const clampedValue = Math.max(min, Math.min(max, value));

    // 0~1 사이 비율 계산
    const ratio = (clampedValue - min) / (max - min);

    // 새 범위에 적용
    return newMin + ratio * (newMax - newMin);
  }
}
