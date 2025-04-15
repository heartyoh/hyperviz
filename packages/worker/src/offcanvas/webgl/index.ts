/**
 * WebGL 모듈
 * WebGL 렌더링을 위한 유틸리티 및 도우미 클래스 내보내기
 */
export type { BufferParams, VAOParams } from './types.js';
export { BufferHelper, VAOHelper } from './geometry.js';
export { ShaderProgram } from './shader.js';
export { TextureHelper } from './texture.js';
export { Renderer, PrimitiveType } from './renderer.js';
export { WebGLBufferType, WebGLBufferUsage } from '../types.js';

/**
 * WebGL 컨텍스트 속성 옵션
 */
export interface WebGLContextOptions {
  /** 알파 채널 지원 */
  alpha?: boolean;
  /** 앤티앨리어싱 지원 */
  antialias?: boolean;
  /** 깊이 버퍼 지원 */
  depth?: boolean;
  /** 스텐실 버퍼 지원 */
  stencil?: boolean;
  /** 투명도 처리 */
  premultipliedAlpha?: boolean;
  /** 보존 드로잉 버퍼 */
  preserveDrawingBuffer?: boolean;
  /** 성능 vs 품질 */
  powerPreference?: "default" | "high-performance" | "low-power";
}

/**
 * WebGL 컨텍스트 생성
 * @param canvas 캔버스 요소
 * @param options 컨텍스트 옵션
 * @param version 버전 (1 또는 2)
 * @returns WebGL 컨텍스트 또는 null
 */
export function createWebGLContext(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: WebGLContextOptions = {},
  version: 1 | 2 = 2
): WebGLRenderingContext | WebGL2RenderingContext | null {
  // 기본 옵션
  const defaultOptions: WebGLContextOptions = {
    alpha: true,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: "default",
  };

  const contextOptions = { ...defaultOptions, ...options };

  try {
    let context: WebGLRenderingContext | WebGL2RenderingContext | null = null;

    // WebGL 버전에 따라 컨텍스트 요청
    if (version === 2) {
      // WebGL 2.0 요청
      context = canvas.getContext(
        "webgl2",
        contextOptions
      ) as WebGL2RenderingContext | null;

      // WebGL 2.0 지원하지 않으면 WebGL 1.0으로 폴백
      if (!context) {
        console.warn("WebGL 2.0이 지원되지 않아 WebGL 1.0으로 대체합니다.");
        context = canvas.getContext(
          "webgl",
          contextOptions
        ) as WebGLRenderingContext | null;

        // 브라우저에 따라 experimental-webgl 사용 (OffscreenCanvas에서는 지원되지 않을 수 있음)
        if (!context && canvas instanceof HTMLCanvasElement) {
          context = canvas.getContext(
            "experimental-webgl",
            contextOptions
          ) as WebGLRenderingContext | null;
        }
      }
    } else {
      // WebGL 1.0 요청
      context = canvas.getContext(
        "webgl",
        contextOptions
      ) as WebGLRenderingContext | null;

      // 브라우저에 따라 experimental-webgl 사용 (OffscreenCanvas에서는 지원되지 않을 수 있음)
      if (!context && canvas instanceof HTMLCanvasElement) {
        context = canvas.getContext(
          "experimental-webgl",
          contextOptions
        ) as WebGLRenderingContext | null;
      }
    }

    if (!context) {
      console.error("WebGL 컨텍스트를 생성할 수 없습니다.");
      return null;
    }

    return context;
  } catch (error) {
    console.error("WebGL 컨텍스트 생성 오류:", error);
    return null;
  }
}

/**
 * WebGL 확장 로드
 * @param gl WebGL 컨텍스트
 * @param extensionName 확장 이름
 * @returns 확장 객체 또는 null
 */
export function loadExtension(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  extensionName: string
): any {
  try {
    const extension = gl.getExtension(extensionName);
    if (!extension) {
      console.warn(`확장 기능이 지원되지 않습니다: ${extensionName}`);
    }
    return extension;
  } catch (error) {
    console.error(`확장 기능 로드 오류: ${extensionName}`, error);
    return null;
  }
}

/**
 * WebGL 버전 및 정보 가져오기
 * @param gl WebGL 컨텍스트
 * @returns WebGL 정보 객체
 */
export function getWebGLInfo(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): {
  version: string;
  vendor: string;
  renderer: string;
  glslVersion: string;
  isWebGL2: boolean;
  maxTextureSize: number;
} {
  const isWebGL2 = "createVertexArray" in gl;

  // WEBGL_debug_renderer_info 확장 가져오기
  const debugInfo = loadExtension(gl, "WEBGL_debug_renderer_info");

  // 기본 정보
  let version = gl.getParameter(gl.VERSION);
  let vendor = gl.getParameter(gl.VENDOR);
  let renderer = gl.getParameter(gl.RENDERER);
  let glslVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);

  // 디버그 정보가 있으면 더 자세한 정보 사용
  if (debugInfo) {
    vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || vendor;
    renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || renderer;
  }

  // 최대 텍스처 크기
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  return {
    version,
    vendor,
    renderer,
    glslVersion,
    isWebGL2,
    maxTextureSize,
  };
}
