// WebGL 렌더링 워커 - OffscreenCanvas 활용
// 3D 큐브 렌더링 예제 - 개선된 WebGL 렌더링 모듈 사용

import {
  ShaderProgram,
  BufferHelper,
  VAOHelper,
  TextureHelper,
  Renderer,
  createWebGLContext,
  PrimitiveType,
  WebGLBufferType,
  WebGLBufferUsage,
} from "../webgl/index.js";

// 타입 정의
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Mat4 {
  elements: Float32Array;
}

interface WebGLInitMessage {
  type: "init";
  canvas: OffscreenCanvas;
  width: number;
  height: number;
}

interface WebGLRenderMessage {
  type: "render";
  rotation?: Vec3;
  zoom?: number;
}

interface WebGLResizeMessage {
  type: "resize";
  width: number;
  height: number;
}

type WorkerMessage = WebGLInitMessage | WebGLRenderMessage | WebGLResizeMessage;

// WorkerMessageType 및 CanvasCommandType 정의
enum WorkerMessageType {
  COMMAND = "command",
  RESPONSE = "response",
  EVENT = "event",
  ERROR = "error",
  READY = "ready",
}

enum CanvasCommandType {
  INIT = "init",
  RENDER = "render",
  RESIZE = "resize",
  CLEAR = "clear",
  DISPOSE = "dispose",
}

// 상태 변수
let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
let renderer: Renderer | null = null;
let shaderProgram: ShaderProgram | null = null;
let projectionMatrix: Mat4 = { elements: new Float32Array(16) };
let modelViewMatrix: Mat4 = { elements: new Float32Array(16) };
let rotation: Vec3 = { x: 0, y: 0, z: 0 };
let zoom = -4.0;
let cubeVaoId = "cube-vao";
let isWebGL2 = false;

// 메시지 핸들러
self.onmessage = (event: MessageEvent) => {
  const message = event.data;

  if (!message || !message.type) {
    sendError("잘못된 메시지 포맷");
    return;
  }

  try {
    // 기존 직접 타입 처리 (이전 버전 호환성)
    if (message.type === "init") {
      setupWebGL(message.canvas, message.width, message.height);
      return;
    }

    // 명령 패턴 처리 (canvas-worker.ts와 동일)
    if (message.type === WorkerMessageType.COMMAND) {
      const command = message.data;

      // 명령 처리
      const result = processCommand(command);

      // 결과 응답
      sendResponse(message.id, command.id, true, result);
    }
  } catch (error: any) {
    console.error("메시지 처리 오류:", error);
    sendError(error.message || "알 수 없는 오류", message.id);
    if (message.type === WorkerMessageType.COMMAND) {
      sendResponse(
        message.id,
        message.data?.id || "unknown",
        false,
        null,
        error.message
      );
    }
  }
};

/**
 * 명령 처리
 * @param command 캔버스 명령
 * @returns 처리 결과
 */
function processCommand(command: any): any {
  if (!command || !command.type) {
    throw new Error("잘못된 명령 포맷");
  }

  switch (command.type) {
    case CanvasCommandType.INIT:
      return initCanvas(command.params);

    case CanvasCommandType.RESIZE:
      return resizeCanvas(command.params.width, command.params.height);

    case CanvasCommandType.RENDER:
      if (command.params?.rotation) rotation = command.params.rotation;
      if (command.params?.zoom !== undefined) zoom = command.params.zoom;
      renderScene();
      return { rendered: true };

    case CanvasCommandType.CLEAR:
      if (gl && renderer) {
        renderer.clear();
        return true;
      }
      return false;

    case CanvasCommandType.DISPOSE:
      // 리소스 정리
      if (gl) {
        gl = null;
        renderer = null;
        shaderProgram = null;
      }
      return true;

    default:
      throw new Error(`지원되지 않는 명령: ${command.type}`);
  }
}

/**
 * 캔버스 초기화
 * @param params 초기화 매개변수
 * @returns 초기화 결과
 */
function initCanvas(params: any): any {
  if (!params.canvas) {
    throw new Error("OffscreenCanvas가 전송되지 않았습니다.");
  }

  setupWebGL(params.canvas, params.width, params.height);
  return {
    width: params.width,
    height: params.height,
    contextType: "webgl2",
  };
}

// WebGL 초기화
function setupWebGL(
  canvas: OffscreenCanvas,
  width: number,
  height: number
): void {
  try {
    // WebGL 컨텍스트 획득 (WebGL2 우선, 폴백으로 WebGL1)
    gl = createWebGLContext(canvas, {
      alpha: true,
      antialias: true,
      depth: true,
      stencil: false,
    });

    if (!gl) {
      throw new Error("WebGL 컨텍스트를 생성할 수 없습니다.");
    }

    isWebGL2 = "createVertexArray" in gl;

    // 렌더러 초기화 - 배경색을 어두운 회색으로 설정
    renderer = new Renderer(gl);
    renderer.init([0.15, 0.15, 0.15, 1.0]);

    // 캔버스 크기 설정
    canvas.width = width;
    canvas.height = height;
    renderer.setViewport(0, 0, width, height);

    // 셰이더 프로그램 생성
    const vsSource = `
      attribute vec4 aVertexPosition;
      attribute vec4 aVertexColor;
      
      uniform mat4 uModelViewMatrix;
      uniform mat4 uProjectionMatrix;
      
      varying lowp vec4 vColor;
      
      void main() {
        gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
        vColor = aVertexColor;
      }
    `;

    const fsSource = `
      varying lowp vec4 vColor;
      
      void main() {
        gl_FragColor = vColor;
      }
    `;

    // 새로운 셰이더 시스템 사용
    const { buffer: bufferHelper, vao: vaoHelper } = renderer.getHelpers();

    const shaderCompileResult = createShaderProgram(gl, {
      programId: "cube-shader",
      vertexSource: vsSource,
      fragmentSource: fsSource,
      attributeLocations: {
        aVertexPosition: 0,
        aVertexColor: 1,
      },
    });

    if (!shaderCompileResult.success || !shaderCompileResult.programInfo) {
      throw new Error(
        "셰이더 프로그램 생성 실패: " +
          (shaderCompileResult.errorMessage || "알 수 없는 오류")
      );
    }

    // createShaderProgram에서 반환된 프로그램 사용
    shaderProgram = new ShaderProgram(
      gl,
      shaderCompileResult.program,
      shaderCompileResult.programInfo.attribLocations,
      shaderCompileResult.programInfo.uniformLocations
    );

    // 버퍼 생성 - 새로운 버퍼 시스템 사용
    const { buffers, indices } = createCubeBuffers(bufferHelper);

    // VAO 생성
    const vaoResult = vaoHelper.createVAO(
      {
        vaoId: cubeVaoId,
        programId: "cube-shader",
        attributes: [
          {
            bufferId: "position",
            name: "0", // aVertexPosition
            size: 3,
            type: "FLOAT",
          },
          {
            bufferId: "color",
            name: "1", // aVertexColor
            size: 4,
            type: "FLOAT",
          },
        ],
        indexBufferId: "indices",
      },
      buffers
    );

    if (!vaoResult.success || !vaoResult.vao) {
      throw new Error(
        "VAO 생성 실패: " + (vaoResult.errorMessage || "알 수 없는 오류")
      );
    }

    // VAO 등록
    renderer.registerVAO(cubeVaoId, vaoResult.vao);

    // 투영 행렬 계산
    const fieldOfView = (45 * Math.PI) / 180; // 시야각(라디안)
    const aspect = width / height;
    const zNear = 0.1;
    const zFar = 100.0;

    // 원근 투영 행렬 생성
    mat4Perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);

    // 초기 렌더링
    console.log("초기 렌더링 시작: 회전=", rotation, "줌=", zoom);
    renderScene();

    // 초기화 완료 메시지
    self.postMessage({ type: "initialized" });
    console.log("WebGL 초기화 완료: 배경색=[0.15, 0.15, 0.15, 1.0], 줌=", zoom);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "알 수 없는 오류",
    });
  }
}

// 새로운 셰이더 시스템
function createShaderProgram(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  params: {
    programId: string;
    vertexSource: string;
    fragmentSource: string;
    attributeLocations?: Record<string, number>;
  }
) {
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
      program: program,
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

// 셰이더 생성 및 컴파일
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

// 큐브 버퍼 생성
function createCubeBuffers(bufferHelper: BufferHelper): {
  buffers: Map<string, WebGLBuffer>;
  indices: Uint16Array;
} {
  // 정점 위치
  const positions = new Float32Array([
    // 앞면
    -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,

    // 뒷면
    -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0, -1.0,

    // 윗면
    -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0,

    // 아랫면
    -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, -1.0, -1.0, 1.0,

    // 오른쪽면
    1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0,

    // 왼쪽면
    -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0,
  ]);

  // 정점 색상 - 더 밝고 선명한 색상으로 변경
  const colors = new Float32Array([
    // 앞면: 밝은 빨간색
    1.0, 0.2, 0.2, 1.0, 1.0, 0.2, 0.2, 1.0, 1.0, 0.2, 0.2, 1.0, 1.0, 0.2, 0.2,
    1.0,

    // 뒷면: 밝은 초록색
    0.2, 1.0, 0.2, 1.0, 0.2, 1.0, 0.2, 1.0, 0.2, 1.0, 0.2, 1.0, 0.2, 1.0, 0.2,
    1.0,

    // 윗면: 밝은 파란색
    0.2, 0.2, 1.0, 1.0, 0.2, 0.2, 1.0, 1.0, 0.2, 0.2, 1.0, 1.0, 0.2, 0.2, 1.0,
    1.0,

    // 아랫면: 밝은 노란색
    1.0, 1.0, 0.2, 1.0, 1.0, 1.0, 0.2, 1.0, 1.0, 1.0, 0.2, 1.0, 1.0, 1.0, 0.2,
    1.0,

    // 오른쪽면: 밝은 자홍색
    1.0, 0.2, 1.0, 1.0, 1.0, 0.2, 1.0, 1.0, 1.0, 0.2, 1.0, 1.0, 1.0, 0.2, 1.0,
    1.0,

    // 왼쪽면: 밝은 청록색
    0.2, 1.0, 1.0, 1.0, 0.2, 1.0, 1.0, 1.0, 0.2, 1.0, 1.0, 1.0, 0.2, 1.0, 1.0,
    1.0,
  ]);

  // 면 인덱스
  const indices = new Uint16Array([
    0,
    1,
    2,
    0,
    2,
    3, // 앞면
    4,
    5,
    6,
    4,
    6,
    7, // 뒷면
    8,
    9,
    10,
    8,
    10,
    11, // 윗면
    12,
    13,
    14,
    12,
    14,
    15, // 아랫면
    16,
    17,
    18,
    16,
    18,
    19, // 오른쪽면
    20,
    21,
    22,
    20,
    22,
    23, // 왼쪽면
  ]);

  const buffers = new Map<string, WebGLBuffer>();

  // 위치 버퍼 생성
  const positionBufferResult = bufferHelper.createBuffer({
    bufferId: "position",
    type: WebGLBufferType.VERTEX,
    data: positions,
    usage: WebGLBufferUsage.STATIC,
  });

  if (positionBufferResult.success && positionBufferResult.buffer) {
    buffers.set("position", positionBufferResult.buffer);
  }

  // 색상 버퍼 생성
  const colorBufferResult = bufferHelper.createBuffer({
    bufferId: "color",
    type: WebGLBufferType.VERTEX,
    data: colors,
    usage: WebGLBufferUsage.STATIC,
  });

  if (colorBufferResult.success && colorBufferResult.buffer) {
    buffers.set("color", colorBufferResult.buffer);
  }

  // 인덱스 버퍼 생성
  const indexBufferResult = bufferHelper.createBuffer({
    bufferId: "indices",
    type: WebGLBufferType.INDEX,
    data: indices,
    usage: WebGLBufferUsage.STATIC,
  });

  if (indexBufferResult.success && indexBufferResult.buffer) {
    buffers.set("indices", indexBufferResult.buffer);
  }

  return { buffers, indices };
}

// 장면 렌더링
function renderScene(): void {
  if (!gl || !renderer || !shaderProgram) {
    console.error(
      "렌더링 실패: gl, renderer 또는 shaderProgram이 초기화되지 않음"
    );
    return;
  }

  const startTime = performance.now();
  console.log("렌더링 시작: 회전=", rotation, "줌=", zoom);

  // 화면 지우기
  renderer.clear();

  // 모델뷰 행렬 계산
  mat4Identity(modelViewMatrix);
  mat4Translate(modelViewMatrix, 0.0, 0.0, zoom);
  mat4Rotate(modelViewMatrix, rotation.x, 1, 0, 0);
  mat4Rotate(modelViewMatrix, rotation.y, 0, 1, 0);
  mat4Rotate(modelViewMatrix, rotation.z, 0, 0, 1);

  // 셰이더 사용
  renderer.useShader(shaderProgram);

  // 유니폼 설정
  shaderProgram.setUniformMatrix4fv(
    "uProjectionMatrix",
    false,
    projectionMatrix.elements
  );
  shaderProgram.setUniformMatrix4fv(
    "uModelViewMatrix",
    false,
    modelViewMatrix.elements
  );

  // WebGL 오류 확인
  const errorCode = gl.getError();
  if (errorCode !== gl.NO_ERROR) {
    console.error("WebGL 오류 발생:", errorCode);
  }

  // 큐브 그리기
  renderer.draw(
    cubeVaoId,
    PrimitiveType.TRIANGLES,
    36, // 인덱스 수
    true // 인덱스 사용
  );

  const endTime = performance.now();
  console.log("렌더링 완료: 소요 시간=", endTime - startTime, "ms");

  // 렌더링 완료 이벤트 발송
  sendEvent("renderComplete", {
    renderId: Date.now(),
    time: endTime - startTime,
  });
}

// 캔버스 크기 조정
function resizeCanvas(width: number, height: number): void {
  if (!gl || !renderer) return;

  // 캔버스 크기 설정
  const canvas = gl.canvas as OffscreenCanvas;
  canvas.width = width;
  canvas.height = height;

  // 뷰포트 설정
  renderer.setViewport(0, 0, width, height);

  // 투영 행렬 업데이트
  const fieldOfView = (45 * Math.PI) / 180;
  const aspect = width / height;
  const zNear = 0.1;
  const zFar = 100.0;
  mat4Perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);

  // 다시 렌더링
  renderScene();
}

// 행렬 관련 유틸리티 함수들은 유지
// 4x4 단위 행렬 생성
function mat4Identity(matrix: Mat4): void {
  const e = matrix.elements;
  e[0] = 1;
  e[4] = 0;
  e[8] = 0;
  e[12] = 0;
  e[1] = 0;
  e[5] = 1;
  e[9] = 0;
  e[13] = 0;
  e[2] = 0;
  e[6] = 0;
  e[10] = 1;
  e[14] = 0;
  e[3] = 0;
  e[7] = 0;
  e[11] = 0;
  e[15] = 1;
}

// 이동 변환
function mat4Translate(matrix: Mat4, x: number, y: number, z: number): void {
  const e = matrix.elements;
  e[12] = e[0] * x + e[4] * y + e[8] * z + e[12];
  e[13] = e[1] * x + e[5] * y + e[9] * z + e[13];
  e[14] = e[2] * x + e[6] * y + e[10] * z + e[14];
  e[15] = e[3] * x + e[7] * y + e[11] * z + e[15];
}

// 회전 변환
function mat4Rotate(
  matrix: Mat4,
  angleInRadians: number,
  x: number,
  y: number,
  z: number
): void {
  if (angleInRadians === 0) return;
  if (x === 0 && y === 0 && z === 0) return;

  // 벡터 정규화
  let len = Math.sqrt(x * x + y * y + z * z);
  let nx = x / len;
  let ny = y / len;
  let nz = z / len;

  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);
  const t = 1 - c;

  // 회전 행렬 계산
  const a00 = matrix.elements[0],
    a01 = matrix.elements[1],
    a02 = matrix.elements[2],
    a03 = matrix.elements[3];
  const a10 = matrix.elements[4],
    a11 = matrix.elements[5],
    a12 = matrix.elements[6],
    a13 = matrix.elements[7];
  const a20 = matrix.elements[8],
    a21 = matrix.elements[9],
    a22 = matrix.elements[10],
    a23 = matrix.elements[11];

  // 회전 행렬 요소 계산
  const b00 = nx * nx * t + c;
  const b01 = ny * nx * t + nz * s;
  const b02 = nz * nx * t - ny * s;
  const b10 = nx * ny * t - nz * s;
  const b11 = ny * ny * t + c;
  const b12 = nz * ny * t + nx * s;
  const b20 = nx * nz * t + ny * s;
  const b21 = ny * nz * t - nx * s;
  const b22 = nz * nz * t + c;

  // 행렬 곱셈
  matrix.elements[0] = a00 * b00 + a10 * b01 + a20 * b02;
  matrix.elements[1] = a01 * b00 + a11 * b01 + a21 * b02;
  matrix.elements[2] = a02 * b00 + a12 * b01 + a22 * b02;
  matrix.elements[3] = a03 * b00 + a13 * b01 + a23 * b02;
  matrix.elements[4] = a00 * b10 + a10 * b11 + a20 * b12;
  matrix.elements[5] = a01 * b10 + a11 * b11 + a21 * b12;
  matrix.elements[6] = a02 * b10 + a12 * b11 + a22 * b12;
  matrix.elements[7] = a03 * b10 + a13 * b11 + a23 * b12;
  matrix.elements[8] = a00 * b20 + a10 * b21 + a20 * b22;
  matrix.elements[9] = a01 * b20 + a11 * b21 + a21 * b22;
  matrix.elements[10] = a02 * b20 + a12 * b21 + a22 * b22;
  matrix.elements[11] = a03 * b20 + a13 * b21 + a23 * b22;
}

// 원근 투영 행렬 생성
function mat4Perspective(
  matrix: Mat4,
  fovY: number,
  aspect: number,
  near: number,
  far: number
): void {
  const f = 1.0 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);

  const e = matrix.elements;
  e[0] = f / aspect;
  e[1] = 0;
  e[2] = 0;
  e[3] = 0;
  e[4] = 0;
  e[5] = f;
  e[6] = 0;
  e[7] = 0;
  e[8] = 0;
  e[9] = 0;
  e[10] = (far + near) * nf;
  e[11] = -1;
  e[12] = 0;
  e[13] = 0;
  e[14] = 2 * far * near * nf;
  e[15] = 0;
}

// 유틸리티 함수들

/**
 * 오류 메시지 전송
 * @param message 오류 메시지
 * @param id 메시지 ID
 */
function sendError(message: string, id?: string): void {
  self.postMessage({
    type: WorkerMessageType.ERROR,
    id,
    data: {
      message,
    },
  });
}

/**
 * 응답 메시지 전송
 * @param messageId 메시지 ID
 * @param commandId 명령 ID
 * @param success 성공 여부
 * @param data 응답 데이터
 * @param error 오류 메시지
 */
function sendResponse(
  messageId: string,
  commandId: string,
  success: boolean,
  data: any = null,
  error: string = ""
): void {
  self.postMessage({
    type: WorkerMessageType.RESPONSE,
    id: messageId,
    data: {
      commandId,
      success,
      data,
      error,
    },
  });
}

/**
 * 이벤트 메시지 전송
 * @param type 이벤트 타입
 * @param data 이벤트 데이터
 */
function sendEvent(type: string, data: any = {}): void {
  self.postMessage({
    type: WorkerMessageType.EVENT,
    data: {
      type,
      ...data,
    },
  });
}

// 워커 초기 메시지
self.postMessage({ type: "ready" });
