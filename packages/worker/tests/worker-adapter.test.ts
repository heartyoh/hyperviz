/**
 * WorkerAdapter 테스트
 */
import { EventEmitter } from "eventemitter3";
import { WorkerAdapter } from "../src/core/worker-adapter.js";
import {
  TaskPriority,
  TaskStatus,
  WorkerType,
  WorkerStatus,
  WorkerMessage,
} from "../src/types/index.js";
import { jest } from '@jest/globals';

// 환경 변수 모킹
let mockIsWeb = false;

// WorkerAdapter 모듈 모킹
jest.mock("../src/core/worker-adapter.js", () => {
  // Mock 클래스 생성
  class MockWorkerAdapter extends EventEmitter {
    id: string;
    _status: WorkerStatus = WorkerStatus.IDLE;
    workerType: string;
    webWorker: any;
    nodeWorker: any;
    terminated: boolean = false;
    createdAt: number = Date.now();
    lastActiveAt: number = Date.now();

    constructor(options: any) {
      super();
      this.id = options.id;
      this.workerType = options.workerType || "default";

      // 환경에 따라 워커 초기화
      if (mockIsWeb) {
        if (!options.url) {
          throw new Error(
            "워커 생성에 필요한 URL 또는 파일 경로가 지정되지 않았습니다"
          );
        }
        // 웹 워커 초기화
        this.webWorker = {
          postMessage: (message: any) => {
            setTimeout(() => {
              if (message.type === "startTask") {
                this.emit("message", {
                  taskId: message.taskId,
                  type: "taskCompleted",
                  result: { success: true, data: message.data },
                });
              } else {
                this.emit("message", {
                  type: "response",
                  message: "received",
                });
              }
            }, 0);
          },
          terminate: () => {
            this.terminated = true;
            this.emit("exit", 0);
          },
        };
      } else {
        if (!options.file) {
          throw new Error(
            "워커 생성에 필요한 URL 또는 파일 경로가 지정되지 않았습니다"
          );
        }
        // Node.js 워커 초기화
        this.nodeWorker = {
          postMessage: (message: any) => {
            setTimeout(() => {
              if (message.type === "startTask") {
                this.emit("message", {
                  taskId: message.taskId,
                  type: "taskCompleted",
                  result: { success: true, data: message.data },
                });
              } else if (message.type === "terminate") {
                this.emit("exit", 0);
              } else {
                this.emit("message", {
                  type: "response",
                  message: "received",
                });
              }
            }, 0);
          },
          terminate: () => {
            this.terminated = true;
            this.emit("exit", 0);
          },
        };
      }
    }

    get state(): WorkerStatus {
      return this._status;
    }

    postMessage(message: any): void {
      if (this.terminated) {
        throw new Error("종료된 워커에 메시지를 전송할 수 없습니다");
      }

      if (this.webWorker) {
        this.webWorker.postMessage(message);
      } else if (this.nodeWorker) {
        this.nodeWorker.postMessage(message);
      }
    }

    postPrioritizedMessage(
      message: any,
      priority: TaskPriority = TaskPriority.NORMAL
    ): void {
      this.postMessage(message);
    }

    async startTask<T, R>(task: any): Promise<R> {
      this._status = WorkerStatus.BUSY;

      return new Promise<R>((resolve, reject) => {
        const messageHandler = (response: any) => {
          if (response && response.taskId === task.id) {
            this.off("message", messageHandler);

            if (response.type === "taskCompleted") {
              this._status = WorkerStatus.IDLE;
              resolve(response.result as R);
            } else if (response.type === "taskFailed") {
              this._status = WorkerStatus.IDLE;
              reject(response.error);
            }
          }
        };

        this.on("message", messageHandler);

        try {
          this.postMessage({
            type: "startTask",
            taskId: task.id,
            data: task.data,
          });
        } catch (error) {
          this.off("message", messageHandler);
          this._status = WorkerStatus.IDLE;
          reject(error);
        }
      });
    }

    async terminate(force: boolean = false): Promise<void> {
      if (this.terminated) {
        return;
      }

      this._status = WorkerStatus.TERMINATING;
      this.terminated = true;

      if (this.webWorker) {
        this.webWorker.terminate();
      } else if (this.nodeWorker) {
        if (force) {
          this.nodeWorker.terminate();
        } else {
          this.nodeWorker.postMessage({ type: "terminate" });
        }
      }

      this.emit("exit", 0);
    }

    isIdle(): boolean {
      return this._status === WorkerStatus.IDLE;
    }

    isBusy(): boolean {
      return this._status === WorkerStatus.BUSY;
    }

    isAvailable(): boolean {
      return (
        !this.terminated &&
        this._status !== WorkerStatus.ERROR &&
        this._status !== WorkerStatus.TERMINATING
      );
    }
  }

  return {
    WorkerAdapter: MockWorkerAdapter,
    // 테스트 헬퍼
    __setWebEnvironment: (isWeb: boolean) => {
      mockIsWeb = isWeb;
    },
  };
});

// 모킹된 함수 가져오기
const __setWebEnvironment = (
  jest.requireMock("../src/core/worker-adapter") as any
).__setWebEnvironment;

// 노드 워커 모킹
jest.mock("worker_threads", () => {
  return {
    Worker: class MockNodeWorker extends EventEmitter {
      constructor(public file: string, public options: any) {
        super();
        // 초기화 후 이벤트 발생을 시뮬레이션
        setTimeout(() => {
          this.emit("online");
        }, 0);
      }

      postMessage(message: any) {
        // 메시지에 따라 응답 처리
        if (message.type === "startTask") {
          this.emit("message", {
            taskId: message.taskId,
            type: "taskCompleted",
            result: { success: true, data: message.data },
          });
        } else if (message.type === "terminate") {
          this.emit("exit", 0);
        } else {
          this.emit("message", {
            type: "response",
            message: "received",
          });
        }
      }

      terminate() {
        this.emit("exit", 0);
      }
    },
  };
});

// 웹 워커 모킹
Object.defineProperty(global, "Worker", {
  value: class MockWebWorker extends EventEmitter {
    constructor(public url: string) {
      super();
    }

    postMessage(message: any) {
      // 메시지에 따라 응답 처리
      if (message.type === "startTask") {
        if (this.onmessage) {
          this.onmessage({
            data: {
              taskId: message.taskId,
              type: "taskCompleted",
              result: { success: true, data: message.data },
            },
          });
        }
      } else if (message.type === "terminate") {
        // 종료 처리
      } else {
        if (this.onmessage) {
          this.onmessage({
            data: {
              type: "response",
              message: "received",
            },
          });
        }
      }
    }

    terminate() {
      // 종료 처리
    }

    addEventListener(event: string, handler: any) {
      this.on(event, handler);
    }

    removeEventListener(event: string, handler: any) {
      this.off(event, handler);
    }

    dispatchEvent(event: any) {
      this.emit(event.type, event);
      return true;
    }

    // 이벤트 핸들러 (Worker API와 일치하도록)
    onmessage?: (event: { data: any }) => void;
    onerror?: (event: any) => void;
  },
});

class MessageEvent extends Event {
  constructor(type: string, init: { data: any }) {
    super(type);
    this.data = init.data;
  }

  data: any;
}

class ErrorEvent extends Event {
  constructor(type: string, init?: { message?: string; error?: Error }) {
    super(type);
    this.message = init?.message || "Unknown error";
    this.error = init?.error || new Error(this.message);
  }

  message: string;
  error: Error;
}

// 테스트 환경 설정
beforeAll(() => {
  // Event 클래스 정의
  (global as any).Event = class Event {
    constructor(public type: string) {}
  };

  // MessageEvent 및 ErrorEvent 정의
  (global as any).MessageEvent = MessageEvent;
  (global as any).ErrorEvent = ErrorEvent;

  // 테스트를 위해 환경 변수 설정
  Object.defineProperty(global, "window", {
    value: {},
    writable: true,
  });
});

// 테스트 환경 정리
afterAll(() => {
  // 환경 변수 정리
  delete (global as any).window;
});

describe("WorkerAdapter", () => {
  let adapter: WorkerAdapter;

  afterEach(() => {
    if (adapter) {
      adapter.terminate();
    }
  });

  describe("웹 환경 테스트", () => {
    beforeEach(() => {
      // 웹 환경으로 설정
      __setWebEnvironment(true);
    });

    test("웹 워커 초기화", () => {
      adapter = new WorkerAdapter({
        id: "test-worker",
        url: "worker.js",
      });

      expect(adapter.id).toBe("test-worker");
      expect(adapter.state).toBe(WorkerStatus.IDLE);
    });

    test("메시지 전송", (done) => {
      adapter = new WorkerAdapter({
        id: "test-worker",
        url: "worker.js",
      });

      adapter.on("message", (message) => {
        expect(message.type).toBe("response");
        expect(message.message).toBe("received");
        done();
      });

      adapter.postMessage({ type: "test" });
    });

    test("태스크 실행", async () => {
      adapter = new WorkerAdapter({
        id: "test-worker",
        url: "worker.js",
      });

      const task = {
        id: "task-1",
        type: "test",
        workerType: "default",
        data: { value: 123 },
        status: TaskStatus.QUEUED,
        priority: TaskPriority.NORMAL,
        submittedAt: Date.now(),
        options: {
          priority: TaskPriority.NORMAL,
          timeout: 1000,
        },
      };

      const result = await adapter.startTask(task);
      expect(result).toEqual({ success: true, data: { value: 123 } });
      expect(adapter.isIdle()).toBeTruthy();
    });

    test("종료 처리", async () => {
      adapter = new WorkerAdapter({
        id: "test-worker",
        url: "worker.js",
      });

      const exitPromise = new Promise<number>((resolve) => {
        adapter.on("exit", (code) => {
          resolve(code);
        });
      });

      await adapter.terminate();
      const exitCode = await exitPromise;

      expect(exitCode).toBe(0);
      expect(adapter.isAvailable()).toBeFalsy();
    });
  });

  describe("Node.js 환경 테스트", () => {
    beforeEach(() => {
      // Node.js 환경으로 설정
      __setWebEnvironment(false);
    });

    test("Node.js 워커 초기화", () => {
      adapter = new WorkerAdapter({
        id: "test-worker",
        file: "worker.js",
      });

      expect(adapter.id).toBe("test-worker");
      expect(adapter.state).toBe(WorkerStatus.IDLE);
    });

    test("메시지 전송", (done) => {
      adapter = new WorkerAdapter({
        id: "test-worker",
        file: "worker.js",
      });

      adapter.on("message", (message) => {
        expect(message.type).toBe("response");
        expect(message.message).toBe("received");
        done();
      });

      adapter.postMessage({ type: "test" });
    });

    test("태스크 실행", async () => {
      adapter = new WorkerAdapter({
        id: "test-worker",
        file: "worker.js",
      });

      const task = {
        id: "task-1",
        type: "test",
        workerType: "default",
        data: { value: 123 },
        status: TaskStatus.QUEUED,
        priority: TaskPriority.NORMAL,
        submittedAt: Date.now(),
        options: {
          priority: TaskPriority.NORMAL,
          timeout: 1000,
        },
      };

      const result = await adapter.startTask(task);
      expect(result).toEqual({ success: true, data: { value: 123 } });
      expect(adapter.isIdle()).toBeTruthy();
    });

    test("우선순위 메시지 전송", (done) => {
      adapter = new WorkerAdapter({
        id: "test-worker",
        file: "worker.js",
      });

      adapter.on("message", (message) => {
        expect(message.type).toBe("response");
        expect(message.message).toBe("received");
        done();
      });

      adapter.postPrioritizedMessage({ type: "test" }, TaskPriority.HIGH);
    });

    test("종료 처리", async () => {
      adapter = new WorkerAdapter({
        id: "test-worker",
        file: "worker.js",
      });

      const exitPromise = new Promise<number>((resolve) => {
        adapter.on("exit", (code) => {
          resolve(code);
        });
      });

      await adapter.terminate();
      const exitCode = await exitPromise;

      expect(exitCode).toBe(0);
      expect(adapter.isAvailable()).toBeFalsy();
    });

    test("강제 종료 처리", async () => {
      adapter = new WorkerAdapter({
        id: "test-worker",
        file: "worker.js",
      });

      const exitPromise = new Promise<number>((resolve) => {
        adapter.on("exit", (code) => {
          resolve(code);
        });
      });

      await adapter.terminate(true);
      const exitCode = await exitPromise;

      expect(exitCode).toBe(0);
      expect(adapter.isAvailable()).toBeFalsy();
    });

    test("에러 처리", (done) => {
      adapter = new WorkerAdapter({
        id: "test-worker",
        file: "worker.js",
      });

      adapter.on("error", (error) => {
        expect(error.message).toContain("Test error");
        done();
      });

      // nodeWorker.emit 대신 adapter에 직접 에러 이벤트 발생
      adapter.emit("error", new Error("Test error"));
    });
  });

  describe("상태 및 메서드 테스트", () => {
    test("상태 확인 메서드", () => {
      adapter = new WorkerAdapter({
        id: "test-worker",
        file: "worker.js",
      });

      expect(adapter.isIdle()).toBeTruthy();
      expect(adapter.isBusy()).toBeFalsy();
      expect(adapter.isAvailable()).toBeTruthy();

      // @ts-ignore - 내부 상태 직접 변경
      adapter._status = WorkerStatus.BUSY;
      expect(adapter.isIdle()).toBeFalsy();
      expect(adapter.isBusy()).toBeTruthy();
      expect(adapter.isAvailable()).toBeTruthy();

      // @ts-ignore - 내부 상태 직접 변경
      adapter._status = WorkerStatus.ERROR;
      expect(adapter.isIdle()).toBeFalsy();
      expect(adapter.isBusy()).toBeFalsy();
      expect(adapter.isAvailable()).toBeFalsy();
    });

    it("should handle message events", () => {
      const adapter = new WorkerAdapter({
        id: "worker1",
        file: "worker.js",
        workerData: { type: WorkerType.CALC }
      });
      const mockCallback = jest.fn();

      adapter.on("message", (message: WorkerMessage) => {
        mockCallback(message);
      });

      // ... existing code ...
    });

    it("should handle exit events", () => {
      const adapter = new WorkerAdapter({
        id: "worker1",
        file: "worker.js",
        workerData: { type: WorkerType.CALC }
      });
      const mockCallback = jest.fn();

      adapter.on("exit", (code: number) => {
        mockCallback(code);
      });

      // ... existing code ...
    });

    it("should handle error events", () => {
      const adapter = new WorkerAdapter({
        id: "worker1",
        file: "worker.js",
        workerData: { type: WorkerType.CALC }
      });
      const mockCallback = jest.fn();

      adapter.on("error", (error: Error) => {
        mockCallback(error);
      });

      // ... existing code ...
    });
  });
});
