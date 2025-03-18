import { Component2D, CanvasRendererOptions } from "./types.js";
import { CanvasRenderer } from "./renderer.js";

export class OffCanvas {
  private renderer: CanvasRenderer;
  private components: Map<string, Component2D> = new Map();
  private needsUpdate: boolean = false;
  private frameId: number | null = null;
  private lastRenderTime: number = 0;

  constructor(
    private container: HTMLElement,
    private options: CanvasRendererOptions = { width: 800, height: 600 }
  ) {
    this.renderer = new CanvasRenderer(options);
    this.setupCanvas();
    this.startRenderLoop();
  }

  private setupCanvas() {
    // 컨테이너에 캔버스 추가
    const canvas = this.renderer.getCanvas();
    if (canvas instanceof HTMLCanvasElement) {
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      this.container.appendChild(canvas);
    }
  }

  public addComponent(component: Component2D): string {
    this.components.set(component.id, component);
    this.needsUpdate = true;
    return component.id;
  }

  public addComponents(components: Component2D[]): void {
    components.forEach((component) => {
      this.components.set(component.id, component);
    });
    this.needsUpdate = true;
  }

  public removeComponent(id: string): boolean {
    const result = this.components.delete(id);
    if (result) {
      this.needsUpdate = true;
    }
    return result;
  }

  public updateComponent(id: string, updates: Partial<Component2D>): boolean {
    const component = this.components.get(id);
    if (!component) return false;

    Object.assign(component, updates);
    this.needsUpdate = true;
    return true;
  }

  public getComponent(id: string): Component2D | undefined {
    return this.components.get(id);
  }

  public getAllComponents(): Component2D[] {
    return Array.from(this.components.values());
  }

  public clear(): void {
    this.components.clear();
    this.renderer.clear();
    this.needsUpdate = true;
  }

  public render(): void {
    if (!this.needsUpdate) return;

    const componentsArray = Array.from(this.components.values()).filter(
      (component) => component.visible !== false
    );

    const startTime = performance.now();
    this.renderer.render(componentsArray);
    const endTime = performance.now();

    this.lastRenderTime = endTime - startTime;
    this.needsUpdate = false;
  }

  public getPerformanceStats(): {
    componentsCount: number;
    lastRenderTime: number;
  } {
    return {
      componentsCount: this.components.size,
      lastRenderTime: this.lastRenderTime,
    };
  }

  public resize(width: number, height: number): void {
    this.options.width = width;
    this.options.height = height;
    this.renderer.resize(width, height);
    this.needsUpdate = true;
  }

  private startRenderLoop(): void {
    const loop = () => {
      this.render();
      this.frameId = requestAnimationFrame(loop);
    };

    this.frameId = requestAnimationFrame(loop);
  }

  public stop(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  public resume(): void {
    if (this.frameId === null) {
      this.startRenderLoop();
    }
  }

  public destroy(): void {
    this.stop();
    this.renderer.dispose();
    this.components.clear();

    // 컨테이너에서 캔버스 제거
    const canvas = this.renderer.getCanvas();
    if (
      canvas instanceof HTMLCanvasElement &&
      canvas.parentNode === this.container
    ) {
      this.container.removeChild(canvas);
    }
  }
}
