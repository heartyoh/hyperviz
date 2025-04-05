/**
 * 이미지 캐시 모듈
 * 이미지 처리 결과를 메모리에 캐싱하여 재계산 방지
 */
import {
  CacheStorageType,
  ImageProcessingOptions,
  ImageProcessingResult,
} from "./types.js";

/**
 * 캐시 항목 인터페이스
 */
interface CacheItem {
  /** 처리 결과 */
  result: ImageProcessingResult;
  /** 캐시 생성 시간 */
  timestamp: number;
  /** 마지막 접근 시간 */
  lastAccessed: number;
}

/**
 * 이미지 캐시 설정
 */
export interface ImageCacheOptions {
  /** 최대 캐시 크기 (항목 수) */
  maxSize?: number;
  /** 캐시 항목 만료 시간 (ms) */
  expiryTime?: number;
  /** 자동 정리 간격 (ms) */
  cleanupInterval?: number;
  /** 디버그 로깅 활성화 */
  debug?: boolean;
  /** 캐시 스토리지 유형 (기본값: MEMORY) */
  storageType?: CacheStorageType;
  /** IndexedDB 데이터베이스 이름 */
  dbName?: string;
  /** IndexedDB 버전 */
  dbVersion?: number;
}

// IndexedDB 관련 상수
const DB_NAME = "hyperviz-image-cache";
const DB_VERSION = 1;
const STORE_NAME = "image-processing-results";

/**
 * 이미지 캐시 클래스
 *
 * 이미지 처리 결과를 메모리에 캐싱하여 동일한 이미지와 옵션에 대한
 * 중복 처리를 방지하고 성능을 향상시킵니다.
 */
export class ImageCache {
  /** 캐시 항목 저장소 */
  private cache = new Map<string, CacheItem>();
  /** 캐시 통계 */
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    dbHits: 0,
    dbMisses: 0,
  };
  /** 최대 캐시 크기 */
  private maxSize: number;
  /** 캐시 항목 만료 시간 (ms) */
  private expiryTime: number;
  /** 정리 타이머 ID */
  private cleanupTimer: NodeJS.Timeout | null = null;
  /** 디버그 모드 */
  private debug: boolean;
  /** 캐시 스토리지 유형 */
  private storageType: CacheStorageType;
  /** IndexedDB 데이터베이스 이름 */
  private dbName: string;
  /** IndexedDB 버전 */
  private dbVersion: number;
  /** IndexedDB 데이터베이스 인스턴스 */
  private db: IDBDatabase | null = null;
  /** IndexedDB 초기화 완료 여부 */
  private dbInitialized = false;
  /** IndexedDB 초기화 중 여부 */
  private dbInitializing = false;
  /** IndexedDB 초기화 대기 프로미스 */
  private dbInitPromise: Promise<void> | null = null;

  /**
   * 이미지 캐시 생성자
   * @param options 캐시 설정
   */
  constructor(options: ImageCacheOptions = {}) {
    this.maxSize = options.maxSize || 100;
    this.expiryTime = options.expiryTime || 10 * 60 * 1000; // 기본 10분
    this.debug = options.debug || false;
    this.storageType = options.storageType || CacheStorageType.MEMORY;
    this.dbName = options.dbName || DB_NAME;
    this.dbVersion = options.dbVersion || DB_VERSION;

    // 정기적인 캐시 정리 설정
    const cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // 기본 5분
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);

    // IndexedDB 사용 시 초기화
    if (
      this.storageType === CacheStorageType.INDEXED_DB ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      this.initIndexedDB();
    }
  }

  /**
   * IndexedDB 초기화
   * @returns 초기화 완료 프로미스
   */
  private async initIndexedDB(): Promise<void> {
    // 브라우저 환경 체크
    if (typeof indexedDB === "undefined") {
      this.logDebug(
        "IndexedDB를 사용할 수 없는 환경입니다. 메모리 캐시만 사용합니다."
      );
      this.storageType = CacheStorageType.MEMORY;
      return;
    }

    // 이미 초기화 중인 경우
    if (this.dbInitializing) {
      return this.dbInitPromise as Promise<void>;
    }

    // 이미 초기화된 경우
    if (this.dbInitialized) {
      return Promise.resolve();
    }

    this.dbInitializing = true;
    this.dbInitPromise = new Promise<void>((resolve, reject) => {
      try {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onupgradeneeded = (event) => {
          const db = request.result;

          // 이미지 처리 결과 저장소 생성
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, {
              keyPath: "cacheKey",
            });
            store.createIndex("timestamp", "timestamp", { unique: false });
            this.logDebug(`IndexedDB 스토어 생성: ${STORE_NAME}`);
          }
        };

        request.onsuccess = () => {
          this.db = request.result;
          this.dbInitialized = true;
          this.dbInitializing = false;
          this.logDebug("IndexedDB 초기화 완료");
          resolve();
        };

        request.onerror = () => {
          this.logDebug(`IndexedDB 초기화 실패: ${request.error?.message}`);
          this.storageType = CacheStorageType.MEMORY;
          this.dbInitializing = false;
          reject(request.error);
        };
      } catch (err) {
        this.logDebug(`IndexedDB 초기화 예외: ${err}`);
        this.storageType = CacheStorageType.MEMORY;
        this.dbInitializing = false;
        reject(err);
      }
    });

    return this.dbInitPromise;
  }

  /**
   * IndexedDB 캐시에서 이미지 처리 결과 조회
   * @param key 캐시 키
   * @returns 캐시된 결과 또는 null을 포함한 프로미스
   */
  private async getFromIndexedDB(key: string): Promise<CacheItem | null> {
    // IndexedDB가 초기화되지 않은 경우
    if (!this.dbInitialized || !this.db) {
      try {
        await this.initIndexedDB();
      } catch (err) {
        return null;
      }
    }

    return new Promise<CacheItem | null>((resolve) => {
      try {
        if (!this.db) {
          resolve(null);
          return;
        }

        const tx = this.db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => {
          if (request.result) {
            this.stats.dbHits++;
            this.logDebug(`IndexedDB 캐시 히트: ${key}`);
            resolve(request.result);
          } else {
            this.stats.dbMisses++;
            this.logDebug(`IndexedDB 캐시 미스: ${key}`);
            resolve(null);
          }
        };

        request.onerror = () => {
          this.logDebug(`IndexedDB 조회 오류: ${request.error?.message}`);
          this.stats.dbMisses++;
          resolve(null);
        };
      } catch (err) {
        this.logDebug(`IndexedDB 조회 예외: ${err}`);
        this.stats.dbMisses++;
        resolve(null);
      }
    });
  }

  /**
   * IndexedDB 캐시에 이미지 처리 결과 저장
   * @param key 캐시 키
   * @param item 캐시 항목
   */
  private async saveToIndexedDB(key: string, item: CacheItem): Promise<void> {
    // IndexedDB가 초기화되지 않은 경우
    if (!this.dbInitialized || !this.db) {
      try {
        await this.initIndexedDB();
      } catch (err) {
        return;
      }
    }

    return new Promise<void>((resolve) => {
      try {
        if (!this.db) {
          resolve();
          return;
        }

        const tx = this.db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        // 캐시 키와 항목 데이터 결합
        const entry = {
          cacheKey: key,
          ...item,
        };

        const request = store.put(entry);

        request.onsuccess = () => {
          this.logDebug(`IndexedDB 캐시 저장: ${key}`);
          resolve();
        };

        request.onerror = () => {
          this.logDebug(`IndexedDB 저장 오류: ${request.error?.message}`);
          resolve();
        };
      } catch (err) {
        this.logDebug(`IndexedDB 저장 예외: ${err}`);
        resolve();
      }
    });
  }

  /**
   * IndexedDB에서 만료된 캐시 항목 정리
   */
  private async cleanupIndexedDB(): Promise<void> {
    // IndexedDB가 초기화되지 않은 경우
    if (!this.dbInitialized || !this.db) {
      return;
    }

    const now = Date.now();
    const cutoffTime = now - this.expiryTime;

    return new Promise<void>((resolve) => {
      try {
        if (!this.db) {
          resolve();
          return;
        }

        const tx = this.db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const index = store.index("timestamp");
        const range = IDBKeyRange.upperBound(cutoffTime);
        const request = index.openCursor(range);

        let deletedCount = 0;

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest)
            .result as IDBCursorWithValue;

          if (cursor) {
            store.delete(cursor.value.cacheKey);
            deletedCount++;
            cursor.continue();
          } else if (deletedCount > 0) {
            this.logDebug(`IndexedDB 캐시 정리: ${deletedCount}개 항목 제거됨`);
          }
        };

        tx.oncomplete = () => {
          resolve();
        };

        tx.onerror = () => {
          this.logDebug(`IndexedDB 정리 오류: ${tx.error?.message}`);
          resolve();
        };
      } catch (err) {
        this.logDebug(`IndexedDB 정리 예외: ${err}`);
        resolve();
      }
    });
  }

  /**
   * 캐시 키 생성
   * @param imageId 이미지 식별자
   * @param options 처리 옵션
   * @returns 캐시 키
   */
  private generateKey(
    imageId: string,
    options: ImageProcessingOptions
  ): string {
    try {
      // 캐싱에 필요한 핵심 옵션 추출
      const width = options.width || 0;
      const height = options.height || 0;
      const quality = parseFloat((options.quality || 0.8).toFixed(2));
      const algorithm = options.algorithm || "bilinear";
      const format = options.format || "image/jpeg";
      const maintainRatio = options.maintainAspectRatio !== false;

      // worker-pool.ts 방식과 유사하게 구현
      // imageId#algorithm#quality#widthxheight#format
      return `${imageId}#${algorithm}#${quality}#${width}x${height}#${format}${
        maintainRatio ? "" : "#noRatio"
      }`;
    } catch (error) {
      console.warn("캐시 키 생성 중 오류:", error);
      // 오류 발생 시 기본 키 생성
      return `${imageId}-fallback`;
    }
  }

  /**
   * 이미지 처리 결과 캐싱
   * @param imageId 이미지 식별자
   * @param options 처리 옵션
   * @param result 처리 결과
   */
  async set(
    imageId: string,
    options: ImageProcessingOptions,
    result: ImageProcessingResult
  ): Promise<void> {
    const key = this.generateKey(imageId, options);
    const now = Date.now();
    const item: CacheItem = {
      result,
      timestamp: now,
      lastAccessed: now,
    };

    // 메모리 캐시에 저장 (MEMORY 또는 HYBRID 모드)
    if (
      this.storageType === CacheStorageType.MEMORY ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      // 캐시에 저장
      this.cache.set(key, item);
      this.logDebug(`메모리 캐시 저장: ${key}`);

      // 캐시 크기 확인 및 정리
      if (this.cache.size > this.maxSize) {
        this.evictLRU();
      }
    }

    // IndexedDB 캐시에 저장 (INDEXED_DB 또는 HYBRID 모드)
    if (
      this.storageType === CacheStorageType.INDEXED_DB ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      await this.saveToIndexedDB(key, item);
    }
  }

  /**
   * 캐시에서 이미지 처리 결과 조회
   * @param imageId 이미지 식별자
   * @param options 처리 옵션
   * @returns 캐시된 결과 또는 null
   */
  async get(
    imageId: string,
    options: ImageProcessingOptions
  ): Promise<ImageProcessingResult | null> {
    const key = this.generateKey(imageId, options);
    const now = Date.now();

    // 1. 메모리 캐시 확인 (MEMORY 또는 HYBRID 모드)
    if (
      this.storageType === CacheStorageType.MEMORY ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      const item = this.cache.get(key);

      // 메모리 캐시 히트
      if (item) {
        // 만료 체크
        if (now - item.timestamp > this.expiryTime) {
          this.cache.delete(key);
          this.stats.misses++;
          this.logDebug(`메모리 캐시 만료: ${key}`);
        } else {
          // 캐시 히트: 마지막 접근 시간 업데이트
          item.lastAccessed = now;
          this.stats.hits++;
          this.logDebug(`메모리 캐시 히트: ${key}`);

          // 결과 복제하여 반환 (원본 보존)
          const result = this.cloneResult(item.result);
          // 캐시에서 로드되었음을 표시
          result.metadata.fromCache = true;
          return result;
        }
      } else {
        this.stats.misses++;
        this.logDebug(`메모리 캐시 미스: ${key}`);
      }
    }

    // 2. IndexedDB 캐시 확인 (INDEXED_DB 또는 HYBRID 모드)
    if (
      this.storageType === CacheStorageType.INDEXED_DB ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      const item = await this.getFromIndexedDB(key);

      // IndexedDB 캐시 히트
      if (item) {
        // 만료 체크
        if (now - item.timestamp > this.expiryTime) {
          this.logDebug(`IndexedDB 캐시 만료: ${key}`);
        } else {
          // 하이브리드 모드인 경우 메모리 캐시에도 저장
          if (this.storageType === CacheStorageType.HYBRID) {
            item.lastAccessed = now;
            this.cache.set(key, item);

            // 캐시 크기 확인 및 정리
            if (this.cache.size > this.maxSize) {
              this.evictLRU();
            }
          }

          // 결과 복제하여 반환
          const result = this.cloneResult(item.result);
          // 캐시에서 로드되었음을 표시
          result.metadata.fromCache = true;
          return result;
        }
      }
    }

    // 캐시 미스
    return null;
  }

  /**
   * 처리 결과 복제
   * @param result 원본 결과
   * @returns 복제된 결과
   */
  private cloneResult(result: ImageProcessingResult): ImageProcessingResult {
    // 메타데이터 복사
    const clonedMetadata = { ...result.metadata };

    // 데이터 유형에 따른 복제
    let clonedData: Blob | ArrayBuffer | string;

    if (result.data instanceof Blob) {
      clonedData = result.data.slice(0, result.data.size, result.data.type);
    } else if (result.data instanceof ArrayBuffer) {
      clonedData = result.data.slice(0);
    } else {
      clonedData = result.data; // 문자열은 그대로 복사
    }

    return {
      data: clonedData,
      metadata: clonedMetadata,
    };
  }

  /**
   * LRU(Least Recently Used) 항목 제거
   */
  private evictLRU(): void {
    // 가장 오래 전에 접근된 항목 찾기
    let oldest: [string, CacheItem] | null = null;

    for (const entry of this.cache.entries()) {
      if (!oldest || entry[1].lastAccessed < oldest[1].lastAccessed) {
        oldest = entry;
      }
    }

    // 제거
    if (oldest) {
      this.cache.delete(oldest[0]);
      this.stats.evictions++;
      this.logDebug(`캐시 제거(LRU): ${oldest[0]}`);
    }
  }

  /**
   * 만료된 캐시 항목 정리
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    let expiredCount = 0;

    // 메모리 캐시 정리
    if (
      this.storageType === CacheStorageType.MEMORY ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      // 만료된 항목 제거
      for (const [key, item] of this.cache.entries()) {
        if (now - item.timestamp > this.expiryTime) {
          this.cache.delete(key);
          expiredCount++;
        }
      }

      if (expiredCount > 0) {
        this.logDebug(`메모리 캐시 정리: ${expiredCount}개 항목 제거됨`);
      }
    }

    // IndexedDB 캐시 정리
    if (
      this.storageType === CacheStorageType.INDEXED_DB ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      await this.cleanupIndexedDB();
    }
  }

  /**
   * 캐시 통계 정보 반환
   * @returns 캐시 통계
   */
  getStats(): {
    size: number;
    memoryHits: number;
    memoryMisses: number;
    dbHits: number;
    dbMisses: number;
    evictions: number;
    totalHits: number;
    totalMisses: number;
  } {
    return {
      size: this.cache.size,
      memoryHits: this.stats.hits,
      memoryMisses: this.stats.misses,
      dbHits: this.stats.dbHits,
      dbMisses: this.stats.dbMisses,
      evictions: this.stats.evictions,
      totalHits: this.stats.hits + this.stats.dbHits,
      totalMisses: this.stats.misses + this.stats.dbMisses,
    };
  }

  /**
   * 디버그 로그 출력
   * @param message 로그 메시지
   */
  private logDebug(message: string): void {
    if (this.debug) {
      console.log(`[ImageCache] ${message}`);
    }
  }

  /**
   * 캐시 초기화
   */
  async clear(): Promise<void> {
    // 메모리 캐시 초기화
    this.cache.clear();

    // IndexedDB 캐시 초기화
    if (
      this.storageType === CacheStorageType.INDEXED_DB ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      if (this.dbInitialized && this.db) {
        try {
          const tx = this.db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          store.clear();
          this.logDebug("IndexedDB 캐시 초기화 완료");
        } catch (err) {
          this.logDebug(`IndexedDB 캐시 초기화 오류: ${err}`);
        }
      }
    }

    this.logDebug("캐시 초기화 완료");
  }

  /**
   * 캐시 스토리지 타입 변경
   * @param storageType 새 스토리지 타입
   */
  async setStorageType(storageType: CacheStorageType): Promise<void> {
    if (storageType === this.storageType) {
      return;
    }

    this.storageType = storageType;

    // IndexedDB 사용하는 경우 초기화
    if (
      storageType === CacheStorageType.INDEXED_DB ||
      storageType === CacheStorageType.HYBRID
    ) {
      await this.initIndexedDB();
    }

    this.logDebug(`캐시 스토리지 타입 변경: ${storageType}`);
  }

  /**
   * 리소스 정리
   */
  dispose(): void {
    // 타이머 정리
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // IndexedDB 연결 종료
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    // 메모리 캐시 초기화
    this.cache.clear();

    this.logDebug("캐시 리소스 정리 완료");
  }
}
