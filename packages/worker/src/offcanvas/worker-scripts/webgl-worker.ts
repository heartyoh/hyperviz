// WebGL 렌더링 워커 - OffscreenCanvas 활용
// 3D 큐브 렌더링 예제

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

// 상태 변수
let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let positionBuffer: WebGLBuffer | null = null;
let colorBuffer: WebGLBuffer | null = null;
let indexBuffer: WebGLBuffer | null = null;
let projectionMatrix: Mat4 = { elements: new Float32Array(16) };
let modelViewMatrix: Mat4 = { elements: new Float32Array(16) };
let rotation: Vec3 = { x: 0, y: 0, z: 0 };
let zoom = -6.0;

// 메시지 핸들러
self.onmessage = (event: MessageEvent) => {
  const message = event.data as WorkerMessage;

  switch (message.type) {
    case "init":
      setupWebGL(message.canvas, message.width, message.height);
      break;
    case "render":
      if (message.rotation) rotation = message.rotation;
      if (message.zoom !== undefined) zoom = message.zoom;
      renderScene();
      break;
    case "resize":
      resizeCanvas(message.width, message.height);
      break;
  }
};

// WebGL 초기화
function setupWebGL(
  canvas: OffscreenCanvas,
  width: number,
  height: number
): void {
  try {
    // WebGL 컨텍스트 획득
    gl = canvas.getContext("webgl") as WebGLRenderingContext;

    if (!gl) {
      throw new Error("WebGL 컨텍스트를 생성할 수 없습니다.");
    }

    // 캔버스 크기 설정
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);

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

    // 셰이더 컴파일 및 프로그램 연결
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    program = gl.createProgram();

    if (!program || !vertexShader || !fragmentShader) {
      throw new Error("셰이더 프로그램을 생성할 수 없습니다.");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        "셰이더 프로그램 링크 실패: " + gl.getProgramInfoLog(program)
      );
    }

    // 버퍼 생성
    createBuffers();

    // 투영 행렬 계산
    const fieldOfView = (45 * Math.PI) / 180; // 시야각(라디안)
    const aspect = width / height;
    const zNear = 0.1;
    const zFar = 100.0;

    // 원근 투영 행렬 생성
    mat4Perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);

    // 초기 렌더링
    renderScene();

    // 초기화 완료 메시지
    self.postMessage({ type: "initialized" });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "알 수 없는 오류",
    });
  }
}

// 셰이더 로드 및 컴파일
function loadShader(
  gl: WebGLRenderingContext,
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

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("셰이더 컴파일 오류: " + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

// 버퍼 생성
function createBuffers(): void {
  if (!gl) return;

  // 정점 위치
  const positions = [
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
  ];

  // 면 색상 (RGBA)
  const colors = [
    // 앞면 (빨강)
    1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0,
    1.0,

    // 뒷면 (초록)
    0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0,
    1.0,

    // 윗면 (파랑)
    0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0,
    1.0,

    // 아랫면 (노랑)
    1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 0.0,
    1.0,

    // 오른쪽면 (자홍)
    1.0, 0.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 0.0, 1.0,
    1.0,

    // 왼쪽면 (청록)
    0.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0,
    1.0,
  ];

  // 인덱스 (삼각형)
  const indices = [
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
  ];

  // 정점 버퍼
  positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  // 색상 버퍼
  colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

  // 인덱스 버퍼
  indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );
}

// 장면 렌더링
function renderScene(): void {
  if (!gl || !program) return;

  // 화면 지우기
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 모델뷰 행렬 설정
  mat4Identity(modelViewMatrix);
  mat4Translate(modelViewMatrix, 0.0, 0.0, zoom);
  mat4Rotate(modelViewMatrix, rotation.x, 1, 0, 0);
  mat4Rotate(modelViewMatrix, rotation.y, 0, 1, 0);
  mat4Rotate(modelViewMatrix, rotation.z, 0, 0, 1);

  // 셰이더 속성 설정
  gl.useProgram(program);

  // 위치 속성
  const vertexPosition = gl.getAttribLocation(program, "aVertexPosition");
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(vertexPosition, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(vertexPosition);

  // 색상 속성
  const vertexColor = gl.getAttribLocation(program, "aVertexColor");
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.vertexAttribPointer(vertexColor, 4, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(vertexColor);

  // 인덱스 버퍼
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

  // 유니폼 설정
  const projectionMatrixLocation = gl.getUniformLocation(
    program,
    "uProjectionMatrix"
  );
  const modelViewMatrixLocation = gl.getUniformLocation(
    program,
    "uModelViewMatrix"
  );

  gl.uniformMatrix4fv(
    projectionMatrixLocation,
    false,
    projectionMatrix.elements
  );
  gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix.elements);

  // 그리기
  gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

  // 렌더링 완료 메시지
  self.postMessage({ type: "renderComplete" });
}

// 캔버스 크기 변경
function resizeCanvas(width: number, height: number): void {
  if (!gl) return;

  gl.canvas.width = width;
  gl.canvas.height = height;
  gl.viewport(0, 0, width, height);

  // 투영 행렬 업데이트
  const fieldOfView = (45 * Math.PI) / 180;
  const aspect = width / height;
  const zNear = 0.1;
  const zFar = 100.0;

  mat4Perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);

  // 리사이즈 후 다시 그리기
  renderScene();

  // 리사이즈 완료 메시지
  self.postMessage({ type: "resizeComplete", width, height });
}

// 행렬 유틸리티 함수
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

function mat4Translate(matrix: Mat4, x: number, y: number, z: number): void {
  const e = matrix.elements;
  e[12] = e[0] * x + e[4] * y + e[8] * z + e[12];
  e[13] = e[1] * x + e[5] * y + e[9] * z + e[13];
  e[14] = e[2] * x + e[6] * y + e[10] * z + e[14];
  e[15] = e[3] * x + e[7] * y + e[11] * z + e[15];
}

function mat4Rotate(
  matrix: Mat4,
  angleInRadians: number,
  x: number,
  y: number,
  z: number
): void {
  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);
  const len = Math.sqrt(x * x + y * y + z * z);

  if (len === 0) return;

  const nx = x / len;
  const ny = y / len;
  const nz = z / len;

  const xx = nx * nx;
  const xy = nx * ny;
  const xz = nx * nz;
  const yy = ny * ny;
  const yz = ny * nz;
  const zz = nz * nz;

  const oneMinusC = 1 - c;

  const r00 = xx + (1 - xx) * c;
  const r01 = xy * oneMinusC + nz * s;
  const r02 = xz * oneMinusC - ny * s;

  const r10 = xy * oneMinusC - nz * s;
  const r11 = yy + (1 - yy) * c;
  const r12 = yz * oneMinusC + nx * s;

  const r20 = xz * oneMinusC + ny * s;
  const r21 = yz * oneMinusC - nx * s;
  const r22 = zz + (1 - zz) * c;

  const e = matrix.elements;
  const m00 = e[0],
    m01 = e[1],
    m02 = e[2],
    m03 = e[3];
  const m10 = e[4],
    m11 = e[5],
    m12 = e[6],
    m13 = e[7];
  const m20 = e[8],
    m21 = e[9],
    m22 = e[10],
    m23 = e[11];

  e[0] = m00 * r00 + m10 * r01 + m20 * r02;
  e[1] = m01 * r00 + m11 * r01 + m21 * r02;
  e[2] = m02 * r00 + m12 * r01 + m22 * r02;
  e[3] = m03 * r00 + m13 * r01 + m23 * r02;

  e[4] = m00 * r10 + m10 * r11 + m20 * r12;
  e[5] = m01 * r10 + m11 * r11 + m21 * r12;
  e[6] = m02 * r10 + m12 * r11 + m22 * r12;
  e[7] = m03 * r10 + m13 * r11 + m23 * r12;

  e[8] = m00 * r20 + m10 * r21 + m20 * r22;
  e[9] = m01 * r20 + m11 * r21 + m21 * r22;
  e[10] = m02 * r20 + m12 * r21 + m22 * r22;
  e[11] = m03 * r20 + m13 * r21 + m23 * r22;
}

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

// 워커 초기 메시지
self.postMessage({ type: "ready" });
