/**
 * WorkerManager 테스트
 */
import { EventEmitter } from "eventemitter3";
import { WorkerManager } from "../src/core/worker-manager";
import { WorkerStatus, WorkerType } from "../src/types/index";

// WorkerAdapter 모킹
jest.mock("../src/core/worker-adapter", () => {
  return {
    WorkerAdapter: jest
      .fn()
      .mockImplementation(function (this: any, options: any) {
        // EventEmitter 상속
        const EventEmitter = require("eventemitter3");
        EventEmitter.call(this);
        Object.setPrototypeOf(this, EventEmitter.prototype);

        // 워커 상태 및 속성
        this.id = options.id;
        this.workerType = options.workerData?.type || "default";
        this._status = WorkerStatus.IDLE;
        this.createdAt = Date.now();
        this.lastActiveAt = Date.now();

        // 워커 메소드
        this.postMessage = jest.fn();

        this.isIdle = jest.fn(() => this._status === WorkerStatus.IDLE);
        this.isBusy = jest.fn(() => this._status === WorkerStatus.BUSY);
        this.isAvailable = jest.fn(
          () =>
            this._status !== WorkerStatus.ERROR &&
            this._status !== WorkerStatus.TERMINATING
        );

        this.terminate = jest.fn(() => {
          this._status = WorkerStatus.TERMINATING;
          this.emit("exit", 0);
          return Promise.resolve();
        });
      }),
  };
});

describe("WorkerManager", () => {
  let manager: WorkerManager;

  beforeEach(() => {
    jest.clearAllMocks();

    manager = new WorkerManager({
      minWorkers: 1,
      maxWorkers: 3,
      idleTimeout: 1000,
      workerType: WorkerType.CALC,
    });
  });

  afterEach(() => {
    manager.removeAllListeners();
  });

  describe("워커 생성 및 관리", () => {
    test("워커 생성", () => {
      const workerId = manager.createWorker();

      // 워커 ID가 반환되었는지 확인
      expect(workerId).toBeDefined();
      expect(typeof workerId).toBe("string");

      // 이벤트가 발생했는지 확인
      const listener = jest.fn();
      manager.on("workerCreated", listener);

      manager.createWorker();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId");
    });

    test("최대 워커 수 제한", () => {
      // 최대 워커 수까지 생성
      manager.createWorker();
      manager.createWorker();
      manager.createWorker();

      // 최대 워커 수를 초과하면 오류 발생
      expect(() => manager.createWorker()).toThrow(/최대 워커 수/);
    });

    test("워커 해제", async () => {
      // 워커 생성
      const workerId = manager.createWorker();

      // 워커 해제
      await manager.releaseWorker(workerId);

      // 워커가 삭제되었는지 확인
      expect(manager.getWorker(workerId)).toBeUndefined();
    });

    test("존재하지 않는 워커 해제", async () => {
      // 존재하지 않는 워커 ID로 해제 시도
      await manager.releaseWorker("non-existent-worker");

      // 오류가 발생하지 않고 정상적으로 처리됨
      expect(true).toBeTruthy();
    });

    test("모든 워커 종료", async () => {
      // 여러 워커 생성
      manager.createWorker();
      manager.createWorker();

      // 모든 워커 종료
      await manager.closeAll();

      // 모든 워커가 삭제되었는지 확인
      const stats = manager.getStats();
      expect(stats.totalWorkers).toBe(0);
    });
  });

  describe("워커 상태 관리", () => {
    test("워커 상태 설정", () => {
      // 워커 생성
      const workerId = manager.createWorker();

      // 워커 상태 설정
      manager.setWorkerStatus(workerId, WorkerStatus.BUSY);

      // 워커 상태 확인
      expect(manager.getWorkerStatus(workerId)).toBe(WorkerStatus.BUSY);
    });

    test("존재하지 않는 워커 상태 설정", () => {
      // 존재하지 않는 워커 ID로 상태 설정 시도
      manager.setWorkerStatus("non-existent-worker", WorkerStatus.BUSY);

      // 오류가 발생하지 않고 정상적으로 처리됨
      expect(true).toBeTruthy();
    });

    test("워커 상태 가져오기", () => {
      // 워커 생성
      const workerId = manager.createWorker();

      // 초기 상태 확인
      expect(manager.getWorkerStatus(workerId)).toBe(WorkerStatus.IDLE);

      // 상태 변경 후 확인
      manager.setWorkerStatus(workerId, WorkerStatus.BUSY);
      expect(manager.getWorkerStatus(workerId)).toBe(WorkerStatus.BUSY);
    });

    test("존재하지 않는 워커 상태 가져오기", () => {
      // 존재하지 않는 워커 ID로 상태 가져오기 시도
      const status = manager.getWorkerStatus("non-existent-worker");

      // 기본값(UNKNOWN)이 반환됨
      expect(status).toBe(WorkerStatus.UNKNOWN);
    });
  });

  describe("워커 선택 및 통계", () => {
    test("유휴 워커 가져오기", () => {
      // 워커 생성
      const workerId = manager.createWorker();

      // 유휴 워커 가져오기
      const worker = manager.getIdleWorker();

      // 생성한 워커가 반환됨
      expect(worker).toBeDefined();
      expect(worker?.id).toBe(workerId);
    });

    test("유휴 워커가 없을 때", () => {
      // 워커 생성
      const workerId = manager.createWorker();

      // 워커 상태를 BUSY로 변경
      manager.setWorkerStatus(workerId, WorkerStatus.BUSY);

      // 유휴 워커 가져오기 시도
      const worker = manager.getIdleWorker();

      // 유휴 워커가 없으므로 undefined 반환
      expect(worker).toBeUndefined();
    });

    test("워커 통계 가져오기", () => {
      // 초기 상태 확인
      let stats = manager.getStats();
      expect(stats.totalWorkers).toBe(0);
      expect(stats.activeWorkers).toBe(0);
      expect(stats.idleWorkers).toBe(0);

      // 워커 생성
      const workerId1 = manager.createWorker();
      const workerId2 = manager.createWorker();

      // 하나의 워커 상태를 BUSY로 변경
      manager.setWorkerStatus(workerId1, WorkerStatus.BUSY);

      // 통계 다시 확인
      stats = manager.getStats();
      expect(stats.totalWorkers).toBe(2);
      expect(stats.activeWorkers).toBe(1);
      expect(stats.idleWorkers).toBe(1);
    });
  });

  describe("워커 이벤트 처리", () => {
    test("워커 오류 이벤트", () => {
      // 이벤트 리스너 등록
      const listener = jest.fn();
      manager.on("workerError", listener);

      // 워커 생성
      const workerId = manager.createWorker();
      const worker = manager.getWorker(workerId);

      // 워커에서 오류 이벤트 발생
      const error = new Error("Test error");
      worker?.emit("error", error);

      // 이벤트가 전파되었는지 확인
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId", workerId);
      expect(listener.mock.calls[0][0]).toHaveProperty("error", error);

      // 워커 상태가 ERROR로 변경되었는지 확인
      expect(manager.getWorkerStatus(workerId)).toBe(WorkerStatus.ERROR);
    });

    test("워커 종료 이벤트", () => {
      // 이벤트 리스너 등록
      const listener = jest.fn();
      manager.on("workerExit", listener);

      // 워커 생성
      const workerId = manager.createWorker();
      const worker = manager.getWorker(workerId);

      // 워커에서 종료 이벤트 발생
      worker?.emit("exit", 0);

      // 이벤트가 전파되었는지 확인
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId", workerId);
      expect(listener.mock.calls[0][0]).toHaveProperty("exitCode", 0);

      // 워커가 삭제되었는지 확인
      expect(manager.getWorker(workerId)).toBeUndefined();
    });

    test("워커 메시지 이벤트", () => {
      // 이벤트 리스너 등록
      const listener = jest.fn();
      manager.on("workerMessage", listener);

      // 워커 생성
      const workerId = manager.createWorker();
      const worker = manager.getWorker(workerId);

      // 워커에서 메시지 이벤트 발생
      const message = { type: "test", data: "test-data" };
      worker?.emit("message", message);

      // 이벤트가 전파되었는지 확인
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId", workerId);
      expect(listener.mock.calls[0][0]).toHaveProperty("message", message);
    });
  });

  describe("워커 스케일링", () => {
    test("최소 워커 수 유지", () => {
      // 최소 워커 수 유지 호출
      manager.ensureMinWorkers();

      // 최소 워커 수 이상의 워커가 생성되었는지 확인
      const stats = manager.getStats();
      expect(stats.totalWorkers).toBeGreaterThanOrEqual(1);
    });

    test("이미 최소 워커 수를 만족할 때", () => {
      // 워커 생성
      manager.createWorker();
      manager.createWorker();

      // 최소 워커 수 유지 호출 전 워커 수 확인
      const beforeStats = manager.getStats();

      // 최소 워커 수 유지 호출
      manager.ensureMinWorkers();

      // 워커 수가 변경되지 않았는지 확인
      const afterStats = manager.getStats();
      expect(afterStats.totalWorkers).toBe(beforeStats.totalWorkers);
    });
  });

  describe("유틸리티 메서드", () => {
    test("워커 가져오기", () => {
      // 워커 생성
      const workerId = manager.createWorker();

      // 워커 가져오기
      const worker = manager.getWorker(workerId);

      // 워커가 존재하는지 확인
      expect(worker).toBeDefined();
      expect(worker?.id).toBe(workerId);
    });

    test("존재하지 않는 워커 가져오기", () => {
      // 존재하지 않는 워커 ID로 가져오기 시도
      const worker = manager.getWorker("non-existent-worker");

      // 워커가 존재하지 않으므로 undefined 반환
      expect(worker).toBeUndefined();
    });

    test("모든 워커 가져오기", () => {
      // 워커 생성
      const workerId1 = manager.createWorker();
      const workerId2 = manager.createWorker();

      // 모든 워커 가져오기
      const workers = manager.getAllWorkers();

      // 모든 워커가 반환되었는지 확인
      expect(workers.length).toBe(2);
      expect(workers.map((w) => w.id).sort()).toEqual(
        [workerId1, workerId2].sort()
      );
    });

    test("워커 해제 타이머 설정 및 해제", async () => {
      // jest의 타이머 모킹 설정
      jest.useFakeTimers();

      // 짧은 유휴 타임아웃으로 매니저 생성
      const workerManager = new WorkerManager({
        minWorkers: 0,
        maxWorkers: 1,
        idleTimeout: 100,
        workerType: WorkerType.CALC,
      });

      // 워커 생성
      const workerId = workerManager.createWorker();

      // 타이머 진행
      jest.advanceTimersByTime(200);

      // 비동기 작업 완료 대기
      await Promise.resolve();

      // 워커가 자동으로 해제되었는지 확인
      expect(workerManager.getWorker(workerId)).toBeUndefined();

      // 타이머 모킹 해제
      jest.useRealTimers();
    });
  });
});
