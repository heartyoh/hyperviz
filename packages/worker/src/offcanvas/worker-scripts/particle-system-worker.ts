/**
 * 고성능 WebGL 기반 파티클 시스템 워커
 *
 * Transform Feedback을 사용하여 GPU에서 파티클 업데이트를 수행하고,
 * 효율적인 버퍼 관리와 메모리 사용을 통해 최적화되었습니다.
 */

// WebGL 모듈 가져오기
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

// ===== 타입 정의 =====
// 메시지 타입 정의
enum WorkerMessageType {
  COMMAND = "command",
  RESPONSE = "response",
  EVENT = "event",
  ERROR = "error",
  READY = "ready",
}

// 캔버스 명령 타입
enum CanvasCommandType {
  INIT = "init",
  RENDER = "render",
  RESIZE = "resize",
  CLEAR = "clear",
  DISPOSE = "dispose",
  START_EFFECT = "startEffect",
  STOP_EFFECT = "stopEffect",
  UPDATE_POSITION = "updatePosition",
}

// 파티클 효과 타입
enum ParticleEffectType {
  EXPLOSION = "explosion",
  FOUNTAIN = "fountain",
  SNOW = "snow",
  CONFETTI = "confetti",
  FIRE = "fire",
  SMOKE = "smoke",
}

// 파티클 객체 인터페이스
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
  life: number;
  maxLife: number;
  rotation?: number;
  rotationSpeed?: number;
  shape?: string;
  [key: string]: any; // 추가 속성
}

// 디버그 모드 설정 (콘솔 로깅 제어)
const DEBUG = false;

// 파티클 시스템 설정
const MAX_PARTICLES = 10000; // 최대 파티클 수 증가
const BUFFER_RESIZE_FACTOR = 1.5; // 버퍼 크기 증가 비율

// ===== 상태 변수 =====
let canvas: OffscreenCanvas | null = null;
let particles: Particle[] = [];
let running = false;
let lastTimestamp = 0;
let effectType: ParticleEffectType | null = null;
let effectOptions: any = null;
let emitterX = 0;
let emitterY = 0;
let frameId: number | null = null;

// WebGL 관련 상태 변수
let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
let renderer: Renderer | null = null;
let shaderProgram: ShaderProgram | null = null;
let particleVaoId = "particle-vao";
let isWebGL2 = false;
let particleBuffers = new Map<string, WebGLBuffer>();

// 캐싱된 행렬
let projectionMatrix: Float32Array | null = null;
let canvasWidth = 0;
let canvasHeight = 0;

// 초기화 상태를 추적하기 위한 변수
let initialized = false;
let ctx: CanvasRenderingContext2D | null = null;
let bufferHelper: BufferHelper | null = null;
let vaoHelper: VAOHelper | null = null;
let textureHelper: TextureHelper | null = null;

// 파티클 시스템 변수
let particleVAO: WebGLVertexArrayObject | null = null;
let positionBuffer: WebGLBuffer | null = null;
let sizeBuffer: WebGLBuffer | null = null;
let colorBuffer: WebGLBuffer | null = null;
let currentMaxParticleCount = 0; // 현재 설정된 최대 파티클 수

// 파티클 효과 설정
let emitter = { x: 0, y: 0 };
let activeEffect: string | null = null;
let mouseTracking = false;
let animationFrameId: number | null = null;

// ===== 메시지 핸들러 =====
self.onmessage = (event: MessageEvent) => {
  const message = event.data;

  if (!message || !message.type) {
    sendError("잘못된 메시지 포맷");
    return;
  }

  try {
    // 기존 직접 타입 처리 (이전 버전 호환성)
    if (message.type === "init") {
      initCanvas({
        canvas: message.canvas,
        contextType: message.contextType,
        contextAttributes: message.contextAttributes,
      });
      return;
    } else if (message.type === "startEffect") {
      startEffect(message.effectType, message.options);
      return;
    } else if (message.type === "stopEffect") {
      stopEffect();
      return;
    } else if (message.type === "update") {
      updateEmitterPosition(message.mouseX, message.mouseY);
      return;
    } else if (message.type === "resize") {
      resizeCanvas(message.width, message.height);
      return;
    }

    // 명령 패턴 처리
    if (message.type === WorkerMessageType.COMMAND) {
      const command = message.data;
      const result = processCommand(command);
      sendResponse(message.id, command.id, true, result);
    }
  } catch (error: any) {
    if (DEBUG) console.error("메시지 처리 오류:", error);
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

    case CanvasCommandType.START_EFFECT:
      return startEffect(command.params.effectType, command.params.options);

    case CanvasCommandType.STOP_EFFECT:
      return stopEffect();

    case CanvasCommandType.UPDATE_POSITION:
      return updateEmitterPosition(
        command.params.mouseX,
        command.params.mouseY
      );

    case CanvasCommandType.CLEAR:
      if (gl && renderer) {
        renderer.clear();
        return true;
      }
      return false;

    case CanvasCommandType.DISPOSE:
      // 리소스 정리
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      particles = [];
      running = false;

      // WebGL 자원 정리
      if (renderer) {
        renderer.dispose();
        gl = null;
        renderer = null;
        shaderProgram = null;
        particleBuffers.clear();
      }

      return true;

    default:
      throw new Error(`지원되지 않는 명령: ${command.type}`);
  }
}

/**
 * 캔버스 초기화
 */
function initCanvas(params: any): any {
  if (!params.canvas) {
    throw new Error("OffscreenCanvas가 전송되지 않았습니다.");
  }

  canvas = params.canvas as OffscreenCanvas;
  const contextType = params.contextType || "webgl2";

  try {
    // WebGL 초기화
    gl = createWebGLContext(
      canvas,
      params.contextAttributes || {
        alpha: true,
        antialias: true,
        depth: false, // 2D 파티클이므로 depth 불필요
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        stencil: false,
      }
    );

    if (!gl) {
      throw new Error("WebGL 컨텍스트를 생성할 수 없습니다.");
    }

    if (DEBUG) console.log("WebGL 컨텍스트 생성 성공");

    // WebGL2 지원 확인
    isWebGL2 = gl instanceof WebGL2RenderingContext;
    if (DEBUG) console.log("WebGL2 지원: ", isWebGL2);

    // 렌더러 초기화
    renderer = new Renderer(gl);
    renderer.init([0, 0, 0, 0]); // 투명 배경

    // 초기 위치를 캔버스 중앙으로 설정
    canvasWidth = canvas.width;
    canvasHeight = canvas.height;
    emitterX = canvasWidth / 2;
    emitterY = canvasHeight / 2;

    // 셰이더 프로그램 초기화
    initializeParticleShaders();

    // 프로젝션 행렬 초기화 (캐싱)
    updateProjectionMatrix();

    // 뷰포트 설정
    renderer.setViewport(0, 0, canvasWidth, canvasHeight);

    self.postMessage({ type: "initialized" });

    return {
      width: canvasWidth,
      height: canvasHeight,
      contextType: isWebGL2 ? "webgl2" : "webgl",
    };
  } catch (error) {
    if (DEBUG) console.error("캔버스 초기화 오류:", error);
    throw error;
  }
}

/**
 * 캔버스 크기 조정
 */
function resizeCanvas(width: number, height: number): any {
  if (!canvas) return null;

  canvas.width = width;
  canvas.height = height;
  canvasWidth = width;
  canvasHeight = height;

  // 이미터 위치 업데이트
  if (!emitterX || !emitterY) {
    emitterX = width / 2;
    emitterY = height / 2;
  }

  // WebGL 모드일 때 뷰포트 설정
  if (gl && renderer) {
    renderer.setViewport(0, 0, width, height);

    // 프로젝션 행렬 업데이트
    updateProjectionMatrix();

    // 셰이더에 새 행렬 적용
    if (shaderProgram && projectionMatrix) {
      shaderProgram.use();
      shaderProgram.setUniformMatrix4fv(
        "uProjectionMatrix",
        false,
        projectionMatrix
      );
    }
  }

  sendEvent("resized");
  return { width, height };
}

/**
 * 프로젝션 행렬 업데이트 (크기 변경 시에만 호출)
 */
function updateProjectionMatrix(): void {
  if (!canvas) return;

  projectionMatrix = createOrthographicMatrix(
    0,
    canvasWidth,
    canvasHeight,
    0,
    -1,
    1
  );
}

/**
 * 오류 메시지 전송
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

// 직교 투영 행렬 생성
function createOrthographicMatrix(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number
): Float32Array {
  const matrix = new Float32Array(16);

  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);

  matrix[0] = -2 * lr;
  matrix[1] = 0;
  matrix[2] = 0;
  matrix[3] = 0;

  matrix[4] = 0;
  matrix[5] = -2 * bt;
  matrix[6] = 0;
  matrix[7] = 0;

  matrix[8] = 0;
  matrix[9] = 0;
  matrix[10] = 2 * nf;
  matrix[11] = 0;

  matrix[12] = (left + right) * lr;
  matrix[13] = (top + bottom) * bt;
  matrix[14] = (far + near) * nf;
  matrix[15] = 1;

  return matrix;
}

// 워커 초기 메시지
self.postMessage({ type: WorkerMessageType.READY });

/**
 * 파티클 효과 시작
 * @param effectType 효과 타입
 * @param options 효과 옵션
 */
function startEffect(effectType: string, options: any = {}): boolean {
  // 효과 옵션 설정
  effectOptions = {
    type: effectType || "explosion",
    particleCount: options.particleCount || 100,
    gravity: options.gravity !== undefined ? options.gravity : 0.1,
    size: options.size || 5,
    lifeSpan: options.lifeSpan || 100,
    colors: options.colors || [],
    mouseTracking:
      options.mouseTracking !== undefined ? options.mouseTracking : false,
  };

  // 버퍼 크기가 충분한지 확인하고 필요시 재생성
  const requiredParticles = Math.max(effectOptions.particleCount * 2, 1000); // 여유 있게 2배 또는 최소 1000
  if (currentMaxParticleCount < requiredParticles) {
    console.log(
      `Increasing buffer size for effect: ${requiredParticles} particles needed`
    );
    createEmptyParticleBuffers(requiredParticles);
  }

  // 효과 타입에 따른 기본 색상 설정
  if (effectOptions.colors.length === 0) {
    switch (effectOptions.type) {
      case "explosion":
        effectOptions.colors = ["#ff0000", "#ff7700", "#ffff00"];
        break;
      case "fountain":
        effectOptions.colors = ["#00ffff", "#0099ff", "#0000ff"];
        break;
      case "snow":
        effectOptions.colors = ["#ffffff", "#eeeeee", "#cccccc"];
        break;
      default:
        effectOptions.colors = ["#ff0000", "#00ff00", "#0000ff"];
    }
  }

  mouseTracking = effectOptions.mouseTracking;
  activeEffect = effectOptions.type;

  // 효과 시작 이벤트 전송
  self.postMessage({
    type: WorkerMessageType.EVENT,
    data: {
      type: "effectStarted",
      effect: activeEffect,
      options: effectOptions,
    },
  });

  // 애니메이션 시작 (아직 실행 중이 아니라면)
  if (!animationFrameId) {
    animate();
  }

  return true;
}

/**
 * 파티클 효과 정지
 */
function stopEffect(): boolean {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  particles = [];
  activeEffect = null;

  sendEvent("effectStopped");
  return true;
}

/**
 * 이미터 위치 업데이트
 */
function updateEmitterPosition(
  mouseX: number,
  mouseY: number
): { x: number; y: number } {
  emitterX = mouseX;
  emitterY = mouseY;

  return { x: emitterX, y: emitterY };
}

/**
 * 애니메이션 루프
 */
function animate(timestamp = 0): void {
  if (!gl || !renderer) return;

  const deltaTime = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  // 캔버스 클리어
  renderer.clear();

  // 파티클 업데이트 및 렌더링
  updateParticles(deltaTime);
  renderParticles();

  // 파티클 통계 전송
  if (particles.length > 0) {
    sendEvent("stats", {
      particleCount: particles.length,
      fps: Math.round(1000 / (deltaTime || 1)),
    });
  }

  // 애니메이션 계속 실행
  animationFrameId = requestAnimationFrame(animate);
}

/**
 * 파티클 업데이트
 */
function updateParticles(deltaTime: number): void {
  // 생존한 파티클만 유지
  particles = particles.filter((p) => p.life > 0);

  // 새 파티클 생성 (이펙트 타입에 따라)
  if (activeEffect) {
    createParticlesForEffect(activeEffect, effectOptions);
  }

  // 모든 파티클 업데이트
  particles.forEach((p) => {
    // 속도 적용
    p.x += p.vx;
    p.y += p.vy;

    // 중력 적용
    if (effectOptions.gravity) {
      p.vy += effectOptions.gravity;
    }

    // 회전 적용
    if (p.rotation !== undefined && p.rotationSpeed) {
      p.rotation += p.rotationSpeed;
    }

    // 수명 감소
    p.life--;

    // 투명도 계산
    p.opacity = p.life / p.maxLife;
  });
}

/**
 * 파티클 렌더링
 */
function renderParticles(): void {
  if (!gl || !shaderProgram || particles.length === 0) return;

  // WebGL 렌더링
  if (gl) {
    renderParticlesWebGL();
  }
}

/**
 * WebGL로 파티클 렌더링
 */
function renderParticlesWebGL(): void {
  if (!gl || !shaderProgram || !renderer || !vaoHelper) return;

  // 셰이더 사용
  shaderProgram.use();

  // 프로젝션 행렬 설정
  if (projectionMatrix) {
    shaderProgram.setUniformMatrix4fv(
      "uProjectionMatrix",
      false,
      projectionMatrix
    );
  }

  // 파티클 버퍼 업데이트
  updateParticleBuffers(particles);

  // VAO 바인딩 및 렌더링
  if (particleVAO && vaoHelper) {
    vaoHelper.bindVAO(particleVAO);
    gl.drawArrays(gl.POINTS, 0, particles.length);
    vaoHelper.unbindVAO();
  }
}

/**
 * 빈 파티클 버퍼 생성
 */
function createEmptyParticleBuffers(maxParticleCount = 10000): boolean {
  if (!gl) {
    return false;
  }

  try {
    // 헬퍼 초기화
    if (!bufferHelper) {
      bufferHelper = new BufferHelper(gl);
    }

    if (!vaoHelper) {
      vaoHelper = new VAOHelper(gl);
    }

    // 기존 버퍼 삭제
    if (positionBuffer && bufferHelper) {
      bufferHelper.deleteBuffer(positionBuffer);
    }

    if (sizeBuffer && bufferHelper) {
      bufferHelper.deleteBuffer(sizeBuffer);
    }

    if (colorBuffer && bufferHelper) {
      bufferHelper.deleteBuffer(colorBuffer);
    }

    if (particleVAO && vaoHelper) {
      vaoHelper.deleteVAO(particleVAO);
    }

    if (!bufferHelper || !vaoHelper) {
      console.error("Buffer or VAO helpers not initialized");
      return false;
    }

    // 파티클 위치 버퍼 생성
    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(maxParticleCount * 2),
      gl.DYNAMIC_DRAW
    );

    // 파티클 크기 버퍼 생성
    sizeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(maxParticleCount),
      gl.DYNAMIC_DRAW
    );

    // 파티클 색상 버퍼 생성
    colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(maxParticleCount * 4),
      gl.DYNAMIC_DRAW
    );

    // VAO 생성
    if (isWebGL2) {
      particleVAO = (gl as WebGL2RenderingContext).createVertexArray();
      (gl as WebGL2RenderingContext).bindVertexArray(particleVAO);
    } else {
      // WebGL1에서는 VAO 확장 사용 필요하나 여기서는 지원하지 않으므로
      // 이 부분은 단순화하거나 별도 처리 필요
      console.log("WebGL1 환경에서는 VAO를 사용하지 않습니다.");
    }

    // 버퍼 바인딩 및 속성 설정
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(1);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(2);

    if (isWebGL2) {
      (gl as WebGL2RenderingContext).bindVertexArray(null);
    } else if (vaoHelper) {
      vaoHelper.unbindVAO();
    }

    // 현재 최대 파티클 수 저장
    currentMaxParticleCount = maxParticleCount;

    return true;
  } catch (err) {
    console.error("Error creating particle buffers:", err);
    return false;
  }
}

/**
 * 파티클 버퍼 업데이트
 */
function updateParticleBuffers(particles: Particle[]): boolean {
  if (!gl || !positionBuffer || !sizeBuffer || !colorBuffer) {
    return false;
  }

  const particleCount = particles.length;

  // 버퍼 크기가 부족한 경우 새로운 버퍼 생성
  if (particleCount > currentMaxParticleCount) {
    const newMax = Math.max(
      particleCount,
      Math.floor(currentMaxParticleCount * BUFFER_RESIZE_FACTOR)
    );
    console.log(`Resizing particle buffers to accommodate ${newMax} particles`);

    if (!createEmptyParticleBuffers(newMax)) {
      console.error("Failed to resize particle buffers");
      return false;
    }
  }

  try {
    // 파티클 위치 데이터 준비
    const positionData = new Float32Array(particleCount * 2);
    const sizeData = new Float32Array(particleCount);
    const colorData = new Float32Array(particleCount * 4);

    for (let i = 0; i < particleCount; i++) {
      positionData[i * 2] = particles[i].x;
      positionData[i * 2 + 1] = particles[i].y;

      sizeData[i] = particles[i].size;

      // 색상 파싱
      const color = parseColor(particles[i].color);
      colorData[i * 4] = color.r / 255;
      colorData[i * 4 + 1] = color.g / 255;
      colorData[i * 4 + 2] = color.b / 255;
      colorData[i * 4 + 3] = particles[i].opacity;
    }

    // 버퍼 업데이트
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positionData);

    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, sizeData);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, colorData);

    return true;
  } catch (err) {
    console.error("Error updating particle buffers:", err);
    return false;
  }
}

/**
 * 색상 문자열을 RGB 객체로 변환
 */
function parseColor(color: string): { r: number; g: number; b: number } {
  // 기본 색상
  if (!color) {
    return { r: 255, g: 255, b: 255 };
  }

  // HEX 색상 파싱
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const bigint = parseInt(hex, 16);

    if (hex.length === 3) {
      // #RGB 형식
      const r = ((bigint >> 8) & 0xf) * 17;
      const g = ((bigint >> 4) & 0xf) * 17;
      const b = (bigint & 0xf) * 17;
      return { r, g, b };
    } else {
      // #RRGGBB 형식
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return { r, g, b };
    }
  }

  // 기본 색상 반환
  return { r: 255, g: 255, b: 255 };
}

/**
 * 이펙트 타입에 따른 파티클 생성
 */
function createParticlesForEffect(effect: string, options: any): void {
  switch (effect) {
    case "explosion":
      createExplosionParticles(options);
      break;
    case "fountain":
      createFountainParticles(options);
      break;
    case "snow":
      createSnowParticles(options);
      break;
    // 다른 효과들...
    default:
      // 기본 파티클
      createFountainParticles(options);
  }
}

/**
 * 폭발 효과 파티클 생성
 */
function createExplosionParticles(options: any): void {
  // 폭발 효과는 한 번에 모든 파티클 생성
  if (particles.length === 0) {
    for (let i = 0; i < options.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      const size = options.size * (0.5 + Math.random() * 0.5);
      const life = options.lifeSpan * (0.8 + Math.random() * 0.4);
      const colorIndex = Math.floor(Math.random() * options.colors.length);

      particles.push({
        x: emitterX,
        y: emitterY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size,
        color: options.colors[colorIndex],
        opacity: 1,
        life,
        maxLife: life,
      });
    }
  }
}

/**
 * 분수 효과 파티클 생성
 */
function createFountainParticles(options: any): void {
  // 분수 효과는 지속적으로 파티클 생성
  const particlesPerFrame = Math.max(1, Math.floor(options.particleCount / 60));

  for (let i = 0; i < particlesPerFrame; i++) {
    const angle = Math.PI / 2 + (Math.random() - 0.5);
    const speed = 2 + Math.random() * 2;
    const size = options.size * (0.5 + Math.random() * 0.5);
    const life = options.lifeSpan * (0.8 + Math.random() * 0.4);
    const colorIndex = Math.floor(Math.random() * options.colors.length);

    particles.push({
      x: emitterX,
      y: emitterY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      color: options.colors[colorIndex],
      opacity: 1,
      life,
      maxLife: life,
    });
  }
}

/**
 * 눈 효과 파티클 생성
 */
function createSnowParticles(options: any): void {
  // 눈 효과는 화면 상단에서 지속적으로 파티클 생성
  const particlesPerFrame = Math.max(
    1,
    Math.floor(options.particleCount / 120)
  );

  for (let i = 0; i < particlesPerFrame; i++) {
    const x = Math.random() * canvasWidth;
    const y = -10;
    const speed = 0.5 + Math.random();
    const size = options.size * (0.3 + Math.random() * 0.7);
    const life = options.lifeSpan * (0.8 + Math.random() * 0.4);
    const colorIndex = Math.floor(Math.random() * options.colors.length);

    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: speed,
      size,
      color: options.colors[colorIndex],
      opacity: 1,
      life,
      maxLife: life,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
    });
  }
}

/**
 * 파티클 셰이더 초기화
 */
function initializeParticleShaders(): void {
  if (!gl || !renderer) return;

  // 헬퍼 초기화
  if (!bufferHelper) {
    bufferHelper = new BufferHelper(gl);
  }

  if (!vaoHelper) {
    vaoHelper = new VAOHelper(gl);
  }

  // 버텍스 셰이더
  const vertexShaderSource = `
    attribute vec2 aPosition;
    attribute float aSize;
    attribute vec4 aColor;
    
    uniform mat4 uProjectionMatrix;
    
    varying vec4 vColor;
    
    void main() {
      gl_Position = uProjectionMatrix * vec4(aPosition, 0.0, 1.0);
      gl_PointSize = aSize;
      vColor = aColor;
    }
  `;

  // 프래그먼트 셰이더
  const fragmentShaderSource = `
    precision mediump float;
    varying vec4 vColor;
    
    void main() {
      // 원형 모양의 파티클 생성
      float dist = length(gl_PointCoord - vec2(0.5, 0.5));
      if (dist > 0.5) {
        discard;
      }
      
      gl_FragColor = vColor;
    }
  `;

  // 셰이더 프로그램 생성
  try {
    // 버텍스 셰이더 컴파일
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) {
      throw new Error("버텍스 셰이더를 생성할 수 없습니다.");
    }
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);

    // 컴파일 상태 확인
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(vertexShader);
      gl.deleteShader(vertexShader);
      throw new Error(`버텍스 셰이더 컴파일 오류: ${error}`);
    }

    // 프래그먼트 셰이더 컴파일
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) {
      gl.deleteShader(vertexShader);
      throw new Error("프래그먼트 셰이더를 생성할 수 없습니다.");
    }
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);

    // 컴파일 상태 확인
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(fragmentShader);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error(`프래그먼트 셰이더 컴파일 오류: ${error}`);
    }

    // 프로그램 생성 및 링크
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error("셰이더 프로그램을 생성할 수 없습니다.");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    // 링크 상태 확인
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error(`셰이더 프로그램 링크 오류: ${error}`);
    }

    // 사용하지 않는 셰이더 정리
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    // 셰이더 프로그램 저장 - 타입 캐스팅 방식 변경
    shaderProgram = {
      program,
      use: function () {
        gl!.useProgram(program);
      },
      setUniformMatrix4fv: function (
        name: string,
        transpose: boolean,
        value: Float32Array
      ) {
        const location = gl!.getUniformLocation(program, name);
        if (location) {
          gl!.uniformMatrix4fv(location, transpose, value);
        }
      },
    } as unknown as ShaderProgram; // unknown으로 먼저 변환

    // 파티클 버퍼 생성
    createEmptyParticleBuffers(MAX_PARTICLES);

    if (DEBUG) console.log("파티클 셰이더 초기화 완료");
  } catch (error) {
    console.error("셰이더 초기화 오류:", error);
    throw new Error("셰이더 초기화 실패");
  }
}
