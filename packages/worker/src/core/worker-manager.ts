/**
 * 워커 매니저
 * 워커 생성, 관리, 스케일링 담당
 */

import { EventEmitter } from "eventemitter3";
import { IWorker, WorkerStatus, WorkerType } from "../types/index.js";
import { WorkerAdapter } from "./worker-adapter.js";
import { generateId } from "./utils.js";

/**
 * 워커 매니저 설정 인터페이스
 */
export interface WorkerManagerConfig {
  /** 최소 워커 수 */
  minWorkers: number;
  /** 최대 워커 수 */
  maxWorkers: number;
  /** 워커 유휴 타임아웃 (밀리초) */
  idleTimeout: number;
  /** 워커 URL (웹 환경) */
  workerUrl?: string | ((type: string) => string);
  /** 워커 파일 경로 (Node.js 환경) */
  workerFile?: string | ((type: string) => string);
  /** 워커 유형 */
  workerType: WorkerType | string;
}

/**
 * 워커 통계 인터페이스
 */
export interface WorkerManagerStats {
  /** 총 워커 수 */
  totalWorkers: number;
  /** 활성 워커 수 */
  activeWorkers: number;
  /** 유휴 워커 수 */
  idleWorkers: number;
}

/**
 * 워커 매니저 인터페이스
 */
export interface IWorkerManager {
  /** 워커 생성 */
  createWorker(): string;
  /** 워커 해제 */
  releaseWorker(workerId: string): Promise<void>;
  /** 유휴 워커 가져오기 */
  getIdleWorker(): IWorker | undefined;
  /** 워커 상태 가져오기 */
  getWorkerStatus(workerId: string): WorkerStatus;
  /** 워커 가져오기 */
  getWorker(workerId: string): IWorker | undefined;
  /** 모든 워커 가져오기 */
  getAllWorkers(): IWorker[];
  /** 워커 매니저 통계 가져오기 */
  getStats(): WorkerManagerStats;
  /** 최소 워커 수 유지 */
  ensureMinWorkers(): void;
  /** 모든 워커 종료 */
  closeAll(force?: boolean): Promise<void>;
}

/**
 * 워커 매니저 이벤트 인터페이스
 */
export interface WorkerManagerEvents {
  /** 워커 생성 이벤트 */
  workerCreated: [{ workerId: string }];
  /** 워커 에러 이벤트 */
  workerError: [{ workerId: string; error: Error }];
  /** 워커 종료 이벤트 */
  workerExit: [{ workerId: string; exitCode: number }];
  /** 워커 메시지 이벤트 */
  workerMessage: [{ workerId: string; message: any }];
}

/**
 * 워커 매니저 클래스
 */
export class WorkerManager extends EventEmitter implements IWorkerManager {
  /** 워커 맵 */
  private workers: Map<string, IWorker> = new Map();
  /** 워커 상태 맵 */
  private workerStatus: Map<string, WorkerStatus> = new Map();
  /** 유휴 타이머 맵 */
  private idleTimers: Map<string, NodeJS.Timeout> = new Map();
  /** 종료 중 여부 */
  private isClosing: boolean = false;
  /** 설정 */
  private config: WorkerManagerConfig;

  /**
   * 워커 매니저 생성자
   * @param config 설정
   */
  constructor(config: WorkerManagerConfig) {
    super();

    this.config = config;
  }

  /**
   * 워커 생성
   * @returns 워커 ID
   */
  createWorker(): string {
    if (this.isClosing) {
      throw new Error("워커 매니저가 종료 중입니다");
    }

    // 최대 워커 수 확인
    if (this.workers.size >= this.config.maxWorkers) {
      throw new Error(`최대 워커 수(${this.config.maxWorkers})에 도달했습니다`);
    }

    // 워커 ID 생성
    const workerId = generateId();

    // 워커 URL 또는 파일 경로 결정
    let url: string | undefined;
    let file: string | undefined;

    if (typeof this.config.workerUrl === "function") {
      url = this.config.workerUrl(this.config.workerType);
    } else if (typeof this.config.workerUrl === "string") {
      url = this.config.workerUrl;
    }

    if (typeof this.config.workerFile === "function") {
      file = this.config.workerFile(this.config.workerType);
    } else if (typeof this.config.workerFile === "string") {
      file = this.config.workerFile;
    }

    // 워커 어댑터 생성
    const worker = new WorkerAdapter({
      id: workerId,
      url,
      file,
      workerData: {
        id: workerId,
        type: this.config.workerType,
      },
    });

    // 이벤트 핸들러 등록
    worker.on("message", (message) => {
      this.emit("workerMessage", { workerId, message });
    });

    worker.on("error", (error) => {
      this.workerStatus.set(workerId, WorkerStatus.ERROR);
      this.emit("workerError", { workerId, error });
    });

    worker.on("exit", (code) => {
      this.clearIdleTimer(workerId);
      this.workers.delete(workerId);
      this.workerStatus.delete(workerId);
      this.emit("workerExit", { workerId, exitCode: code });
    });

    // 워커 맵에 추가
    this.workers.set(workerId, worker);

    // 워커 상태 설정
    this.workerStatus.set(workerId, WorkerStatus.IDLE);

    // 유휴 타이머 설정
    this.setIdleTimer(workerId);

    // 워커 생성 이벤트 발생
    this.emit("workerCreated", { workerId });

    return workerId;
  }

  /**
   * 워커 해제
   * @param workerId 워커 ID
   */
  async releaseWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // 유휴 타이머 제거
    this.clearIdleTimer(workerId);

    try {
      // 워커 종료
      await worker.terminate();

      // 워커 제거
      this.workers.delete(workerId);
      this.workerStatus.delete(workerId);
    } catch (error) {
      console.error(`워커(${workerId}) 해제 중 오류:`, error);
    }
  }

  /**
   * 유휴 워커 가져오기
   * @returns 유휴 워커 또는 undefined
   */
  getIdleWorker(): IWorker | undefined {
    for (const [workerId, status] of this.workerStatus.entries()) {
      if (status === WorkerStatus.IDLE) {
        return this.workers.get(workerId);
      }
    }
    return undefined;
  }

  /**
   * 워커 상태 가져오기
   * @param workerId 워커 ID
   * @returns 워커 상태
   */
  getWorkerStatus(workerId: string): WorkerStatus {
    return this.workerStatus.get(workerId) || WorkerStatus.UNKNOWN;
  }

  /**
   * 워커 가져오기
   * @param workerId 워커 ID
   * @returns 워커 또는 undefined
   */
  getWorker(workerId: string): IWorker | undefined {
    return this.workers.get(workerId);
  }

  /**
   * 모든 워커 가져오기
   * @returns 모든 워커 배열
   */
  getAllWorkers(): IWorker[] {
    return Array.from(this.workers.values());
  }

  /**
   * 워커 상태 설정
   * @param workerId 워커 ID
   * @param status 워커 상태
   */
  setWorkerStatus(workerId: string, status: WorkerStatus): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    this.workerStatus.set(workerId, status);

    // 상태가 IDLE이면 유휴 타이머 설정
    if (status === WorkerStatus.IDLE) {
      this.setIdleTimer(workerId);
    } else {
      this.clearIdleTimer(workerId);
    }
  }

  /**
   * 워커 매니저 통계 가져오기
   * @returns 워커 매니저 통계
   */
  getStats(): WorkerManagerStats {
    let activeWorkers = 0;
    let idleWorkers = 0;

    for (const status of this.workerStatus.values()) {
      if (status === WorkerStatus.BUSY) {
        activeWorkers++;
      } else if (status === WorkerStatus.IDLE) {
        idleWorkers++;
      }
    }

    return {
      totalWorkers: this.workers.size,
      activeWorkers,
      idleWorkers,
    };
  }

  /**
   * 최소 워커 수 유지
   */
  ensureMinWorkers(): void {
    if (this.isClosing) return;

    const currentWorkerCount = this.workers.size;
    const minWorkers = this.config.minWorkers;

    // 현재 워커 수가 최소 워커 수보다 적으면 워커 추가
    for (let i = currentWorkerCount; i < minWorkers; i++) {
      this.createWorker();
    }
  }

  /**
   * 모든 워커 종료
   * @param force 강제 종료 여부
   * @returns 프로미스
   */
  async closeAll(force: boolean = false): Promise<void> {
    this.isClosing = true;

    // 모든 유휴 타이머 제거
    for (const workerId of this.idleTimers.keys()) {
      this.clearIdleTimer(workerId);
    }

    // 모든 워커 종료
    const terminatePromises = [];
    for (const [workerId, worker] of this.workers.entries()) {
      terminatePromises.push(
        worker.terminate().catch((error) => {
          console.error(`워커(${workerId}) 종료 중 오류:`, error);
        })
      );
    }

    // 모든 종료 작업 완료 대기
    await Promise.all(terminatePromises);

    // 모든 맵 초기화
    this.workers.clear();
    this.workerStatus.clear();
  }

  /**
   * 유휴 타이머 설정
   * @param workerId 워커 ID
   */
  private setIdleTimer(workerId: string): void {
    // 기존 타이머 제거
    this.clearIdleTimer(workerId);

    // 새 타이머 설정
    const idleTimeout = this.config.idleTimeout;
    if (idleTimeout <= 0 || this.workers.size <= this.config.minWorkers) {
      return;
    }

    const timer = setTimeout(() => {
      // 최소 워커 수 확인
      if (this.workers.size <= this.config.minWorkers) {
        return;
      }

      // 워커 상태 확인
      const status = this.workerStatus.get(workerId);
      if (status === WorkerStatus.IDLE) {
        // 유휴 워커 종료
        this.releaseWorker(workerId);
      }
    }, idleTimeout);

    this.idleTimers.set(workerId, timer);
  }

  /**
   * 유휴 타이머 제거
   * @param workerId 워커 ID
   */
  private clearIdleTimer(workerId: string): void {
    const timer = this.idleTimers.get(workerId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(workerId);
    }
  }
}
