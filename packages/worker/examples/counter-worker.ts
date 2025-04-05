/**
 * 카운터 워커 (이벤트 스트림 예제용)
 */

// 메시지 타입 정의
interface StreamMessage {
  type: string;
  streamId: string;
  data?: any;
  timestamp?: number;
}

interface CommandData {
  command: "increment" | "decrement" | "reset" | "get";
  value?: number;
}

// 카운터 상태
let counter = 0;

// 메시지 처리
self.onmessage = function (event: MessageEvent): void {
  const message = event.data as StreamMessage;

  // 스트림 초기화 메시지 처리
  if (message.type === "STREAM_INIT") {
    // 초기화 데이터가 있으면 사용
    if (message.data && message.data.startValue) {
      counter = message.data.startValue;
    }

    // 준비 완료 응답
    self.postMessage({
      type: "STREAM_READY",
      streamId: message.streamId,
      timestamp: Date.now(),
    });

    return;
  }

  // 스트림 메시지 처리
  if (message.type === "STREAM_MESSAGE") {
    const { streamId, data } = message;
    const commandData = data as CommandData;

    // 명령에 따라 처리
    switch (commandData.command) {
      case "increment":
        counter += commandData.value || 1;
        break;

      case "decrement":
        counter -= commandData.value || 1;
        break;

      case "reset":
        counter = commandData.value || 0;
        break;

      case "get":
        // 그대로 두기
        break;
    }

    // 결과 응답
    self.postMessage({
      type: "STREAM_MESSAGE",
      streamId,
      data: {
        counter,
        lastCommand: commandData.command,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    });

    return;
  }
};

// 파일을 모듈로 만들기 위한 export 문
export {};
