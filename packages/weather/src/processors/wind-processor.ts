import { BaseProcessor } from "./base-processor";
import { ProcessorType, WeatherDataBase } from "../types";

/**
 * 바람 움직임 파티클
 */
interface WindParticle {
  x: number;
  y: number;
  age: number;
  u: number;
  v: number;
  dx: number;
  dy: number;
  speed: number;
}

/**
 * 바람 데이터 시각화 프로세서
 */
export class WindProcessor extends BaseProcessor {
  private particles: WindParticle[] = [];
  private particleCount: number = 2000;
  private particleLifetime: number = 60; // 프레임 단위
  private colorScale: string[] = [];
  private lineWidth: number = 1;
  private velocityScale: number = 1 / 30;
  private minVelocity: number = 0;
  private maxVelocity: number = 10;
  private fadeOpacity: number = 0.92;
  private dropRate: number = 0.003;
  private dropRateBump: number = 0.01;
  private speedFactor: number = 0.25;

  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  // width와 height는 BaseProcessor에서 상속받음

  // 애니메이션 관련 변수
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;

  /**
   * 프로세서 타입 반환
   */
  getType(): ProcessorType {
    return "wind";
  }

  /**
   * 데이터 처리
   */
  async process(data: any): Promise<any> {
    // 간단한 데이터 전처리 수행
    return data;
  }

  /**
   * 오프스크린 캔버스에 렌더링
   */
  async render(
    canvas: OffscreenCanvas,
    weatherData: WeatherDataBase[],
    options: any
  ): Promise<{ imageData?: ImageBitmap; metadata?: any }> {
    // 캔버스 설정
    this.canvas = canvas;
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

    // 옵션 설정
    this.applyOptions(options);

    // 파티클 초기화
    this.initParticles(weatherData, options);

    // 애니메이션 시작
    this.startAnimation();

    // 프레임을 몇 개 렌더링한 후 결과 반환
    await this.renderFrames(30); // 30프레임 렌더링

    // 애니메이션 정지
    this.stopAnimation();

    // 이미지 생성 및 반환
    const imageData = await createImageBitmap(canvas);

    return {
      imageData,
      metadata: {
        timestamp: Date.now(),
        type: this.getType(),
      },
    };
  }

  /**
   * 옵션 적용
   */
  private applyOptions(options: any) {
    if (!options) return;

    // 옵션 적용
    this.particleCount = options.particleCount || this.particleCount;
    this.particleLifetime = options.particleAge || this.particleLifetime;
    this.colorScale = options.colorScale || this.colorScale;
    this.lineWidth = options.lineWidth || this.lineWidth;
    this.velocityScale = options.velocityScale || this.velocityScale;
    this.minVelocity = options.minVelocity || this.minVelocity;
    this.maxVelocity = options.maxVelocity || this.maxVelocity;
    this.fadeOpacity = options.fadeOpacity || this.fadeOpacity;
    this.dropRate = options.dropRate || this.dropRate;
    this.dropRateBump = options.dropRateBump || this.dropRateBump;
    this.speedFactor = options.speedFactor || this.speedFactor;
  }

  /**
   * 파티클 초기화
   */
  private initParticles(weatherData: WeatherDataBase[], options: any = {}) {
    this.particles = [];

    // 데이터가 없으면 무작위 파티클 생성
    if (!weatherData || weatherData.length === 0) {
      this.createRandomParticles();
      return;
    }

    // 데이터 기반 파티클 생성
    for (const data of weatherData) {
      if (
        !data.location ||
        typeof data.location.lon !== "number" ||
        typeof data.location.lat !== "number" ||
        !data.wind
      ) {
        continue;
      }

      // 벡터 필드 값 추출
      const u = data.wind.u || 0;
      const v = data.wind.v || 0;

      // 위치를 캔버스 좌표로 변환
      const [x, y] = this.mapToCanvas(
        data.location.lon,
        data.location.lat,
        options.bounds || [0, 0, 1, 1]
      );

      // 파티클 추가
      if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
        this.particles.push({
          x,
          y,
          age: Math.random() * this.particleLifetime,
          u,
          v,
          dx: u * this.velocityScale,
          dy: v * this.velocityScale,
          speed: Math.sqrt(u * u + v * v),
        });
      }
    }

    // 충분한 파티클이 없으면 추가 생성
    const density = options?.particleDensity || 1.0;
    const targetCount = Math.max(
      this.particleCount,
      ((this.width * this.height) / 1000) * density
    );

    while (this.particles.length < targetCount) {
      const u = (Math.random() - 0.5) * 2;
      const v = (Math.random() - 0.5) * 2;
      const speed = Math.sqrt(u * u + v * v);

      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        age: Math.random() * this.particleLifetime,
        u,
        v,
        dx: u * this.velocityScale,
        dy: v * this.velocityScale,
        speed,
      });
    }
  }

  /**
   * 무작위 파티클 생성
   */
  private createRandomParticles() {
    const count = this.particleCount;

    for (let i = 0; i < count; i++) {
      const u = (Math.random() - 0.5) * 2;
      const v = (Math.random() - 0.5) * 2;
      const speed = Math.sqrt(u * u + v * v);

      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        age: Math.random() * this.particleLifetime,
        u,
        v,
        dx: u * this.velocityScale,
        dy: v * this.velocityScale,
        speed,
      });
    }
  }

  /**
   * 파티클 그리기
   */
  private drawParticles() {
    if (!this.ctx) return;

    // ctx 객체 참조를 로컬 변수에 저장
    const ctx = this.ctx;

    // 선 스타일 설정
    ctx.strokeStyle = "rgba(0, 191, 255, 0.85)";
    ctx.lineWidth = 1.5;

    // 모든 파티클 업데이트 및 그리기
    this.particles.forEach((particle, index) => {
      // 파티클 이동
      particle.x += particle.dx;
      particle.y += particle.dy;

      // 나이 증가
      particle.age++;

      // 화면 밖으로 나가거나 수명이 다한 경우 재설정
      if (
        particle.age > this.particleLifetime ||
        particle.x < 0 ||
        particle.x > this.width ||
        particle.y < 0 ||
        particle.y > this.height ||
        Math.random() < this.dropRate
      ) {
        particle.x = Math.random() * this.width;
        particle.y = Math.random() * this.height;
        particle.age = 0;
      }

      // 이전 위치 계산
      const prevX = particle.x - particle.dx;
      const prevY = particle.y - particle.dy;

      // 선 그리기
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(particle.x, particle.y);
      ctx.stroke();
    });
  }

  /**
   * 애니메이션 프레임 렌더링
   */
  private renderFrame() {
    if (!this.ctx || !this.canvas) return;

    const now = performance.now();
    const dt = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // 프레임 시간이 너무 길면 건너뜀 (브라우저 탭이 비활성화된 경우 등)
    if (dt > 1000) {
      return;
    }

    // ctx가 존재하는지 다시 확인
    const ctx = this.ctx;
    if (!ctx) return;

    // 페이드 아웃 효과
    ctx.globalAlpha = this.fadeOpacity;
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.fillRect(0, 0, this.width, this.height);

    // 블렌딩 모드 원래대로
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // 파티클 그리기
    this.drawParticles();
  }

  /**
   * 애니메이션 시작
   */
  private startAnimation() {
    this.lastFrameTime = performance.now();
    this.animationFrameId = null;
  }

  /**
   * 여러 프레임 렌더링
   */
  private async renderFrames(count: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let frameCount = 0;

      const renderLoop = () => {
        this.renderFrame();
        frameCount++;

        if (frameCount < count) {
          requestAnimationFrame(renderLoop);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(renderLoop);
    });
  }

  /**
   * 애니메이션 정지
   */
  private stopAnimation() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * 지도 좌표를 캔버스 좌표로 변환
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
}
