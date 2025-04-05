// 타입 정의
interface Point {
  x: number;
  y: number;
}

interface PathEntry {
  type: "path";
  points: Point[];
  color: string;
  size: number;
}

interface ClearEntry {
  type: "clear";
}

type HistoryEntry = PathEntry | ClearEntry;

interface DrawSettings {
  color: string;
  size: number;
}

interface StreamMessage {
  type: string;
  streamId: string;
  data?: any;
  timestamp?: number;
}

interface DrawCommand {
  action: string;
  x?: number;
  y?: number;
  color?: string;
  size?: number;
}

// 캔버스 및 컨텍스트
let drawCanvas: OffscreenCanvas | null = null;
let drawCtx: OffscreenCanvasRenderingContext2D | null = null;

// 드로잉 이력
const drawHistory: HistoryEntry[] = [];
const maxHistory: number = 50;

// 현재 경로
let currentPath: Point[] = [];

// 드로잉 상태
let isDrawing: boolean = false;

// 드로잉 설정
let settings: DrawSettings = {
  color: "#000000",
  size: 5,
};

// 스트림 관리
const activeStreams: Set<string> = new Set();

// 오프스크린 캔버스 설정
function setupCanvas(offscreenCanvas: OffscreenCanvas): void {
  drawCanvas = offscreenCanvas;
  const context = drawCanvas.getContext("2d");

  if (!context) {
    throw new Error("캔버스 컨텍스트를 가져올 수 없습니다.");
  }

  drawCtx = context;

  // 캔버스 초기화
  drawCtx.fillStyle = "white";
  drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);

  // 기본 스타일 설정
  drawCtx.lineCap = "round";
  drawCtx.lineJoin = "round";
  updateStyle();
}

// 스타일 업데이트
function updateStyle(): void {
  if (!drawCtx) return;

  drawCtx.strokeStyle = settings.color;
  drawCtx.lineWidth = settings.size;
}

// 그리기 시작
function startDrawing(x: number, y: number): void {
  if (!drawCtx) return;

  isDrawing = true;
  currentPath = [{ x, y }];

  // 새 경로 시작
  drawCtx.beginPath();
  drawCtx.moveTo(x, y);
}

// 그리기 계속
function continueDrawing(x: number, y: number): void {
  if (!drawCtx || !isDrawing) return;

  // 포인트 추가
  currentPath.push({ x, y });

  // 선 그리기
  drawCtx.lineTo(x, y);
  drawCtx.stroke();
}

// 그리기 종료
function endDrawing(): void {
  if (!isDrawing) return;

  isDrawing = false;

  // 이력에 추가
  if (currentPath.length > 1) {
    const pathEntry: PathEntry = {
      type: "path",
      points: currentPath,
      color: settings.color,
      size: settings.size,
    };

    drawHistory.push(pathEntry);

    // 이력 제한
    while (drawHistory.length > maxHistory) {
      drawHistory.shift();
    }
  }

  currentPath = [];
}

// 모두 지우기
function clearCanvas(): void {
  if (!drawCtx || !drawCanvas) return;

  drawCtx.fillStyle = "white";
  drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);

  // 이력에 추가
  drawHistory.push({
    type: "clear",
  });

  // 이력 제한
  while (drawHistory.length > maxHistory) {
    drawHistory.shift();
  }
}

// 실행 취소
function undoLastAction(): void {
  if (!drawCtx || !drawCanvas || drawHistory.length === 0) return;

  // 마지막 액션 제거
  drawHistory.pop();

  // 캔버스 초기화
  drawCtx.fillStyle = "white";
  drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);

  // 이력 다시 그리기
  for (const entry of drawHistory) {
    if (entry.type === "clear") {
      drawCtx.fillStyle = "white";
      drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
    } else if (entry.type === "path") {
      const { points, color, size } = entry;

      // 스타일 설정
      drawCtx.strokeStyle = color;
      drawCtx.lineWidth = size;

      // 경로 그리기
      drawCtx.beginPath();
      drawCtx.moveTo(points[0].x, points[0].y);

      for (let i = 1; i < points.length; i++) {
        drawCtx.lineTo(points[i].x, points[i].y);
      }

      drawCtx.stroke();
    }
  }

  // 현재 스타일 복원
  updateStyle();
}

// 메시지 핸들러
self.onmessage = function (event: MessageEvent): void {
  const message = event.data;

  // 오프스크린 캔버스 설정
  if (message.type === "init") {
    setupCanvas(message.canvas);

    // 초기화 완료 응답
    self.postMessage({
      type: "initialized",
    });

    return;
  }

  // 스트림 메시지 처리
  if (message.type && message.type.startsWith("STREAM_")) {
    const { type, streamId, data } = message as StreamMessage;

    if (type === "STREAM_INIT") {
      // 스트림 초기화
      activeStreams.add(streamId);

      // 준비 완료 응답
      self.postMessage({
        type: "STREAM_READY",
        streamId,
        timestamp: Date.now(),
      });
    } else if (type === "STREAM_MESSAGE" && activeStreams.has(streamId)) {
      // 명령 처리
      const command = data as DrawCommand;
      if (command && command.action) {
        switch (command.action) {
          case "updateStyle":
            if (command.color) settings.color = command.color;
            if (command.size !== undefined) settings.size = command.size;
            updateStyle();
            break;

          case "startDrawing":
            if (command.x !== undefined && command.y !== undefined) {
              startDrawing(command.x, command.y);
            }
            break;

          case "continueDrawing":
            if (command.x !== undefined && command.y !== undefined) {
              continueDrawing(command.x, command.y);
            }
            break;

          case "endDrawing":
            endDrawing();
            break;

          case "clear":
            clearCanvas();
            break;

          case "undo":
            undoLastAction();
            break;
        }

        // 상태 응답
        self.postMessage({
          type: "STREAM_MESSAGE",
          streamId,
          data: {
            historyLength: drawHistory.length,
            action: command.action,
            timestamp: Date.now(),
          },
        });
      }
    } else if (type === "STREAM_CLOSE") {
      // 스트림 종료
      activeStreams.delete(streamId);
    }
  }
};
