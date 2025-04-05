/**
 * 이벤트 스트림 사용 예제 (TypeScript)
 */

import { WorkerPool, TaskPriority, WorkerType } from "../dist/index.js";

// EventStream 인터페이스 정의
interface EventStream {
  on(event: string, listener: (data: any) => void): void;
  once(event: string, listener: (data: any) => void): void;
  send(data: any): Promise<void>;
  close(): Promise<void>;
}

// 메시지 타입 정의
interface StreamInitMessage {
  type: "STREAM_INIT";
  streamId: string;
  data?: InitData;
  timestamp?: number;
}

interface StreamReadyMessage {
  type: "STREAM_READY";
  streamId: string;
  timestamp: number;
}

interface StreamDataMessage {
  type: "STREAM_MESSAGE";
  streamId: string;
  data: any;
  timestamp: number;
}

// 데이터 타입 정의
interface InitData {
  startValue?: number;
}

interface CommandData {
  command: "increment" | "decrement" | "reset" | "get";
  value?: number;
}

interface ResponseData {
  counter: number;
  lastCommand: string;
  timestamp: number;
}

// WorkerPool 생성
const workerPool = new WorkerPool({
  workerUrl: "../dist/examples/counter-worker.js",
  minWorkers: 1,
  maxWorkers: 2,
});

// 이벤트 스트림 사용 예제
async function runStreamExample(): Promise<void> {
  console.log("이벤트 스트림 예제 시작");

  // 카운터 스트림 생성
  const counterStream = workerPool.createEventStream({
    workerType: WorkerType.CALC,
    initialData: { startValue: 10 } as InitData,
    priority: TaskPriority.HIGH,
  }) as unknown as EventStream;

  // 이벤트 리스너 설정
  counterStream.on("ready", () => {
    console.log("스트림 준비 완료");
  });

  counterStream.on("message", (data: ResponseData) => {
    console.log(`카운터 값: ${data.counter} (명령: ${data.lastCommand})`);
  });

  counterStream.on("error", (error: Error) => {
    console.error("스트림 오류:", error);
  });

  // 스트림 준비 대기
  await new Promise<void>((resolve) => {
    counterStream.once("ready", resolve);
  });

  // 카운터 증가
  await counterStream.send({ command: "increment", value: 5 } as CommandData);

  // 약간의 지연
  await new Promise<void>((resolve) => setTimeout(resolve, 500));

  // 카운터 감소
  await counterStream.send({ command: "decrement", value: 3 } as CommandData);

  // 약간의 지연
  await new Promise<void>((resolve) => setTimeout(resolve, 500));

  // 카운터 값 가져오기
  await counterStream.send({ command: "get" } as CommandData);

  // 약간의 지연
  await new Promise<void>((resolve) => setTimeout(resolve, 500));

  // 카운터 리셋
  await counterStream.send({ command: "reset", value: 0 } as CommandData);

  // 약간의 지연
  await new Promise<void>((resolve) => setTimeout(resolve, 500));

  // 스트림 종료
  await counterStream.close();
  console.log("스트림 종료됨");

  // 워커 풀 종료
  await workerPool.shutdown();
  console.log("워커 풀 종료됨");
}

// 예제 실행
runStreamExample().catch((error: Error) => {
  console.error("예제 실행 중 오류 발생:", error);
});
