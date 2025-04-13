/**
 * Image Processing Module Type Definitions
 */

/**
 * Image Format Types
 */
export enum ImageFormat {
  /** JPEG image format */
  JPEG = "image/jpeg",
  /** PNG image format */
  PNG = "image/png",
  /** WebP image format */
  WEBP = "image/webp",
}

/**
 * Image Processing Options Interface
 */
export interface ImageProcessingOptions {
  /** Width (pixels) */
  width?: number;
  /** Height (pixels) */
  height?: number;
  /** Whether to maintain aspect ratio */
  maintainAspectRatio?: boolean;
  /** Output format */
  format?: ImageFormat;
  /** Image quality (0-1) */
  quality?: number;
  /** Progress callback function */
  onProgress?: (progress: number) => void;
  /** Whether to use discrete scales (optimization) */
  useDiscreteScales?: boolean;
  /** Discrete scales override values */
  discreteScalesOverride?: Record<string, number>;
  /** Viewport bound width */
  boundWidth?: number;
  /** Viewport bound height */
  boundHeight?: number;
  /** Device pixel ratio (DPR) */
  devicePixelRatio?: number;
}

/**
 * Cache Storage Type
 */
export enum CacheStorageType {
  /** Memory-based cache */
  MEMORY = "memory",
  /** IndexedDB-based cache */
  INDEXED_DB = "indexeddb",
  /** Hybrid cache (memory + IndexedDB) */
  HYBRID = "hybrid",
}

/**
 * Unified Image Processing Result Interface
 * Combines previous ImageProcessingResult and ProcessingResult interfaces
 */
export interface ProcessingResult {
  /** Processed image data (Base64 string) */
  data: string;
  /** Width (pixels) */
  width: number;
  /** Height (pixels) */
  height: number;
  /** Image format */
  format: ImageFormat;
  /** Original width (optional) */
  originalWidth?: number;
  /** Original height (optional) */
  originalHeight?: number;
  /** Processing time (milliseconds) */
  processingTime?: number;
  /** Whether loaded from cache */
  fromCache?: boolean;
}

/**
 * Worker Task Type
 */
export enum ImageTaskType {
  /** Image scaling */
  SCALE = "scale",
  /** Image format conversion */
  CONVERT = "convert",
  /** Apply image effect */
  APPLY_EFFECT = "apply_effect",
}

/**
 * Worker Task Request Message
 */
export interface ImageTaskRequest {
  /** Task type */
  type: ImageTaskType;
  /** Task ID */
  taskId: string;
  /** Image data (URL string) */
  imageData: string;
  /** Processing options */
  options: ImageProcessingOptions;
}

/**
 * Worker Task Response Message
 */
export interface ImageTaskResponse {
  /** Task type */
  type: "taskCompleted" | "taskFailed" | "taskProgress";
  /** Task ID */
  taskId: string;
  /** Processing result (when completed) */
  result?: ProcessingResult;
  /** Error message (when failed) */
  error?: string;
  /** Progress (0-1) */
  progress?: number;
}

/**
 * Task Retry Event Data
 */
export interface TaskRetryEvent {
  /** Task ID */
  taskId: string;
  /** Current retry count */
  retryCount: number;
  /** Maximum retries allowed */
  maxRetries: number;
  /** Delay before next retry (ms) */
  nextDelay: number;
  /** Error message */
  error?: string;
}

import { TaskStatus, TaskPriority } from "../types/index.js";

export type ImageSource = string | Blob | ArrayBuffer | ImageData;

export enum WorkerType {
  IMAGE = "image",
  VIDEO = "video",
}

export interface ImageProcessor {
  generateImageId(
    imageData: Blob | ArrayBuffer | ImageData | string,
    sourceUrl?: string
  ): string;
}

/**
 * Image Processor Event Constants
 * Defines event names as string constants for type safety
 */
export const ImageProcessorEvents = {
  /** Ready event */
  READY: "ready",
  /** Error event */
  ERROR: "error",
  /** Task start event */
  TASK_START: "taskStart",
  /** Task progress event */
  TASK_PROGRESS: "taskProgress",
  /** Task complete event */
  TASK_COMPLETE: "taskComplete",
  /** Task fail event */
  TASK_FAIL: "taskFail",
  /** Task retry event */
  TASK_RETRY: "taskRetry",
  /** Cache hit event */
  CACHE_HIT: "cacheHit",
  /** Cache miss event */
  CACHE_MISS: "cacheMiss",
} as const;

export type ImageProcessorEvent =
  (typeof ImageProcessorEvents)[keyof typeof ImageProcessorEvents];

/**
 * Cache Options Interface
 */
export interface CacheOptions {
  /** Cache storage type */
  storageType: CacheStorageType;
  /** Maximum cache size */
  maxSize?: number;
  /** Cache item expiry time (ms) */
  expiryTime?: number;
  /** Whether to use compression */
  compression?: boolean;
}

/**
 * Cache Statistics Interface
 */
export interface ImageCacheStats {
  /** Number of cache items */
  size: number;
  /** Memory cache hit count */
  memoryHits: number;
  /** Memory cache miss count */
  memoryMisses: number;
  /** IndexedDB cache hit count */
  dbHits: number;
  /** IndexedDB cache miss count */
  dbMisses: number;
  /** Cache eviction count */
  evictions: number;
  /** Total hit count */
  totalHits: number;
  /** Total miss count */
  totalMisses: number;
}
