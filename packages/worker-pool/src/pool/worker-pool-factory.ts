/**
 * Worker Pool Factory
 *
 * Worker Pool 생성 및 관리 담당
 */

import { WorkerPool } from "./worker-pool.js";
import { WorkerRegistry } from "../registry/worker-registry.js";
import { WorkerType, PoolConfig } from "../types/index.js";
import { recommendWorkerCount } from "../utils/helpers.js";

/**
 * 워커 풀 매니저 설정 인터페이스
 */
export interface WorkerPoolFactoryConfig {
  defaultPoolConfig?: Partial<PoolConfig>;
  registry?: WorkerRegistry;
}

/**
 * 워커 풀 생성 설정 인터페이스
 */
export interface CreatePoolOptions {
  minWorkers?: number;
  maxWorkers?: number;
  idleTimeout?: number;
  maxQueueSize?: number;
}

/**
 * 워커 풀 팩토리 클래스
 */
export class WorkerPoolFactory {
  private registry: WorkerRegistry;
  private pools: Map<WorkerType | string, WorkerPool>;
  private defaultPoolConfig: Partial<PoolConfig>;

  /**
   * 워커 풀 팩토리 생성자
   *
   * @param config 설정 객체
   */
  constructor(config: WorkerPoolFactoryConfig = {}) {
    this.registry = config.registry || new WorkerRegistry();
    this.pools = new Map();
    this.defaultPoolConfig = config.defaultPoolConfig || {
      minWorkers: 1,
      maxWorkers: recommendWorkerCount(),
    };
  }

  /**
   * 워커 레지스트리 설정
   *
   * @param registry 워커 레지스트리 인스턴스
   */
  setRegistry(registry: WorkerRegistry): void {
    this.registry = registry;
  }

  /**
   * 기본 풀 설정 업데이트
   *
   * @param config 새 설정
   */
  setDefaultPoolConfig(config: Partial<PoolConfig>): void {
    this.defaultPoolConfig = { ...this.defaultPoolConfig, ...config };
  }

  /**
   * 워커 풀 생성 또는 기존 풀 반환
   *
   * @param type 워커 유형
   * @param options 풀 생성 옵션
   * @returns 워커 풀 인스턴스
   */
  createPool(
    type: WorkerType | string,
    options: CreatePoolOptions = {}
  ): WorkerPool {
    // 이미 존재하는 풀이면 반환
    if (this.pools.has(type)) {
      const pool = this.pools.get(type)!;

      // 설정이 제공되었으면 풀 재설정
      if (Object.keys(options).length > 0) {
        pool.reconfigure(options);
      }

      return pool;
    }

    // 워커 경로 가져오기
    const workerPath = this.registry.getWorkerPath(type);

    // 기본 설정과 옵션 병합
    const poolConfig = { ...this.defaultPoolConfig, ...options };

    // 새 풀 생성
    const pool = new WorkerPool(type, workerPath, poolConfig);

    // 맵에 저장
    this.pools.set(type, pool);

    return pool;
  }

  /**
   * 특정 유형의 풀 가져오기
   *
   * @param type 워커 유형
   * @returns 워커 풀 또는 undefined
   */
  getPool(type: WorkerType | string): WorkerPool | undefined {
    return this.pools.get(type);
  }

  /**
   * 특정 유형의 풀이 존재하는지 확인
   *
   * @param type 워커 유형
   * @returns 존재 여부
   */
  hasPool(type: WorkerType | string): boolean {
    return this.pools.has(type);
  }

  /**
   * 특정 유형의 풀 해제
   *
   * @param type 워커 유형
   * @param force 강제 종료 여부
   * @returns 프로미스
   */
  async releasePool(
    type: WorkerType | string,
    force: boolean = false
  ): Promise<boolean> {
    const pool = this.pools.get(type);
    if (!pool) return false;

    // 풀 종료
    await pool.close(force);

    // 맵에서 제거
    this.pools.delete(type);

    return true;
  }

  /**
   * 모든 풀 해제
   *
   * @param force 강제 종료 여부
   * @returns 프로미스
   */
  async releaseAllPools(force: boolean = false): Promise<void> {
    const releasePromises = [];

    for (const [type] of this.pools.entries()) {
      releasePromises.push(this.releasePool(type, force));
    }

    await Promise.all(releasePromises);
  }

  /**
   * 풀 재설정
   *
   * @param type 워커 유형
   * @param config 새 설정
   * @returns 성공 여부
   */
  reconfigurePool(
    type: WorkerType | string,
    config: Partial<PoolConfig>
  ): boolean {
    const pool = this.pools.get(type);
    if (!pool) return false;

    pool.reconfigure(config);
    return true;
  }

  /**
   * 모든 풀 재설정
   *
   * @param config 새 설정
   */
  reconfigureAllPools(config: Partial<PoolConfig>): void {
    for (const [, pool] of this.pools.entries()) {
      pool.reconfigure(config);
    }
  }

  /**
   * 생성된 모든 풀 목록 반환
   *
   * @returns 워커 유형 배열
   */
  getPoolTypes(): (WorkerType | string)[] {
    return Array.from(this.pools.keys());
  }

  /**
   * 모든 풀 통계 반환
   *
   * @returns 풀 통계 맵
   */
  getAllPoolStats(): Map<WorkerType | string, any> {
    const statsMap = new Map();

    for (const [type, pool] of this.pools.entries()) {
      statsMap.set(type, pool.getPoolStats());
    }

    return statsMap;
  }

  /**
   * 모든 풀 반환
   *
   * @returns 모든 풀 맵
   */
  getAllPools(): Map<WorkerType | string, WorkerPool> {
    return new Map(this.pools);
  }
}
