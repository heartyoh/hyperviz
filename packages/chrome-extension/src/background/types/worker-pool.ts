/**
 * 워커풀 관련 타입 정의
 */

// 워커풀 맵 타입
export interface WorkerPoolsMap {
  [key: string]: any;
}

// 워커풀 모니터 인터페이스
export interface WorkerPoolMonitor {
  initialized: boolean;
  workerPools: WorkerPoolsMap;
  logs: any[];
  monitoringInterval: number | null;
  init(): boolean;
  hookLogger?(): void;
  startMonitoring(interval?: number): boolean;
}
