/**
 * WebGL 지오메트리 처리 시스템
 * VAO 및 버퍼 관리를 위한 유틸리티 제공
 */
import {
  BufferParams,
  VAOParams,
  WebGLBufferType,
  WebGLBufferUsage,
} from "../types.js";

/**
 * 버퍼 생성 결과
 */
export interface BufferCreateResult {
  /** 성공 여부 */
  success: boolean;
  /** 에러 메시지 (실패 시) */
  errorMessage?: string;
  /** 버퍼 객체 (성공 시) */
  buffer?: WebGLBuffer;
}

/**
 * VAO 생성 결과
 */
export interface VAOCreateResult {
  /** 성공 여부 */
  success: boolean;
  /** 에러 메시지 (실패 시) */
  errorMessage?: string;
  /** VAO 객체 (성공 시) */
  vao?: WebGLVertexArrayObject;
}

/**
 * WebGL 버퍼 도우미 클래스
 * 버퍼 생성 및 관리를 위한 유틸리티
 */
export class BufferHelper {
  /** WebGL 컨텍스트 */
  private gl: WebGLRenderingContext | WebGL2RenderingContext;

  /**
   * 생성자
   * @param gl WebGL 렌더링 컨텍스트
   */
  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.gl = gl;
  }

  /**
   * 버퍼 생성
   * @param params 버퍼 파라미터
   * @returns 생성 결과
   */
  createBuffer(params: BufferParams): BufferCreateResult {
    try {
      // 버퍼 생성
      const buffer = this.gl.createBuffer();
      if (!buffer) {
        throw new Error("버퍼를 생성할 수 없습니다.");
      }

      // 버퍼 타입에 따른 바인딩
      const target = this.getBufferTarget(params.type);
      this.gl.bindBuffer(target, buffer);

      // 버퍼 데이터 설정
      const usage = this.getBufferUsage(params.usage);
      this.gl.bufferData(target, params.data, usage);

      // 버퍼 바인딩 해제
      this.gl.bindBuffer(target, null);

      return {
        success: true,
        buffer,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage:
          error instanceof Error ? error.message : "알 수 없는 오류",
      };
    }
  }

  /**
   * 버퍼 데이터 업데이트
   * @param type 버퍼 타입
   * @param buffer 버퍼 객체
   * @param data 새 데이터
   * @param offset 오프셋 (기본값: 0)
   * @returns 성공 여부
   */
  updateBufferData(
    type: WebGLBufferType,
    buffer: WebGLBuffer,
    data: Float32Array | Uint16Array | Uint32Array,
    offset: number = 0
  ): boolean {
    try {
      const target = this.getBufferTarget(type);
      this.gl.bindBuffer(target, buffer);
      this.gl.bufferSubData(target, offset, data);
      this.gl.bindBuffer(target, null);
      return true;
    } catch (error) {
      console.error("버퍼 데이터 업데이트 오류:", error);
      return false;
    }
  }

  /**
   * 버퍼 삭제
   * @param buffer 버퍼 객체
   */
  deleteBuffer(buffer: WebGLBuffer): void {
    this.gl.deleteBuffer(buffer);
  }

  /**
   * 버퍼 타입을 WebGL 상수로 변환
   * @param type 버퍼 타입
   * @returns WebGL 버퍼 타입 상수
   */
  private getBufferTarget(type: WebGLBufferType): number {
    switch (type) {
      case WebGLBufferType.VERTEX:
        return this.gl.ARRAY_BUFFER;
      case WebGLBufferType.INDEX:
        return this.gl.ELEMENT_ARRAY_BUFFER;
      case WebGLBufferType.UNIFORM:
        // WebGL2에서만 사용 가능
        if ("UNIFORM_BUFFER" in this.gl) {
          return (this.gl as WebGL2RenderingContext).UNIFORM_BUFFER;
        }
        throw new Error("UNIFORM_BUFFER는 WebGL 2.0에서만 지원됩니다.");
      default:
        return this.gl.ARRAY_BUFFER;
    }
  }

  /**
   * 버퍼 사용법을 WebGL 상수로 변환
   * @param usage 버퍼 사용법
   * @returns WebGL 버퍼 사용법 상수
   */
  private getBufferUsage(usage: WebGLBufferUsage): number {
    switch (usage) {
      case WebGLBufferUsage.STATIC:
        return this.gl.STATIC_DRAW;
      case WebGLBufferUsage.DYNAMIC:
        return this.gl.DYNAMIC_DRAW;
      case WebGLBufferUsage.STREAM:
        return this.gl.STREAM_DRAW;
      default:
        return this.gl.STATIC_DRAW;
    }
  }
}

/**
 * VAO 도우미 클래스
 * 버텍스 배열 객체 관리를 위한 유틸리티
 */
export class VAOHelper {
  /** WebGL 컨텍스트 */
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  /** WebGL2 컨텍스트 여부 */
  private isWebGL2: boolean;
  /** VAO 확장 (WebGL1) */
  private vaoExtension: any = null;

  /**
   * 생성자
   * @param gl WebGL 렌더링 컨텍스트
   */
  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.gl = gl;
    this.isWebGL2 = "createVertexArray" in gl;

    // WebGL1에서 OES_vertex_array_object 확장 가져오기
    if (!this.isWebGL2) {
      this.vaoExtension =
        gl.getExtension("OES_vertex_array_object") ||
        gl.getExtension("WEBKIT_OES_vertex_array_object") ||
        gl.getExtension("MOZ_OES_vertex_array_object");

      if (!this.vaoExtension) {
        console.warn("VAO 확장이 지원되지 않습니다. 폴백 방식을 사용합니다.");
      }
    }
  }

  /**
   * VAO 생성 가능 여부 확인
   * @returns VAO 지원 여부
   */
  isVAOSupported(): boolean {
    return this.isWebGL2 || !!this.vaoExtension;
  }

  /**
   * VAO 생성
   * @param params VAO 파라미터
   * @param buffers 버퍼 맵
   * @returns 생성 결과
   */
  createVAO(
    params: VAOParams,
    buffers: Map<string, WebGLBuffer>
  ): VAOCreateResult {
    try {
      if (!this.isVAOSupported()) {
        throw new Error("VAO가 지원되지 않습니다.");
      }

      // VAO 생성
      const vao = this.isWebGL2
        ? (this.gl as WebGL2RenderingContext).createVertexArray()
        : this.vaoExtension.createVertexArrayOES();

      if (!vao) {
        throw new Error("VAO를 생성할 수 없습니다.");
      }

      // VAO 바인딩
      this.bindVAO(vao);

      // 속성 설정
      for (const attr of params.attributes) {
        const buffer = buffers.get(attr.bufferId);
        if (!buffer) {
          throw new Error(`버퍼를 찾을 수 없습니다: ${attr.bufferId}`);
        }

        // 버퍼 바인딩
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);

        // 속성 위치
        const location = attr.name;

        // 속성 활성화
        this.gl.enableVertexAttribArray(Number(location));

        // 속성 포인터 설정
        const type = attr.type === "FLOAT" ? this.gl.FLOAT : this.gl.INT;
        this.gl.vertexAttribPointer(
          Number(location),
          attr.size,
          type,
          attr.normalized || false,
          attr.stride || 0,
          attr.offset || 0
        );
      }

      // 인덱스 버퍼 설정 (있는 경우)
      if (params.indexBufferId) {
        const indexBuffer = buffers.get(params.indexBufferId);
        if (indexBuffer) {
          this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        }
      }

      // VAO 바인딩 해제
      this.unbindVAO();

      return {
        success: true,
        vao,
      };
    } catch (error) {
      this.unbindVAO();
      return {
        success: false,
        errorMessage:
          error instanceof Error ? error.message : "알 수 없는 오류",
      };
    }
  }

  /**
   * VAO 바인딩
   * @param vao VAO 객체
   */
  bindVAO(vao: WebGLVertexArrayObject): void {
    if (this.isWebGL2) {
      (this.gl as WebGL2RenderingContext).bindVertexArray(vao);
    } else if (this.vaoExtension) {
      this.vaoExtension.bindVertexArrayOES(vao);
    }
  }

  /**
   * VAO 바인딩 해제
   */
  unbindVAO(): void {
    if (this.isWebGL2) {
      (this.gl as WebGL2RenderingContext).bindVertexArray(null);
    } else if (this.vaoExtension) {
      this.vaoExtension.bindVertexArrayOES(null);
    }
  }

  /**
   * VAO 삭제
   * @param vao VAO 객체
   */
  deleteVAO(vao: WebGLVertexArrayObject): void {
    if (this.isWebGL2) {
      (this.gl as WebGL2RenderingContext).deleteVertexArray(vao);
    } else if (this.vaoExtension) {
      this.vaoExtension.deleteVertexArrayOES(vao);
    }
  }
}
