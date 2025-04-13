/**
 * Image Cache Module
 * Caches image processing results in memory to prevent recalculation
 */
import {
  CacheStorageType,
  ImageProcessingOptions,
  ProcessingResult,
} from "./types.js";

/**
 * Cache Item Interface
 */
interface CacheItem {
  /** Processing result */
  result: ProcessingResult;
  /** Cache creation timestamp */
  timestamp: number;
  /** Last accessed timestamp */
  lastAccessed: number;
}

/**
 * Image Cache Options
 */
export interface ImageCacheOptions {
  /** Maximum cache size (number of items) */
  maxSize?: number;
  /** Cache item expiry time (ms) */
  expiryTime?: number;
  /** Auto cleanup interval (ms) */
  cleanupInterval?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Cache storage type (default: MEMORY) */
  storageType?: CacheStorageType;
  /** IndexedDB database name */
  dbName?: string;
  /** IndexedDB version */
  dbVersion?: number;
}

// IndexedDB constants
const DB_NAME = "hyperviz-image-cache";
const DB_VERSION = 1;
const STORE_NAME = "image-processing-results";

/**
 * Image Cache Class
 *
 * Caches image processing results in memory to prevent duplicate processing
 * of the same images with the same options, improving performance.
 */
export class ImageCache {
  /** Cache storage */
  private cache = new Map<string, CacheItem>();
  /** Cache statistics */
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    dbHits: 0,
    dbMisses: 0,
  };
  /** Maximum cache size */
  private maxSize: number;
  /** Cache item expiry time (ms) */
  private expiryTime: number;
  /** Cleanup timer ID */
  private cleanupTimer: NodeJS.Timeout | null = null;
  /** Debug mode */
  private debug: boolean;
  /** Cache storage type */
  private storageType: CacheStorageType;
  /** IndexedDB database name */
  private dbName: string;
  /** IndexedDB version */
  private dbVersion: number;
  /** IndexedDB database instance */
  private db: IDBDatabase | null = null;
  /** IndexedDB initialization status */
  private dbInitialized = false;
  /** IndexedDB initialization in progress */
  private dbInitializing = false;
  /** IndexedDB initialization promise */
  private dbInitPromise: Promise<void> | null = null;

  /**
   * Image cache constructor
   * @param options Cache options
   */
  constructor(options: ImageCacheOptions = {}) {
    this.maxSize = options.maxSize || 100;
    this.expiryTime = options.expiryTime || 15 * 60 * 1000; // 15 minutes
    this.debug = options.debug || false;
    this.storageType = options.storageType || CacheStorageType.MEMORY;
    this.dbName = options.dbName || DB_NAME;
    this.dbVersion = options.dbVersion || DB_VERSION;

    // Set up periodic cache cleanup
    const cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // Default 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);

    // Initialize IndexedDB if needed
    if (
      this.storageType === CacheStorageType.INDEXED_DB ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      this.initIndexedDB();
    }
  }

  /**
   * Initialize IndexedDB
   * @returns Initialization completion promise
   */
  private async initIndexedDB(): Promise<void> {
    // Check for browser environment
    if (typeof indexedDB === "undefined") {
      this.logDebug(
        "IndexedDB is not available in this environment. Using memory cache only."
      );
      this.storageType = CacheStorageType.MEMORY;
      return;
    }

    // Already initializing
    if (this.dbInitializing) {
      return this.dbInitPromise as Promise<void>;
    }

    // Already initialized
    if (this.dbInitialized) {
      return Promise.resolve();
    }

    this.dbInitializing = true;
    this.dbInitPromise = new Promise<void>((resolve, reject) => {
      try {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onupgradeneeded = (event) => {
          const db = request.result;

          // Create object store for image processing results
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, {
              keyPath: "cacheKey",
            });
            store.createIndex("timestamp", "timestamp", { unique: false });
            this.logDebug(`Created IndexedDB store: ${STORE_NAME}`);
          }
        };

        request.onsuccess = () => {
          this.db = request.result;
          this.dbInitialized = true;
          this.dbInitializing = false;
          this.logDebug("IndexedDB initialization complete");
          resolve();
        };

        request.onerror = () => {
          this.logDebug(
            `IndexedDB initialization failed: ${request.error?.message}`
          );
          this.storageType = CacheStorageType.MEMORY;
          this.dbInitializing = false;
          reject(request.error);
        };
      } catch (err) {
        this.logDebug(`IndexedDB initialization exception: ${err}`);
        this.storageType = CacheStorageType.MEMORY;
        this.dbInitializing = false;
        reject(err);
      }
    });

    return this.dbInitPromise;
  }

  /**
   * IndexedDB cache lookup
   * @param key Cache key
   * @returns Cached result or null in a promise
   */
  private async getFromIndexedDB(key: string): Promise<CacheItem | null> {
    if (!this.db) {
      return null;
    }

    try {
      const tx = this.db.transaction([STORE_NAME], "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const item = request.result;
          if (item) {
            // Return cached item as is
            resolve(item);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      this.logDebug(`IndexedDB lookup failed: ${error}`);
      return null;
    }
  }

  /**
   * Save image processing result to IndexedDB cache
   * @param key Cache key
   * @param item Cache item
   */
  private async saveToIndexedDB(key: string, item: CacheItem): Promise<void> {
    // If IndexedDB is not initialized
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

        // Combine cache key and item data
        const entry = {
          cacheKey: key,
          ...item,
        };

        const request = store.put(entry);

        request.onsuccess = () => {
          this.logDebug(`Saved to IndexedDB cache: ${key}`);
          resolve();
        };

        request.onerror = () => {
          this.logDebug(`IndexedDB save error: ${request.error?.message}`);
          resolve();
        };
      } catch (err) {
        this.logDebug(`IndexedDB save exception: ${err}`);
        resolve();
      }
    });
  }

  /**
   * Clean up expired cache items in IndexedDB
   */
  private async cleanupIndexedDB(): Promise<void> {
    // If IndexedDB is not initialized
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
            this.logDebug(
              `IndexedDB cache cleanup: ${deletedCount} items removed`
            );
          }
        };

        tx.oncomplete = () => {
          resolve();
        };

        tx.onerror = () => {
          this.logDebug(`IndexedDB cleanup error: ${tx.error?.message}`);
          resolve();
        };
      } catch (err) {
        this.logDebug(`IndexedDB cleanup exception: ${err}`);
        resolve();
      }
    });
  }

  /**
   * Generate cache key
   * @param imageId Image identifier
   * @param options Processing options
   * @returns Cache key
   */
  private generateKey(
    imageId: string,
    options: ImageProcessingOptions
  ): string {
    try {
      // Extract essential caching options
      const width = options.width || 0;
      const height = options.height || 0;
      const quality = parseFloat((options.quality || 0.8).toFixed(2));
      const format = options.format || "image/jpeg";
      const maintainRatio = options.maintainAspectRatio !== false;

      // Generate cache key
      return `${imageId}#${quality}#${width}x${height}#${format}${
        maintainRatio ? "" : "#noRatio"
      }`;
    } catch (error) {
      console.warn("Error generating cache key:", error);
      // If error occurs, generate a default key
      return `${imageId}-fallback`;
    }
  }

  /**
   * Cache image processing result
   * @param imageId Image identifier
   * @param options Processing options
   * @param result Processing result
   */
  async set(
    imageId: string,
    options: ImageProcessingOptions,
    result: ProcessingResult
  ): Promise<void> {
    const key = this.generateKey(imageId, options);
    const now = Date.now();
    const item: CacheItem = {
      result,
      timestamp: now,
      lastAccessed: now,
    };

    // Save to memory cache (MEMORY or HYBRID mode)
    if (
      this.storageType === CacheStorageType.MEMORY ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      // Save to cache
      this.cache.set(key, item);
      this.logDebug(`Saved to memory cache: ${key}`);

      // Check cache size and clean up
      if (this.cache.size > this.maxSize) {
        this.evictLRU();
      }
    }

    // Save to IndexedDB cache (INDEXED_DB or HYBRID mode)
    if (
      this.storageType === CacheStorageType.INDEXED_DB ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      await this.saveToIndexedDB(key, item);
    }
  }

  /**
   * Lookup image processing result from cache
   * @param imageId Image identifier
   * @param options Processing options
   * @returns Cached result or null
   */
  async get(
    imageId: string,
    options: ImageProcessingOptions
  ): Promise<ProcessingResult | null> {
    const key = this.generateKey(imageId, options);
    const now = Date.now();

    // 1. Check memory cache (MEMORY or HYBRID mode)
    if (
      this.storageType === CacheStorageType.MEMORY ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      const item = this.cache.get(key);

      // Memory cache hit
      if (item) {
        // Expiry check
        if (now - item.timestamp > this.expiryTime) {
          this.cache.delete(key);
          this.stats.misses++;
          this.logDebug(`Memory cache expired: ${key}`);
        } else {
          // Memory cache hit: Update last accessed time
          item.lastAccessed = now;
          this.stats.hits++;
          this.logDebug(`Memory cache hit: ${key}`);

          // Return cloned result (original preserved)
          const result = this.cloneResult(item.result);
          // Mark as loaded from cache
          result.fromCache = true;
          return result;
        }
      } else {
        this.stats.misses++;
        this.logDebug(`Memory cache miss: ${key}`);
      }
    }

    // 2. Check IndexedDB cache (INDEXED_DB or HYBRID mode)
    if (
      this.storageType === CacheStorageType.INDEXED_DB ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      const item = await this.getFromIndexedDB(key);

      // IndexedDB cache hit
      if (item) {
        // Expiry check
        if (now - item.timestamp > this.expiryTime) {
          this.logDebug(`IndexedDB cache expired: ${key}`);
        } else {
          // If hybrid mode, also save to memory cache
          if (this.storageType === CacheStorageType.HYBRID) {
            item.lastAccessed = now;
            this.cache.set(key, item);

            // Check cache size and clean up
            if (this.cache.size > this.maxSize) {
              this.evictLRU();
            }
          }

          // Return cloned result
          const result = this.cloneResult(item.result);
          // Mark as loaded from cache
          result.fromCache = true;
          return result;
        }
      }
    }

    // Cache miss
    return null;
  }

  /**
   * Clone result data
   * @param result Original result
   * @returns Cloned result
   */
  private cloneResult(result: ProcessingResult): ProcessingResult {
    // Clone result data
    return {
      data: result.data,
      width: result.width,
      height: result.height,
      format: result.format,
      originalWidth: result.originalWidth,
      originalHeight: result.originalHeight,
      processingTime: result.processingTime,
      fromCache: true,
    };
  }

  /**
   * Evict LRU (Least Recently Used) item
   */
  private evictLRU(): void {
    // Find the oldest accessed item
    let oldest: [string, CacheItem] | null = null;

    for (const entry of this.cache.entries()) {
      if (!oldest || entry[1].lastAccessed < oldest[1].lastAccessed) {
        oldest = entry;
      }
    }

    // Evict
    if (oldest) {
      this.cache.delete(oldest[0]);
      this.stats.evictions++;
      this.logDebug(`Evicted from cache (LRU): ${oldest[0]}`);
    }
  }

  /**
   * Clean up expired cache items
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    let expiredCount = 0;

    // Clean up memory cache
    if (
      this.storageType === CacheStorageType.MEMORY ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      // Remove expired items
      for (const [key, item] of this.cache.entries()) {
        if (now - item.timestamp > this.expiryTime) {
          this.cache.delete(key);
          expiredCount++;
        }
      }

      if (expiredCount > 0) {
        this.logDebug(`Cleaned up memory cache: ${expiredCount} items removed`);
      }
    }

    // Clean up IndexedDB cache
    if (
      this.storageType === CacheStorageType.INDEXED_DB ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      await this.cleanupIndexedDB();
    }
  }

  /**
   * Return cache statistics
   * @returns Cache statistics
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
   * Output debug log
   * @param message Log message
   */
  private logDebug(message: string): void {
    if (this.debug) {
      console.log(`[ImageCache] ${message}`);
    }
  }

  /**
   * Initialize cache
   */
  async clear(): Promise<void> {
    // Clean up memory cache
    this.cache.clear();

    // Clean up IndexedDB cache
    if (
      this.storageType === CacheStorageType.INDEXED_DB ||
      this.storageType === CacheStorageType.HYBRID
    ) {
      if (this.dbInitialized && this.db) {
        try {
          const tx = this.db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          store.clear();
          this.logDebug("Cleaned up IndexedDB cache");
        } catch (err) {
          this.logDebug(`IndexedDB cache cleanup error: ${err}`);
        }
      }
    }

    this.logDebug("Cache initialization complete");
  }

  /**
   * Change cache storage type
   * @param storageType New storage type
   */
  async setStorageType(storageType: CacheStorageType): Promise<void> {
    if (storageType === this.storageType) {
      return;
    }

    this.storageType = storageType;

    // Initialize IndexedDB if needed
    if (
      storageType === CacheStorageType.INDEXED_DB ||
      storageType === CacheStorageType.HYBRID
    ) {
      await this.initIndexedDB();
    }

    this.logDebug(`Changed cache storage type: ${storageType}`);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    // Clean up timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Close IndexedDB connection
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    // Clean up memory cache
    this.cache.clear();

    this.logDebug("Cache resource cleanup complete");
  }
}
