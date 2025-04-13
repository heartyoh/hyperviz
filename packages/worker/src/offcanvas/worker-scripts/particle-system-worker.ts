// 파티클 시스템 워커 - OffscreenCanvas 활용
// 다양한 파티클 효과 구현

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
  START_EFFECT = "startEffect",
  STOP_EFFECT = "stopEffect",
  UPDATE_POSITION = "updatePosition",
}

// 파티클 타입 정의
enum ParticleEffectType {
  EXPLOSION = "explosion",
  FOUNTAIN = "fountain",
  SNOW = "snow",
  CONFETTI = "confetti",
  FIRE = "fire",
  SMOKE = "smoke",
}

// 파티클 객체 정의
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

// 상태 변수
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
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
let useWebGL = false; // WebGL 사용 여부
let particleVaoId = "particle-vao"; // 파티클 VAO ID
let isWebGL2 = false; // WebGL2 지원 여부
let particleBuffers = new Map<string, WebGLBuffer>(); // 파티클 버퍼 저장용

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
      if (useWebGL && gl && renderer) {
        renderer.clear();
        return true;
      } else if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      if (useWebGL && renderer) {
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
 * 캔버스 초기화 (명령 패턴용)
 * @param params 초기화 매개변수
 * @returns 초기화 결과
 */
function initCanvas(params: any): any {
  if (!params.canvas) {
    throw new Error("OffscreenCanvas가 전송되지 않았습니다.");
  }

  canvas = params.canvas as OffscreenCanvas;
  const contextType = params.contextType || "2d";

  try {
    // 컨텍스트 타입에 따라 초기화
    if (contextType === "webgl" || contextType === "webgl2") {
      useWebGL = true;
      // WebGL 초기화
      gl = createWebGLContext(
        canvas,
        params.contextAttributes || {
          alpha: true,
          antialias: true,
          depth: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          stencil: false,
        }
      );

      if (!gl) {
        console.error("WebGL 컨텍스트 생성 실패, 2D로 폴백");
        useWebGL = false;
        ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("2D 컨텍스트를 생성할 수 없습니다.");
        }
      } else {
        console.log("WebGL 컨텍스트 생성 성공");
        isWebGL2 = "createVertexArray" in gl;
        console.log("WebGL2 지원: ", isWebGL2);

        // 렌더러 초기화
        renderer = new Renderer(gl);
        renderer.init([0, 0, 0, 0]); // 투명 배경

        // 셰이더 프로그램 초기화
        initializeParticleShaders();
      }
    } else {
      useWebGL = false;
      // 2D 컨텍스트 초기화
      ctx = canvas.getContext(
        "2d",
        params.contextAttributes || {
          alpha: true,
          willReadFrequently: true,
        }
      );

      if (!ctx) {
        throw new Error("2D 컨텍스트를 생성할 수 없습니다.");
      }
    }

    // 초기 위치를 캔버스 중앙으로 설정
    emitterX = canvas.width / 2;
    emitterY = canvas.height / 2;

    // sendEvent("initialized", { useWebGL, contextType });
    self.postMessage({ type: "initialized" });

    // 캔버스 크기 설정
    if (useWebGL && gl && renderer) {
      renderer.setViewport(0, 0, canvas.width, canvas.height);
    }

    return {
      width: canvas.width,
      height: canvas.height,
      contextType: useWebGL ? (isWebGL2 ? "webgl2" : "webgl") : "2d",
    };
  } catch (error) {
    console.error("캔버스 초기화 오류:", error);
    throw error;
  }
}

// 파티클 셰이더 초기화
function initializeParticleShaders(): void {
  if (!gl || !renderer) return;

  // 정점 셰이더 소스 - 단순화된 버전
  const vsSource = `
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

  // 프래그먼트 셰이더 소스 - 단순화된 버전
  const fsSource = `
    precision mediump float;
    varying vec4 vColor;
    
    void main() {
      // 원형 파티클 생성 (단순화된 버전)
      float dist = length(gl_PointCoord - vec2(0.5, 0.5));
      if (dist > 0.5) discard;
      
      gl_FragColor = vColor;
    }
  `;

  try {
    console.log("셰이더 초기화 시작");
    // 셰이더 생성
    const { buffer: bufferHelper, vao: vaoHelper } = renderer.getHelpers();

    // 셰이더 프로그램 생성
    const shaderCompileResult = createShaderProgram(gl, {
      programId: "particle-shader",
      vertexSource: vsSource,
      fragmentSource: fsSource,
      attributeLocations: {
        aPosition: 0,
        aSize: 1,
        aColor: 2,
      },
    });

    if (!shaderCompileResult.success || !shaderCompileResult.programInfo) {
      console.error("셰이더 컴파일 에러:", shaderCompileResult.errorMessage);
      throw new Error(
        "셰이더 프로그램 생성 실패: " +
          (shaderCompileResult.errorMessage || "알 수 없는 오류")
      );
    }

    console.log("셰이더 컴파일 성공");
    // 셰이더 프로그램 설정
    shaderProgram = new ShaderProgram(
      gl,
      shaderCompileResult.program,
      shaderCompileResult.programInfo.attribLocations,
      shaderCompileResult.programInfo.uniformLocations
    );

    // 빈 파티클 버퍼 생성
    createEmptyParticleBuffers(bufferHelper, vaoHelper);

    console.log("파티클 셰이더 초기화 완료");
  } catch (error) {
    console.error("셰이더 초기화 오류:", error);
    throw error;
  }
}

// 셰이더 프로그램 생성
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

// 셰이더 생성 및 컴파일 (개선된 버전)
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
    console.error("셰이더 컴파일 오류:", info);
    console.error("셰이더 소스:", source);
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

// 빈 파티클 버퍼 생성
function createEmptyParticleBuffers(
  bufferHelper: BufferHelper,
  vaoHelper: VAOHelper
): void {
  if (!gl) return;

  const maxParticles = 5000; // 최대 파티클 수 증가 (1000 -> 5000)

  // 빈 버퍼 데이터 생성
  const positions = new Float32Array(maxParticles * 2); // x, y
  const sizes = new Float32Array(maxParticles); // 크기
  const colors = new Float32Array(maxParticles * 4); // r, g, b, a

  // 위치 버퍼 생성
  const positionBufferResult = bufferHelper.createBuffer({
    bufferId: "particlePosition",
    type: WebGLBufferType.VERTEX,
    data: positions,
    usage: WebGLBufferUsage.DYNAMIC,
  });

  if (positionBufferResult.success && positionBufferResult.buffer) {
    particleBuffers.set("particlePosition", positionBufferResult.buffer);
  }

  // 크기 버퍼 생성
  const sizeBufferResult = bufferHelper.createBuffer({
    bufferId: "particleSize",
    type: WebGLBufferType.VERTEX,
    data: sizes,
    usage: WebGLBufferUsage.DYNAMIC,
  });

  if (sizeBufferResult.success && sizeBufferResult.buffer) {
    particleBuffers.set("particleSize", sizeBufferResult.buffer);
  }

  // 색상 버퍼 생성
  const colorBufferResult = bufferHelper.createBuffer({
    bufferId: "particleColor",
    type: WebGLBufferType.VERTEX,
    data: colors,
    usage: WebGLBufferUsage.DYNAMIC,
  });

  if (colorBufferResult.success && colorBufferResult.buffer) {
    particleBuffers.set("particleColor", colorBufferResult.buffer);
  }

  // VAO 생성
  const vaoResult = vaoHelper.createVAO(
    {
      vaoId: particleVaoId,
      programId: "particle-shader",
      attributes: [
        {
          bufferId: "particlePosition",
          name: "0", // aPosition
          size: 2,
          type: "FLOAT",
        },
        {
          bufferId: "particleSize",
          name: "1", // aSize
          size: 1,
          type: "FLOAT",
        },
        {
          bufferId: "particleColor",
          name: "2", // aColor
          size: 4,
          type: "FLOAT",
        },
      ],
    },
    particleBuffers
  );

  if (vaoResult.success && vaoResult.vao && renderer) {
    renderer.registerVAO(particleVaoId, vaoResult.vao);
    console.log("파티클 버퍼 및 VAO 생성 완료");
  } else {
    console.error("VAO 생성 실패:", vaoResult.errorMessage);
  }
}

// 캔버스 크기 조정
function resizeCanvas(width: number, height: number): any {
  if (!canvas) return null;

  canvas.width = width;
  canvas.height = height;

  // 이미터 위치 업데이트
  if (!emitterX || !emitterY) {
    emitterX = width / 2;
    emitterY = height / 2;
  }

  // WebGL 모드일 때 뷰포트 설정
  if (useWebGL && gl && renderer) {
    renderer.setViewport(0, 0, width, height);

    // 셰이더가 있으면 프로젝션 매트릭스 업데이트
    if (shaderProgram) {
      const projectionMatrix = createOrthographicMatrix(
        0,
        width,
        height,
        0,
        -1,
        1
      );
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

// 이미터 위치 업데이트 (마우스 추적 등)
function updateEmitterPosition(x?: number, y?: number): any {
  if (x !== undefined && y !== undefined) {
    emitterX = x;
    emitterY = y;
  }
  return { x: emitterX, y: emitterY };
}

// 파티클 효과 시작
function startEffect(type: ParticleEffectType, options: any = {}): any {
  effectType = type;
  effectOptions = {
    particleCount: 100,
    gravity: 0.1,
    wind: 0,
    minSize: 2,
    maxSize: 8,
    minLife: 30,
    maxLife: 100,
    speed: 1,
    spread: 1,
    fadeOut: true,
    shrink: false,
    ...options,
  };

  // 최대 파티클 수 제한 (버퍼 크기 초과 방지)
  effectOptions.particleCount = Math.min(effectOptions.particleCount, 5000);

  // 이미터 위치 설정
  if (options.x !== undefined) emitterX = options.x;
  if (options.y !== undefined) emitterY = options.y;

  // 색상 기본값 설정
  if (!effectOptions.colors || effectOptions.colors.length === 0) {
    switch (type) {
      case ParticleEffectType.EXPLOSION:
        effectOptions.colors = ["#ff0000", "#ffff00", "#ff7700", "#ff00ff"];
        break;
      case ParticleEffectType.FOUNTAIN:
        effectOptions.colors = ["#00aaff", "#0077ff", "#00ddff", "#ffffff"];
        break;
      case ParticleEffectType.SNOW:
        effectOptions.colors = ["#ffffff", "#f0f0f0", "#dddddd"];
        break;
      case ParticleEffectType.CONFETTI:
        effectOptions.colors = [
          "#ff0000",
          "#00ff00",
          "#0000ff",
          "#ffff00",
          "#00ffff",
          "#ff00ff",
        ];
        break;
      case ParticleEffectType.FIRE:
        effectOptions.colors = ["#ff0000", "#ff7700", "#ffff00", "#ffaa00"];
        break;
      case ParticleEffectType.SMOKE:
        effectOptions.colors = ["#666666", "#999999", "#cccccc", "#dddddd"];
        break;
      default:
        effectOptions.colors = ["#ffffff"];
    }
  }

  // 효과 타입별 특성 설정
  switch (type) {
    case ParticleEffectType.EXPLOSION:
      createExplosionParticles();
      break;
    case ParticleEffectType.FOUNTAIN:
      // 분수는 계속 파티클 생성
      running = true;
      break;
    case ParticleEffectType.SNOW:
      createSnowParticles();
      running = true;
      break;
    case ParticleEffectType.CONFETTI:
      createConfettiParticles();
      break;
    case ParticleEffectType.FIRE:
      running = true;
      break;
    case ParticleEffectType.SMOKE:
      running = true;
      break;
  }

  // 애니메이션 시작
  if (!frameId) {
    lastTimestamp = performance.now();
    console.log("animation started......");
    frameId = requestAnimationFrame(animate);
  }

  sendEvent("effectStarted", { effectType: type });
  return { effectStarted: true, effectType: type };
}

// 파티클 효과 중지
function stopEffect(): any {
  running = false;

  // 애니메이션 중지 (모든 파티클이 소멸한 후)
  // 현재 frameId는 중지하지 않고, 모든 파티클이 사라질 때까지 기다림

  sendEvent("effectStopped");
  return { effectStopped: true };
}

// 애니메이션 루프
function animate(timestamp: number): void {
  if (!canvas) return;

  const deltaTime = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  // 배경 지우기
  if (useWebGL && gl && renderer) {
    renderer.clear();
  } else if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    return; // 컨텍스트가 없으면 종료
  }

  // 효과가 계속 실행 중인 경우 새 파티클 생성
  if (running && effectType) {
    switch (effectType) {
      case ParticleEffectType.FOUNTAIN:
        createFountainParticles(2); // 프레임당 파티클 수
        break;
      case ParticleEffectType.SNOW:
        if (particles.length < effectOptions.particleCount) {
          createSnowParticles(1);
        }
        break;
      case ParticleEffectType.FIRE:
        createFireParticles(3);
        break;
      case ParticleEffectType.SMOKE:
        createSmokeParticles(1);
        break;
    }
  }

  // 파티클 업데이트 및 렌더링
  updateParticles(deltaTime / 16); // 16ms(60fps)를 기준으로 정규화

  // WebGL 모드에서 렌더링
  if (useWebGL) {
    renderParticlesWebGL();
  }

  // 모든 파티클이 사라지고 효과가 중지된 경우, 애니메이션 중지
  if (particles.length === 0 && !running) {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }

    sendEvent("animationStopped");
    return;
  }

  // 현재 파티클 통계 전송
  sendEvent("particleStats", { count: particles.length });

  // 다음 프레임 요청
  frameId = requestAnimationFrame(animate);
}

// WebGL을 사용하여 파티클 렌더링
function renderParticlesWebGL(): void {
  if (!gl || !renderer || !shaderProgram) return;

  if (particles.length === 0) {
    console.log("렌더링할 파티클이 없음");
    return;
  }

  console.log(`WebGL 파티클 렌더링: ${particles.length}개 파티클`);

  try {
    // 렌더링 시작
    renderer.useShader(shaderProgram);

    // 프로젝션 매트릭스 설정 (직교 투영)
    const projectionMatrix = createOrthographicMatrix(
      0,
      canvas!.width,
      canvas!.height,
      0,
      -1,
      1
    );

    // 셰이더 프로그램을 다시 사용하여 확실하게 활성화
    shaderProgram.use();

    // 프로젝션 매트릭스 설정
    try {
      shaderProgram.setUniformMatrix4fv(
        "uProjectionMatrix",
        false,
        projectionMatrix
      );
    } catch (error) {
      console.error("프로젝션 매트릭스 설정 오류:", error);
    }

    // 파티클 데이터 업데이트
    updateParticleBuffers();

    // 안전하게 파티클 수 제한 (버퍼 오버플로우 방지)
    const MAX_PARTICLES = 5000;
    const particleCount = Math.min(particles.length, MAX_PARTICLES);

    // 블렌딩 활성화 (파티클의 투명도 처리)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 파티클 렌더링
    renderer.draw(
      particleVaoId,
      PrimitiveType.POINTS, // 점으로 렌더링
      particleCount, // 제한된 파티클 수
      false, // 인덱스 사용 안 함
      0
    );

    // 블렌딩 비활성화
    gl.disable(gl.BLEND);

    console.log("WebGL 렌더링 완료");

    // 렌더링 완료 이벤트
    sendEvent("renderComplete");
  } catch (error) {
    console.error("WebGL 파티클 렌더링 오류:", error);
  }
}

// 파티클 버퍼 업데이트
function updateParticleBuffers(): void {
  if (!gl || !renderer) return;

  try {
    const { buffer: bufferHelper } = renderer.getHelpers();
    const MAX_PARTICLES = 5000;
    const count = Math.min(particles.length, MAX_PARTICLES); // 버퍼 크기 제한

    if (count === 0) {
      console.log("업데이트할 파티클이 없음");
      return;
    }

    console.log(`파티클 버퍼 업데이트: ${count}개 파티클`);

    // 버퍼 데이터 준비
    const positions = new Float32Array(count * 2); // x, y
    const sizes = new Float32Array(count); // 크기
    const colors = new Float32Array(count * 4); // r, g, b, a

    // 파티클 데이터 채우기
    for (let i = 0; i < count; i++) {
      const p = particles[i];

      // 위치
      positions[i * 2] = p.x;
      positions[i * 2 + 1] = p.y;

      // 크기 - 훨씬 크게 조정
      sizes[i] = p.size * 5; // 점 크기 대폭 증가

      // 색상 (HTML 색상 문자열 파싱)
      const color = parseColor(p.color);
      colors[i * 4] = color.r; // R
      colors[i * 4 + 1] = color.g; // G
      colors[i * 4 + 2] = color.b; // B
      colors[i * 4 + 3] = p.opacity; // A
    }

    // 우리가 저장한 버퍼 맵에서 버퍼를 가져옴
    const positionBuffer = particleBuffers.get("particlePosition");
    const sizeBuffer = particleBuffers.get("particleSize");
    const colorBuffer = particleBuffers.get("particleColor");

    // 버퍼가 존재하면 업데이트
    if (positionBuffer) {
      bufferHelper.updateBufferData(
        WebGLBufferType.VERTEX,
        positionBuffer,
        positions,
        0
      );
    }

    if (sizeBuffer) {
      bufferHelper.updateBufferData(
        WebGLBufferType.VERTEX,
        sizeBuffer,
        sizes,
        0
      );
    }

    if (colorBuffer) {
      bufferHelper.updateBufferData(
        WebGLBufferType.VERTEX,
        colorBuffer,
        colors,
        0
      );
    }

    console.log("파티클 버퍼 업데이트 완료");
  } catch (error) {
    console.error("파티클 버퍼 업데이트 오류:", error);
  }
}

// HTML 색상 문자열을 RGB 값으로 변환
function parseColor(color: string): { r: number; g: number; b: number } {
  // #RRGGBB 형식 처리
  if (color.startsWith("#")) {
    const r = parseInt(color.substring(1, 3), 16) / 255;
    const g = parseInt(color.substring(3, 5), 16) / 255;
    const b = parseInt(color.substring(5, 7), 16) / 255;
    return { r, g, b };
  }

  // 기본값으로 흰색 반환
  return { r: 1, g: 1, b: 1 };
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

// 파티클 업데이트 및 렌더링
function updateParticles(deltaFactor: number): void {
  if (!ctx || !canvas) return;

  const gravity = effectOptions.gravity * deltaFactor;
  const wind = effectOptions.wind * deltaFactor;

  // 각 파티클 업데이트
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    // 위치 업데이트
    p.x += p.vx * deltaFactor;
    p.y += p.vy * deltaFactor;

    // 중력 및 바람 적용
    p.vy += gravity;
    p.vx += wind;

    // 생명력 감소
    p.life--;

    // 페이드 아웃 효과
    if (effectOptions.fadeOut) {
      p.opacity = p.life / p.maxLife;
    }

    // 축소 효과
    if (effectOptions.shrink) {
      p.size = (p.life / p.maxLife) * (p.initialSize || p.size);
    }

    // 회전 업데이트 (있는 경우)
    if (p.rotation !== undefined && p.rotationSpeed !== undefined) {
      p.rotation += p.rotationSpeed * deltaFactor;
    }

    // 파티클 그리기
    drawParticle(p);

    // 파티클 제거 조건 확인
    if (
      p.life <= 0 ||
      p.y > canvas.height + 50 ||
      p.x < -50 ||
      p.x > canvas.width + 50
    ) {
      particles.splice(i, 1);
    }
  }
}

// 파티클 그리기
function drawParticle(p: Particle): void {
  if (!ctx) return;

  ctx.globalAlpha = p.opacity;

  // 파티클 모양에 따라 그리기
  switch (p.shape) {
    case "square":
      drawSquareParticle(p);
      break;
    case "rect":
      drawRectParticle(p);
      break;
    case "line":
      drawLineParticle(p);
      break;
    case "star":
      drawStarParticle(p);
      break;
    case "image":
      // 이미지 파티클 그리기 (필요한 경우 구현)
      break;
    case "circle":
    default:
      drawCircleParticle(p);
      break;
  }

  ctx.globalAlpha = 1.0;
}

// 원형 파티클 그리기
function drawCircleParticle(p: Particle): void {
  if (!ctx) return;

  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
}

// 사각형 파티클 그리기
function drawSquareParticle(p: Particle): void {
  if (!ctx) return;

  const halfSize = p.size / 2;

  if (p.rotation) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    ctx.fillRect(-halfSize, -halfSize, p.size, p.size);
    ctx.restore();
  } else {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - halfSize, p.y - halfSize, p.size, p.size);
  }
}

// 직사각형 파티클 그리기
function drawRectParticle(p: Particle): void {
  if (!ctx) return;

  const width = p.width || p.size * 2;
  const height = p.height || p.size;

  if (p.rotation) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.restore();
  } else {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - width / 2, p.y - height / 2, width, height);
  }
}

// 선 파티클 그리기
function drawLineParticle(p: Particle): void {
  if (!ctx) return;

  const length = p.length || p.size * 3;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation || Math.atan2(p.vy, p.vx));

  ctx.beginPath();
  ctx.moveTo(-length / 2, 0);
  ctx.lineTo(length / 2, 0);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = p.size;
  ctx.stroke();

  ctx.restore();
}

// 별 모양 파티클 그리기
function drawStarParticle(p: Particle): void {
  if (!ctx) return;

  const spikes = p.spikes || 5;
  const outerRadius = p.size;
  const innerRadius = p.size / 2;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation || 0);

  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(0, -outerRadius);

  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(Math.cos(rot) * outerRadius, Math.sin(rot) * outerRadius);
    rot += step;

    ctx.lineTo(Math.cos(rot) * innerRadius, Math.sin(rot) * innerRadius);
    rot += step;
  }

  ctx.lineTo(0, -outerRadius);
  ctx.closePath();

  ctx.fillStyle = p.color;
  ctx.fill();

  ctx.restore();
}

// 폭발 효과 파티클 생성
function createExplosionParticles(): void {
  const count = effectOptions.particleCount;
  const colors = effectOptions.colors;

  for (let i = 0; i < count; i++) {
    // 랜덤 각도 및 속도
    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 5 + 2) * effectOptions.speed;

    const size =
      Math.random() * (effectOptions.maxSize - effectOptions.minSize) +
      effectOptions.minSize;
    const life =
      Math.random() * (effectOptions.maxLife - effectOptions.minLife) +
      effectOptions.minLife;

    particles.push({
      x: emitterX,
      y: emitterY,
      vx: Math.cos(angle) * speed * effectOptions.spread,
      vy: Math.sin(angle) * speed * effectOptions.spread,
      size: size,
      initialSize: size,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 1,
      life: life,
      maxLife: life,
      shape: Math.random() < 0.3 ? "square" : "circle",
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
    });
  }
}

// 분수 효과 파티클 생성
function createFountainParticles(count: number): void {
  const colors = effectOptions.colors;

  for (let i = 0; i < count; i++) {
    // 위쪽 방향으로 약간의 랜덤성을 가진 각도
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
    const speed = (Math.random() * 3 + 5) * effectOptions.speed;

    const size =
      Math.random() * (effectOptions.maxSize - effectOptions.minSize) +
      effectOptions.minSize;
    const life =
      Math.random() * (effectOptions.maxLife - effectOptions.minLife) +
      effectOptions.minLife;

    particles.push({
      x: emitterX,
      y: emitterY,
      vx: Math.cos(angle) * speed * effectOptions.spread,
      vy: Math.sin(angle) * speed,
      size: size,
      initialSize: size,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 1,
      life: life,
      maxLife: life,
    });
  }
}

// 눈 효과 파티클 생성
function createSnowParticles(count: number = 20): void {
  if (!canvas) return;

  const colors = effectOptions.colors;

  for (let i = 0; i < count; i++) {
    const x = Math.random() * canvas.width;
    const y = -10;

    const size =
      Math.random() * (effectOptions.maxSize - effectOptions.minSize) +
      effectOptions.minSize;
    const life =
      Math.random() * (effectOptions.maxLife - effectOptions.minLife) +
      effectOptions.minLife;

    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * effectOptions.spread,
      vy: (Math.random() * 1 + 0.5) * effectOptions.speed,
      size: size,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 0.8,
      life: life,
      maxLife: life,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.03,
      shape: Math.random() < 0.3 ? "star" : "circle",
    });
  }
}

// 색종이 효과 파티클 생성
function createConfettiParticles(): void {
  if (!canvas) return;

  const count = effectOptions.particleCount;
  const colors = effectOptions.colors;

  for (let i = 0; i < count; i++) {
    const x = emitterX + (Math.random() - 0.5) * 100 * effectOptions.spread;
    const y = emitterY;

    const size =
      Math.random() * (effectOptions.maxSize - effectOptions.minSize) +
      effectOptions.minSize;
    const life =
      Math.random() * (effectOptions.maxLife - effectOptions.minLife) +
      effectOptions.minLife;

    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 2 * effectOptions.spread,
      vy: Math.random() * -3 * effectOptions.speed,
      size: size,
      width: size * (1 + Math.random() * 2),
      height: size * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 1,
      life: life,
      maxLife: life,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      shape: Math.random() < 0.5 ? "rect" : "square",
    });
  }
}

// 불 효과 파티클 생성
function createFireParticles(count: number): void {
  const colors = effectOptions.colors;

  for (let i = 0; i < count; i++) {
    // 위쪽 방향
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    const speed = (Math.random() * 1 + 1) * effectOptions.speed;

    const size =
      Math.random() * (effectOptions.maxSize - effectOptions.minSize) +
      effectOptions.minSize;
    const life =
      Math.random() * (effectOptions.maxLife - effectOptions.minLife) +
      effectOptions.minLife;

    // 위치에 약간의 랜덤성 추가
    const offsetX = (Math.random() - 0.5) * 20 * effectOptions.spread;

    particles.push({
      x: emitterX + offsetX,
      y: emitterY,
      vx: Math.cos(angle) * speed * 0.2,
      vy: Math.sin(angle) * speed,
      size: size,
      initialSize: size,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 0.8,
      life: life,
      maxLife: life,
    });
  }
}

// 연기 효과 파티클 생성
function createSmokeParticles(count: number): void {
  const colors = effectOptions.colors;

  for (let i = 0; i < count; i++) {
    // 위쪽 방향
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    const speed = (Math.random() * 0.5 + 0.2) * effectOptions.speed;

    const size =
      Math.random() * (effectOptions.maxSize - effectOptions.minSize) +
      effectOptions.minSize;
    const life =
      Math.random() * (effectOptions.maxLife - effectOptions.minLife) +
      effectOptions.minLife;

    // 위치에 약간의 랜덤성 추가
    const offsetX = (Math.random() - 0.5) * 10 * effectOptions.spread;

    particles.push({
      x: emitterX + offsetX,
      y: emitterY,
      vx: Math.cos(angle) * speed * 0.5,
      vy: Math.sin(angle) * speed,
      size: size,
      initialSize: size * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 0.7,
      life: life,
      maxLife: life,
    });
  }
}

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
self.postMessage({ type: WorkerMessageType.READY });
