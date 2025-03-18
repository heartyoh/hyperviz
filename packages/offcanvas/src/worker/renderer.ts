import { Component2D, CanvasRendererOptions } from "../types.js";

/**
 * 웹워커 내부에서 동작하는 렌더러 구현
 */
export class WorkerRenderer {
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private pixelRatio: number = 1;

  constructor(
    private canvas: OffscreenCanvas,
    private options: CanvasRendererOptions
  ) {
    this.pixelRatio = options.pixelRatio || 1;
    this.ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

    if (!this.ctx) {
      throw new Error("Failed to get 2D context from offscreen canvas");
    }

    // 픽셀 비율 보정
    this.ctx.scale(this.pixelRatio, this.pixelRatio);
  }

  /**
   * 컴포넌트 렌더링
   */
  public render(components: Component2D[]): void {
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

  /**
   * 캔버스 클리어
   */
  public clear(): void {
    if (this.ctx) {
      const { width, height } = this.options;
      this.ctx.clearRect(0, 0, width, height);
    }
  }

  /**
   * 개별 컴포넌트 렌더링
   */
  private renderComponent(
    component: Component2D,
    ctx: OffscreenCanvasRenderingContext2D
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
    ctx: OffscreenCanvasRenderingContext2D
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
    ctx: OffscreenCanvasRenderingContext2D
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
    ctx: OffscreenCanvasRenderingContext2D
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
    ctx: OffscreenCanvasRenderingContext2D
  ) {
    const { image } = component.data || {};

    if (!image) return;

    ctx.drawImage(image, 0, 0, component.width, component.height);
  }

  private renderPath(
    component: Component2D,
    ctx: OffscreenCanvasRenderingContext2D
  ) {
    const { path } = component.data || {};

    if (!path || !Array.isArray(path)) return;

    ctx.beginPath();

    path.forEach((cmd, i) => {
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
}
