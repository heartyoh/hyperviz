/**
 * 이미지 처리 모듈 타입 정의
 */

/**
 * 스케일링 알고리즘 유형
 */
export enum ScalingAlgorithm {
  /** 최근접 이웃 (가장 빠르지만 품질이 낮음) */
  NEAREST_NEIGHBOR = "nearest",
  /** 바이리니어 (중간 품질과 속도) */
  BILINEAR = "bilinear",
  /** 바이큐빅 (높은 품질) */
  BICUBIC = "bicubic",
  /** 랑초스 (가장 높은 품질) */
  LANCZOS = "lanczos",
}

/**
 * 이미지 포맷 유형
 */
export enum ImageFormat {
  /** JPEG 이미지 포맷 */
  JPEG = "image/jpeg",
  /** PNG 이미지 포맷 */
  PNG = "image/png",
  /** WebP 이미지 포맷 */
  WEBP = "image/webp",
}

/**
 * 이미지 처리 옵션
 */
export interface ImageProcessingOptions {
  /** 너비 (픽셀) */
  width?: number;
  /** 높이 (픽셀) */
  height?: number;
  /** 가로세로 비율 유지 여부 */
  maintainAspectRatio?: boolean;
  /** 스케일링 알고리즘 */
  algorithm?: ScalingAlgorithm;
  /** 이미지 품질 (0-1) */
  quality?: number;
  /** 출력 포맷 */
  format?: ImageFormat;
  /** 진행 상황 콜백 */
  onProgress?: (progress: number) => void;
  /** 이산 스케일 사용 여부 (최적화) */
  useDiscreteScales?: boolean;
  /** 이산 스케일 오버라이드 값 */
  discreteScalesOverride?: Record<string, number>;
  /** 화면 크기 (뷰포트) 너비 */
  boundWidth?: number;
  /** 화면 크기 (뷰포트) 높이 */
  boundHeight?: number;
  /** 기기 픽셀 비율 (DPR) */
  devicePixelRatio?: number;
}

/**
 * 캐시 스토리지 유형
 */
export enum CacheStorageType {
  /** 메모리 기반 캐시 */
  MEMORY = "memory",
  /** IndexedDB 기반 캐시 */
  INDEXED_DB = "indexeddb",
  /** 하이브리드 캐시 (메모리 + IndexedDB) */
  HYBRID = "hybrid",
}

/**
 * 이미지 메타데이터
 */
export interface ImageMetadata {
  /** 원본 너비 */
  originalWidth: number;
  /** 원본 높이 */
  originalHeight: number;
  /** 원본 포맷 */
  originalFormat: string;
  /** 처리된 너비 */
  processedWidth: number;
  /** 처리된 높이 */
  processedHeight: number;
  /** 처리 시간 (ms) */
  processingTime: number;
  /** 캐시에서 로드되었는지 여부 */
  fromCache?: boolean;
}

/**
 * 이미지 처리 결과
 */
export interface ImageProcessingResult {
  /** 처리된 이미지 데이터 (Blob, ArrayBuffer 또는 Base64 문자열) */
  data: Blob | ArrayBuffer | string;
  /** 이미지 메타데이터 */
  metadata: ImageMetadata;
}

/**
 * 워커 태스크 타입
 */
export enum ImageTaskType {
  /** 이미지 스케일링 */
  SCALE = "scale",
  /** 이미지 포맷 변환 */
  CONVERT = "convert",
  /** 이미지 효과 적용 */
  APPLY_EFFECT = "apply_effect",
}

/**
 * 워커 태스크 요청 메시지
 */
export interface ImageTaskRequest {
  /** 태스크 유형 */
  type: ImageTaskType;
  /** 태스크 ID */
  taskId: string;
  /** 이미지 데이터 (ArrayBuffer 또는 ImageData) */
  imageData: ArrayBuffer | ImageData;
  /** 처리 옵션 */
  options: ImageProcessingOptions;
}

/**
 * 워커 태스크 응답 메시지
 */
export interface ImageTaskResponse {
  /** 태스크 유형 */
  type: "taskCompleted" | "taskFailed" | "taskProgress";
  /** 태스크 ID */
  taskId: string;
  /** 처리 결과 (완료 시) */
  result?: ImageProcessingResult;
  /** 에러 메시지 (실패 시) */
  error?: string;
  /** 진행 상황 (0-1) */
  progress?: number;
}
