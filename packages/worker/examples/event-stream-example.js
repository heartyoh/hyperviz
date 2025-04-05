/**
 * 이벤트 스트림 사용 예제
 */

import { WorkerPool, TaskPriority, WorkerType } from "../dist/index.js";

// 워커 코드 - 별도 파일로 분리할 수도 있음
const workerCode = `
  // 카운터 상태
  let counter = 0;
  
  // 메시지 처리
  self.onmessage = function(event) {
    const message = event.data;
    
    // 스트림 초기화 메시지 처리
    if (message.type === 'STREAM_INIT') {
      // 초기화 데이터가 있으면 사용
      if (message.data && message.data.startValue) {
        counter = message.data.startValue;
      }
      
      // 준비 완료 응답
      self.postMessage({
        type: 'STREAM_READY',
        streamId: message.streamId,
        timestamp: Date.now()
      });
      
      return;
    }
    
    // 스트림 메시지 처리
    if (message.type === 'STREAM_MESSAGE') {
      const { streamId, data } = message;
      
      // 명령에 따라 처리
      switch (data.command) {
        case 'increment':
          counter += (data.value || 1);
          break;
          
        case 'decrement':
          counter -= (data.value || 1);
          break;
          
        case 'reset':
          counter = data.value || 0;
          break;
          
        case 'get':
          // 그대로 두기
          break;
      }
      
      // 결과 응답
      self.postMessage({
        type: 'STREAM_MESSAGE',
        streamId,
        data: { 
          counter, 
          lastCommand: data.command,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      });
      
      return;
    }
  };
`;

// 워커 URL 생성
const workerBlob = new Blob([workerCode], { type: "application/javascript" });
const workerURL = URL.createObjectURL(workerBlob);

// WorkerPool 생성
const workerPool = new WorkerPool({
  workerUrl: workerURL,
  minWorkers: 1,
  maxWorkers: 2,
});

// 이벤트 스트림 사용 예제
async function runStreamExample() {
  console.log("이벤트 스트림 예제 시작");

  // 카운터 스트림 생성
  const counterStream = workerPool.createEventStream({
    workerType: WorkerType.CALC,
    initialData: { startValue: 10 },
    priority: TaskPriority.HIGH,
  });

  // 이벤트 리스너 설정
  counterStream.on("ready", () => {
    console.log("스트림 준비 완료");
  });

  counterStream.on("message", (data) => {
    console.log(`카운터 값: ${data.counter} (명령: ${data.lastCommand})`);
  });

  counterStream.on("error", (error) => {
    console.error("스트림 오류:", error);
  });

  // 스트림 준비 대기
  await new Promise((resolve) => {
    counterStream.once("ready", resolve);
  });

  // 카운터 증가
  await counterStream.send({ command: "increment", value: 5 });

  // 약간의 지연
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 카운터 감소
  await counterStream.send({ command: "decrement", value: 3 });

  // 약간의 지연
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 카운터 값 가져오기
  await counterStream.send({ command: "get" });

  // 약간의 지연
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 카운터 리셋
  await counterStream.send({ command: "reset", value: 0 });

  // 약간의 지연
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 스트림 종료
  await counterStream.close();
  console.log("스트림 종료됨");

  // 워커 풀 종료
  await workerPool.shutdown();
  console.log("워커 풀 종료됨");

  // 워커 URL 해제
  URL.revokeObjectURL(workerURL);
}

// 예제 실행
runStreamExample().catch((error) => {
  console.error("예제 실행 중 오류 발생:", error);
});
