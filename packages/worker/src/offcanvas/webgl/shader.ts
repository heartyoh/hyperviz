/**
 * WebGL 셰이더 관리 시스템
 * 셰이더 프로그램 생성 및 관리를 위한 유틸리티 제공
 */
import { ShaderType, ShaderCompileParams } from "../types.js";

/**
 * 셰이더 컴파일 결과
 */
export interface ShaderCompileResult {
  /** 성공 여부 */
  success: boolean;
  /** 에러 메시지 (실패 시) */
  errorMessage?: string;
  /** 프로그램 정보 (성공 시) */
  programInfo?: {
    /** 속성 위치 */
    attribLocations: Record<string, number>;
    /** 유니폼 위치 */
    uniformLocations: Record<string, WebGLUniformLocation>;
  };
}

/**
 * 셰이더 소스를 컴파일하여 프로그램 생성
 * @param gl WebGL 렌더링 컨텍스트
 * @param params 셰이더 컴파일 파라미터
 * @returns 컴파일 결과
 */
export function compileShaderProgram(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  params: ShaderCompileParams
): ShaderCompileResult {
  try {
    // 셰이더 생성 및 컴파일
    const vertexShader = createShader(
      gl,
      gl.VERTEX_SHADER,
      params.vertexSource
    );
    const fragmentShader = createShader(
      gl,
      gl.FRAGMENT_SHADER,
      params.fragmentSource
    );

    if (!vertexShader || !fragmentShader) {
      throw new Error("셰이더를 생성할 수 없습니다.");
    }

    // 프로그램 생성 및 링크
    const program = gl.createProgram();
    if (!program) {
      throw new Error("셰이더 프로그램을 생성할 수 없습니다.");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    // 속성 위치 바인딩 (선택적)
    if (params.attributeLocations) {
      for (const [name, location] of Object.entries(
        params.attributeLocations
      )) {
        gl.bindAttribLocation(program, location, name);
      }
    }

    gl.linkProgram(program);

    // 링크 결과 확인
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`셰이더 프로그램 링크 실패: ${info}`);
    }

    // 속성 및 유니폼 위치 수집
    const attribLocations: Record<string, number> = {};
    const uniformLocations: Record<string, WebGLUniformLocation> = {};

    // 활성 속성 수 가져오기
    const numAttribs = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < numAttribs; i++) {
      const info = gl.getActiveAttrib(program, i);
      if (info) {
        attribLocations[info.name] = gl.getAttribLocation(program, info.name);
      }
    }

    // 활성 유니폼 수 가져오기
    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) {
        const location = gl.getUniformLocation(program, info.name);
        if (location) {
          uniformLocations[info.name] = location;
        }
      }
    }

    // 셰이더는 프로그램에 링크되었으므로 삭제 가능
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return {
      success: true,
      programInfo: {
        attribLocations,
        uniformLocations,
      },
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : "알 수 없는 오류",
    };
  }
}

/**
 * 셰이더 생성 및 컴파일
 * @param gl WebGL 렌더링 컨텍스트
 * @param type 셰이더 타입
 * @param source 셰이더 소스 코드
 * @returns 컴파일된 셰이더 또는 null
 */
function createShader(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    console.error("셰이더를 생성할 수 없습니다.");
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  // 컴파일 결과 확인
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    console.error("셰이더 컴파일 오류:", info);
    return null;
  }

  return shader;
}

/**
 * 셰이더 프로그램 클래스
 * 셰이더 프로그램 사용 및 유니폼 설정을 위한 래퍼 클래스
 */
export class ShaderProgram {
  /** WebGL 컨텍스트 */
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  /** 프로그램 ID */
  private program: WebGLProgram;
  /** 속성 위치 */
  private attribLocations: Record<string, number>;
  /** 유니폼 위치 */
  private uniformLocations: Record<string, WebGLUniformLocation>;
  /** 활성 여부 */
  private isActive: boolean = false;

  /**
   * 생성자
   * @param gl WebGL 렌더링 컨텍스트
   * @param program 셰이더 프로그램
   * @param attribLocations 속성 위치
   * @param uniformLocations 유니폼 위치
   */
  constructor(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    program: WebGLProgram,
    attribLocations: Record<string, number>,
    uniformLocations: Record<string, WebGLUniformLocation>
  ) {
    this.gl = gl;
    this.program = program;
    this.attribLocations = attribLocations;
    this.uniformLocations = uniformLocations;
  }

  /**
   * 프로그램 사용
   */
  use(): void {
    this.gl.useProgram(this.program);
    this.isActive = true;
  }

  /**
   * 속성 위치 가져오기
   * @param name 속성 이름
   * @returns 속성 위치
   */
  getAttribLocation(name: string): number {
    if (this.attribLocations[name] === undefined) {
      // 캐시에 없으면 가져와서 저장
      this.attribLocations[name] = this.gl.getAttribLocation(
        this.program,
        name
      );
    }
    return this.attribLocations[name];
  }

  /**
   * 유니폼 위치 가져오기
   * @param name 유니폼 이름
   * @returns 유니폼 위치
   */
  getUniformLocation(name: string): WebGLUniformLocation | null {
    if (this.uniformLocations[name] === undefined) {
      // 캐시에 없으면 가져와서 저장
      const location = this.gl.getUniformLocation(this.program, name);
      if (location) {
        this.uniformLocations[name] = location;
      } else {
        return null;
      }
    }
    return this.uniformLocations[name];
  }

  /**
   * 유니폼 설정 (1f)
   * @param name 유니폼 이름
   * @param value 값
   */
  setUniform1f(name: string, value: number): void {
    if (!this.isActive) this.use();
    const location = this.getUniformLocation(name);
    if (location) {
      this.gl.uniform1f(location, value);
    }
  }

  /**
   * 유니폼 설정 (2f)
   * @param name 유니폼 이름
   * @param v1 첫 번째 값
   * @param v2 두 번째 값
   */
  setUniform2f(name: string, v1: number, v2: number): void {
    if (!this.isActive) this.use();
    const location = this.getUniformLocation(name);
    if (location) {
      this.gl.uniform2f(location, v1, v2);
    }
  }

  /**
   * 유니폼 설정 (3f)
   * @param name 유니폼 이름
   * @param v1 첫 번째 값
   * @param v2 두 번째 값
   * @param v3 세 번째 값
   */
  setUniform3f(name: string, v1: number, v2: number, v3: number): void {
    if (!this.isActive) this.use();
    const location = this.getUniformLocation(name);
    if (location) {
      this.gl.uniform3f(location, v1, v2, v3);
    }
  }

  /**
   * 유니폼 설정 (4f)
   * @param name 유니폼 이름
   * @param v1 첫 번째 값
   * @param v2 두 번째 값
   * @param v3 세 번째 값
   * @param v4 네 번째 값
   */
  setUniform4f(
    name: string,
    v1: number,
    v2: number,
    v3: number,
    v4: number
  ): void {
    if (!this.isActive) this.use();
    const location = this.getUniformLocation(name);
    if (location) {
      this.gl.uniform4f(location, v1, v2, v3, v4);
    }
  }

  /**
   * 행렬 유니폼 설정 (4fv)
   * @param name 유니폼 이름
   * @param transpose 전치 여부
   * @param value 행렬 값
   */
  setUniformMatrix4fv(
    name: string,
    transpose: boolean,
    value: Float32Array | number[]
  ): void {
    if (!this.isActive) this.use();
    const location = this.getUniformLocation(name);
    if (location) {
      this.gl.uniformMatrix4fv(location, transpose, value);
    }
  }

  /**
   * 정수 유니폼 설정 (1i)
   * @param name 유니폼 이름
   * @param value 값
   */
  setUniform1i(name: string, value: number): void {
    if (!this.isActive) this.use();
    const location = this.getUniformLocation(name);
    if (location) {
      this.gl.uniform1i(location, value);
    }
  }

  /**
   * 프로그램 삭제
   */
  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}
