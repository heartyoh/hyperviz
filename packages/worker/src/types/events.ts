/**
 * Event types and interfaces for worker communication
 */

import { WorkerType, TaskPriority } from "./index.js";

/**
 * Base event message interface
 */
export interface BaseEventMessage {
  /** Event type */
  type: string;
  /** Event timestamp */
  timestamp: number;
  /** Event metadata */
  metadata?: Record<string, any>;
}

/**
 * Stream event types
 */
export enum StreamEventType {
  /** Stream initialization */
  INIT = "STREAM_INIT",
  /** Stream ready */
  READY = "STREAM_READY",
  /** Stream message */
  MESSAGE = "STREAM_MESSAGE",
  /** Stream pause */
  PAUSE = "STREAM_PAUSE",
  /** Stream resume */
  RESUME = "STREAM_RESUME",
  /** Stream close */
  CLOSE = "STREAM_CLOSE",
  /** Stream error */
  ERROR = "STREAM_ERROR"
}

/**
 * Stream event message interface
 */
export interface StreamEventMessage<T = any> extends BaseEventMessage {
  /** Stream ID */
  streamId: string;
  /** Event data */
  data?: T;
  /** Error information */
  error?: string;
}

/**
 * Stream event handler interface
 */
export interface StreamEventHandler<T = any> {
  /** Handle stream ready event */
  onReady?: () => void;
  /** Handle stream message event */
  onMessage?: (data: T) => void;
  /** Handle stream error event */
  onError?: (error: Error) => void;
  /** Handle stream close event */
  onClose?: () => void;
  /** Handle stream pause event */
  onPause?: () => void;
  /** Handle stream resume event */
  onResume?: () => void;
}

/**
 * Stream options interface
 */
export interface StreamOptions {
  /** Worker type */
  workerType?: WorkerType | string;
  /** Stream priority */
  priority?: TaskPriority;
  /** Initial data */
  initialData?: any;
  /** Stream timeout in milliseconds */
  timeout?: number;
  /** Auto cleanup flag */
  autoCleanup?: boolean;
  /** Stream metadata */
  metadata?: Record<string, any>;
}

/**
 * Stream status enum
 */
export enum StreamStatus {
  /** Initializing */
  INITIALIZING = "INITIALIZING",
  /** Active */
  ACTIVE = "ACTIVE",
  /** Paused */
  PAUSED = "PAUSED",
  /** Closed */
  CLOSED = "CLOSED",
  /** Error */
  ERROR = "ERROR"
} 