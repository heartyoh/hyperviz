/**
 * Image Processor Main Class
 * Provides image processing capabilities using WorkerAdapter
 */
import { EventEmitter } from "eventemitter3";
import { WorkerAdapter } from "../core/worker-adapter.js";
import {
  CacheStorageType,
  ImageProcessingOptions,
  ProcessingResult,
  ImageTaskType,
  ImageFormat,
  ImageSource,
  WorkerType,
  ImageProcessorEvents,
  CacheOptions,
  TaskRetryEvent,
} from "./types.js";
import { ImageCache } from "./image-cache.js";
import * as crypto from "crypto";
import { TaskStatus, TaskPriority } from "../types/index.js";
import { TimeoutManager, TimeoutStatus } from "../core/timeout-manager.js";

/**
 * Discrete Scale Constants - Limit to most commonly used sizes for cache optimization
 */
export const DISCRETE_SCALES = {
  ORIGINAL: 1.0, // Original size
  MEDIUM: 0.5, // 50% of original
  SMALL: 0.25, // 25% of original
  TINY: 0.1, // 10% of original
};

/**
 * Image Processor Options
 */
export interface ImageProcessorOptions {
  /** Worker script URL (default: built-in URL) */
  workerUrl?: string;
  /** Task timeout (ms) */
  timeout?: number;
  /** Ready callback */
  onReady?: () => void;
  /** Error callback */
  onError?: (error: Error) => void;
  /** Whether to use cache (default: true) */
  useCache?: boolean;
  /** Cache storage type (default: MEMORY) */
  cacheStorageType?: CacheStorageType;
  /** Cache options */
  cacheOptions?: CacheOptions;
  /** Whether to use discrete scales */
  useDiscreteScales?: boolean;
  /** Custom discrete scale values */
  discreteScales?: Record<string, number>;
  /** Maximum retry count for timeouts */
  maxRetries?: number;
  /** Base delay for retry backoff (ms) */
  retryDelayBase?: number;
  /** Max jitter for retry delay (ms) */
  maxJitter?: number;
  /** Maximum backoff delay (ms) */
  maxBackoffDelay?: number;
}

/**
 * Image Processor Class
 * Provides image processing functionality using worker threads
 */
export class ImageProcessor extends EventEmitter {
  /** Worker URL */
  private workerUrl: string = "";
  /** Worker */
  private worker: WorkerAdapter;
  /** Ready state */
  private isReady: boolean = false;
  /** Task ID counter */
  private taskIdCounter: number = 0;
  /** Task timeout */
  private timeout: number;
  /** Maximum retry count */
  private maxRetries: number;
  /** Base delay for retry */
  private retryDelayBase: number;
  /** Max jitter for retry delay */
  private maxJitter: number;
  /** Maximum backoff delay */
  private maxBackoffDelay: number;
  /** Timeout manager */
  private timeoutManager: TimeoutManager;
  /** Running tasks and their timeouts */
  private runningTasks: Map<string, { timeoutId?: number; startTime: number }> =
    new Map();
  /** Image cache */
  private cache: ImageCache | null = null;
  /** Whether to use cache */
  private useCache: boolean;
  /** Cache storage type */
  private cacheStorageType: CacheStorageType;
  /** Whether to use discrete scales */
  private useDiscreteScales: boolean;
  /** Discrete scale values */
  private discreteScales: Record<string, number>;

  /**
   * Image processor constructor
   * @param options Initialization options
   */
  constructor(options: ImageProcessorOptions = {}) {
    super();

    // Set options
    this.timeout = options.timeout || 30000; // Default 30 seconds
    this.maxRetries = options.maxRetries || 3; // Default 3 retries
    this.retryDelayBase = options.retryDelayBase || 2000; // Default 2 seconds
    this.maxJitter = options.maxJitter || 500; // Default 500ms jitter
    this.maxBackoffDelay = options.maxBackoffDelay || 30000; // Default 30 seconds max delay
    this.useCache = options.useCache !== false; // Cache enabled by default
    this.cacheStorageType = options.cacheStorageType || CacheStorageType.MEMORY;

    // Initialize timeout manager with retry options
    this.timeoutManager = new TimeoutManager({
      maxRetries: this.maxRetries,
      retryDelayBase: this.retryDelayBase,
      maxJitter: this.maxJitter,
      maxBackoffDelay: this.maxBackoffDelay,
      debug: false,
    });

    // Discrete scale settings
    this.useDiscreteScales = options.useDiscreteScales || false;
    this.discreteScales = options.discreteScales || DISCRETE_SCALES;

    // Register event handlers
    if (options.onReady) {
      this.on(ImageProcessorEvents.READY, options.onReady);
    }

    if (options.onError) {
      this.on(ImageProcessorEvents.ERROR, options.onError);
    }

    // Initialize cache (if enabled)
    if (this.useCache) {
      const cacheOptions: CacheOptions = {
        ...(options.cacheOptions || {}),
        storageType: this.cacheStorageType,
      };
      this.cache = new ImageCache(cacheOptions);
    }

    // Set worker URL (custom or default)
    const workerUrl = options.workerUrl || this.getDefaultWorkerUrl();

    // Create worker adapter
    this.worker = new WorkerAdapter({
      id: `image-processor-${Date.now()}`,
      url: workerUrl,
    });

    // Register worker message handlers
    this.worker.on("message", this.handleWorkerMessage.bind(this));
    this.worker.on("error", this.handleWorkerError.bind(this));
  }

  /**
   * 타임아웃 값 가져오기
   * @returns 현재 설정된 타임아웃 값(ms)
   */
  public getTimeout(): number {
    return this.timeout;
  }

  /**
   * 타임아웃 값 설정하기
   * @param value 새 타임아웃 값(ms)
   */
  public setTimeout(value: number): void {
    if (value > 0) {
      this.timeout = value;
    }
  }

  /**
   * 타임아웃 매니저 통계 가져오기
   * @returns 타임아웃 관련 통계
   */
  public getTimeoutStats(): any {
    return this.timeoutManager.getStats();
  }

  /**
   * Generate default worker URL
   * @returns Default worker URL
   */
  private getDefaultWorkerUrl(): string {
    // Worker script content
    const workerScript = `
      // Image worker script content converted to string
      // In actual implementation, the worker-scripts/image-worker.ts file would be converted to a string during build
      self.addEventListener('message', (event) => {
        const { type, taskId, data } = event.data;
        
        if (type === 'startTask') {
          self.postMessage({
            type: 'taskFailed',
            taskId,
            error: 'Default worker implementation is not available. Please provide a workerUrl.'
          });
        }
      });
      
      self.postMessage({ type: 'workerReady', timestamp: Date.now() });
    `;

    // Create Blob URL
    const blob = new Blob([workerScript], { type: "application/javascript" });
    return URL.createObjectURL(blob);
  }

  /**
   * Handles messages received from the worker
   * Processes different message types and emits corresponding events
   *
   * @param event - Message event from worker containing data payload
   */
  private handleWorkerMessage(event: MessageEvent | any): void {
    // Extract message data
    const data = event.data || event;

    if (!data) {
      return;
    }

    try {
      // Ignore timestamp-only messages (browser initialization)
      if (data.timestamp && Object.keys(data).length === 1) {
        return;
      }

      // Special handling for worker ready messages (various formats)
      if (
        data.type === "workerReady" ||
        data.status === "ready" ||
        (data.data && data.data.status === "ready")
      ) {
        this.isReady = true;
        this.emit(ImageProcessorEvents.READY);
        return;
      }

      // Validate message type
      const type = data.type;
      if (!type) {
        console.warn(
          `[ImageProcessor] Message missing type field: ${JSON.stringify(data)}`
        );
        return;
      }

      // Process message by type
      switch (type) {
        case "taskProgress":
          if (data.taskId) {
            this.resetTaskTimeout(data.taskId);
            this.emit(ImageProcessorEvents.TASK_PROGRESS, data);
          }
          break;

        case "taskCompleted":
          if (data.taskId) {
            this.clearTaskTimeout(data.taskId);
            this.emit(ImageProcessorEvents.TASK_COMPLETE, data);

            // 작업 완료시 실행 시간 기록 (성능 측정용)
            const taskInfo = this.runningTasks.get(data.taskId);
            if (taskInfo) {
              const duration = Date.now() - taskInfo.startTime;
              this.runningTasks.delete(data.taskId);
              this.emit("taskDuration", { taskId: data.taskId, duration });
            }
          }
          break;

        case "taskFailed":
          if (data.taskId) {
            this.clearTaskTimeout(data.taskId);
            this.emit(ImageProcessorEvents.TASK_FAIL, data);

            // 작업 실패시에도 실행 시간 기록
            const taskInfo = this.runningTasks.get(data.taskId);
            if (taskInfo) {
              const duration = Date.now() - taskInfo.startTime;
              this.runningTasks.delete(data.taskId);
              this.emit("taskFailure", {
                taskId: data.taskId,
                duration,
                error: data.error,
              });
            }
          }
          break;

        case "cacheHit":
          this.emit(ImageProcessorEvents.CACHE_HIT, data);
          break;

        case "cacheMiss":
          this.emit(ImageProcessorEvents.CACHE_MISS, data);
          break;

        case "pong":
          // Ping response - ignore
          break;

        default:
          // Ignore unknown message types
          break;
      }
    } catch (error) {
      console.error("[ImageProcessor] Error processing message:", error);
    }
  }

  /**
   * 워커 오류 핸들러
   * @param error 오류 객체
   */
  private handleWorkerError(error: Error): void {
    this.emit(ImageProcessorEvents.ERROR, error);
  }

  /**
   * 새 작업 ID 생성
   * @returns 고유 작업 ID
   */
  private generateTaskId(): string {
    return `img-task-${Date.now()}-${this.taskIdCounter++}`;
  }

  /**
   * 작업 타임아웃 설정 (재시도 기능 포함)
   * @param taskId 작업 ID
   */
  private setTaskTimeout(taskId: string): void {
    if (!taskId) {
      console.warn("[ImageProcessor] Cannot set timeout for undefined taskId");
      return;
    }

    const taskInfo = {
      startTime: Date.now(),
      timeoutId: undefined as number | undefined,
    };

    // 재시도 기능이 있는 타임아웃 설정
    const timeoutId = this.timeoutManager.setWithRetry(
      taskId,
      () => {
        const task = this.worker.getTask(taskId);
        if (task && task.status === TaskStatus.RUNNING) {
          this.emit(ImageProcessorEvents.TASK_FAIL, {
            taskId,
            error: `Task timeout after all retries (${this.maxRetries}) exceeded`,
            retriesAttempted: this.maxRetries,
          });

          // 모든 재시도가 실패하면 실행 중인 작업 정리
          this.runningTasks.delete(taskId);
        }
        return false; // 이 값으로 성공/실패 여부를 판단 (false = 실패)
      },
      (retryCount: number, nextDelay: number) => {
        // 재시도 콜백 - 재시도 이벤트 발생
        this._handleTaskRetry({
          taskId,
          retryCount,
          maxRetries: this.maxRetries,
          nextDelay,
          error: "작업 타임아웃",
        });
      },
      this.timeout
    );

    // 작업 정보 저장 - 타입 명시
    taskInfo.timeoutId = timeoutId;
    this.runningTasks.set(taskId, taskInfo);
  }

  /**
   * 작업 타임아웃 갱신
   * @param taskId 작업 ID
   */
  private resetTaskTimeout(taskId: string): void {
    if (!taskId) {
      console.warn(
        "[ImageProcessor] Cannot reset timeout for undefined taskId"
      );
      return;
    }

    const taskInfo = this.runningTasks.get(taskId);
    if (!taskInfo || !taskInfo.timeoutId) {
      // 작업 정보나 타임아웃 ID가 없으면 새로 설정
      this.setTaskTimeout(taskId);
      return;
    }

    // 진행 중인 작업의 타임아웃 재설정
    this.timeoutManager.clear(String(taskInfo.timeoutId));

    // 새 타임아웃 설정
    this.setTaskTimeout(taskId);
  }

  /**
   * 작업 타임아웃 제거
   * @param taskId 작업 ID
   */
  private clearTaskTimeout(taskId: string): void {
    if (!taskId) {
      console.warn(
        "[ImageProcessor] Cannot clear timeout for undefined taskId"
      );
      return;
    }

    const taskInfo = this.runningTasks.get(taskId);
    if (taskInfo && taskInfo.timeoutId) {
      this.timeoutManager.clear(String(taskInfo.timeoutId));
    }

    // 실행 중인 작업 목록에서 제거
    this.runningTasks.delete(taskId);
  }

  /**
   * 이미지 크기 및 형식에 따라 타임아웃 동적 조정
   * @param imageSize 이미지 크기(바이트)
   * @param format 이미지 형식
   * @returns 조정된 타임아웃 값(ms)
   */
  public adjustTimeoutBasedOnImageSize(
    imageSize: number,
    format?: ImageFormat
  ): number {
    let adjustedTimeout = this.timeout;

    // 기본값: 1MB당 5초 추가
    const sizeMultiplier = 5000; // 5초/MB
    const sizeMB = imageSize / (1024 * 1024);

    // 이미지 크기에 비례하여 타임아웃 증가
    const sizeAdjustment = Math.min(sizeMB * sizeMultiplier, 60000); // 최대 60초 추가

    // 형식에 따른 추가 조정
    let formatAdjustment = 0;
    if (format) {
      switch (format) {
        case ImageFormat.PNG:
          // 무손실 압축 형식은 처리 시간이 더 오래 걸림
          formatAdjustment = 5000; // 5초 추가
          break;
        case ImageFormat.WEBP:
          // 압축 효율이 좋은 형식
          formatAdjustment = -2000; // 2초 감소
          break;
        default:
          formatAdjustment = 0;
          break;
      }
    }

    // 최종 타임아웃 (최소 5초)
    adjustedTimeout = Math.max(
      5000,
      this.timeout + sizeAdjustment + formatAdjustment
    );

    // 로깅 (디버깅용)
    console.log(
      `[ImageProcessor] Adjusted timeout: ${adjustedTimeout}ms (base: ${this.timeout}ms, size: +${sizeAdjustment}ms, format: ${formatAdjustment}ms)`
    );

    return adjustedTimeout;
  }

  /**
   * 모든 진행 중인 작업의 타임아웃 정리
   */
  private clearAllTimeouts(): void {
    for (const [taskId, taskInfo] of this.runningTasks.entries()) {
      if (taskInfo.timeoutId) {
        this.timeoutManager.clear(String(taskInfo.timeoutId));
      }
    }
    this.runningTasks.clear();
  }

  /**
   * 이미지 데이터에서 해시 식별자 생성
   * @param imageData 이미지 데이터
   * @param sourceUrl 이미지 소스 URL (선택사항) - 캐시 키 생성에 사용
   * @returns 해시 문자열
   */
  private generateImageId(
    imageData: Blob | ArrayBuffer | ImageData | string,
    sourceUrl?: string
  ): string {
    try {
      // 이미지 데이터가 문자열인 경우 (URL)
      if (typeof imageData === "string") {
        return `url-${imageData}`;
      }

      // 소스 URL이 제공된 경우 파일명 추출
      if (sourceUrl) {
        // URL의 파일명 부분 추출
        const urlPart = sourceUrl.split("/").pop() || sourceUrl;
        // 쿼리 파라미터 제거
        const cleanUrlPart = urlPart.split("?")[0];

        if (imageData instanceof Blob) {
          // 파일명 + 크기 + 타입
          return `file-${cleanUrlPart}-${imageData.size}-${imageData.type}`;
        }
      }

      // 웹 환경에서 가능한 간단한 해시 대체 함수
      if (typeof window !== "undefined") {
        // 샘플링하여 간단한 해시 생성
        let hashData: ArrayBuffer;

        if (imageData instanceof Blob) {
          // Blob의 경우 크기와 타입만으로 해시 생성 (Math.random 제거)
          const typeInfo = imageData.type || "unknown";
          // 크기와 타입에서 숫자 추출해서 조합
          const sizeHash = String(imageData.size)
            .split("")
            .reduce((a, b) => a + parseInt(b, 10), 0);
          const typeHash = typeInfo.replace(/[^a-z0-9]/g, "");
          return `blob-${imageData.size}-${typeInfo}-${sizeHash}${typeHash}`;
        } else if (imageData instanceof ArrayBuffer) {
          hashData = imageData;
        } else {
          // ImageData의 경우 데이터 배열 사용
          hashData = imageData.data.buffer;
        }

        // 샘플링하여 단순화된 해시 생성
        const view = new DataView(hashData);
        let hash = 0;
        for (let i = 0; i < Math.min(hashData.byteLength, 1024); i += 32) {
          if (i + 4 <= hashData.byteLength) {
            hash = hash ^ view.getUint32(i, true);
          }
        }

        return `sample-${hashData.byteLength}-${hash}`;
      }
      // Node.js 환경에서는 crypto 모듈 사용 가능
      else if (typeof crypto !== "undefined" && crypto.createHash) {
        const hash = crypto.createHash("md5");

        if (imageData instanceof Blob) {
          // 크기와 타입만으로 안정적인 해시 생성 (Math.random 제거)
          const typeInfo = imageData.type || "unknown";
          // 크기와 타입에서 간단한 해시 생성
          const sizeHash = String(imageData.size)
            .split("")
            .reduce((a, b) => a + parseInt(b, 10), 0);
          const typeHash = typeInfo.replace(/[^a-z0-9]/g, "");
          return `blob-${imageData.size}-${typeInfo}-${sizeHash}${typeHash}`;
        } else if (imageData instanceof ArrayBuffer) {
          hash.update(Buffer.from(imageData));
        } else {
          // ImageData의 경우 데이터 배열 사용
          hash.update(Buffer.from(imageData.data.buffer));
        }

        return hash.digest("hex");
      }

      // 기본 폴백: 타입과 크기 정보 활용
      let sizeInfo = 0;
      let typeInfo = "";

      if (imageData instanceof Blob) {
        sizeInfo = imageData.size;
        typeInfo = imageData.type || "unknown";
      } else if (imageData instanceof ArrayBuffer) {
        sizeInfo = imageData.byteLength;
        typeInfo = "arraybuffer";
      } else {
        sizeInfo = imageData.data.length;
        typeInfo = `imagedata-${imageData.width}x${imageData.height}`;
      }

      // 무작위 값 대신 크기와 타입으로부터 간단한 해시 생성
      const sizeHash = String(sizeInfo)
        .split("")
        .reduce((a, b) => a + parseInt(b, 10), 0);
      const typeHash = typeInfo.replace(/[^a-z0-9]/g, "").substring(0, 8);
      return `img-${typeInfo}-${sizeInfo}-${sizeHash}${typeHash}`;
    } catch (error) {
      console.error("이미지 ID 생성 오류:", error);
      // 오류 발생 시에도 무작위 값 대신 고정 값 사용
      return `img-fallback-error`;
    }
  }

  /**
   * 이미지 스케일링 (비동기)
   * @param imageData 원본 이미지 데이터 (Blob, ArrayBuffer, ImageData)
   * @param options 처리 옵션
   * @param sourceUrl 이미지 소스 URL (선택사항) - 캐시 키 생성에 사용
   * @returns Promise<ProcessingResult>
   */
  async scaleImage(
    imageData: ImageSource,
    options: ImageProcessingOptions = {},
    sourceUrl?: string
  ): Promise<ProcessingResult> {
    // 기본 옵션 설정
    const defaultOptions: ImageProcessingOptions = {
      width: 0,
      height: 0,
      maintainAspectRatio: true,
      quality: 0.8,
      format: ImageFormat.JPEG,
      useDiscreteScales: this.useDiscreteScales,
    };

    // 옵션 병합
    const finalOptions = { ...defaultOptions, ...options };

    // 이미지 ID 생성 (캐싱용)
    const imageId = this.generateImageId(imageData, sourceUrl);

    // 캐시 확인 (활성화된 경우)
    if (this.useCache && this.cache) {
      try {
        const cachedResult = await this.cache.get(imageId, finalOptions);

        if (cachedResult) {
          this.emit(ImageProcessorEvents.CACHE_HIT, {
            imageId,
            options: finalOptions,
          });
          return cachedResult;
        } else {
          this.emit(ImageProcessorEvents.CACHE_MISS, {
            imageId,
            options: finalOptions,
          });
        }
      } catch (error) {
        console.warn("캐시 조회 중 오류:", error);
      }
    }

    return new Promise(async (resolve, reject) => {
      try {
        // 이미지 프로세서 준비 확인
        if (!this.isReady) {
          throw new Error("ImageProcessor is not ready");
        }

        // 작업 ID 생성
        const taskId = this.generateTaskId();

        // 진행 상황 업데이트 핸들러
        const progressHandler = (data: any) => {
          if (data.taskId === taskId && data.progress !== undefined) {
            // 타임아웃 리셋 (진행 상황이 있다면 작업 중임)
            this.resetTaskTimeout(taskId);

            // 사용자 지정 진행 콜백이 있는 경우 호출
            if (finalOptions.onProgress) {
              finalOptions.onProgress(data.progress);
            }
          }
        };

        // 작업 완료 핸들러
        const completeHandler = async (data: any) => {
          if (data.taskId === taskId) {
            // 타임아웃 제거 (작업 완료)
            this.clearTaskTimeout(taskId);

            // 캐시에 결과 저장 (활성화된 경우)
            if (this.useCache && this.cache && data.result) {
              try {
                await this.cache.set(imageId, finalOptions, data.result);
              } catch (error) {
                console.warn("캐시 저장 중 오류:", error);
              }
            }

            cleanup();
            resolve(data.result);
          }
        };

        // 작업 실패 핸들러
        const failHandler = (data: any) => {
          if (data.taskId === taskId) {
            // 타임아웃 제거 (작업 실패)
            this.clearTaskTimeout(taskId);

            cleanup();
            reject(new Error(data.error));
          }
        };

        // 리소스 정리 함수
        const cleanup = () => {
          this.off(ImageProcessorEvents.TASK_PROGRESS, progressHandler);
          this.off(ImageProcessorEvents.TASK_COMPLETE, completeHandler);
          this.off(ImageProcessorEvents.TASK_FAIL, failHandler);
        };

        // 이벤트 리스너 등록
        this.on(ImageProcessorEvents.TASK_PROGRESS, progressHandler);
        this.on(ImageProcessorEvents.TASK_COMPLETE, completeHandler);
        this.on(ImageProcessorEvents.TASK_FAIL, failHandler);

        // 태스크 시작 이벤트 발생
        this.emit(ImageProcessorEvents.TASK_START, {
          taskId,
          options: finalOptions,
        });

        // 작업 타임아웃 설정
        this.setTaskTimeout(taskId);

        // Transferable 객체 준비
        const transferables: Transferable[] = [];

        // 원본 이미지 데이터 (변경 가능)
        let processableImageData: any = imageData;

        // imageData가 Blob, ArrayBuffer, ImageData인 경우 처리
        if (typeof Blob !== "undefined" && imageData instanceof Blob) {
          try {
            const arrayBuffer = await imageData.arrayBuffer();
            processableImageData = arrayBuffer;
            transferables.push(arrayBuffer);
          } catch (error) {
            console.warn("Blob을 ArrayBuffer로 변환 중 오류:", error);
            // 오류 발생하면 원본 Blob 사용
          }
        } else if (
          typeof ArrayBuffer !== "undefined" &&
          imageData instanceof ArrayBuffer
        ) {
          transferables.push(imageData);
        } else if (
          typeof ImageData !== "undefined" &&
          typeof imageData === "object" &&
          imageData !== null &&
          "data" in imageData &&
          "buffer" in imageData.data &&
          imageData.data.buffer instanceof ArrayBuffer
        ) {
          transferables.push(imageData.data.buffer);
        }

        // 워커에 작업 전송 - transferables 활용
        const taskData = {
          type: ImageTaskType.SCALE,
          taskId,
          imageData: processableImageData,
          options: finalOptions,
        };

        this.worker.startTask({
          id: taskId,
          type: "image_task",
          workerType: WorkerType.IMAGE,
          data: taskData,
          status: TaskStatus.QUEUED,
          priority: TaskPriority.NORMAL,
          submittedAt: Date.now(),
          options: {
            priority: TaskPriority.NORMAL,
            transferables: transferables.length > 0 ? transferables : undefined,
          },
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Blob에서 이미지 로드 (크기 정보 추출용)
   * @param blob 이미지 Blob
   * @returns Promise<{width: number, height: number}>
   */
  private loadImageFromBlob(
    blob: Blob
  ): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      // 브라우저 환경에서만 동작
      if (typeof window === "undefined" || typeof Image === "undefined") {
        reject(
          new Error("Image loading is only supported in browser environment")
        );
        return;
      }

      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: img.width,
          height: img.height,
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };

      img.src = url;
    });
  }

  /**
   * 캐시 통계 정보 반환
   * @returns 캐시 통계 또는, 캐시 비활성화 시 null
   */
  getCacheStats(): {
    size: number;
    memoryHits: number;
    memoryMisses: number;
    dbHits: number;
    dbMisses: number;
    evictions: number;
    totalHits: number;
    totalMisses: number;
  } | null {
    if (!this.useCache || !this.cache) {
      return null;
    }
    return this.cache.getStats();
  }

  /**
   * 캐시 스토리지 타입 변경
   * @param storageType 새 스토리지 타입
   */
  async setCacheStorageType(storageType: CacheStorageType): Promise<void> {
    if (!this.useCache || !this.cache) {
      this.cacheStorageType = storageType;
      return;
    }

    await this.cache.setStorageType(storageType);
    this.cacheStorageType = storageType;
  }

  /**
   * 캐시 활성화 여부 설정
   * @param enabled 캐시 활성화 여부
   * @param options 캐시 옵션 (기존 옵션 대체)
   */
  async setCacheEnabled(
    enabled: boolean,
    options?: CacheOptions
  ): Promise<void> {
    this.useCache = enabled;

    if (enabled) {
      if (!this.cache) {
        const cacheOptions: CacheOptions = {
          ...(options || {}),
          storageType: options?.storageType || this.cacheStorageType,
        };
        this.cache = new ImageCache(cacheOptions);
      } else if (options) {
        // 기존 캐시가 있고 새 옵션이 있는 경우, 캐시를 재생성
        this.cache.dispose();
        this.cache = new ImageCache({
          ...options,
          storageType: options.storageType || this.cacheStorageType,
        });
      }
    } else if (this.cache) {
      this.cache.dispose();
      this.cache = null;
    }
  }

  /**
   * 캐시 초기화
   */
  async clearCache(): Promise<void> {
    if (this.useCache && this.cache) {
      await this.cache.clear();
    }
  }

  /**
   * 리소스 정리
   */
  terminate(): void {
    // 타임아웃 타이머 정리
    this.timeoutManager.clearAll();

    // 캐시 정리
    if (this.cache) {
      this.cache.dispose();
      this.cache = null;
    }

    // 워커 종료
    if (this.worker) {
      this.worker.terminate();
    }
  }

  /**
   * 작업 재시도 처리 핸들러
   * @param data 재시도 이벤트 데이터
   * @private
   */
  private _handleTaskRetry(data: {
    taskId: string;
    retryCount: number;
    maxRetries: number;
    nextDelay: number;
    error?: string;
  }): void {
    this.emit(ImageProcessorEvents.TASK_RETRY, data);
  }
}

/**
 * Discrete Scale Calculation Function
 * Returns the most suitable discrete scale based on given size and original size
 *
 * @param originalWidth Original image width
 * @param originalHeight Original image height
 * @param targetWidth Target width
 * @param targetHeight Target height
 * @param discreteScales Discrete scale values
 * @param devicePixelRatio Device pixel ratio
 * @returns Calculated discrete scale value
 */
export function calculateDiscreteScale(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number = 0,
  targetHeight: number = 0,
  discreteScales: Record<string, number> = DISCRETE_SCALES,
  devicePixelRatio: number = 1
): number {
  // If target size is not specified, use original size
  if (!targetWidth && !targetHeight) {
    return discreteScales.ORIGINAL;
  }

  // If screen size is specified, calculate ratio
  let displayRatio: number;

  if (targetWidth && targetHeight) {
    // If both width and height are specified, use smaller ratio
    const widthRatio = (targetWidth / originalWidth) * devicePixelRatio;
    const heightRatio = (targetHeight / originalHeight) * devicePixelRatio;
    displayRatio = Math.min(widthRatio, heightRatio);
  } else if (targetWidth) {
    // If only width is specified
    displayRatio = (targetWidth / originalWidth) * devicePixelRatio;
  } else {
    // If only height is specified
    displayRatio = (targetHeight / originalHeight) * devicePixelRatio;
  }

  // Determine discrete scale value
  const scales = Object.values(discreteScales).sort((a, b) => b - a);

  // Find the largest discrete scale that is less than or equal to calculated ratio
  for (const scale of scales) {
    if (displayRatio >= scale) {
      return scale;
    }
  }

  // If all scales are smaller, return the smallest scale
  return scales[scales.length - 1];
}
