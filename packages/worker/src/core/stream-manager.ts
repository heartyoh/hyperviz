/**
 * StreamManager 클래스
 * 이벤트 스트림을 관리하는 클래스
 */

import { EventEmitter } from "eventemitter3";
import { EventStream } from "./event-stream.js";
import {
  StreamOptions,
  StreamMessage,
  StreamMessageType,
} from "../types/stream.js";
import { WorkerType } from "../types/index.js";
import { logger } from "../utils/logger.js";

/**
 * StreamManager 클래스
 * 여러 이벤트 스트림을 생성하고 관리
 */
export class StreamManager extends EventEmitter {
  /** 활성 스트림 맵 */
  private streams: Map<string, EventStream<any>> = new Map();

  /** 워커별 스트림 맵 */
  private workerStreams: Map<string, Set<string>> = new Map();

  /**
   * StreamManager 생성자
   * @param sendMessageToWorker 워커에 메시지 전송 함수
   */
  constructor(
    private sendMessageToWorker: (
      workerId: string,
      message: any
    ) => Promise<void>
  ) {
    super();
  }

  /**
   * 새 스트림 생성
   * @param options 스트림 옵션
   * @returns 생성된 스트림 인스턴스
   */
  public createStream<T = any>(options: StreamOptions = {}): EventStream<T> {
    // 메시지 전송 함수 래핑
    const sendMessage = async (message: StreamMessage<T>): Promise<void> => {
      // 초기 메시지인 경우 워커가 할당되지 않음
      if (message.type === StreamMessageType.INIT) {
        // 나중에 처리하기 위해 초기화 메시지 저장
        // 워커 풀에서 적절한 워커가 할당되면 전송됨
        return;
      }

      // 워커에게 메시지 전송
      const stream = this.streams.get(message.streamId);
      if (stream) {
        try {
          const workerId = this.findWorkerForStream(message.streamId);
          if (workerId) {
            await this.sendMessageToWorker(workerId, message);
          } else {
            logger.error(`No worker assigned to stream ${message.streamId}`);
          }
        } catch (error) {
          logger.error(`Failed to send message to worker:`, error);
        }
      }
    };

    // 새 스트림 생성
    const stream = new EventStream<T>(sendMessage, options);

    // 스트림 맵에 추가
    this.streams.set(stream.getId(), stream);

    // 스트림 이벤트 처리
    stream.once("close", () => {
      this.removeStream(stream.getId());
    });

    logger.debug(`Stream ${stream.getId()} created`);

    return stream;
  }

  /**
   * 워커 메시지 처리
   * @param workerId 워커 ID
   * @param message 메시지
   */
  public handleWorkerMessage(workerId: string, message: any): void {
    // 스트림 메시지 확인
    if (
      message &&
      typeof message === "object" &&
      message.type &&
      message.type.startsWith("STREAM_") &&
      message.streamId
    ) {
      const streamId = message.streamId;
      const stream = this.streams.get(streamId);

      if (stream) {
        // 워커를 스트림에 연결 (첫 메시지인 경우)
        if (!this.findWorkerForStream(streamId)) {
          this.assignWorkerToStream(workerId, streamId);
        }

        // 메시지를 스트림에 전달
        stream.handleMessage(message);
      } else {
        logger.warn(`Received message for unknown stream ${streamId}`);
      }
    }
  }

  /**
   * 스트림 가져오기
   * @param streamId 스트림 ID
   */
  public getStream<T = any>(streamId: string): EventStream<T> | undefined {
    return this.streams.get(streamId) as EventStream<T> | undefined;
  }

  /**
   * 스트림 삭제
   * @param streamId 스트림 ID
   */
  private removeStream(streamId: string): void {
    // 스트림 맵에서 제거
    this.streams.delete(streamId);

    // 워커 연결 제거
    for (const [workerId, streamIds] of this.workerStreams.entries()) {
      if (streamIds.has(streamId)) {
        streamIds.delete(streamId);

        // 워커에 연결된 스트림이 없으면 맵에서 제거
        if (streamIds.size === 0) {
          this.workerStreams.delete(workerId);
        }

        break;
      }
    }

    logger.debug(`Stream ${streamId} removed`);
  }

  /**
   * 워커 종료 처리
   * @param workerId 워커 ID
   */
  public handleWorkerTermination(workerId: string): void {
    const streamIds = this.workerStreams.get(workerId);
    if (!streamIds) return;

    // 워커에 연결된 모든 스트림 종료
    for (const streamId of streamIds) {
      const stream = this.streams.get(streamId);
      if (stream) {
        // 오류로 스트림 종료
        stream.handleMessage({
          type: StreamMessageType.ERROR,
          streamId,
          error: `Worker ${workerId} terminated unexpectedly`,
          timestamp: Date.now(),
        });
      }
    }

    // 워커 연결 제거
    this.workerStreams.delete(workerId);
  }

  /**
   * 워커를 스트림에 할당
   * @param workerId 워커 ID
   * @param streamId 스트림 ID
   */
  public assignWorkerToStream(workerId: string, streamId: string): void {
    // 스트림 확인
    const stream = this.streams.get(streamId);
    if (!stream) {
      logger.warn(`Cannot assign worker to unknown stream ${streamId}`);
      return;
    }

    // 워커에 연결된 스트림 세트 가져오기 또는 생성
    let streamIds = this.workerStreams.get(workerId);
    if (!streamIds) {
      streamIds = new Set<string>();
      this.workerStreams.set(workerId, streamIds);
    }

    // 스트림 ID 추가
    streamIds.add(streamId);

    // 스트림에 워커 ID 설정
    stream.setWorkerId(workerId);

    logger.debug(`Worker ${workerId} assigned to stream ${streamId}`);
  }

  /**
   * 스트림에 할당된 워커 찾기
   * @param streamId 스트림 ID
   */
  public findWorkerForStream(streamId: string): string | undefined {
    for (const [workerId, streamIds] of this.workerStreams.entries()) {
      if (streamIds.has(streamId)) {
        return workerId;
      }
    }
    return undefined;
  }

  /**
   * 워커가 관리하는 스트림 목록 가져오기
   * @param workerId 워커 ID
   */
  public getWorkerStreams(workerId: string): string[] {
    const streamIds = this.workerStreams.get(workerId);
    return streamIds ? Array.from(streamIds) : [];
  }

  /**
   * 모든 스트림 닫기
   */
  public closeAllStreams(): void {
    for (const stream of this.streams.values()) {
      stream.close();
    }
  }

  /**
   * 활성 스트림 수 가져오기
   */
  public getActiveStreamCount(): number {
    return this.streams.size;
  }
}
