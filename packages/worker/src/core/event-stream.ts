/**
 * EventStream class
 * Provides bidirectional communication stream between worker and main thread
 */

import { EventEmitter } from "eventemitter3";
import {
  StreamEventType,
  StreamEventMessage,
  StreamEventHandler,
  StreamStatus,
  StreamOptions as EventStreamOptions
} from "../types/events.js";
import { WorkerType, TaskPriority } from "../types/index.js";
import { generateId } from "./utils.js";
import { logger } from "../utils/logger.js";

/**
 * EventStream class for managing event streams
 * @template T - Type of events in the stream
 */
export class EventStream<T> extends EventEmitter {
  /** Stream ID */
  private id: string;

  /** Stream status */
  private status: StreamStatus = StreamStatus.INITIALIZING;

  /** Worker ID */
  private workerId?: string;

  /** Stream options */
  private options: Required<EventStreamOptions>;

  /** Last activity time */
  private lastActivityTime: number = Date.now();

  /** Timeout timer */
  private timeoutTimer?: NodeJS.Timeout;

  /**
   * EventStream constructor
   * @param sendMessage Message sending callback
   * @param options Stream options
   */
  constructor(
    private sendMessage: (message: StreamEventMessage<T>) => Promise<void>,
    options: EventStreamOptions = {}
  ) {
    super();

    // Generate stream ID
    this.id = generateId();

    // Set default options
    this.options = {
      workerType: WorkerType.CALC,
      priority: TaskPriority.NORMAL,
      initialData: undefined,
      timeout: 0, // 0 means no timeout
      autoCleanup: true,
      metadata: {},
      ...options,
    };

    // Setup timeout if specified
    if (this.options.timeout > 0) {
      this.setupTimeoutTimer();
    }

    // Initialize stream
    this.initialize();
  }

  /**
   * Initialize stream
   */
  private async initialize(): Promise<void> {
    try {
      // Send initialization message
      await this.sendMessage({
        type: StreamEventType.INIT,
        streamId: this.id,
        data: this.options.initialData,
        timestamp: Date.now(),
      });

      logger.debug(`Stream ${this.id} initialized`);
    } catch (error) {
      this.status = StreamStatus.ERROR;
      this.emit("error", error);
      logger.error(`Stream initialization error:`, error);
    }
  }

  /**
   * Get stream ID
   */
  public getId(): string {
    return this.id;
  }

  /**
   * Get stream status
   */
  public getStatus(): StreamStatus {
    return this.status;
  }

  /**
   * Send message
   * @param data Data to send
   */
  public async send(data: T): Promise<void> {
    // Check stream status
    if (
      this.status !== StreamStatus.ACTIVE &&
      this.status !== StreamStatus.INITIALIZING
    ) {
      throw new Error(`Cannot send message: stream is ${this.status}`);
    }

    try {
      // Send message
      await this.sendMessage({
        type: StreamEventType.MESSAGE,
        streamId: this.id,
        data,
        timestamp: Date.now(),
      });

      // Update last activity time
      this.updateActivity();
    } catch (error) {
      logger.error(`Error sending message to stream ${this.id}:`, error);
      this.emit("error", error);
    }
  }

  /**
   * Handle received message
   * @param message Received message
   */
  public handleMessage(message: StreamEventMessage): void {
    // Update last activity time
    this.updateActivity();

    // Process message based on type
    switch (message.type) {
      case StreamEventType.READY:
        this.status = StreamStatus.ACTIVE;
        this.emit("ready");
        break;

      case StreamEventType.MESSAGE:
        if (this.status === StreamStatus.ACTIVE) {
          this.emit("message", message.data);
        }
        break;

      case StreamEventType.PAUSE:
        this.status = StreamStatus.PAUSED;
        this.emit("pause");
        break;

      case StreamEventType.RESUME:
        this.status = StreamStatus.ACTIVE;
        this.emit("resume");
        break;

      case StreamEventType.ERROR:
        this.emit("error", new Error(message.error || "Unknown stream error"));
        break;

      case StreamEventType.CLOSE:
        this.close();
        break;

      default:
        logger.debug(`Unknown stream message type: ${message.type}`);
    }
  }

  /**
   * Pause stream
   */
  public async pause(): Promise<void> {
    if (this.status !== StreamStatus.ACTIVE) return;

    try {
      await this.sendMessage({
        type: StreamEventType.PAUSE,
        streamId: this.id,
        timestamp: Date.now(),
      });

      this.status = StreamStatus.PAUSED;
      this.emit("pause");
    } catch (error) {
      logger.error(`Error pausing stream ${this.id}:`, error);
    }
  }

  /**
   * Resume stream
   */
  public async resume(): Promise<void> {
    if (this.status !== StreamStatus.PAUSED) return;

    try {
      await this.sendMessage({
        type: StreamEventType.RESUME,
        streamId: this.id,
        timestamp: Date.now(),
      });

      this.status = StreamStatus.ACTIVE;
      this.emit("resume");
    } catch (error) {
      logger.error(`Error resuming stream ${this.id}:`, error);
    }
  }

  /**
   * Close stream
   */
  public async close(): Promise<void> {
    if (this.status === StreamStatus.CLOSED) return;

    try {
      // Send close message if not in error state
      if (this.status !== StreamStatus.ERROR) {
        await this.sendMessage({
          type: StreamEventType.CLOSE,
          streamId: this.id,
          timestamp: Date.now(),
        });
      }

      // Update status
      this.status = StreamStatus.CLOSED;

      // Clear timeout timer
      this.clearTimeoutTimer();

      // Emit close event and cleanup
      this.emit("close");

      if (this.options.autoCleanup) {
        this.removeAllListeners();
      }
    } catch (error) {
      logger.error(`Error closing stream ${this.id}:`, error);
    }
  }

  /**
   * Set event handlers
   * @param handlers Event handlers
   */
  public setEventHandlers(handlers: StreamEventHandler<T>): void {
    if (handlers.onReady) this.on("ready", handlers.onReady);
    if (handlers.onMessage) this.on("message", handlers.onMessage);
    if (handlers.onError) this.on("error", handlers.onError);
    if (handlers.onClose) this.on("close", handlers.onClose);
    if (handlers.onPause) this.on("pause", handlers.onPause);
    if (handlers.onResume) this.on("resume", handlers.onResume);
  }

  /**
   * Update last activity time
   */
  private updateActivity(): void {
    this.lastActivityTime = Date.now();
    if (this.timeoutTimer) {
      this.setupTimeoutTimer();
    }
  }

  /**
   * Setup timeout timer
   */
  private setupTimeoutTimer(): void {
    this.clearTimeoutTimer();
    this.timeoutTimer = setTimeout(() => {
      this.emit("error", new Error("Stream timeout"));
      this.close();
    }, this.options.timeout);
  }

  /**
   * Clear timeout timer
   */
  private clearTimeoutTimer(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }
  }
}
