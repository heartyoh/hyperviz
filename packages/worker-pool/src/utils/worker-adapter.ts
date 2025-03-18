/**
 * Worker 어댑터
 *
 * 브라우저의 Web Worker API와 Node.js의 worker_threads를 통합하는 어댑터
 */

import { EventEmitter } from "eventemitter3";
import { isBrowser, isNode } from "./env-detector.js";

// Node.js Worker 타입 (런타임에 로드)
type NodeWorker = {
  postMessage: (data: any) => void;
  terminate: () => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
};

// Browser Worker 타입
type BrowserWorker = Worker;

// Worker 타입 유니온
type AnyWorker = BrowserWorker | NodeWorker;

// Worker 옵션 인터페이스
export interface WorkerAdapterOptions {
  workerData?: any;
}

// 메시지 핸들러 타입
export type MessageHandler = (message: any) => void;
export type ErrorHandler = (error: Error) => void;
export type ExitHandler = (exitCode: number) => void;

/**
 * Worker 어댑터 클래스
 *
 * 브라우저와 Node.js 환경에서 일관된 Worker API를 제공합니다.
 */
export class WorkerAdapter extends EventEmitter {
  private worker: AnyWorker | null = null;
  private isTerminated: boolean = false;
  private isWeb: boolean;
  private scriptPath: string;

  /**
   * Worker 어댑터 생성자
   *
   * @param scriptPath 워커 스크립트 경로
   * @param options 워커 옵션
   */
  constructor(scriptPath: string, options: WorkerAdapterOptions = {}) {
    super();

    this.scriptPath = scriptPath;
    this.isWeb = isBrowser();

    // 환경에 따라 적절한 Worker 인스턴스 생성
    if (this.isWeb) {
      this.initWebWorker(options);
    } else if (isNode()) {
      this.initNodeWorker(options);
    } else {
      throw new Error("지원되지 않는 환경입니다.");
    }
  }

  /**
   * Web Worker 초기화
   */
  private initWebWorker(options: WorkerAdapterOptions): void {
    try {
      // Web Worker 생성
      this.worker = new Worker(this.scriptPath) as BrowserWorker;

      // 이벤트 리스너 설정
      this.worker.onmessage = (event: MessageEvent) => {
        this.emit("message", event.data);
      };

      this.worker.onerror = (event: ErrorEvent) => {
        const error = new Error(event.message);
        this.emit("error", error);
      };

      // 워커 데이터 전송 (초기 설정)
      if (options.workerData) {
        this.postMessage({
          __workerInit: true,
          workerData: options.workerData,
        });
      }
    } catch (error) {
      this.emit(
        "error",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Node.js Worker 초기화
   */
  private initNodeWorker(options: WorkerAdapterOptions): void {
    try {
      // 필요한 모듈만 런타임에 로드
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const workerThreads = require("worker_threads");

      // Node.js Worker 생성
      this.worker = new workerThreads.Worker(this.scriptPath, {
        workerData: options.workerData,
      }) as NodeWorker;

      // 이벤트 리스너 설정
      this.worker.on("message", (message: any) => {
        this.emit("message", message);
      });

      this.worker.on("error", (error: Error) => {
        this.emit("error", error);
      });

      this.worker.on("exit", (exitCode: number) => {
        this.emit("exit", exitCode);
        this.isTerminated = true;
      });
    } catch (error) {
      // Node.js 환경이지만 worker_threads를 불러올 수 없는 경우
      this.emit(
        "error",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 워커에 메시지 전송
   *
   * @param data 전송할 데이터
   */
  postMessage(data: any): void {
    if (this.isTerminated || !this.worker) {
      this.emit(
        "error",
        new Error("종료된 워커에 메시지를 전송할 수 없습니다.")
      );
      return;
    }

    try {
      this.worker.postMessage(data);
    } catch (error) {
      this.emit(
        "error",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 워커 종료
   */
  terminate(): void {
    if (this.isTerminated || !this.worker) {
      return;
    }

    try {
      this.worker.terminate();
      this.isTerminated = true;
      this.emit("exit", 0);
    } catch (error) {
      this.emit(
        "error",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 워커가 종료되었는지 확인
   */
  isTerminatedWorker(): boolean {
    return this.isTerminated;
  }
}

/**
 * WorkerAdapter 생성 함수
 *
 * 브라우저와 Node.js 환경에 맞는 WorkerAdapter 인스턴스를 생성합니다.
 *
 * @param scriptPath 워커 스크립트 경로
 * @param options 워커 옵션
 * @returns WorkerAdapter 인스턴스
 */
export function createWorker(
  scriptPath: string,
  options: WorkerAdapterOptions = {}
): WorkerAdapter {
  return new WorkerAdapter(scriptPath, options);
}
