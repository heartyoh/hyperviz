/**
 * OffscreenCanvas 워커
 * 메인 스레드에서 전송된 OffscreenCanvas를 처리하는 워커 스크립트입니다.
 */
import {
  CanvasCommand,
  CanvasCommandType,
  Canvas2DCommandType,
  CanvasInitCommand,
  CanvasResizeCommand,
  CanvasRenderCommand,
  Canvas2DRenderCommand,
  Canvas2DOperation,
  CanvasWebGLCommandType,
  CanvasWebGLRenderCommand,
  WorkerMessage,
  WorkerMessageType,
  CanvasEventType,
  ShapeType,
} from "../types.js";

// 캔버스 및 컨텍스트 상태
let canvas: OffscreenCanvas | null = null;
let ctx:
  | OffscreenCanvasRenderingContext2D
  | WebGLRenderingContext
  | WebGL2RenderingContext
  | null = null;
let contextType: string = "2d";
let renderId: number = 0;
let devicePixelRatio: number = 1;

// 메시지 핸들러 등록
self.onmessage = (event: MessageEvent): void => {
  const message = event.data as WorkerMessage;

  // 메시지 처리
  if (!message || !message.type) {
    sendError("잘못된 메시지 포맷");
    return;
  }

  try {
    if (message.type === WorkerMessageType.COMMAND) {
      const command = message.data as CanvasCommand;

      // 오프스크린 캔버스 설정 특수 처리
      if (
        command.type === CanvasCommandType.INIT &&
        event.data.transfer?.length
      ) {
        canvas = event.data.transfer[0] as OffscreenCanvas;
      }

      // 명령 처리
      const result = processCommand(command);

      // 결과 응답
      sendResponse(message.id!, command.id!, true, result);
    }
  } catch (error: any) {
    sendError(error.message || "알 수 없는 오류", message.id);
    sendResponse(
      message.id!,
      message.data?.id || "unknown",
      false,
      null,
      error.message
    );
  }
};

/**
 * 명령 처리
 * @param command 캔버스 명령
 * @returns 처리 결과
 */
function processCommand(command: CanvasCommand): any {
  if (!command || !command.type) {
    throw new Error("잘못된 명령 포맷");
  }

  switch (command.type) {
    case CanvasCommandType.INIT:
      return initCanvas(command as CanvasInitCommand);

    case CanvasCommandType.RESIZE:
      return resizeCanvas(command as CanvasResizeCommand);

    case CanvasCommandType.CLEAR:
      return clearCanvas();

    case CanvasCommandType.RENDER:
      return renderCanvas(command as CanvasRenderCommand);

    case CanvasCommandType.DISPOSE:
      return disposeCanvas();

    default:
      throw new Error(`지원되지 않는 명령: ${command.type}`);
  }
}

/**
 * 캔버스 초기화
 * @param command 초기화 명령
 * @returns 초기화 결과
 */
function initCanvas(command: CanvasInitCommand): any {
  if (!canvas) {
    throw new Error("OffscreenCanvas가 전송되지 않았습니다.");
  }

  const params = command.params;
  contextType = params.contextType;
  devicePixelRatio = params.devicePixelRatio || 1;

  // 캔버스 크기 설정
  if (params.width && params.height) {
    canvas.width = params.width;
    canvas.height = params.height;
  }

  // 컨텍스트 생성
  try {
    // 컨텍스트 타입에 따라 적절한 컨텍스트 얻기
    if (contextType === "2d") {
      ctx = canvas.getContext("2d", params.contextAttributes || {});
    } else if (contextType === "webgl") {
      ctx = canvas.getContext("webgl", params.contextAttributes || {});
    } else if (contextType === "webgl2") {
      ctx = canvas.getContext("webgl2", params.contextAttributes || {});
    } else {
      throw new Error(`지원되지 않는 컨텍스트 타입: ${contextType}`);
    }

    if (!ctx) {
      throw new Error(`컨텍스트를 생성할 수 없습니다: ${contextType}`);
    }

    // 2D 컨텍스트 설정
    if (
      contextType === "2d" &&
      ctx instanceof OffscreenCanvasRenderingContext2D
    ) {
      setupCanvas2D(ctx);
    }

    sendEvent(CanvasEventType.READY, {
      width: canvas.width,
      height: canvas.height,
      contextType,
    });

    return {
      width: canvas.width,
      height: canvas.height,
      contextType,
    };
  } catch (error: any) {
    throw new Error(`컨텍스트 초기화 실패: ${error.message}`);
  }
}

/**
 * 2D 캔버스 기본 설정
 * @param ctx 2D 컨텍스트
 */
function setupCanvas2D(ctx: OffscreenCanvasRenderingContext2D): void {
  // 기본 설정 - 필요시 수정
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = "14px sans-serif";
}

/**
 * 캔버스 크기 조정
 * @param command 크기 조정 명령
 * @returns 크기 조정 결과
 */
function resizeCanvas(command: CanvasResizeCommand): any {
  if (!canvas) {
    throw new Error("캔버스가 초기화되지 않았습니다.");
  }

  const params = command.params;
  devicePixelRatio = params.devicePixelRatio || devicePixelRatio;

  canvas.width = params.width;
  canvas.height = params.height;

  // 2D 컨텍스트 재설정
  if (
    contextType === "2d" &&
    ctx instanceof OffscreenCanvasRenderingContext2D
  ) {
    setupCanvas2D(ctx);
  }

  sendEvent(CanvasEventType.RESIZE, {
    width: canvas.width,
    height: canvas.height,
  });

  return {
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * 캔버스 지우기
 * @returns 지우기 결과
 */
function clearCanvas(): boolean {
  if (!canvas || !ctx) {
    throw new Error("캔버스가 초기화되지 않았습니다.");
  }

  if (
    contextType === "2d" &&
    ctx instanceof OffscreenCanvasRenderingContext2D
  ) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else if (contextType === "webgl" || contextType === "webgl2") {
    const glCtx = ctx as WebGLRenderingContext | WebGL2RenderingContext;
    glCtx.clear(glCtx.COLOR_BUFFER_BIT | glCtx.DEPTH_BUFFER_BIT);
  }

  return true;
}

/**
 * 캔버스 렌더링
 * @param command 렌더링 명령
 * @returns 렌더링 결과
 */
function renderCanvas(command: CanvasRenderCommand): any {
  if (!canvas || !ctx) {
    throw new Error("캔버스가 초기화되지 않았습니다.");
  }

  renderId++;
  const startTime = performance.now();

  // 컨텍스트 타입에 따라 렌더링
  if (
    contextType === "2d" &&
    ctx instanceof OffscreenCanvasRenderingContext2D
  ) {
    render2D(command as Canvas2DRenderCommand, ctx);
  } else if (contextType === "webgl" || contextType === "webgl2") {
    renderWebGL(
      command as CanvasWebGLRenderCommand,
      ctx as WebGLRenderingContext | WebGL2RenderingContext
    );
  }

  const endTime = performance.now();

  // 렌더링 완료 이벤트 발송
  sendEvent(CanvasEventType.RENDER_COMPLETE, {
    renderId,
    time: endTime - startTime,
  });

  return {
    renderId,
    time: endTime - startTime,
  };
}

/**
 * 2D 컨텍스트 렌더링
 * @param command 2D 렌더링 명령
 * @param ctx 2D 컨텍스트
 */
function render2D(
  command: Canvas2DRenderCommand,
  ctx: OffscreenCanvasRenderingContext2D
): void {
  const params = command.params;

  if (!params || !params.operations || !Array.isArray(params.operations)) {
    return;
  }

  // 글로벌 설정 적용
  if (params.globalCompositeOperation) {
    ctx.globalCompositeOperation =
      params.globalCompositeOperation as GlobalCompositeOperation;
  }

  if (params.globalAlpha !== undefined) {
    ctx.globalAlpha = params.globalAlpha;
  }

  // 모든 작업 순차 처리
  params.operations.forEach((op) => {
    // 작업 전 상태 저장
    ctx.save();

    // 변환 적용
    if (op.transform) {
      const t = op.transform;
      if (Array.isArray(t) && t.length === 6) {
        ctx.transform(t[0], t[1], t[2], t[3], t[4], t[5]);
      }
    }

    // 유형별 작업 처리
    switch (op.type) {
      case Canvas2DCommandType.DRAW_IMAGE:
        drawImage(ctx, op as Canvas2DOperation);
        break;

      case Canvas2DCommandType.DRAW_SHAPE:
        drawShape(ctx, op as Canvas2DOperation);
        break;

      case Canvas2DCommandType.DRAW_TEXT:
        drawText(ctx, op as Canvas2DOperation);
        break;

      case Canvas2DCommandType.FILL_RECT:
        fillRect(ctx, op as Canvas2DOperation);
        break;

      case Canvas2DCommandType.STROKE_RECT:
        strokeRect(ctx, op as Canvas2DOperation);
        break;

      case Canvas2DCommandType.CLEAR_RECT:
        clearRect(ctx, op as Canvas2DOperation);
        break;

      case Canvas2DCommandType.PATH:
        drawPath(ctx, op as Canvas2DOperation);
        break;
    }

    // 작업 후 상태 복원
    ctx.restore();
  });
}

/**
 * 이미지 그리기
 * @param ctx 2D 컨텍스트
 * @param op 작업 정보
 */
function drawImage(
  ctx: OffscreenCanvasRenderingContext2D,
  op: Canvas2DOperation
): void {
  // 비트맵 변환 (필요시)
  if ((op as any).imageBitmap) {
    try {
      const imgOp = op as any;
      if (
        imgOp.sx !== undefined &&
        imgOp.sy !== undefined &&
        imgOp.sWidth !== undefined &&
        imgOp.sHeight !== undefined &&
        imgOp.dx !== undefined &&
        imgOp.dy !== undefined &&
        imgOp.dWidth !== undefined &&
        imgOp.dHeight !== undefined
      ) {
        ctx.drawImage(
          imgOp.imageBitmap,
          imgOp.sx,
          imgOp.sy,
          imgOp.sWidth,
          imgOp.sHeight,
          imgOp.dx,
          imgOp.dy,
          imgOp.dWidth,
          imgOp.dHeight
        );
      } else if (
        imgOp.dx !== undefined &&
        imgOp.dy !== undefined &&
        imgOp.dWidth !== undefined &&
        imgOp.dHeight !== undefined
      ) {
        ctx.drawImage(
          imgOp.imageBitmap,
          imgOp.dx,
          imgOp.dy,
          imgOp.dWidth,
          imgOp.dHeight
        );
      } else if (imgOp.dx !== undefined && imgOp.dy !== undefined) {
        ctx.drawImage(imgOp.imageBitmap, imgOp.dx, imgOp.dy);
      }
    } catch (error) {
      console.error("이미지 그리기 실패:", error);
    }
  }
}

/**
 * 도형 그리기
 * @param ctx 2D 컨텍스트
 * @param op 작업 정보
 */
function drawShape(
  ctx: OffscreenCanvasRenderingContext2D,
  op: Canvas2DOperation
): void {
  const shapeOp = op as any;
  if (!shapeOp.shape) return;

  // 스타일 적용
  applyStyle(ctx, op.style);

  const shape = shapeOp.shape;

  switch (shape.type) {
    case ShapeType.RECT:
      drawRect(ctx, shape, shapeOp.fill, shapeOp.stroke);
      break;

    case ShapeType.CIRCLE:
      drawCircle(ctx, shape, shapeOp.fill, shapeOp.stroke);
      break;

    case ShapeType.ELLIPSE:
      drawEllipse(ctx, shape, shapeOp.fill, shapeOp.stroke);
      break;

    case ShapeType.LINE:
      drawLine(ctx, shape);
      break;

    case ShapeType.POLYGON:
      drawPolygon(ctx, shape, shapeOp.fill, shapeOp.stroke);
      break;
  }
}

/**
 * 사각형 그리기
 * @param ctx 2D 컨텍스트
 * @param shape 도형 정보
 * @param fill 채우기 여부
 * @param stroke 윤곽선 여부
 */
function drawRect(
  ctx: OffscreenCanvasRenderingContext2D,
  shape: any,
  fill: boolean = true,
  stroke: boolean = true
): void {
  const x = shape.x || 0;
  const y = shape.y || 0;
  const width = shape.width || 0;
  const height = shape.height || 0;
  const radius = shape.radius;

  // 둥근 모서리 처리
  if (radius) {
    drawRoundRect(ctx, x, y, width, height, radius, fill, stroke);
  } else {
    if (fill) {
      ctx.fillRect(x, y, width, height);
    }

    if (stroke) {
      ctx.strokeRect(x, y, width, height);
    }
  }
}

/**
 * 둥근 모서리 사각형 그리기
 * @param ctx 2D 컨텍스트
 * @param x X 좌표
 * @param y Y 좌표
 * @param width 너비
 * @param height 높이
 * @param radius 모서리 반경
 * @param fill 채우기 여부
 * @param stroke 윤곽선 여부
 */
function drawRoundRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number | number[],
  fill: boolean = true,
  stroke: boolean = true
): void {
  let tl = 0,
    tr = 0,
    br = 0,
    bl = 0;

  // 반경 설정
  if (typeof radius === "number") {
    tl = tr = br = bl = radius;
  } else if (Array.isArray(radius)) {
    if (radius.length === 1) {
      tl = tr = br = bl = radius[0];
    } else if (radius.length === 2) {
      tl = br = radius[0];
      tr = bl = radius[1];
    } else if (radius.length === 4) {
      [tl, tr, br, bl] = radius;
    }
  }

  // 경로 그리기
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + width - tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + tr);
  ctx.lineTo(x + width, y + height - br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
  ctx.lineTo(x + bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();

  // 채우기 및 윤곽선
  if (fill) {
    ctx.fill();
  }

  if (stroke) {
    ctx.stroke();
  }
}

/**
 * 원 그리기
 * @param ctx 2D 컨텍스트
 * @param shape 도형 정보
 * @param fill 채우기 여부
 * @param stroke 윤곽선 여부
 */
function drawCircle(
  ctx: OffscreenCanvasRenderingContext2D,
  shape: any,
  fill: boolean = true,
  stroke: boolean = true
): void {
  const x = shape.x || 0;
  const y = shape.y || 0;
  const radius = shape.radius || 0;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);

  if (fill) {
    ctx.fill();
  }

  if (stroke) {
    ctx.stroke();
  }
}

/**
 * 타원 그리기
 * @param ctx 2D 컨텍스트
 * @param shape 도형 정보
 * @param fill 채우기 여부
 * @param stroke 윤곽선 여부
 */
function drawEllipse(
  ctx: OffscreenCanvasRenderingContext2D,
  shape: any,
  fill: boolean = true,
  stroke: boolean = true
): void {
  const x = shape.x || 0;
  const y = shape.y || 0;
  const radiusX = shape.radiusX || 0;
  const radiusY = shape.radiusY || 0;
  const rotation = shape.rotation || 0;

  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2);

  if (fill) {
    ctx.fill();
  }

  if (stroke) {
    ctx.stroke();
  }
}

/**
 * 선 그리기
 * @param ctx 2D 컨텍스트
 * @param shape 도형 정보
 */
function drawLine(ctx: OffscreenCanvasRenderingContext2D, shape: any): void {
  const x1 = shape.x1 || 0;
  const y1 = shape.y1 || 0;
  const x2 = shape.x2 || 0;
  const y2 = shape.y2 || 0;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/**
 * 다각형 그리기
 * @param ctx 2D 컨텍스트
 * @param shape 도형 정보
 * @param fill 채우기 여부
 * @param stroke 윤곽선 여부
 */
function drawPolygon(
  ctx: OffscreenCanvasRenderingContext2D,
  shape: any,
  fill: boolean = true,
  stroke: boolean = true
): void {
  const points = shape.points;

  if (!points || !Array.isArray(points) || points.length < 2) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }

  ctx.closePath();

  if (fill) {
    ctx.fill();
  }

  if (stroke) {
    ctx.stroke();
  }
}

/**
 * 경로 그리기
 * @param ctx 2D 컨텍스트
 * @param op 작업 정보
 */
function drawPath(
  ctx: OffscreenCanvasRenderingContext2D,
  op: Canvas2DOperation
): void {
  const pathOp = op as any;
  const commands = pathOp.commands;

  if (!commands || !Array.isArray(commands) || commands.length === 0) {
    return;
  }

  // 스타일 적용
  applyStyle(ctx, op.style);

  ctx.beginPath();

  for (const cmd of commands) {
    const type = cmd.type;
    const args = cmd.args || [];

    switch (type) {
      case "moveTo":
        ctx.moveTo(args[0], args[1]);
        break;

      case "lineTo":
        ctx.lineTo(args[0], args[1]);
        break;

      case "quadraticCurveTo":
        ctx.quadraticCurveTo(args[0], args[1], args[2], args[3]);
        break;

      case "bezierCurveTo":
        ctx.bezierCurveTo(args[0], args[1], args[2], args[3], args[4], args[5]);
        break;

      case "arc":
        ctx.arc(args[0], args[1], args[2], args[3], args[4], args[5]);
        break;

      case "arcTo":
        ctx.arcTo(args[0], args[1], args[2], args[3], args[4]);
        break;

      case "closePath":
        ctx.closePath();
        break;
    }
  }

  // 채우기 및 윤곽선
  if (pathOp.fill) {
    ctx.fill(pathOp.fillRule || "nonzero");
  }

  if (pathOp.stroke) {
    ctx.stroke();
  }
}

/**
 * 텍스트 그리기
 * @param ctx 2D 컨텍스트
 * @param op 작업 정보
 */
function drawText(
  ctx: OffscreenCanvasRenderingContext2D,
  op: Canvas2DOperation
): void {
  const textOp = op as any;
  if (!textOp.text) return;

  // 텍스트 스타일 적용
  if (textOp.font) ctx.font = textOp.font;
  if (textOp.textAlign) ctx.textAlign = textOp.textAlign;
  if (textOp.textBaseline) ctx.textBaseline = textOp.textBaseline;
  if (textOp.direction) ctx.direction = textOp.direction;

  // 스타일 적용
  applyStyle(ctx, op.style);

  const x = textOp.x || 0;
  const y = textOp.y || 0;
  const maxWidth = textOp.maxWidth;

  // 텍스트 렌더링
  if (textOp.fill !== false) {
    if (maxWidth !== undefined) {
      ctx.fillText(textOp.text, x, y, maxWidth);
    } else {
      ctx.fillText(textOp.text, x, y);
    }
  }

  if (textOp.stroke) {
    if (maxWidth !== undefined) {
      ctx.strokeText(textOp.text, x, y, maxWidth);
    } else {
      ctx.strokeText(textOp.text, x, y);
    }
  }
}

/**
 * 사각형 채우기
 * @param ctx 2D 컨텍스트
 * @param op 작업 정보
 */
function fillRect(
  ctx: OffscreenCanvasRenderingContext2D,
  op: Canvas2DOperation
): void {
  const rectOp = op as any;
  const x = rectOp.x || 0;
  const y = rectOp.y || 0;
  const width = rectOp.width || 0;
  const height = rectOp.height || 0;

  // 색상 설정
  if (rectOp.fillStyle) {
    ctx.fillStyle = rectOp.fillStyle;
  }

  ctx.fillRect(x, y, width, height);
}

/**
 * 사각형 윤곽선
 * @param ctx 2D 컨텍스트
 * @param op 작업 정보
 */
function strokeRect(
  ctx: OffscreenCanvasRenderingContext2D,
  op: Canvas2DOperation
): void {
  const rectOp = op as any;
  const x = rectOp.x || 0;
  const y = rectOp.y || 0;
  const width = rectOp.width || 0;
  const height = rectOp.height || 0;

  // 선 스타일 설정
  if (rectOp.strokeStyle) ctx.strokeStyle = rectOp.strokeStyle;
  if (rectOp.lineWidth) ctx.lineWidth = rectOp.lineWidth;
  if (rectOp.lineJoin) ctx.lineJoin = rectOp.lineJoin;
  if (rectOp.lineCap) ctx.lineCap = rectOp.lineCap;
  if (rectOp.miterLimit) ctx.miterLimit = rectOp.miterLimit;

  ctx.strokeRect(x, y, width, height);
}

/**
 * 사각형 지우기
 * @param ctx 2D 컨텍스트
 * @param op 작업 정보
 */
function clearRect(
  ctx: OffscreenCanvasRenderingContext2D,
  op: Canvas2DOperation
): void {
  const rectOp = op as any;
  const x = rectOp.x || 0;
  const y = rectOp.y || 0;
  const width = rectOp.width || 0;
  const height = rectOp.height || 0;

  ctx.clearRect(x, y, width, height);
}

/**
 * 스타일 적용
 * @param ctx 2D 컨텍스트
 * @param style 스타일 객체
 */
function applyStyle(ctx: OffscreenCanvasRenderingContext2D, style: any): void {
  if (!style) return;

  // 채우기 스타일
  if (style.fillStyle) {
    ctx.fillStyle = style.fillStyle;
  }

  // 선 스타일
  if (style.strokeStyle) ctx.strokeStyle = style.strokeStyle;
  if (style.lineWidth) ctx.lineWidth = style.lineWidth;
  if (style.lineJoin) ctx.lineJoin = style.lineJoin;
  if (style.lineCap) ctx.lineCap = style.lineCap;
  if (style.miterLimit) ctx.miterLimit = style.miterLimit;

  // 그림자
  if (style.shadowColor) ctx.shadowColor = style.shadowColor;
  if (style.shadowBlur) ctx.shadowBlur = style.shadowBlur;
  if (style.shadowOffsetX) ctx.shadowOffsetX = style.shadowOffsetX;
  if (style.shadowOffsetY) ctx.shadowOffsetY = style.shadowOffsetY;

  // 투명도
  if (style.globalAlpha !== undefined) ctx.globalAlpha = style.globalAlpha;
  if (style.globalCompositeOperation) {
    ctx.globalCompositeOperation =
      style.globalCompositeOperation as GlobalCompositeOperation;
  }
}

/**
 * WebGL 렌더링
 * @param command WebGL 렌더링 명령
 * @param ctx WebGL 컨텍스트
 */
function renderWebGL(
  command: CanvasWebGLRenderCommand,
  ctx: WebGLRenderingContext | WebGL2RenderingContext
): void {
  const params = command.params;

  if (!params) {
    return;
  }

  // WebGL 렌더링 구현
  // 실제 WebGL 렌더링 로직은 구체적인 요구사항에 따라 구현
}

/**
 * 캔버스 및 리소스 정리
 * @returns 정리 성공 여부
 */
function disposeCanvas(): boolean {
  // 리소스 정리
  ctx = null;
  canvas = null;

  return true;
}

/**
 * 오류 메시지 전송
 * @param message 오류 메시지
 * @param id 메시지 ID (옵션)
 */
function sendError(message: string, id?: string): void {
  self.postMessage({
    type: WorkerMessageType.ERROR,
    id: id || undefined,
    data: { message },
  });
}

/**
 * 응답 메시지 전송
 * @param messageId 메시지 ID
 * @param commandId 명령 ID
 * @param success 성공 여부
 * @param data 응답 데이터
 * @param error 오류 메시지 (실패시)
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
function sendEvent(type: CanvasEventType, data: any = {}): void {
  self.postMessage({
    type: WorkerMessageType.EVENT,
    data: {
      type,
      ...data,
    },
  });
}

// 워커 준비 완료 메시지 전송
sendEvent(CanvasEventType.READY);
