// 파티클 시스템 워커 - OffscreenCanvas 활용
// 다양한 파티클 효과 구현

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

// 메시지 타입 정의
interface InitMessage {
  type: "init";
  canvas: OffscreenCanvas;
}

interface StartEffectMessage {
  type: "startEffect";
  effectType: ParticleEffectType;
  options?: {
    x?: number;
    y?: number;
    particleCount?: number;
    gravity?: number;
    wind?: number;
    colors?: string[];
    minSize?: number;
    maxSize?: number;
    minLife?: number;
    maxLife?: number;
    spread?: number;
    speed?: number;
    fadeOut?: boolean;
    shrink?: boolean;
    [key: string]: any;
  };
}

interface StopEffectMessage {
  type: "stopEffect";
}

interface UpdateMessage {
  type: "update";
  mouseX?: number;
  mouseY?: number;
}

interface ResizeMessage {
  type: "resize";
  width: number;
  height: number;
}

type WorkerMessage =
  | InitMessage
  | StartEffectMessage
  | StopEffectMessage
  | UpdateMessage
  | ResizeMessage;

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

// 메시지 핸들러
self.onmessage = (event: MessageEvent) => {
  const message = event.data as WorkerMessage;

  try {
    switch (message.type) {
      case "init":
        initializeCanvas(message.canvas);
        break;

      case "startEffect":
        startEffect(message.effectType, message.options);
        break;

      case "stopEffect":
        stopEffect();
        break;

      case "update":
        updateEmitterPosition(message.mouseX, message.mouseY);
        break;

      case "resize":
        resizeCanvas(message.width, message.height);
        break;

      default:
        throw new Error("알 수 없는 메시지 타입");
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "알 수 없는 오류",
    });
  }
};

// 캔버스 초기화
function initializeCanvas(offscreenCanvas: OffscreenCanvas): void {
  canvas = offscreenCanvas;
  ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("2D 컨텍스트를 생성할 수 없습니다.");
  }

  // 초기 위치를 캔버스 중앙으로 설정
  emitterX = canvas.width / 2;
  emitterY = canvas.height / 2;

  self.postMessage({ type: "initialized" });
}

// 캔버스 크기 조정
function resizeCanvas(width: number, height: number): void {
  if (!canvas) return;

  canvas.width = width;
  canvas.height = height;

  // 이미터 위치 업데이트
  if (!emitterX || !emitterY) {
    emitterX = width / 2;
    emitterY = height / 2;
  }

  self.postMessage({ type: "resized" });
}

// 이미터 위치 업데이트 (마우스 추적 등)
function updateEmitterPosition(x?: number, y?: number): void {
  if (x !== undefined && y !== undefined) {
    emitterX = x;
    emitterY = y;
  }
}

// 파티클 효과 시작
function startEffect(type: ParticleEffectType, options: any = {}): void {
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
    frameId = requestAnimationFrame(animate);
  }

  self.postMessage({ type: "effectStarted", effectType: type });
}

// 파티클 효과 중지
function stopEffect(): void {
  running = false;

  // 애니메이션 중지 (모든 파티클이 소멸한 후)
  // 현재 frameId는 중지하지 않고, 모든 파티클이 사라질 때까지 기다림

  self.postMessage({ type: "effectStopped" });
}

// 애니메이션 루프
function animate(timestamp: number): void {
  if (!canvas || !ctx) return;

  const deltaTime = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  // 배경 지우기
  ctx.clearRect(0, 0, canvas.width, canvas.height);

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

  // 모든 파티클이 사라지고 효과가 중지된 경우, 애니메이션 중지
  if (particles.length === 0 && !running) {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }

    self.postMessage({ type: "animationStopped" });
    return;
  }

  // 다음 프레임 요청
  frameId = requestAnimationFrame(animate);
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

// 워커 초기 메시지
self.postMessage({ type: "ready" });
