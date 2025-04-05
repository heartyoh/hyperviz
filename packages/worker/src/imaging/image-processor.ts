/**
 * 이미지 처리 메인 클래스
 * WorkerAdapter를 활용한 이미지 처리 기능 제공
 */
import { EventEmitter } from "eventemitter3";
import { WorkerAdapter } from "../core/worker-adapter.js";
import {
  CacheStorageType,
  ImageProcessingOptions,
  ImageProcessingResult,
  ImageTaskType,
  ScalingAlgorithm,
  ImageFormat,
} from "./types.js";
import { ImageCache, ImageCacheOptions } from "./image-cache.js";
import * as crypto from "crypto";
import {
  TaskPriority,
  TaskStatus,
  WorkerType,
  IWorkerPool,
} from "../types/index.js";

/**
 * 이미지 프로세서 이벤트 타입
 */
export enum ImageProcessorEvent {
  /** 준비 완료 */
  READY = "ready",
  /** 오류 발생 */
  ERROR = "error",
  /** 작업 시작 */
  TASK_START = "taskStart",
  /** 작업 진행 */
  TASK_PROGRESS = "taskProgress",
  /** 작업 완료 */
  TASK_COMPLETE = "taskComplete",
  /** 작업 실패 */
  TASK_FAIL = "taskFail",
  /** 캐시 히트 */
  CACHE_HIT = "cacheHit",
  /** 캐시 미스 */
  CACHE_MISS = "cacheMiss",
}

/**
 * 이산 스케일 상수 - 가장 많이 사용되는 크기로 제한하여 캐시 최적화
 */
export const DISCRETE_SCALES = {
  ORIGINAL: 1.0, // 원본 크기
  MEDIUM: 0.5, // 원본의 50%
  SMALL: 0.25, // 원본의 25%
  TINY: 0.1, // 원본의 10%
};

/**
 * 이미지 프로세서 옵션
 */
export interface ImageProcessorOptions {
  /** 워커 스크립트 URL (기본값: 내장 URL) */
  workerUrl?: string;
  /** 작업 제한 시간 (ms) */
  timeout?: number;
  /** 초기화 완료 콜백 */
  onReady?: () => void;
  /** 오류 발생 콜백 */
  onError?: (error: Error) => void;
  /** 캐시 사용 여부 (기본값: true) */
  useCache?: boolean;
  /** 캐시 스토리지 유형 (기본값: MEMORY) */
  cacheStorageType?: CacheStorageType;
  /** 캐시 옵션 */
  cacheOptions?: ImageCacheOptions;
  /** 이산 스케일 사용 여부 */
  useDiscreteScales?: boolean;
  /** 커스텀 이산 스케일 값 */
  discreteScales?: Record<string, number>;
}

/**
 * 이미지 프로세서 클래스
 * 워커 스레드를 활용한 이미지 처리 기능 제공
 */
export class ImageProcessor extends EventEmitter {
  /** 워커 URL */
  private workerUrl: string = "";
  /** 워커 */
  private worker: WorkerAdapter;
  /** 준비 완료 여부 */
  private isReady: boolean = false;
  /** 작업 ID 카운터 */
  private taskIdCounter: number = 0;
  /** 작업 제한 시간 */
  private timeout: number;
  /** 작업 제한 시간 타이머 */
  private timeoutTimers: Map<string, NodeJS.Timeout> = new Map();
  /** 이미지 캐시 */
  private cache: ImageCache | null = null;
  /** 캐시 사용 여부 */
  private useCache: boolean;
  /** 캐시 스토리지 유형 */
  private cacheStorageType: CacheStorageType;
  /** 이산 스케일 사용 여부 */
  private useDiscreteScales: boolean;
  /** 이산 스케일 값 */
  private discreteScales: Record<string, number>;

  /**
   * 이미지 프로세서 생성자
   * @param options 초기화 옵션
   */
  constructor(options: ImageProcessorOptions = {}) {
    super();

    // 옵션 설정
    this.timeout = options.timeout || 30000; // 기본 30초
    this.useCache = options.useCache !== false; // 기본적으로 캐시 활성화
    this.cacheStorageType = options.cacheStorageType || CacheStorageType.MEMORY;

    // 이산 스케일 설정
    this.useDiscreteScales = options.useDiscreteScales || false;
    this.discreteScales = options.discreteScales || DISCRETE_SCALES;

    // 이벤트 핸들러 등록
    if (options.onReady) {
      this.on(ImageProcessorEvent.READY, options.onReady);
    }

    if (options.onError) {
      this.on(ImageProcessorEvent.ERROR, options.onError);
    }

    // 캐시 초기화 (사용 설정된 경우)
    if (this.useCache) {
      const cacheOptions: ImageCacheOptions = {
        ...(options.cacheOptions || {}),
        storageType: this.cacheStorageType,
      };
      this.cache = new ImageCache(cacheOptions);
    }

    // 워커 URL 설정 (사용자 지정 또는 기본값)
    const workerUrl = options.workerUrl || this.getDefaultWorkerUrl();

    // 워커 어댑터 생성
    this.worker = new WorkerAdapter({
      id: `image-processor-${Date.now()}`,
      url: workerUrl,
    });

    // 워커 메시지 핸들러 등록
    this.worker.on("message", this.handleWorkerMessage.bind(this));
    this.worker.on("error", this.handleWorkerError.bind(this));
  }

  /**
   * 기본 워커 URL 생성
   * @returns 기본 워커 URL
   */
  private getDefaultWorkerUrl(): string {
    // 워커 스크립트 내용
    const workerScript = `
      // 이미지 워커 스크립트 내용이 문자열로 변환되어 포함됨
      // 실제 구현에서는 빌드 과정에서 worker-scripts/image-worker.ts 파일을 문자열로 변환하여 삽입
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

    // Blob URL 생성
    const blob = new Blob([workerScript], { type: "application/javascript" });
    return URL.createObjectURL(blob);
  }

  /**
   * 워커 메시지 핸들러
   * @param message 워커로부터 받은 메시지
   */
  private handleWorkerMessage(message: any): void {
    if (!message || !message.type) return;

    switch (message.type) {
      // 워커 준비 완료
      case "workerReady":
        this.isReady = true;
        this.emit(ImageProcessorEvent.READY);
        break;

      // 작업 진행 상황
      case "taskProgress":
        // 타임아웃 타이머 갱신
        this.resetTaskTimeout(message.taskId);

        if (message.progress !== undefined) {
          this.emit(ImageProcessorEvent.TASK_PROGRESS, {
            taskId: message.taskId,
            progress: message.progress,
          });
        }
        break;

      // 작업 완료
      case "taskCompleted":
        // 타임아웃 타이머 제거
        this.clearTaskTimeout(message.taskId);

        this.emit(ImageProcessorEvent.TASK_COMPLETE, {
          taskId: message.taskId,
          result: message.result,
        });
        break;

      // 작업 실패
      case "taskFailed":
        // 타임아웃 타이머 제거
        this.clearTaskTimeout(message.taskId);

        this.emit(ImageProcessorEvent.TASK_FAIL, {
          taskId: message.taskId,
          error: message.error,
        });
        break;
    }
  }

  /**
   * 워커 오류 핸들러
   * @param error 오류 객체
   */
  private handleWorkerError(error: Error): void {
    this.emit(ImageProcessorEvent.ERROR, error);
  }

  /**
   * 새 작업 ID 생성
   * @returns 고유 작업 ID
   */
  private generateTaskId(): string {
    return `img-task-${Date.now()}-${this.taskIdCounter++}`;
  }

  /**
   * 작업 타임아웃 설정
   * @param taskId 작업 ID
   */
  private setTaskTimeout(taskId: string): void {
    const timer = setTimeout(() => {
      this.emit(ImageProcessorEvent.TASK_FAIL, {
        taskId,
        error: `Task timeout after ${this.timeout}ms`,
      });
      this.timeoutTimers.delete(taskId);
    }, this.timeout);

    this.timeoutTimers.set(taskId, timer);
  }

  /**
   * 작업 타임아웃 갱신
   * @param taskId 작업 ID
   */
  private resetTaskTimeout(taskId: string): void {
    this.clearTaskTimeout(taskId);
    this.setTaskTimeout(taskId);
  }

  /**
   * 작업 타임아웃 제거
   * @param taskId 작업 ID
   */
  private clearTaskTimeout(taskId: string): void {
    const timer = this.timeoutTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(taskId);
    }
  }

  /**
   * 이미지 데이터에서 해시 식별자 생성
   * @param imageData 이미지 데이터
   * @param sourceUrl 이미지 소스 URL (선택사항) - 캐시 키 생성에 사용
   * @returns 해시 문자열
   */
  private generateImageId(
    imageData: Blob | ArrayBuffer | ImageData,
    sourceUrl?: string
  ): string {
    try {
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
   * @returns Promise<ImageProcessingResult>
   */
  async scaleImage(
    imageData: Blob | ArrayBuffer | ImageData,
    options: ImageProcessingOptions = {},
    sourceUrl?: string
  ): Promise<ImageProcessingResult> {
    // 기본 옵션 설정
    const defaultOptions: ImageProcessingOptions = {
      width: 0,
      height: 0,
      maintainAspectRatio: true,
      algorithm: ScalingAlgorithm.BILINEAR,
      quality: 0.8,
      format: ImageFormat.JPEG,
      useDiscreteScales: this.useDiscreteScales,
    };

    // 옵션 병합
    const finalOptions = { ...defaultOptions, ...options };

    // 이미지 크기 정보 추출 (ImageData 또는 Blob에서)
    let originalWidth = 0;
    let originalHeight = 0;

    if (imageData instanceof ImageData) {
      originalWidth = imageData.width;
      originalHeight = imageData.height;
    } else if (
      imageData instanceof Blob &&
      finalOptions.width &&
      finalOptions.height
    ) {
      // Blob에서는 직접 크기를 알 수 없으므로 옵션에서 제공된 값 사용
      originalWidth = finalOptions.width;
      originalHeight = finalOptions.height;
    }

    // 이산 스케일 적용 (옵션 활성화 시)
    if (
      finalOptions.useDiscreteScales &&
      originalWidth > 0 &&
      originalHeight > 0
    ) {
      // 이산 스케일 계산
      const discreteScale = calculateDiscreteScale(
        originalWidth,
        originalHeight,
        finalOptions.width,
        finalOptions.height,
        this.discreteScales,
        finalOptions.devicePixelRatio || 1
      );

      // 최종 너비와 높이 계산
      if (finalOptions.width || finalOptions.height) {
        // 비율에 맞게 크기 조정
        if (finalOptions.width && !finalOptions.height) {
          finalOptions.width = Math.round(originalWidth * discreteScale);
        } else if (!finalOptions.width && finalOptions.height) {
          finalOptions.height = Math.round(originalHeight * discreteScale);
        } else {
          // 둘 다 있는 경우 유지 비율에 따라 조정
          if (finalOptions.maintainAspectRatio) {
            const aspectRatio = originalWidth / originalHeight;

            // 타입 안전성 보장: finalOptions.width와 finalOptions.height를 임시 변수에 저장
            const currentWidth = finalOptions.width || 0;
            const currentHeight = finalOptions.height || 0;

            if (currentWidth / currentHeight > aspectRatio) {
              // 높이 맞춤
              finalOptions.height = Math.round(originalHeight * discreteScale);
              finalOptions.width = Math.round(
                finalOptions.height * aspectRatio
              );
            } else {
              // 너비 맞춤
              finalOptions.width = Math.round(originalWidth * discreteScale);
              finalOptions.height = Math.round(
                finalOptions.width / aspectRatio
              );
            }
          }
        }
      }
    }

    // 이미지 ID 생성 (캐싱용)
    const imageId = this.generateImageId(imageData, sourceUrl);

    // 캐시 확인 (활성화된 경우)
    if (this.useCache && this.cache) {
      try {
        const cachedResult = await this.cache.get(imageId, finalOptions);

        if (cachedResult) {
          this.emit(ImageProcessorEvent.CACHE_HIT, {
            imageId,
            options: finalOptions,
          });
          return cachedResult;
        } else {
          this.emit(ImageProcessorEvent.CACHE_MISS, {
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
        // 이미지 데이터가 Blob인 경우 ArrayBuffer로 변환
        let processedImageData: ArrayBuffer | ImageData = imageData as
          | ArrayBuffer
          | ImageData;

        if (imageData instanceof Blob) {
          processedImageData = await imageData.arrayBuffer();
        }

        // 진행 상황 업데이트 핸들러
        const progressHandler = (data: any) => {
          if (data.taskId === taskId && data.progress !== undefined) {
            // 사용자 지정 진행 콜백이 있는 경우 호출
            if (finalOptions.onProgress) {
              finalOptions.onProgress(data.progress);
            }
          }
        };

        // 작업 완료 핸들러
        const completeHandler = async (data: any) => {
          if (data.taskId === taskId) {
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
            cleanup();
            reject(new Error(data.error));
          }
        };

        // 리소스 정리 함수
        const cleanup = () => {
          this.off(ImageProcessorEvent.TASK_PROGRESS, progressHandler);
          this.off(ImageProcessorEvent.TASK_COMPLETE, completeHandler);
          this.off(ImageProcessorEvent.TASK_FAIL, failHandler);
        };

        // 이벤트 리스너 등록
        this.on(ImageProcessorEvent.TASK_PROGRESS, progressHandler);
        this.on(ImageProcessorEvent.TASK_COMPLETE, completeHandler);
        this.on(ImageProcessorEvent.TASK_FAIL, failHandler);

        // 태스크 시작 이벤트 발생
        this.emit(ImageProcessorEvent.TASK_START, {
          taskId,
          options: finalOptions,
        });

        // 작업 타임아웃 설정
        this.setTaskTimeout(taskId);

        // 워커에 작업 전송
        this.worker.startTask({
          id: taskId,
          type: "image_task",
          workerType: WorkerType.IMAGE,
          data: {
            type: ImageTaskType.SCALE,
            taskId,
            imageData: processedImageData,
            options: finalOptions,
          },
          status: TaskStatus.QUEUED,
          priority: TaskPriority.NORMAL,
          submittedAt: Date.now(),
          options: {
            priority: TaskPriority.NORMAL,
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
    options?: ImageCacheOptions
  ): Promise<void> {
    this.useCache = enabled;

    if (enabled) {
      if (!this.cache) {
        const cacheOptions: ImageCacheOptions = {
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
  dispose(): void {
    // 작업 타임아웃 타이머 정리
    this.timeoutTimers.forEach((timer) => clearTimeout(timer));
    this.timeoutTimers.clear();

    // 캐시 정리
    if (this.cache) {
      this.cache.dispose();
      this.cache = null;
    }

    // 워커 종료
    if (this.worker) {
      this.worker.terminate();
    }

    // 이벤트 리스너 제거
    this.removeAllListeners();
  }
}

/**
 * 이산 스케일 계산 함수
 * 주어진 크기와 원본 크기를 기반으로 가장 적합한 이산 스케일을 반환합니다.
 *
 * @param originalWidth 원본 이미지 너비
 * @param originalHeight 원본 이미지 높이
 * @param targetWidth 대상 너비
 * @param targetHeight 대상 높이
 * @param discreteScales 이산 스케일 값
 * @param devicePixelRatio 기기 픽셀 비율
 * @returns 계산된 이산 스케일 값
 */
export function calculateDiscreteScale(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number = 0,
  targetHeight: number = 0,
  discreteScales: Record<string, number> = DISCRETE_SCALES,
  devicePixelRatio: number = 1
): number {
  // 대상 크기가 지정되지 않은 경우 원본 크기 사용
  if (!targetWidth && !targetHeight) {
    return discreteScales.ORIGINAL;
  }

  // 화면 크기가 지정된 경우 비율 계산
  let displayRatio: number;

  if (targetWidth && targetHeight) {
    // 너비와 높이 모두 지정된 경우 더 작은 비율 사용
    const widthRatio = (targetWidth / originalWidth) * devicePixelRatio;
    const heightRatio = (targetHeight / originalHeight) * devicePixelRatio;
    displayRatio = Math.min(widthRatio, heightRatio);
  } else if (targetWidth) {
    // 너비만 지정된 경우
    displayRatio = (targetWidth / originalWidth) * devicePixelRatio;
  } else {
    // 높이만 지정된 경우
    displayRatio = (targetHeight / originalHeight) * devicePixelRatio;
  }

  // 이산 스케일 값 결정
  const scales = Object.values(discreteScales).sort((a, b) => b - a);

  // 계산된 비율보다 작거나 같은 가장 큰 이산 스케일 찾기
  for (const scale of scales) {
    if (displayRatio >= scale) {
      return scale;
    }
  }

  // 모든 스케일보다 작은 경우 가장 작은 스케일 반환
  return scales[scales.length - 1];
}
