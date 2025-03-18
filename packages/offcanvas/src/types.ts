export interface Component2D {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  fillStyle?: string;
  strokeStyle?: string;
  lineWidth?: number;
  type: "rect" | "circle" | "image" | "text" | "path";
  data?: any; // 컴포넌트별 추가 데이터
  visible?: boolean;
  alpha?: number;
  children?: Component2D[];
  [key: string]: any;
}

export interface CanvasRendererOptions {
  width: number;
  height: number;
  pixelRatio?: number;
  background?: string;
  useOffscreenCanvas?: boolean;
  maxWorkers?: number;
  batchSize?: number;
}

export interface RenderContext {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  width: number;
  height: number;
  pixelRatio: number;
}

export interface RenderTask {
  id: string;
  components: Component2D[];
  options: CanvasRendererOptions;
}

export interface RenderResult {
  taskId: string;
  duration: number;
  componentsRendered: number;
}

export interface WorkerMessage {
  type: "init" | "render" | "clear" | "terminate";
  data: any;
}
