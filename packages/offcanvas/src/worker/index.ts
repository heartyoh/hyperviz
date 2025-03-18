import * as Comlink from "comlink";
import { Component2D, CanvasRendererOptions, RenderResult } from "../types";
import { WorkerRenderer } from "./renderer";

let renderer: WorkerRenderer | null = null;

/**
 * 워커 렌더러 인터페이스 구현
 */
const workerApi = {
  /**
   * 렌더러 초기화
   */
  init(canvas: OffscreenCanvas, options: CanvasRendererOptions): void {
    renderer = new WorkerRenderer(canvas, options);
  },

  /**
   * 컴포넌트 렌더링
   */
  render(components: Component2D[]): RenderResult {
    if (!renderer) {
      throw new Error("Renderer not initialized");
    }

    const start = performance.now();
    renderer.render(components);
    const end = performance.now();

    return {
      taskId: Date.now().toString(),
      duration: end - start,
      componentsRendered: components.length,
    };
  },

  /**
   * 캔버스 클리어
   */
  clear(): void {
    if (renderer) {
      renderer.clear();
    }
  },

  /**
   * 워커 정리
   */
  terminate(): void {
    renderer = null;
  },
};

// Comlink 를 사용하여 워커 API 노출
Comlink.expose(workerApi);
