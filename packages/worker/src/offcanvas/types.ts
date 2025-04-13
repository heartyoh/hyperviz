/**
 * OffscreenCanvas 모듈 타입 정의
 * 캔버스 작업과 워커 간 통신을 위한 타입을 정의합니다.
 */

/**
 * 캔버스 컨텍스트 타입
 */
export enum CanvasContextType {
  /** 2D 컨텍스트 */
  CONTEXT_2D = "2d",
  /** WebGL 컨텍스트 */
  CONTEXT_WEBGL = "webgl",
  /** WebGL2 컨텍스트 */
  CONTEXT_WEBGL2 = "webgl2",
}

/**
 * 캔버스 명령 타입
 */
export enum CanvasCommandType {
  /** 초기화 명령 */
  INIT = "init",
  /** 크기 조정 명령 */
  RESIZE = "resize",
  /** 렌더링 명령 */
  RENDER = "render",
  /** 캔버스 지우기 명령 */
  CLEAR = "clear",
  /** 자원 해제 명령 */
  DISPOSE = "dispose",
}

/**
 * 2D 캔버스 명령 타입
 */
export enum Canvas2DCommandType {
  /** 이미지 그리기 */
  DRAW_IMAGE = "drawImage",
  /** 도형 그리기 */
  DRAW_SHAPE = "drawShape",
  /** 텍스트 그리기 */
  DRAW_TEXT = "drawText",
  /** 사각형 채우기 */
  FILL_RECT = "fillRect",
  /** 사각형 윤곽선 */
  STROKE_RECT = "strokeRect",
  /** 사각형 지우기 */
  CLEAR_RECT = "clearRect",
  /** 경로 그리기 */
  PATH = "path",
}

/**
 * WebGL 캔버스 명령 타입
 */
export enum CanvasWebGLCommandType {
  /** 셰이더 설정 */
  SET_SHADER = "setShader",
  /** 셰이더 프로그램 컴파일 */
  COMPILE_SHADER = "compileShader",
  /** 버퍼 설정 */
  SET_BUFFER = "setBuffer",
  /** 버텍스 배열 객체 설정 */
  SET_VAO = "setVAO",
  /** 유니폼 설정 */
  SET_UNIFORM = "setUniform",
  /** 텍스처 설정 */
  SET_TEXTURE = "setTexture",
  /** 도형 그리기 */
  DRAW = "draw",
  /** 인스턴스 그리기 */
  DRAW_INSTANCED = "drawInstanced",
  /** Transform Feedback 설정 */
  SET_TRANSFORM_FEEDBACK = "setTransformFeedback",
}

/**
 * 도형 타입
 */
export enum ShapeType {
  /** 사각형 */
  RECT = "rect",
  /** 원 */
  CIRCLE = "circle",
  /** 타원 */
  ELLIPSE = "ellipse",
  /** 선 */
  LINE = "line",
  /** 다각형 */
  POLYGON = "polygon",
}

/**
 * 기본 캔버스 명령 인터페이스
 */
export interface CanvasCommand {
  /** 명령 ID */
  id?: string;
  /** 명령 타입 */
  type: CanvasCommandType;
  /** 명령 매개변수 (옵션) */
  params?: any;
}

/**
 * 캔버스 초기화 명령
 */
export interface CanvasInitCommand extends CanvasCommand {
  type: CanvasCommandType.INIT;
  params: {
    /** 캔버스 너비 */
    width?: number;
    /** 캔버스 높이 */
    height?: number;
    /** 컨텍스트 타입 */
    contextType: string;
    /** 컨텍스트 속성 */
    contextAttributes?: any;
    /** 장치 픽셀 비율 */
    devicePixelRatio?: number;
  };
}

/**
 * 캔버스 크기 조정 명령
 */
export interface CanvasResizeCommand extends CanvasCommand {
  type: CanvasCommandType.RESIZE;
  params: {
    /** 새 너비 */
    width: number;
    /** 새 높이 */
    height: number;
    /** 장치 픽셀 비율 */
    devicePixelRatio?: number;
  };
}

/**
 * 캔버스 렌더링 명령
 */
export interface CanvasRenderCommand extends CanvasCommand {
  type: CanvasCommandType.RENDER;
  params: any;
}

/**
 * 2D 캔버스 렌더링 명령
 */
export interface Canvas2DRenderCommand extends CanvasRenderCommand {
  params: {
    /** 전역 합성 연산 */
    globalCompositeOperation?: string;
    /** 전역 알파 */
    globalAlpha?: number;
    /** 렌더링 작업 배열 */
    operations: Canvas2DOperation[];
  };
}

/**
 * Canvas2D 작업 기본 인터페이스
 */
export interface Canvas2DOperation {
  /** 작업 타입 */
  type: Canvas2DCommandType;
  /** 변환 행렬 */
  transform?: number[];
  /** 스타일 */
  style?: Canvas2DStyle;
}

/**
 * Canvas2D 스타일 인터페이스
 */
export interface Canvas2DStyle {
  /** 채우기 스타일 */
  fillStyle?: string;
  /** 선 스타일 */
  strokeStyle?: string;
  /** 선 두께 */
  lineWidth?: number;
  /** 선 끝 스타일 */
  lineCap?: CanvasLineCap;
  /** 선 모서리 스타일 */
  lineJoin?: CanvasLineJoin;
  /** 모서리 한도 */
  miterLimit?: number;
  /** 그림자 색상 */
  shadowColor?: string;
  /** 그림자 흐림 정도 */
  shadowBlur?: number;
  /** 그림자 X 오프셋 */
  shadowOffsetX?: number;
  /** 그림자 Y 오프셋 */
  shadowOffsetY?: number;
  /** 전역 알파 */
  globalAlpha?: number;
  /** 전역 합성 연산 */
  globalCompositeOperation?: GlobalCompositeOperation;
}

/**
 * WebGL 캔버스 렌더링 명령
 */
export interface CanvasWebGLRenderCommand extends CanvasRenderCommand {
  params: {
    /** 셰이더 프로그램 ID */
    programId?: string;
    /** 버퍼 데이터 */
    buffers?: WebGLBuffer[];
    /** 유니폼 데이터 */
    uniforms?: any;
    /** 렌더링 작업 배열 */
    operations: WebGLOperation[];
  };
}

/**
 * WebGL 작업 기본 인터페이스
 */
export interface WebGLOperation {
  /** 작업 타입 */
  type: CanvasWebGLCommandType;
  /** 매개변수 */
  params: any;
}

/**
 * OffscreenCanvas 매니저 옵션
 */
export interface OffscreenCanvasManagerOptions {
  /** 캔버스 요소 또는 선택자 */
  canvas: HTMLCanvasElement | string;
  /** 컨텍스트 타입 */
  contextType?: CanvasContextType;
  /** 컨텍스트 속성 */
  contextAttributes?: any;
  /** 워커 URL */
  workerUrl?: string;
  /** 워커 수 */
  workerCount?: number;
  /** 자동 리사이즈 */
  autoResize?: boolean;
  /** 디버그 모드 */
  debug?: boolean;
}

/**
 * 워커 메시지 타입
 */
export enum WorkerMessageType {
  /** 준비 완료 */
  READY = "ready",
  /** 명령 */
  COMMAND = "command",
  /** 응답 */
  RESPONSE = "response",
  /** 이벤트 */
  EVENT = "event",
  /** 오류 */
  ERROR = "error",
}

/**
 * 워커 메시지 인터페이스
 */
export interface WorkerMessage {
  /** 메시지 타입 */
  type: WorkerMessageType;
  /** 메시지 ID */
  id?: string;
  /** 메시지 데이터 */
  data?: any;
  /** 전송 가능한 객체 */
  transfer?: Transferable[];
}

/**
 * 캔버스 이벤트 타입
 */
export enum CanvasEventType {
  /** 준비 완료 */
  READY = "ready",
  /** 크기 변경 */
  RESIZE = "resize",
  /** 렌더링 완료 */
  RENDER_COMPLETE = "renderComplete",
  /** 오류 */
  ERROR = "error",
}

/**
 * WebGL 셰이더 타입
 */
export enum ShaderType {
  /** 버텍스 셰이더 */
  VERTEX = "vertex",
  /** 프래그먼트 셰이더 */
  FRAGMENT = "fragment",
}

/**
 * 셰이더 컴파일 명령 파라미터
 */
export interface ShaderCompileParams {
  /** 프로그램 ID */
  programId: string;
  /** 버텍스 셰이더 소스 */
  vertexSource: string;
  /** 프래그먼트 셰이더 소스 */
  fragmentSource: string;
  /** 속성 위치 바인딩 */
  attributeLocations?: Record<string, number>;
}

/**
 * WebGL 버퍼 타입
 */
export enum WebGLBufferType {
  /** 버텍스 버퍼 */
  VERTEX = "vertex",
  /** 인덱스 버퍼 */
  INDEX = "index",
  /** 유니폼 버퍼 */
  UNIFORM = "uniform",
}

/**
 * WebGL 버퍼 사용법
 */
export enum WebGLBufferUsage {
  /** 정적 데이터 */
  STATIC = "static",
  /** 동적 데이터 */
  DYNAMIC = "dynamic",
  /** 스트림 데이터 */
  STREAM = "stream",
}

/**
 * 버퍼 설정 명령 파라미터
 */
export interface BufferParams {
  /** 버퍼 ID */
  bufferId: string;
  /** 버퍼 타입 */
  type: WebGLBufferType;
  /** 데이터 */
  data: Float32Array | Uint16Array | Uint32Array;
  /** 사용법 */
  usage: WebGLBufferUsage;
}

/**
 * VAO 설정 명령 파라미터
 */
export interface VAOParams {
  /** VAO ID */
  vaoId: string;
  /** 프로그램 ID */
  programId: string;
  /** 속성 설정 */
  attributes: Array<{
    /** 버퍼 ID */
    bufferId: string;
    /** 속성 이름 */
    name: string;
    /** 속성 크기 (요소 수) */
    size: number;
    /** 속성 타입 */
    type: "FLOAT" | "INT";
    /** 정규화 여부 */
    normalized?: boolean;
    /** 스트라이드 */
    stride?: number;
    /** 오프셋 */
    offset?: number;
  }>;
  /** 인덱스 버퍼 ID (선택적) */
  indexBufferId?: string;
}
