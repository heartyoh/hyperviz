/**
 * 카운터 스트림 워커 (HTML 예제용)
 */

// 메시지 타입 상수 정의
const MESSAGE_TYPES = {
  INIT: "STREAM_INIT",
  READY: "STREAM_READY",
  MESSAGE: "STREAM_MESSAGE",
  CLOSE: "STREAM_CLOSE",
  ERROR: "STREAM_ERROR",
} as const;

// 명령 타입 상수 정의
const COMMAND_ACTIONS = {
  INCREMENT: "increment",
  DECREMENT: "decrement",
  RESET: "reset",
  GET: "get",
} as const;

// 스트림 메시지 타입 정의
interface StreamMessage {
  type: string;
  streamId: string;
  data?: any;
  timestamp: number;
}

// 명령 데이터 타입 정의
interface CommandData {
  action: (typeof COMMAND_ACTIONS)[keyof typeof COMMAND_ACTIONS];
  value?: number;
}

// 응답 데이터 타입 정의
interface ResponseData {
  counter: number;
  action: string;
  error?: string;
  timestamp?: number;
}

// 액티브 스트림 관리
const activeStreams = new Set<string>();

// 카운터 상태
let counter = 0;

/**
 * 초기화 메시지 처리 함수
 */
function handleInit(message: StreamMessage): void {
  if (activeStreams.has(message.streamId)) {
    sendError(
      message.streamId,
      `스트림 ${message.streamId}이(가) 이미 존재합니다`
    );
    return;
  }

  // 스트림 등록
  activeStreams.add(message.streamId);
  console.log(`스트림 ${message.streamId} 초기화됨`);

  // 시작 값 설정
  if (message.data && typeof message.data.startValue === "number") {
    counter = message.data.startValue;
  } else {
    counter = 0;
  }

  // 준비 완료 응답
  sendReady(message.streamId);

  // 초기 카운터 값 전송
  sendResponse(message.streamId, "init");
}

/**
 * 스트림 메시지 처리 함수
 */
function handleMessage(message: StreamMessage): void {
  if (!activeStreams.has(message.streamId)) {
    sendError(
      message.streamId,
      `스트림 ${message.streamId}을(를) 찾을 수 없습니다`
    );
    return;
  }

  // 명령 처리
  const data = message.data as CommandData;
  processCommand(message.streamId, data);
}

/**
 * 스트림 종료 처리 함수
 */
function handleClose(message: StreamMessage): void {
  if (!activeStreams.has(message.streamId)) {
    console.warn(`종료할 스트림 ${message.streamId}을(를) 찾을 수 없습니다`);
    return;
  }

  try {
    // 스트림 제거
    activeStreams.delete(message.streamId);
    console.log(`스트림 ${message.streamId} 종료됨`);

    // 모든 스트림이 종료되었는지 확인
    if (activeStreams.size === 0) {
      console.log("모든 스트림이 종료되었습니다");
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`스트림 ${message.streamId} 종료 중 오류 발생:`, error);
    sendError(message.streamId, `스트림 종료 중 오류 발생: ${errorMessage}`);
  }
}

/**
 * 명령 처리 함수
 */
function processCommand(streamId: string, data: CommandData): void {
  if (!data || !data.action) {
    sendError(streamId, "유효하지 않은 명령입니다");
    return;
  }

  // 기본값 처리
  const value = data.value ?? 1;

  // 명령 실행
  switch (data.action) {
    case COMMAND_ACTIONS.INCREMENT:
      counter += value;
      break;

    case COMMAND_ACTIONS.DECREMENT:
      counter -= value;
      break;

    case COMMAND_ACTIONS.RESET:
      counter = data.value ?? 0;
      break;

    case COMMAND_ACTIONS.GET:
      // 값 조회만 수행
      break;

    default:
      console.warn(`알 수 없는 명령: ${data.action}`);
      sendError(streamId, `지원하지 않는 명령: ${data.action}`);
      return;
  }

  // 응답 전송
  sendResponse(streamId, data.action);
}

/**
 * 준비 완료 메시지 전송 함수
 */
function sendReady(streamId: string): void {
  self.postMessage({
    type: MESSAGE_TYPES.READY,
    streamId,
    timestamp: Date.now(),
  });
}

/**
 * 응답 메시지 전송 함수
 */
function sendResponse(streamId: string, action: string): void {
  self.postMessage({
    type: MESSAGE_TYPES.MESSAGE,
    streamId,
    data: {
      counter,
      action,
      timestamp: Date.now(),
    } as ResponseData,
    timestamp: Date.now(),
  });
}

/**
 * 오류 메시지 전송 함수
 */
function sendError(streamId: string, errorMessage: string): void {
  console.error(errorMessage);

  self.postMessage({
    type: MESSAGE_TYPES.ERROR,
    streamId,
    data: {
      error: errorMessage,
      counter,
      action: "error",
      timestamp: Date.now(),
    } as ResponseData,
    timestamp: Date.now(),
  });
}

// 메시지 리스너 등록
self.addEventListener("message", (event: MessageEvent<StreamMessage>) => {
  const message = event.data;

  try {
    if (!message || !message.type) {
      console.error("유효하지 않은 메시지 형식입니다");
      return;
    }

    // 메시지 타입에 따른 처리
    switch (message.type) {
      case MESSAGE_TYPES.INIT:
        handleInit(message);
        break;

      case MESSAGE_TYPES.MESSAGE:
        handleMessage(message);
        break;

      case MESSAGE_TYPES.CLOSE:
        handleClose(message);
        break;

      default:
        console.warn(`지원하지 않는 메시지 타입: ${message.type}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("메시지 처리 중 오류 발생:", error);
    if (message) {
      sendError(message.streamId, `메시지 처리 중 오류 발생: ${errorMessage}`);
    }
  }
});

// 워커 종료 시 정리
self.addEventListener("unload", () => {
  try {
    // 남아있는 스트림 정리
    for (const streamId of activeStreams) {
      console.log(`워커 종료 전 스트림 ${streamId} 정리`);
      activeStreams.delete(streamId);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("워커 종료 중 오류 발생:", errorMessage);
  }
});

// 파일을 모듈로 만들기 위한 빈 export 구문
export {};
