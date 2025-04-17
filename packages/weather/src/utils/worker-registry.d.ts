import { ProcessorType } from "../types/index.js";
import { WorkerPool, PoolConfig } from "@hyperviz/worker";
/**
 * 날씨 모듈 워커 시스템 옵션
 */
export interface WeatherWorkerOptions extends PoolConfig {}
/**
 * 워커 시스템 초기화
 * @param options 워커 시스템 옵션
 */
export declare function initializeWorkerSystem(
  options?: WeatherWorkerOptions
): Promise<WorkerPool>;
/**
 * 프로세서 등록 함수 - 현재 Worker 모듈에서는 직접 프로세서 등록이 다른 방식으로 이루어짐
 * 이 함수는 향후 확장을 위해 스텁으로 남겨둠
 */
export declare function registerWeatherProcessors(): void;
/**
 * 태스크 제출 헬퍼 함수
 * @param processor 프로세서 타입
 * @param data 태스크 데이터
 */
export declare function submitTask(
  processor: ProcessorType,
  data: any
): Promise<unknown>;
/**
 * 워커 시스템 정리
 */
export declare function cleanupWorkerSystem(): Promise<void>;
