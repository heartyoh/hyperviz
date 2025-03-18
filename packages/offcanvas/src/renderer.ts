import * as Comlink from "comlink";
import { Component2D, CanvasRendererOptions, RenderResult } from "./types.js";

// 웹 워커 경로 설정
// production 환경의 경로와 일치하도록 확장자 없이 설정하고 빌드 시 해석되도록 함
const WORKER_PATH = "./worker/index";

// 웹 워커 관련 타입 정의
type WorkerRenderer = {
  init: (canvas: OffscreenCanvas, options: CanvasRendererOptions) => void;
  render: (components: Component2D[]) => RenderResult;
  clear: () => void;
  terminate: () => void;
};

export class CanvasRenderer {
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  private ctx:
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null = null;
  private workers: Array<Comlink.Remote<WorkerRenderer>> = [];
  private useOffscreenCanvas: boolean = false;
  private pixelRatio: number = window.devicePixelRatio || 1;

  constructor(private options: CanvasRendererOptions) {
    this.useOffscreenCanvas =
      !!options.useOffscreenCanvas && typeof OffscreenCanvas !== "undefined";

    this.pixelRatio = options.pixelRatio || window.devicePixelRatio || 1;

    // 캔버스 생성
    if (this.useOffscreenCanvas) {
      this.canvas = new OffscreenCanvas(
        options.width * this.pixelRatio,
        options.height * this.pixelRatio
      );
      this.initWorkers();
    } else {
      this.canvas = document.createElement("canvas");
      this.canvas.width = options.width * this.pixelRatio;
      this.canvas.height = options.height * this.pixelRatio;
      this.canvas.style.width = `${options.width}px`;
      this.canvas.style.height = `${options.height}px`;

      this.ctx = this.canvas.getContext("2d");

      if (!this.ctx) {
        throw new Error("Failed to get 2D context from canvas");
      }

      // 픽셀 비율 보정
      this.ctx.scale(this.pixelRatio, this.pixelRatio);
    }
  }

  private initWorkers() {
    const maxWorkers =
      this.options.maxWorkers || navigator.hardwareConcurrency || 4;

    for (let i = 0; i < maxWorkers; i++) {
      // import.meta.url 방식을 대체하여 더 호환성 있는 워커 로딩 방식 사용
      // 빌드 과정에서 경로가 올바르게 해석되도록 수정
      let worker: Worker;

      try {
        // 최신 브라우저에서는 모듈 타입의 워커 사용
        worker = new Worker(new URL(WORKER_PATH, import.meta.url), {
          type: "module",
        });
      } catch (e) {
        // 폴백: 일반적인 워커 생성 방식
        // 이 부분은 실제 빌드/배포 환경에 맞게 조정 필요
        console.warn("모듈 타입 워커 로드 실패, 일반 워커로 대체:", e);
        worker = new Worker(WORKER_PATH);
      }

      const workerApi = Comlink.wrap<WorkerRenderer>(worker);

      if (this.canvas instanceof OffscreenCanvas) {
        // 오프스크린 캔버스 클론 생성 및 워커에 전달
        const offscreen = new OffscreenCanvas(
          this.options.width * this.pixelRatio,
          this.options.height * this.pixelRatio
        );

        workerApi.init(Comlink.transfer(offscreen, [offscreen]), this.options);
      }

      this.workers.push(workerApi);
    }
  }

  public getCanvas(): HTMLCanvasElement | OffscreenCanvas {
    return this.canvas;
  }

  public render(components: Component2D[]): void {
    if (this.useOffscreenCanvas) {
      this.renderWithWorkers(components);
    } else {
      this.renderWithMainThread(components);
    }
  }

  private async renderWithWorkers(components: Component2D[]) {
    const batchSize = this.options.batchSize || 1000;
    const workerCount = this.workers.length;
    const batches: Component2D[][] = [];

    // 컴포넌트들을 배치로 나누기
    for (let i = 0; i < components.length; i += batchSize) {
      batches.push(components.slice(i, i + batchSize));
    }

    // 워커들에게 배치 할당
    const renderPromises = batches.map((batch, i) => {
      const workerIndex = i % workerCount;
      return this.workers[workerIndex].render(batch);
    });

    // 모든 워커의 작업이 완료될 때까지 기다림
    await Promise.all(renderPromises);
  }

  private renderWithMainThread(components: Component2D[]) {
    if (!this.ctx) return;

    const { width, height, background } = this.options;

    // 배경 지우기
    this.ctx.clearRect(0, 0, width, height);

    // 배경색 설정
    if (background) {
      this.ctx.fillStyle = background;
      this.ctx.fillRect(0, 0, width, height);
    }

    // 컴포넌트 렌더링
    components.forEach((component) => {
      this.renderComponent(component, this.ctx!);
    });
  }

  private renderComponent(
    component: Component2D,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  ) {
    if (component.visible === false) return;

    ctx.save();

    // 위치 이동
    ctx.translate(component.x, component.y);

    // 회전
    if (component.rotation) {
      ctx.rotate((component.rotation * Math.PI) / 180);
    }

    // 알파값 적용
    if (component.alpha !== undefined && component.alpha < 1) {
      ctx.globalAlpha = component.alpha;
    }

    // 타입별 렌더링
    switch (component.type) {
      case "rect":
        this.renderRect(component, ctx);
        break;
      case "circle":
        this.renderCircle(component, ctx);
        break;
      case "text":
        this.renderText(component, ctx);
        break;
      case "image":
        this.renderImage(component, ctx);
        break;
      case "path":
        this.renderPath(component, ctx);
        break;
    }

    // 자식 컴포넌트 렌더링
    if (component.children && component.children.length > 0) {
      component.children.forEach((child) => {
        this.renderComponent(child, ctx);
      });
    }

    ctx.restore();
  }

  private renderRect(
    component: Component2D,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  ) {
    if (component.fillStyle) {
      ctx.fillStyle = component.fillStyle;
      ctx.fillRect(0, 0, component.width, component.height);
    }

    if (component.strokeStyle) {
      ctx.strokeStyle = component.strokeStyle;
      ctx.lineWidth = component.lineWidth || 1;
      ctx.strokeRect(0, 0, component.width, component.height);
    }
  }

  private renderCircle(
    component: Component2D,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  ) {
    const radius = Math.min(component.width, component.height) / 2;

    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.closePath();

    if (component.fillStyle) {
      ctx.fillStyle = component.fillStyle;
      ctx.fill();
    }

    if (component.strokeStyle) {
      ctx.strokeStyle = component.strokeStyle;
      ctx.lineWidth = component.lineWidth || 1;
      ctx.stroke();
    }
  }

  private renderText(
    component: Component2D,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  ) {
    const { text, font, textAlign, textBaseline } = component.data || {};

    if (!text) return;

    if (font) ctx.font = font;
    if (textAlign) ctx.textAlign = textAlign;
    if (textBaseline) ctx.textBaseline = textBaseline;

    if (component.fillStyle) {
      ctx.fillStyle = component.fillStyle;
      ctx.fillText(text, 0, 0);
    }

    if (component.strokeStyle) {
      ctx.strokeStyle = component.strokeStyle;
      ctx.lineWidth = component.lineWidth || 1;
      ctx.strokeText(text, 0, 0);
    }
  }

  private renderImage(
    component: Component2D,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  ) {
    const { image } = component.data || {};

    if (!image) return;

    ctx.drawImage(image, 0, 0, component.width, component.height);
  }

  private renderPath(
    component: Component2D,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  ) {
    const { path } = component.data || {};

    if (!path || !Array.isArray(path)) return;

    ctx.beginPath();

    path.forEach((cmd) => {
      if (!Array.isArray(cmd)) return;

      const [type, ...args] = cmd;

      switch (type) {
        case "M": // moveTo
          ctx.moveTo(args[0], args[1]);
          break;
        case "L": // lineTo
          ctx.lineTo(args[0], args[1]);
          break;
        case "C": // bezierCurveTo
          ctx.bezierCurveTo(
            args[0],
            args[1],
            args[2],
            args[3],
            args[4],
            args[5]
          );
          break;
        case "Q": // quadraticCurveTo
          ctx.quadraticCurveTo(args[0], args[1], args[2], args[3]);
          break;
        case "A": // arc
          ctx.arc(args[0], args[1], args[2], args[3], args[4], args[5]);
          break;
        case "Z": // closePath
          ctx.closePath();
          break;
      }
    });

    if (component.fillStyle) {
      ctx.fillStyle = component.fillStyle;
      ctx.fill();
    }

    if (component.strokeStyle) {
      ctx.strokeStyle = component.strokeStyle;
      ctx.lineWidth = component.lineWidth || 1;
      ctx.stroke();
    }
  }

  public clear(): void {
    if (this.useOffscreenCanvas) {
      // 모든 워커에게 clear 명령 전달
      this.workers.forEach((worker) => worker.clear());
    } else if (this.ctx) {
      const { width, height } = this.options;
      this.ctx.clearRect(0, 0, width, height);
    }
  }

  public resize(width: number, height: number): void {
    const scaledWidth = width * this.pixelRatio;
    const scaledHeight = height * this.pixelRatio;

    if (this.canvas instanceof HTMLCanvasElement) {
      this.canvas.width = scaledWidth;
      this.canvas.height = scaledHeight;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;

      if (this.ctx) {
        this.ctx.scale(this.pixelRatio, this.pixelRatio);
      }
    } else if (this.useOffscreenCanvas) {
      // 워커 재초기화 필요
      this.disposeWorkers();

      this.canvas = new OffscreenCanvas(scaledWidth, scaledHeight);
      this.options.width = width;
      this.options.height = height;

      this.initWorkers();
    }
  }

  private disposeWorkers(): void {
    if (this.workers.length > 0) {
      this.workers.forEach((worker) => worker.terminate());
      this.workers = [];
    }
  }

  public dispose(): void {
    this.disposeWorkers();
    this.ctx = null;
  }
}
