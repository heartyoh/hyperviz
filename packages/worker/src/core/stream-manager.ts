/**
 * StreamManager class
 * Manages multiple event streams and their connections to workers
 */

import { EventStream } from "./event-stream.js";
import { StreamStatus, StreamEventMessage, StreamEventType, StreamOptions } from "../types/events.js";
import { WorkerAdapter } from "./worker-adapter.js";
import { logger } from "../utils/logger.js";

/**
 * StreamManager class
 * Manages multiple event streams and their connections to workers
 */
export class StreamManager {
  /** Active streams */
  private streams: Map<string, EventStream<any>> = new Map();

  /** Worker-stream assignments */
  private workerStreams: Map<string, Set<string>> = new Map();

  /**
   * StreamManager constructor
   */
  constructor() {}

  /**
   * Create new stream
   * @param worker Worker adapter
   * @param options Stream options
   * @returns New event stream
   */
  public createStream<T = any>(
    worker: WorkerAdapter,
    options: StreamOptions = {}
  ): EventStream<T> {
    // Create stream
    const stream = new EventStream<T>(
      async (message) => {
        await worker.postMessage(message);
      },
      options
    );

    // Store stream
    this.streams.set(stream.getId(), stream);

    // Assign worker to stream
    this.assignWorkerToStream(worker.getId(), stream.getId());

    // Setup stream cleanup
    stream.on("close", () => {
      this.removeStream(stream.getId());
    });

    return stream;
  }

  /**
   * Handle worker message
   * @param workerId Worker ID
   * @param message Message from worker
   */
  public handleWorkerMessage(workerId: string, message: StreamEventMessage): void {
    // Find stream for message
    const streamId = message.streamId;
    const stream = this.streams.get(streamId);

    if (!stream) {
      logger.warn(`No stream found for message: ${streamId}`);
      return;
    }

    // Handle message
    stream.handleMessage(message);

    // Handle stream close
    if (message.type === StreamEventType.CLOSE) {
      this.removeStream(streamId);
    }
  }

  /**
   * Assign worker to stream
   * @param workerId Worker ID
   * @param streamId Stream ID
   */
  private assignWorkerToStream(workerId: string, streamId: string): void {
    let workerStreams = this.workerStreams.get(workerId);
    if (!workerStreams) {
      workerStreams = new Set();
      this.workerStreams.set(workerId, workerStreams);
    }
    workerStreams.add(streamId);
  }

  /**
   * Find worker for stream
   * @param streamId Stream ID
   * @returns Worker ID or undefined
   */
  private findWorkerForStream(streamId: string): string | undefined {
    for (const [workerId, streams] of this.workerStreams.entries()) {
      if (streams.has(streamId)) {
        return workerId;
      }
    }
    return undefined;
  }

  /**
   * Remove stream
   * @param streamId Stream ID
   */
  private removeStream(streamId: string): void {
    // Remove stream
    this.streams.delete(streamId);

    // Remove worker assignment
    for (const [workerId, streams] of this.workerStreams.entries()) {
      if (streams.delete(streamId)) {
        // Cleanup empty worker assignments
        if (streams.size === 0) {
          this.workerStreams.delete(workerId);
        }
        break;
      }
    }
  }

  /**
   * Close all streams
   */
  public async closeAllStreams(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const stream of this.streams.values()) {
      if (stream.getStatus() !== StreamStatus.CLOSED) {
        closePromises.push(stream.close());
      }
    }

    await Promise.all(closePromises);
    this.streams.clear();
    this.workerStreams.clear();
  }

  /**
   * Get stream count
   */
  public getStreamCount(): number {
    return this.streams.size;
  }

  /**
   * Get worker count
   */
  public getWorkerCount(): number {
    return this.workerStreams.size;
  }
}


