/**
 * 카운터 스트림 워커 (HTML 예제용)
 */

// 스트림 메시지 타입 정의
interface StreamMessage {
  type: string;
  streamId: string;
  data?: any;
  timestamp: number;
}

// 명령 데이터 타입 정의
interface CommandData {
  action: string;
  value: number;
}

// 액티브 스트림 관리
const activeStreams = new Set<string>();

// 카운터 상태
let counter = 0;

// 메시지 처리
self.addEventListener("message", (event: MessageEvent) => {
  const message = event.data as StreamMessage;

  // 스트림 초기화
  if (message.type === "STREAM_INIT") {
    if (activeStreams.has(message.streamId)) {
      console.error(`Stream ${message.streamId} already exists`);
      return;
    }

    // 스트림 등록
    activeStreams.add(message.streamId);
    console.log(`Stream ${message.streamId} initialized`);

    // 시작 값 설정
    if (message.data && typeof message.data.startValue === "number") {
      counter = message.data.startValue;
    } else {
      counter = 0;
    }

    // 준비 완료 응답
    self.postMessage({
      type: "STREAM_READY",
      streamId: message.streamId,
      data: { counter },
      timestamp: Date.now(),
    });
  }
  // 스트림 메시지 처리
  else if (message.type === "STREAM_MESSAGE") {
    if (!activeStreams.has(message.streamId)) {
      console.error(`Stream ${message.streamId} not found`);
      return;
    }

    // 명령 처리
    const data = message.data as CommandData;

    if (data.action === "increment") {
      counter += data.value;
    } else if (data.action === "decrement") {
      counter -= data.value;
    } else if (data.action === "reset") {
      counter = data.value;
    } else {
      console.warn(`Unknown action: ${data.action}`);
    }

    // 응답 메시지
    self.postMessage({
      type: "STREAM_MESSAGE",
      streamId: message.streamId,
      data: {
        counter,
        action: data.action,
      },
      timestamp: Date.now(),
    });
  }
  // 스트림 종료
  else if (message.type === "STREAM_CLOSE") {
    if (!activeStreams.has(message.streamId)) {
      console.warn(`Stream ${message.streamId} not found for closing`);
      return;
    }

    // 스트림 제거
    activeStreams.delete(message.streamId);
    console.log(`Stream ${message.streamId} closed`);
  }
});

// 파일을 모듈로 만들기 위한 빈 export 구문
export {};
