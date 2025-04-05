/**
 * EventStream 테스트
 */

import { EventStream } from "../src/core/event-stream.js";
import { StreamMessageType, StreamStatus } from "../src/types/stream.js";

describe("EventStream", () => {
  // 메시지 전송 모의 함수
  const mockSendMessage = jest.fn();

  beforeEach(() => {
    // 각 테스트 전에 모의 함수 초기화
    mockSendMessage.mockClear();
    mockSendMessage.mockResolvedValue(undefined);
  });

  test("스트림이 올바르게 초기화됨", () => {
    const stream = new EventStream(mockSendMessage);

    // 스트림 ID가 생성됨
    expect(stream.getId()).toBeTruthy();
    expect(typeof stream.getId()).toBe("string");

    // 초기 상태가 INITIALIZING임
    expect(stream.getStatus()).toBe(StreamStatus.INITIALIZING);

    // 초기화 메시지가 전송됨
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][0].type).toBe(StreamMessageType.INIT);
  });

  test("메시지 전송이 올바르게 동작함", async () => {
    const stream = new EventStream(mockSendMessage);
    const testData = { test: "data" };

    // 스트림 상태를 ACTIVE로 변경
    stream.handleMessage({
      type: StreamMessageType.READY,
      streamId: stream.getId(),
      timestamp: Date.now(),
    });

    // 메시지 전송
    await stream.send(testData);

    // 메시지 전송 함수가 호출됨
    expect(mockSendMessage).toHaveBeenCalledTimes(2); // 초기화 + 메시지 전송
    expect(mockSendMessage.mock.calls[1][0].type).toBe(
      StreamMessageType.MESSAGE
    );
    expect(mockSendMessage.mock.calls[1][0].data).toBe(testData);
  });

  test("메시지 수신이 올바르게 처리됨", () => {
    const stream = new EventStream(mockSendMessage);
    const testData = { result: "processed" };
    const messageHandler = jest.fn();

    // 메시지 핸들러 등록
    stream.on("message", messageHandler);

    // 스트림 상태를 ACTIVE로 변경
    stream.handleMessage({
      type: StreamMessageType.READY,
      streamId: stream.getId(),
      timestamp: Date.now(),
    });

    // 메시지 수신 처리
    stream.handleMessage({
      type: StreamMessageType.MESSAGE,
      streamId: stream.getId(),
      data: testData,
      timestamp: Date.now(),
    });

    // 메시지 핸들러가 호출됨
    expect(messageHandler).toHaveBeenCalledTimes(1);
    expect(messageHandler).toHaveBeenCalledWith(testData);
  });

  test("스트림 종료가 올바르게 동작함", async () => {
    const stream = new EventStream(mockSendMessage);
    const closeHandler = jest.fn();

    // 종료 핸들러 등록
    stream.on("close", closeHandler);

    // 스트림 상태를 ACTIVE로 변경
    stream.handleMessage({
      type: StreamMessageType.READY,
      streamId: stream.getId(),
      timestamp: Date.now(),
    });

    // 스트림 종료
    await stream.close();

    // 종료 메시지가 전송됨
    expect(mockSendMessage).toHaveBeenCalledTimes(2); // 초기화 + 종료
    expect(mockSendMessage.mock.calls[1][0].type).toBe(StreamMessageType.CLOSE);

    // 상태가 CLOSED로 변경됨
    expect(stream.getStatus()).toBe(StreamStatus.CLOSED);

    // 종료 핸들러가 호출됨
    expect(closeHandler).toHaveBeenCalledTimes(1);
  });
});
