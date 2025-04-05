/**
 * EventHub 테스트
 */
import {
  EventHub,
  TaskEventType,
  WorkerEventType,
  TaskEventData,
  WorkerEventData,
} from "../src/core/event-hub";
import { TaskStatus } from "../src/types/index";

describe("EventHub", () => {
  let eventHub: EventHub;

  beforeEach(() => {
    eventHub = new EventHub();
  });

  afterEach(() => {
    eventHub.removeAllListeners();
  });

  describe("Task 이벤트", () => {
    test("QUEUED 이벤트 발행 및 구독", () => {
      const listener = jest.fn();
      eventHub.on(TaskEventType.QUEUED, listener);

      const taskId = "task-1";
      const workerType = "calc";

      eventHub.taskQueued(taskId, workerType);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("taskId", taskId);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "workerType",
        workerType
      );
      expect(listener.mock.calls[0][0]).toHaveProperty("timestamp");
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "eventType",
        TaskEventType.QUEUED
      );
    });

    test("STARTED 이벤트 발행 및 구독", () => {
      const listener = jest.fn();
      eventHub.on(TaskEventType.STARTED, listener);

      const taskId = "task-1";
      const workerId = "worker-1";
      const workerType = "calc";

      eventHub.taskStarted(taskId, workerId, workerType);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("taskId", taskId);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId", workerId);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "workerType",
        workerType
      );
      expect(listener.mock.calls[0][0]).toHaveProperty("timestamp");
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "eventType",
        TaskEventType.STARTED
      );
    });

    test("COMPLETED 이벤트 발행 및 구독", () => {
      const listener = jest.fn();
      eventHub.on(TaskEventType.COMPLETED, listener);

      const taskId = "task-1";
      const workerId = "worker-1";
      const result = { value: 42 };
      const workerType = "calc";

      eventHub.taskCompleted(taskId, workerId, result, workerType);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("taskId", taskId);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId", workerId);
      expect(listener.mock.calls[0][0]).toHaveProperty("result", result);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "workerType",
        workerType
      );
      expect(listener.mock.calls[0][0]).toHaveProperty("timestamp");
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "eventType",
        TaskEventType.COMPLETED
      );
    });

    test("FAILED 이벤트 발행 및 구독", () => {
      const listener = jest.fn();
      eventHub.on(TaskEventType.FAILED, listener);

      const taskId = "task-1";
      const workerId = "worker-1";
      const error = new Error("Task failed");
      const workerType = "calc";

      eventHub.taskFailed(taskId, workerId, error, workerType);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("taskId", taskId);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId", workerId);
      expect(listener.mock.calls[0][0]).toHaveProperty("error", error);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "workerType",
        workerType
      );
      expect(listener.mock.calls[0][0]).toHaveProperty("timestamp");
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "eventType",
        TaskEventType.FAILED
      );
    });

    test("CANCELLED 이벤트 발행 및 구독", () => {
      const listener = jest.fn();
      eventHub.on(TaskEventType.CANCELLED, listener);

      const taskId = "task-1";
      const workerId = "worker-1";
      const workerType = "calc";

      eventHub.taskCancelled(taskId, workerId, workerType);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("taskId", taskId);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId", workerId);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "workerType",
        workerType
      );
      expect(listener.mock.calls[0][0]).toHaveProperty("timestamp");
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "eventType",
        TaskEventType.CANCELLED
      );
    });

    test("PROGRESS 이벤트 발행 및 구독", () => {
      const listener = jest.fn();
      eventHub.on(TaskEventType.PROGRESS, listener);

      const taskId = "task-1";
      const workerId = "worker-1";
      const progress = { percent: 50 };
      const workerType = "calc";

      eventHub.taskProgress(taskId, workerId, progress, workerType);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("taskId", taskId);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId", workerId);
      expect(listener.mock.calls[0][0]).toHaveProperty("progress", progress);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "workerType",
        workerType
      );
      expect(listener.mock.calls[0][0]).toHaveProperty("timestamp");
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "eventType",
        TaskEventType.PROGRESS
      );
    });

    test("모든 Task 이벤트 구독", () => {
      const listener = jest.fn();
      eventHub.on("taskEvent", listener);

      eventHub.taskQueued("task-1", "calc");
      eventHub.taskStarted("task-1", "worker-1", "calc");
      eventHub.taskCompleted("task-1", "worker-1", { value: 42 }, "calc");

      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "type",
        TaskEventType.QUEUED
      );
      expect(listener.mock.calls[1][0]).toHaveProperty(
        "type",
        TaskEventType.STARTED
      );
      expect(listener.mock.calls[2][0]).toHaveProperty(
        "type",
        TaskEventType.COMPLETED
      );
    });

    test("Task 이벤트 구독 해제", () => {
      const listener = jest.fn();
      eventHub.on(TaskEventType.QUEUED, listener);

      eventHub.taskQueued("task-1", "calc");

      eventHub.off(TaskEventType.QUEUED, listener);

      eventHub.taskQueued("task-2", "calc");

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("Worker 이벤트", () => {
    test("CREATED 이벤트 발행 및 구독", () => {
      const listener = jest.fn();
      eventHub.on(WorkerEventType.CREATED, listener);

      const workerId = "worker-1";
      const workerType = "calc";

      eventHub.workerCreated(workerId, workerType);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId", workerId);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "workerType",
        workerType
      );
      expect(listener.mock.calls[0][0]).toHaveProperty("timestamp");
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "eventType",
        WorkerEventType.CREATED
      );
    });

    test("ERROR 이벤트 발행 및 구독", () => {
      const listener = jest.fn();
      eventHub.on(WorkerEventType.ERROR, listener);

      const workerId = "worker-1";
      const error = new Error("Worker error");
      const workerType = "calc";

      eventHub.emitWorkerEvent(WorkerEventType.ERROR, {
        workerId,
        error,
        workerType,
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId", workerId);
      expect(listener.mock.calls[0][0]).toHaveProperty("error", error);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "workerType",
        workerType
      );
      expect(listener.mock.calls[0][0]).toHaveProperty("timestamp");
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "eventType",
        WorkerEventType.ERROR
      );
    });

    test("EXIT 이벤트 발행 및 구독", () => {
      const listener = jest.fn();
      eventHub.on(WorkerEventType.EXIT, listener);

      const workerId = "worker-1";
      const exitCode = 0;
      const workerType = "calc";

      eventHub.emitWorkerEvent(WorkerEventType.EXIT, {
        workerId,
        exitCode,
        workerType,
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId", workerId);
      expect(listener.mock.calls[0][0]).toHaveProperty("exitCode", exitCode);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "workerType",
        workerType
      );
      expect(listener.mock.calls[0][0]).toHaveProperty("timestamp");
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "eventType",
        WorkerEventType.EXIT
      );
    });

    test("STATE_CHANGE 이벤트 발행 및 구독", () => {
      const listener = jest.fn();
      eventHub.on(WorkerEventType.STATE_CHANGE, listener);

      const workerId = "worker-1";
      const previousState = "IDLE";
      const newState = "BUSY";
      const workerType = "calc";

      eventHub.emitWorkerEvent(WorkerEventType.STATE_CHANGE, {
        workerId,
        previousState,
        newState,
        workerType,
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveProperty("workerId", workerId);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "previousState",
        previousState
      );
      expect(listener.mock.calls[0][0]).toHaveProperty("newState", newState);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "workerType",
        workerType
      );
      expect(listener.mock.calls[0][0]).toHaveProperty("timestamp");
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "eventType",
        WorkerEventType.STATE_CHANGE
      );
    });

    test("모든 Worker 이벤트 구독", () => {
      const listener = jest.fn();
      eventHub.on("workerEvent", listener);

      eventHub.workerCreated("worker-1", "calc");
      eventHub.emitWorkerEvent(WorkerEventType.STATE_CHANGE, {
        workerId: "worker-1",
        previousState: "IDLE",
        newState: "BUSY",
      });
      eventHub.emitWorkerEvent(WorkerEventType.EXIT, {
        workerId: "worker-1",
        exitCode: 0,
      });

      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener.mock.calls[0][0]).toHaveProperty(
        "type",
        WorkerEventType.CREATED
      );
      expect(listener.mock.calls[1][0]).toHaveProperty(
        "type",
        WorkerEventType.STATE_CHANGE
      );
      expect(listener.mock.calls[2][0]).toHaveProperty(
        "type",
        WorkerEventType.EXIT
      );
    });

    test("Worker 이벤트 구독 해제", () => {
      const listener = jest.fn();
      eventHub.on(WorkerEventType.CREATED, listener);

      eventHub.workerCreated("worker-1", "calc");

      eventHub.off(WorkerEventType.CREATED, listener);

      eventHub.workerCreated("worker-2", "calc");

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("이벤트 리스너 관리", () => {
    test("리스너 등록 및 제거", () => {
      const listener = jest.fn();

      eventHub.on("test-event", listener);

      eventHub.emit("test-event", { data: "test" });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ data: "test" });

      eventHub.off("test-event", listener);

      eventHub.emit("test-event", { data: "test2" });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("모든 리스너 제거", () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventHub.on("test-event-1", listener1);
      eventHub.on("test-event-2", listener2);

      eventHub.emit("test-event-1", { data: "test1" });
      eventHub.emit("test-event-2", { data: "test2" });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      eventHub.removeAllListeners();

      eventHub.emit("test-event-1", { data: "test1-again" });
      eventHub.emit("test-event-2", { data: "test2-again" });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    test("특정 이벤트의 모든 리스너 제거", () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      eventHub.on("test-event", listener1);
      eventHub.on("test-event", listener2);
      eventHub.on("other-event", listener3);

      eventHub.emit("test-event", { data: "test" });
      eventHub.emit("other-event", { data: "other" });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);

      eventHub.removeAllListeners("test-event");

      eventHub.emit("test-event", { data: "test-again" });
      eventHub.emit("other-event", { data: "other-again" });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(2);
    });
  });
});
