/**
 * WebGL 렌더러 시스템
 * 인스턴스 렌더링 및 고급 렌더링 기능 제공
 */
import { BufferHelper, VAOHelper } from "./geometry.js";
import { ShaderProgram } from "./shader.js";
import { TextureHelper } from "./texture.js";

/**
 * 도형 유형 열거형
 */
export enum PrimitiveType {
  /** 점 */
  POINTS = 0,
  /** 선 */
  LINES = 1,
  /** 선 스트립 */
  LINE_STRIP = 2,
  /** 선 루프 */
  LINE_LOOP = 3,
  /** 삼각형 */
  TRIANGLES = 4,
  /** 삼각형 스트립 */
  TRIANGLE_STRIP = 5,
  /** 삼각형 팬 */
  TRIANGLE_FAN = 6,
}

/**
 * 인스턴스 드로잉 파라미터
 */
export interface InstancedDrawParams {
  /** VAO ID */
  vaoId: string;
  /** 도형 유형 */
  primitiveType: PrimitiveType;
  /** 요소 개수 */
  count: number;
  /** 인덱스 사용 여부 */
  indexed: boolean;
  /** 인스턴스 개수 */
  instanceCount: number;
  /** 오프셋 */
  offset?: number;
  /** 인덱스 타입 (인덱스 사용 시) */
  indexType?: number;
}

/**
 * 렌더러 클래스
 * WebGL 렌더링 기능 통합
 */
export class Renderer {
  /** WebGL 컨텍스트 */
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  /** WebGL 2.0 여부 */
  private isWebGL2: boolean;
  /** 버퍼 헬퍼 */
  private bufferHelper: BufferHelper;
  /** VAO 헬퍼 */
  private vaoHelper: VAOHelper;
  /** 텍스처 헬퍼 */
  private textureHelper: TextureHelper;
  /** 활성 셰이더 프로그램 */
  private activeShader: ShaderProgram | null = null;
  /** VAO 맵 */
  private vaoMap: Map<string, WebGLVertexArrayObject> = new Map();
  /** 인스턴싱 확장 (WebGL 1.0) */
  private instancedExt: any = null;

  /**
   * 생성자
   * @param gl WebGL 컨텍스트
   */
  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.gl = gl;
    this.isWebGL2 = "createVertexArray" in gl;

    // 헬퍼 초기화
    this.bufferHelper = new BufferHelper(gl);
    this.vaoHelper = new VAOHelper(gl);
    this.textureHelper = new TextureHelper(gl);

    // WebGL 1.0에서 인스턴싱 확장 로드
    if (!this.isWebGL2) {
      this.instancedExt =
        gl.getExtension("ANGLE_instanced_arrays") ||
        gl.getExtension("WEBKIT_ANGLE_instanced_arrays");

      if (!this.instancedExt) {
        console.warn("인스턴스 렌더링 확장이 지원되지 않습니다.");
      }
    }
  }

  /**
   * 렌더러 초기화
   * @param clearColor 배경색 (RGBA)
   */
  init(clearColor: [number, number, number, number] = [0, 0, 0, 1]): void {
    const [r, g, b, a] = clearColor;

    // 배경색 설정
    this.gl.clearColor(r, g, b, a);

    // 깊이 테스트 활성화
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);

    // 컬링 활성화
    this.gl.enable(this.gl.CULL_FACE);
    this.gl.cullFace(this.gl.BACK);

    // 블렌딩 활성화
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
  }

  /**
   * 화면 지우기
   * @param clearBits 지울 버퍼 (기본: 색상+깊이)
   */
  clear(clearBits?: number): void {
    const bits =
      clearBits ?? this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT;
    this.gl.clear(bits);
  }

  /**
   * 뷰포트 설정
   * @param x X 좌표
   * @param y Y 좌표
   * @param width 너비
   * @param height 높이
   */
  setViewport(x: number, y: number, width: number, height: number): void {
    this.gl.viewport(x, y, width, height);
  }

  /**
   * VAO 등록
   * @param id VAO ID
   * @param vao VAO 객체
   */
  registerVAO(id: string, vao: WebGLVertexArrayObject): void {
    this.vaoMap.set(id, vao);
  }

  /**
   * 셰이더 활성화
   * @param shader 셰이더 프로그램
   */
  useShader(shader: ShaderProgram): void {
    shader.use();
    this.activeShader = shader;
  }

  /**
   * 인스턴스 렌더링
   * @param params 인스턴스 드로잉 파라미터
   * @returns 성공 여부
   */
  drawInstanced(params: InstancedDrawParams): boolean {
    if (!this.activeShader) {
      console.error("셰이더가 설정되지 않았습니다.");
      return false;
    }

    // VAO 가져오기
    const vao = this.vaoMap.get(params.vaoId);
    if (!vao) {
      console.error(`VAO를 찾을 수 없습니다: ${params.vaoId}`);
      return false;
    }

    // VAO 바인딩
    this.vaoHelper.bindVAO(vao);

    try {
      const primitiveType = this.getPrimitiveType(params.primitiveType);

      if (params.indexed) {
        // 인덱스 사용 드로잉
        const indexType = params.indexType || this.gl.UNSIGNED_SHORT;

        if (this.isWebGL2) {
          // WebGL 2.0 인스턴스 드로잉
          (this.gl as WebGL2RenderingContext).drawElementsInstanced(
            primitiveType,
            params.count,
            indexType,
            params.offset || 0,
            params.instanceCount
          );
        } else if (this.instancedExt) {
          // WebGL 1.0 확장 사용
          this.instancedExt.drawElementsInstancedANGLE(
            primitiveType,
            params.count,
            indexType,
            params.offset || 0,
            params.instanceCount
          );
        } else {
          console.error("인스턴스 렌더링이 지원되지 않습니다.");
          return false;
        }
      } else {
        // 인덱스 없는 드로잉
        if (this.isWebGL2) {
          // WebGL 2.0 인스턴스 드로잉
          (this.gl as WebGL2RenderingContext).drawArraysInstanced(
            primitiveType,
            params.offset || 0,
            params.count,
            params.instanceCount
          );
        } else if (this.instancedExt) {
          // WebGL 1.0 확장 사용
          this.instancedExt.drawArraysInstancedANGLE(
            primitiveType,
            params.offset || 0,
            params.count,
            params.instanceCount
          );
        } else {
          console.error("인스턴스 렌더링이 지원되지 않습니다.");
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error("인스턴스 렌더링 오류:", error);
      return false;
    } finally {
      // VAO 바인딩 해제
      this.vaoHelper.unbindVAO();
    }
  }

  /**
   * 일반 드로잉
   * @param vaoId VAO ID
   * @param primitiveType 도형 유형
   * @param count 요소 개수
   * @param indexed 인덱스 사용 여부
   * @param offset 오프셋 (기본: 0)
   * @param indexType 인덱스 타입 (인덱스 사용 시)
   * @returns 성공 여부
   */
  draw(
    vaoId: string,
    primitiveType: PrimitiveType,
    count: number,
    indexed: boolean = false,
    offset: number = 0,
    indexType?: number
  ): boolean {
    if (!this.activeShader) {
      console.error("셰이더가 설정되지 않았습니다.");
      return false;
    }

    // VAO 가져오기
    const vao = this.vaoMap.get(vaoId);
    if (!vao) {
      console.error(`VAO를 찾을 수 없습니다: ${vaoId}`);
      return false;
    }

    // VAO 바인딩
    this.vaoHelper.bindVAO(vao);

    try {
      const glPrimitiveType = this.getPrimitiveType(primitiveType);

      if (indexed) {
        // 인덱스 사용 드로잉
        const type = indexType || this.gl.UNSIGNED_SHORT;
        this.gl.drawElements(glPrimitiveType, count, type, offset);
      } else {
        // 인덱스 없는 드로잉
        this.gl.drawArrays(glPrimitiveType, offset, count);
      }

      return true;
    } catch (error) {
      console.error("드로잉 오류:", error);
      return false;
    } finally {
      // VAO 바인딩 해제
      this.vaoHelper.unbindVAO();
    }
  }

  /**
   * 도형 유형을 WebGL 상수로 변환
   * @param type 도형 유형
   * @returns WebGL 도형 유형 상수
   */
  private getPrimitiveType(type: PrimitiveType): number {
    switch (type) {
      case PrimitiveType.POINTS:
        return this.gl.POINTS;
      case PrimitiveType.LINES:
        return this.gl.LINES;
      case PrimitiveType.LINE_STRIP:
        return this.gl.LINE_STRIP;
      case PrimitiveType.LINE_LOOP:
        return this.gl.LINE_LOOP;
      case PrimitiveType.TRIANGLES:
        return this.gl.TRIANGLES;
      case PrimitiveType.TRIANGLE_STRIP:
        return this.gl.TRIANGLE_STRIP;
      case PrimitiveType.TRIANGLE_FAN:
        return this.gl.TRIANGLE_FAN;
      default:
        return this.gl.TRIANGLES;
    }
  }

  /**
   * 헬퍼 객체 가져오기
   * @returns 헬퍼 객체 모음
   */
  getHelpers(): {
    buffer: BufferHelper;
    vao: VAOHelper;
    texture: TextureHelper;
  } {
    return {
      buffer: this.bufferHelper,
      vao: this.vaoHelper,
      texture: this.textureHelper,
    };
  }

  /**
   * 가비지 컬렉션 및 리소스 해제
   */
  dispose(): void {
    // VAO 삭제
    for (const vao of this.vaoMap.values()) {
      this.vaoHelper.deleteVAO(vao);
    }
    this.vaoMap.clear();

    // 텍스처 삭제
    this.textureHelper.deleteAllTextures();

    // 셰이더 참조 해제
    this.activeShader = null;
  }
}
