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

  // 파티클 통계 정보 (FPS와 파티클 수) 전송
  const fps = Math.round(1000 / (deltaTime || 1));
  const particleCount = particles.length;

  // 디버그 로그
  if (DEBUG && particleCount > 0) {
    console.log(`파티클 통계: 현재 ${particleCount}개, FPS: ${fps}`);
  }

  // 이벤트 형식으로 통계 정보 전송 (HTML에서 event 핸들러로 처리)
  self.postMessage({
    type: WorkerMessageType.EVENT,
    data: {
      type: "particleStats",
      particleCount: particleCount, // HTML에서 사용하는 필드명에 맞춤
      count: particleCount, // 이전 코드와의 호환성을 위해 유지
      fps: fps,
    },
  });

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
    // 특수 움직임 패턴 적용 (색종이 효과)
    if (p.zigzag) {
      p.zigzagTime += 0.1;
      // 지그재그 움직임 강도를 파티클 형태에 따라 조정
      const intensity = p.zigzagIntensity || 0.1;
      p.vx += Math.sin(p.zigzagTime) * intensity;
    }

    if (p.flutter) {
      p.flutterTime += 0.2;
      // 더 자연스러운 펄럭임을 위해 cos과 sin 함수 조합
      const flutterX = Math.sin(p.flutterTime) * 0.05 * p.flutterIntensity;
      const flutterY =
        Math.cos(p.flutterTime * 1.3) * 0.02 * p.flutterIntensity;

      p.vx += flutterX;
      // 세로로 길쭉한 형태는 위아래로도 더 많이 흔들림
      if (p.shape === "rect-v" || p.shape === "needle") {
        p.vy += flutterY;
      }
    }

    if (p.spiral) {
      const t = p.life / p.maxLife;
      const spiral = p.spiralRadius * (1 - t); // 시간이 지남에 따라 나선형 축소
      // 나선형 움직임에 회전 각도를 고려하여 더 자연스러운 움직임
      const angle = p.life * 0.1 + (p.rotation || 0);
      p.vx += Math.sin(angle) * 0.05 * spiral;
      p.vy += Math.cos(angle) * 0.02 * spiral;
    }

    // 속도 적용
    p.x += p.vx;
    p.y += p.vy;

    // 중력 적용 (이펙트 타입에 따라 다르게 적용)
    if (effectOptions.type !== "fire" && effectOptions.type !== "smoke") {
      // 불과 연기는 중력의 영향을 받지 않음
      if (effectOptions.gravity) {
        // 색종이는 형태에 따라 다른 중력과 공기저항 적용
        if (
          p.shape === "rectangle" ||
          p.shape === "rect-h" ||
          p.shape === "triangle" ||
          p.shape === "rect-v" ||
          p.shape === "needle"
        ) {
          // 모양에 따라 다른 중력 및 공기저항 적용
          if (p.shape === "rect-h") {
            // 가로 직사각형은 높은 공기저항 (천천히 떨어짐)
            p.vy += effectOptions.gravity * 0.6;
            p.vy *= 0.985; // 강한 공기저항
            // 가로 직사각형은 좌우로 더 많이 흔들림
            p.vx *= 0.99;
          } else if (p.shape === "needle") {
            // 바늘형은 옆으로 떨어지는 경향
            p.vy += effectOptions.gravity * 0.7;
            p.vy *= 0.99;
            // 바늘은 수직 방향으로 있을 때 더 빨리 떨어짐, 수평일 때 천천히
            const verticalFactor = Math.abs(Math.sin(p.rotation || 0));
            p.vy += effectOptions.gravity * 0.2 * verticalFactor;
          } else if (p.shape === "rect-v") {
            // 세로 직사각형은 빠르게 떨어짐
            p.vy += effectOptions.gravity * 0.85;
            p.vy *= 0.99;
            // 세로로 긴 직사각형은 수직 방향으로 정렬되려는 경향
            const alignmentForce = Math.sin(2 * (p.rotation || 0)) * 0.001;
            p.rotationSpeed = (p.rotationSpeed || 0) - alignmentForce;
          } else if (p.shape === "triangle") {
            // 삼각형은 중간 정도의 공기저항
            p.vy += effectOptions.gravity * 0.75;
            p.vy *= 0.99;
            // 삼각형은 기울어진 방향으로 약간 움직임
            if (p.rotation) {
              p.vx += Math.sin(p.rotation) * 0.01;
            }
          } else {
            // 정사각형은 일반적인 중력
            p.vy += effectOptions.gravity * 0.9;
          }

          // 수평 속도에 약한 공기저항
          p.vx *= 0.995;
        } else {
          // 일반 파티클은 정상 중력
          p.vy += effectOptions.gravity;
        }
      }
    }

    // 회전 적용
    if (p.rotation !== undefined && p.rotationSpeed) {
      p.rotation += p.rotationSpeed;

      // 긴 형태인 경우 공기저항으로 회전속도 감소
      if (
        p.shape === "rect-h" ||
        p.shape === "rect-v" ||
        p.shape === "needle"
      ) {
        p.rotationSpeed *= 0.995;
      }
    }

    // 크기 변화 (연기 효과를 위해)
    if (p.growRate) {
      p.size += p.size * p.growRate * 0.01;
    }

    // 수명 감소
    p.life--;

    // 특수 효과별 추가 업데이트
    if (p.type === "fire") {
      // 불 효과는 위로 올라갈수록 크기 감소
      p.size *= 0.99;

      // 색상을 점점 밝게 변경 (이 부분은 실제 렌더링에서 적용해야 함)
      if (p.fadeRate) {
        p.opacity -= p.fadeRate;
      } else {
        p.opacity = p.life / p.maxLife;
      }
    } else if (effectOptions.type === "smoke") {
      // 연기는 위로 올라갈수록 크기 증가하고 투명해짐
      if (p.fadeRate) {
        p.opacity -= p.fadeRate;
      } else {
        p.opacity = (p.life / p.maxLife) * 0.7; // 연기는 더 투명하게
      }
    } else {
      // 기본 파티클 투명도 계산
      p.opacity = p.life / p.maxLife;
    }

    // 투명도 범위 제한
    p.opacity = Math.max(0, Math.min(1, p.opacity));
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

  // 파티클 타입별로 그룹화하여 최적화
  const defaultParticles = [];
  const squareConfetti = [];
  const rectHorizConfetti = [];
  const triangleConfetti = [];
  const rectVertConfetti = [];
  const needleConfetti = [];
  const fireParticles = [];

  // 파티클 타입별로 분류
  for (let i = 0; i < particles.length; i++) {
    if (particles[i].type === "fire") {
      fireParticles.push(particles[i]);
    } else if (particles[i].shape === "rectangle") {
      squareConfetti.push(particles[i]);
    } else if (particles[i].shape === "rect-h") {
      rectHorizConfetti.push(particles[i]);
    } else if (particles[i].shape === "triangle") {
      triangleConfetti.push(particles[i]);
    } else if (particles[i].shape === "rect-v") {
      rectVertConfetti.push(particles[i]);
    } else if (particles[i].shape === "needle") {
      needleConfetti.push(particles[i]);
    } else {
      defaultParticles.push(particles[i]);
    }
  }

  // 블렌딩 활성화 - 투명도 지원
  gl.enable(gl.BLEND);
  // 가산 블렌딩 모드 (불꽃과 같은 밝은 효과에 적합)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // 일반 원형 파티클 렌더링
  if (defaultParticles.length > 0) {
    // 원형 모양으로 설정
    shaderProgram.setUniform1i("uShape", 0);
    updateParticleBuffers(defaultParticles);

    if (particleVAO && vaoHelper) {
      vaoHelper.bindVAO(particleVAO);
      gl.drawArrays(gl.POINTS, 0, defaultParticles.length);
      vaoHelper.unbindVAO();
    }
  }

  // 정사각형 색종이 파티클 렌더링
  if (squareConfetti.length > 0) {
    // 사각형 모양으로 설정
    shaderProgram.setUniform1i("uShape", 1);
    updateParticleBuffers(squareConfetti);

    if (particleVAO && vaoHelper) {
      vaoHelper.bindVAO(particleVAO);
      gl.drawArrays(gl.POINTS, 0, squareConfetti.length);
      vaoHelper.unbindVAO();
    }
  }

  // 가로형 직사각형 색종이 파티클 렌더링
  if (rectHorizConfetti.length > 0) {
    // 직사각형 모양으로 설정
    shaderProgram.setUniform1i("uShape", 3);
    updateParticleBuffers(rectHorizConfetti);

    if (particleVAO && vaoHelper) {
      vaoHelper.bindVAO(particleVAO);
      gl.drawArrays(gl.POINTS, 0, rectHorizConfetti.length);
      vaoHelper.unbindVAO();
    }
  }

  // 삼각형 색종이 파티클 렌더링
  if (triangleConfetti.length > 0) {
    // 삼각형 모양으로 설정
    shaderProgram.setUniform1i("uShape", 4);
    updateParticleBuffers(triangleConfetti);

    if (particleVAO && vaoHelper) {
      vaoHelper.bindVAO(particleVAO);
      gl.drawArrays(gl.POINTS, 0, triangleConfetti.length);
      vaoHelper.unbindVAO();
    }
  }

  // 세로형 직사각형 색종이 파티클 렌더링
  if (rectVertConfetti.length > 0) {
    // 세로형 직사각형 모양으로 설정
    shaderProgram.setUniform1i("uShape", 5);
    updateParticleBuffers(rectVertConfetti);

    if (particleVAO && vaoHelper) {
      vaoHelper.bindVAO(particleVAO);
      gl.drawArrays(gl.POINTS, 0, rectVertConfetti.length);
      vaoHelper.unbindVAO();
    }
  }

  // 바늘형 색종이 파티클 렌더링
  if (needleConfetti.length > 0) {
    // 바늘형 모양으로 설정
    shaderProgram.setUniform1i("uShape", 6);
    updateParticleBuffers(needleConfetti);

    if (particleVAO && vaoHelper) {
      vaoHelper.bindVAO(particleVAO);
      gl.drawArrays(gl.POINTS, 0, needleConfetti.length);
      vaoHelper.unbindVAO();
    }
  }

  // 불꽃 파티클 렌더링 (가산 블렌딩으로 더 밝은 효과)
  if (fireParticles.length > 0) {
    // 가산 블렌딩으로 변경 (더 밝은 불꽃 효과)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    // 불꽃 모양으로 설정
    shaderProgram.setUniform1i("uShape", 2);
    updateParticleBuffers(fireParticles);

    if (particleVAO && vaoHelper) {
      vaoHelper.bindVAO(particleVAO);
      gl.drawArrays(gl.POINTS, 0, fireParticles.length);
      vaoHelper.unbindVAO();
    }

    // 원래 블렌딩 모드로 복원
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // 블렌딩 비활성화
  gl.disable(gl.BLEND);
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
    console.log(`파티클 버퍼 생성 완료: 최대 ${maxParticleCount}개`);

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
    console.log(
      `Resizing particle buffers to accommodate ${newMax} particles (current: ${currentMaxParticleCount}, needed: ${particleCount})`
    );

    if (!createEmptyParticleBuffers(newMax)) {
      console.error("Failed to resize particle buffers");
      // 안전장치: 현재 파티클 수를 최대 파티클 수로 제한
      particles.length = currentMaxParticleCount;
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

    // 버퍼 업데이트 - 안전 검사 추가
    if (positionData.length > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, positionData);
    }

    if (sizeData.length > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sizeData);
    }

    if (colorData.length > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, colorData);
    }

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
    case "confetti":
      createConfettiParticles(options);
      break;
    case "fire":
      createFireParticles(options);
      break;
    case "smoke":
      createSmokeParticles(options);
      break;
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
 * 색종이 효과 파티클 생성
 */
function createConfettiParticles(options: any): void {
  // 색종이는 위쪽에서 떨어지는 다채로운 사각형 파티클
  const particlesPerFrame = Math.max(1, Math.floor(options.particleCount / 80));

  // 기본 색상이 설정되지 않았다면 밝고 다양한 색상 사용 (더 다양한 색상 추가)
  const confettiColors =
    options.colors.length > 0
      ? options.colors
      : [
          "#ff0000", // 빨강
          "#ff3300", // 주황빨강
          "#ff9900", // 주황
          "#ffcc00", // 황금색
          "#ffff00", // 노랑
          "#99cc00", // 라임
          "#33cc33", // 초록
          "#00cccc", // 청록
          "#3399ff", // 하늘
          "#0066ff", // 파랑
          "#6600ff", // 진보라
          "#cc66ff", // 라일락
          "#ff66cc", // 핑크
          "#ff0099", // 진분홍
          "#ffffff", // 흰색
          "#dddddd", // 은색
          "#ffcc99", // 살구색
          "#ffff99", // 연한 노랑
          "#99ffcc", // 연한 민트
        ];

  for (let i = 0; i < particlesPerFrame; i++) {
    // 화면 상단 전체에서 생성 (약간의 높이 변화)
    const x = Math.random() * canvasWidth;
    const y = -10 - Math.random() * 40; // 다양한 높이에서 떨어지기 시작

    // 다양한 모양 랜덤 선택 (확률 조정: 길쭉한 모양들 비중 증가)
    const shapes = [
      "rectangle",
      "rect-h",
      "triangle",
      "rect-v",
      "needle",
      "rect-h",
      "rect-v",
    ];
    const shapeIndex = Math.floor(Math.random() * shapes.length);
    const shape = shapes[shapeIndex];

    // 불규칙한 속도와 방향 (자연스러운 떨어짐, 다양한 패턴)
    // 더 넓은 범위의 수평 속도
    const vx = (Math.random() - 0.5) * (3 + Math.random() * 2);
    // 다양한 떨어지는 속도
    const vy = 0.5 + Math.random() * 3.0;

    // 크기는 모양에 따라 다르게
    let size;
    if (shape === "rectangle") {
      // 정사각형은 중간 크기
      size = options.size * (0.7 + Math.random() * 1.0);
    } else if (shape === "rect-h") {
      // 가로 직사각형은 크게
      size = options.size * (1.2 + Math.random() * 1.3);
    } else if (shape === "rect-v") {
      // 세로 직사각형은 크게
      size = options.size * (1.0 + Math.random() * 1.2);
    } else if (shape === "needle") {
      // 바늘형은 매우 크게 (길이가 매우 길어보이도록)
      size = options.size * (1.5 + Math.random() * 1.5);
    } else {
      // 삼각형은 작게
      size = options.size * (0.6 + Math.random() * 0.9);
    }

    // 수명도 모양에 따라 다르게
    const lifeFactor =
      shape === "needle" || shape === "rect-v"
        ? 1.3
        : shape === "rect-h"
        ? 1.2
        : shape === "rectangle"
        ? 1.0
        : 1.1;
    const life = options.lifeSpan * (0.8 + Math.random() * lifeFactor);

    // 다양한 색상 중 랜덤 선택
    const colorIndex = Math.floor(Math.random() * confettiColors.length);

    // 다양한 회전 속도 (모양에 따라 다르게)
    let rotationSpeed;
    if (shape === "needle") {
      // 바늘형은 더 빠르게 회전
      rotationSpeed = (Math.random() - 0.5) * 0.25;
    } else if (shape === "rect-v" || shape === "rect-h") {
      // 직사각형은 빠르게
      rotationSpeed = (Math.random() - 0.5) * 0.2;
    } else if (shape === "rectangle") {
      // 정사각형은 중간 속도
      rotationSpeed = (Math.random() - 0.5) * 0.1;
    } else {
      // 삼각형은 느린 속도
      rotationSpeed = (Math.random() - 0.5) * 0.08;
    }

    // 특이한 움직임 패턴을 위한 추가 속성
    const zigzag = Math.random() > 0.65; // 35% 확률로 지그재그 움직임
    const spiral = Math.random() > 0.75; // 25% 확률로 나선형 움직임
    const flutter = Math.random() > 0.5; // 50% 확률로 펄럭임 (더 자주 발생)

    // 길쭉한 형태일수록 flutter 효과 강화
    const flutterIntensity =
      shape === "needle"
        ? 1.5 + Math.random() * 2.0
        : shape === "rect-v"
        ? 1.2 + Math.random() * 1.5
        : shape === "rect-h"
        ? 0.8 + Math.random() * 1.2
        : 0.5 + Math.random() * 1.0;

    particles.push({
      x,
      y,
      vx,
      vy,
      size,
      color: confettiColors[colorIndex],
      opacity: 0.9 + Math.random() * 0.1, // 거의 불투명하게
      life,
      maxLife: life,
      rotation: Math.random() * Math.PI * 2, // 0-360도 랜덤 회전
      rotationSpeed,
      shape,
      zigzag,
      zigzagTime: 0,
      zigzagIntensity: 0.05 + Math.random() * 0.15, // 지그재그 강도 다양화
      spiral,
      spiralRadius: 0.5 + Math.random() * 1.5,
      flutter,
      flutterTime: Math.random() * 10, // 시작 시간을 랜덤하게 하여 다양한 패턴 생성
      flutterIntensity,
    });
  }
}

/**
 * 불 효과 파티클 생성
 */
function createFireParticles(options: any): void {
  // 불은 아래에서 위로 상승하는 파티클들
  const particlesPerFrame = Math.max(1, Math.floor(options.particleCount / 30));

  // 기본 색상이 설정되지 않았다면 불 색상 사용 (좀 더 자연스러운 불꽃 색상)
  const fireColors =
    options.colors.length > 0
      ? options.colors
      : ["#ff3300", "#ff6600", "#ff9900", "#ffcc00", "#ffff33"];

  for (let i = 0; i < particlesPerFrame; i++) {
    // 이미터 위치 주변에서 생성 (약간의 랜덤성 추가)
    const x = emitterX + (Math.random() - 0.5) * (20 + Math.random() * 15);
    const y = emitterY + Math.random() * 10; // 약간 아래서부터 시작

    // 위쪽으로 상승하는 속도, 좌우로 약간 불규칙하게 흔들림
    const vx = (Math.random() - 0.5) * 1.2;
    const vy = -2.5 - Math.random() * 2.5; // 좀 더 빠르게 상승

    // 크기는 불꽃 특성에 맞게 다양하게 (불의 불규칙함 표현)
    const size = options.size * (0.6 + Math.random() * 1.2);

    // 수명은 짧게 (불꽃은 빨리 사라짐)
    const life = options.lifeSpan * (0.3 + Math.random() * 0.5);

    // 색상은 불꽃 색상 중 랜덤 (주로 아래쪽은 빨간색/주황색)
    // 위치에 따라 색상 선택 (아래쪽은 더 빨갛고, 위쪽은 더 노란색)
    const colorIndex = Math.floor(Math.random() * fireColors.length);

    particles.push({
      x,
      y,
      vx,
      vy,
      size,
      color: fireColors[colorIndex],
      opacity: 0.8 + Math.random() * 0.2, // 불투명도 높게
      life,
      maxLife: life,
      type: "fire", // 파티클 유형으로 fire 지정
      fadeRate: 0.02 + Math.random() * 0.04, // 빠르게 사라짐
      growRate: -0.2 - Math.random() * 0.3, // 시간이 지날수록 크기 감소
      shape: "fire", // 불꽃 모양 지정
    });

    // 연기 효과도 가끔 추가 (높은 opacity 값으로 거의 안 보이게)
    if (Math.random() < 0.2) {
      const smokeLife = life * 2;
      particles.push({
        x,
        y,
        vx: vx * 0.5,
        vy: vy * 0.3,
        size: size * 1.5,
        color: "#777777",
        opacity: 0.05 + Math.random() * 0.05, // 매우 투명하게
        life: smokeLife,
        maxLife: smokeLife,
        type: "smoke",
        growRate: 0.3 + Math.random() * 0.2,
        fadeRate: 0.005 + Math.random() * 0.008,
      });
    }
  }
}

/**
 * 연기 효과 파티클 생성
 */
function createSmokeParticles(options: any): void {
  // 연기는 천천히 상승하며 점점 확산되는 파티클
  const particlesPerFrame = Math.max(1, Math.floor(options.particleCount / 60));

  // 연기 색상 기본값
  const smokeColors =
    options.colors.length > 0
      ? options.colors
      : ["#555555", "#666666", "#777777", "#888888", "#999999"];

  for (let i = 0; i < particlesPerFrame; i++) {
    // 이미터 위치 주변에서 생성
    const x = emitterX + (Math.random() - 0.5) * 10;
    const y = emitterY;

    // 느리게 상승하며 좌우로 약간 흔들림
    const vx = (Math.random() - 0.5) * 0.5;
    const vy = -0.5 - Math.random() * 1; // 천천히 위로 상승

    // 크기는 크게 시작해서 더 커짐
    const size = options.size * (1.0 + Math.random() * 1.5);

    // 수명은 길게
    const life = options.lifeSpan * (1.0 + Math.random() * 1.0);

    // 연기 색상 중 랜덤
    const colorIndex = Math.floor(Math.random() * smokeColors.length);

    particles.push({
      x,
      y,
      vx,
      vy,
      size,
      color: smokeColors[colorIndex],
      opacity: 0.4 + Math.random() * 0.3, // 낮은 불투명도로 시작
      life,
      maxLife: life,
      growRate: 0.2 + Math.random() * 0.3, // 시간이 지남에 따라 크기 증가
      fadeRate: 0.01 + Math.random() * 0.01, // 천천히 사라짐
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

  // 프래그먼트 셰이더 - 다양한 파티클 모양 지원
  const fragmentShaderSource = `
    precision mediump float;
    varying vec4 vColor;
    
    uniform int uShape; // 0: 원형, 1: 사각형, 2: 불꽃, 3: 직사각형(가로), 4: 삼각형, 5: 직사각형(세로), 6: 바늘형
    
    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5, 0.5);
      float dist = length(coord);
      
      // 모양에 따라 다른 렌더링 방식 적용
      if (uShape == 1) {
        // 정사각형 색종이
        float edgeSoftness = 0.05;
        float rectShape = max(abs(coord.x), abs(coord.y));
        
        if (rectShape > 0.4) {
          discard;
        }
        
        // 사각형 가장자리 부드럽게
        float alpha = smoothstep(0.4, 0.4 - edgeSoftness, rectShape);
        gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
      } else if (uShape == 2) {
        // 불꽃 효과 (아래쪽은 더 밝고, 위쪽으로 갈수록 희미해짐)
        if (dist > 0.5) {
          discard;
        }
        
        // y 좌표로 그라데이션 계산 (위쪽으로 갈수록 희미해짐)
        float gradient = smoothstep(0.5, -0.2, coord.y);
        
        // 중앙은 더 밝고, 가장자리는 희미하게
        float centerGlow = smoothstep(0.5, 0.2, dist);
        
        // 두 효과 조합
        float fireEffect = centerGlow * gradient;
        
        // 최종 알파 계산
        float alpha = smoothstep(0.5, 0.0, dist) * fireEffect;
        
        // 불꽃 색상 조정 (위쪽은 더 밝게)
        vec3 flameColor = mix(vColor.rgb, vec3(1.0, 1.0, 0.6), gradient * 0.7);
        
        gl_FragColor = vec4(flameColor, vColor.a * alpha);
      } else if (uShape == 3) {
        // 직사각형 색종이 (가로로 더 길게)
        float edgeSoftness = 0.05;
        float rectX = abs(coord.x) / 0.3; // x축으로 더 길게(이전보다 더 길쭉하게)
        float rectY = abs(coord.y) / 0.2; // y축으로 더 짧게
        float rectShape = max(rectX, rectY);
        
        if (rectShape > 1.0) {
          discard;
        }
        
        // 사각형 가장자리 부드럽게
        float alpha = smoothstep(1.0, 1.0 - edgeSoftness, rectShape);
        gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
      } else if (uShape == 4) {
        // 삼각형 색종이 (더 길쭉한 삼각형)
        // 삼각형 정의 (길쭉한 삼각형)
        float triangleDist = max(
          abs(coord.x) * 0.866 + coord.y * 0.3,   // 오른쪽 변 (더 길쭉하게)
          -coord.y * 1.2                         // 아래 변 (더 길게)
        );
        triangleDist = max(triangleDist, coord.x * 0.866 - coord.y * 0.3); // 왼쪽 변
        
        if (triangleDist > 0.4) {
          discard;
        }
        
        // 삼각형 가장자리 부드럽게
        float edgeSoftness = 0.05;
        float alpha = smoothstep(0.4, 0.4 - edgeSoftness, triangleDist);
        gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
      } else if (uShape == 5) {
        // 직사각형 색종이 (세로로 길쭉하게)
        float edgeSoftness = 0.05;
        float rectX = abs(coord.x) / 0.18; // x축으로 짧게
        float rectY = abs(coord.y) / 0.45; // y축으로 길게
        float rectShape = max(rectX, rectY);
        
        if (rectShape > 1.0) {
          discard;
        }
        
        // 사각형 가장자리 부드럽게
        float alpha = smoothstep(1.0, 1.0 - edgeSoftness, rectShape);
        gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
      } else if (uShape == 6) {
        // 바늘 형태의 매우 길쭉한 색종이
        float edgeSoftness = 0.05;
        float rectX = abs(coord.x) / 0.10; // x축으로 매우 짧게
        float rectY = abs(coord.y) / 0.6;  // y축으로 매우 길게
        float rectShape = max(rectX, rectY);
        
        if (rectShape > 1.0) {
          discard;
        }
        
        // 가장자리 부드럽게
        float alpha = smoothstep(1.0, 1.0 - edgeSoftness, rectShape);
        gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
      } else {
        // 기본 원형 파티클
        if (dist > 0.5) {
          discard;
        }
        
        // 부드러운 가장자리 효과
        float alpha = smoothstep(0.5, 0.4, dist);
        gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
      }
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
      setUniform1i: function (name: string, value: number) {
        const location = gl!.getUniformLocation(program, name);
        if (location) {
          gl!.uniform1i(location, value);
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
