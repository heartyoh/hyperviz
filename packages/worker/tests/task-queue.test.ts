/**
 * TaskQueue 테스트
 */
import { TaskQueue } from "../src/core/task-queue.js";
import { Task, TaskPriority, TaskStatus, WorkerType } from "../src/types/index.js";

describe("TaskQueue", () => {
  let taskQueue: TaskQueue;

  beforeEach(() => {
    taskQueue = new TaskQueue();
  });

  // 테스트용 태스크 생성 헬퍼 함수
  const createTask = (
    id: string,
    priority: TaskPriority = TaskPriority.NORMAL
  ): Task => {
    return {
      id,
      type: "test",
      workerType: WorkerType.CALC,
      data: { test: true },
      status: TaskStatus.QUEUED,
      priority,
      submittedAt: Date.now(),
      options: {
        priority,
      },
    };
  };

  describe("큐 초기화 및 상태", () => {
    test("빈 큐로 초기화", () => {
      // 초기 상태 확인
      expect(taskQueue.size()).toBe(0);
      expect(taskQueue.isEmpty()).toBe(true);
    });

    test("큐 상태 확인", () => {
      // 태스크 추가
      const task1 = createTask("task-1");
      const task2 = createTask("task-2");

      taskQueue.enqueue(task1);
      taskQueue.enqueue(task2);

      // 큐 상태 확인
      expect(taskQueue.size()).toBe(2);
      expect(taskQueue.isEmpty()).toBe(false);
    });
  });

  describe("태스크 추가 및 제거", () => {
    test("태스크 추가 및 dequeue", () => {
      // 태스크 추가
      const task = createTask("task-1");
      taskQueue.enqueue(task);

      // 태스크 제거
      const removedTask = taskQueue.dequeue();

      // 제거된 태스크 확인
      expect(removedTask).toEqual(task);

      // 큐 상태 확인
      expect(taskQueue.size()).toBe(0);
      expect(taskQueue.isEmpty()).toBe(true);
    });

    test("빈 큐에서 dequeue", () => {
      // 빈 큐에서 태스크 제거
      const removedTask = taskQueue.dequeue();

      // 결과 확인
      expect(removedTask).toBeUndefined();
    });

    test("ID로 태스크 제거", () => {
      // 태스크 추가
      const task1 = createTask("task-1");
      const task2 = createTask("task-2");
      const task3 = createTask("task-3");

      taskQueue.enqueue(task1);
      taskQueue.enqueue(task2);
      taskQueue.enqueue(task3);

      // ID로 태스크 제거
      const removed = taskQueue.remove("task-2");

      // 제거 성공 확인
      expect(removed).toBe(true);

      // 큐 상태 확인
      expect(taskQueue.size()).toBe(2);

      // 남은 태스크 확인
      const allTasks = taskQueue.getAll();
      expect(allTasks.length).toBe(2);
      expect(allTasks.find((task) => task.id === "task-2")).toBeUndefined();

      // 큐에서 태스크 꺼내기
      const firstTask = taskQueue.dequeue();
      const secondTask = taskQueue.dequeue();

      expect(firstTask?.id).toBe("task-1");
      expect(secondTask?.id).toBe("task-3");
    });

    test("존재하지 않는 ID로 태스크 제거", () => {
      // 태스크 추가
      const task = createTask("task-1");
      taskQueue.enqueue(task);

      // 존재하지 않는 ID로 태스크 제거
      const removed = taskQueue.remove("non-existent-task");

      // 결과 확인
      expect(removed).toBe(false);

      // 큐 상태 확인
      expect(taskQueue.size()).toBe(1);
    });
  });

  describe("우선순위 기반 태스크 정렬", () => {
    test("우선순위에 따른 dequeue 순서", () => {
      // 다양한 우선순위의 태스크 추가
      const lowPriorityTask = createTask("low", TaskPriority.LOW);
      const normalPriorityTask = createTask("normal", TaskPriority.NORMAL);
      const highPriorityTask = createTask("high", TaskPriority.HIGH);

      // 순서대로 추가
      taskQueue.enqueue(lowPriorityTask);
      taskQueue.enqueue(normalPriorityTask);
      taskQueue.enqueue(highPriorityTask);

      // 우선순위에 따라 제거되는지 확인
      expect(taskQueue.dequeue()).toEqual(highPriorityTask);
      expect(taskQueue.dequeue()).toEqual(normalPriorityTask);
      expect(taskQueue.dequeue()).toEqual(lowPriorityTask);
    });

    test("같은 우선순위의 태스크는 추가 순서대로 dequeue", () => {
      // 동일한 우선순위의 태스크 추가
      const task1 = createTask("task-1", TaskPriority.NORMAL);
      const task2 = createTask("task-2", TaskPriority.NORMAL);
      const task3 = createTask("task-3", TaskPriority.NORMAL);

      // 순서대로 추가
      taskQueue.enqueue(task1);
      taskQueue.enqueue(task2);
      taskQueue.enqueue(task3);

      // 추가 순서대로 제거되는지 확인
      expect(taskQueue.dequeue()).toEqual(task1);
      expect(taskQueue.dequeue()).toEqual(task2);
      expect(taskQueue.dequeue()).toEqual(task3);
    });

    test("혼합 우선순위의 태스크 정렬", () => {
      // 다양한 우선순위의 태스크 추가
      const task1 = createTask("task-1", TaskPriority.NORMAL);
      const task2 = createTask("task-2", TaskPriority.HIGH);
      const task3 = createTask("task-3", TaskPriority.LOW);
      const task4 = createTask("task-4", TaskPriority.HIGH);
      const task5 = createTask("task-5", TaskPriority.NORMAL);

      // 순서대로 추가
      taskQueue.enqueue(task1);
      taskQueue.enqueue(task2);
      taskQueue.enqueue(task3);
      taskQueue.enqueue(task4);
      taskQueue.enqueue(task5);

      // 우선순위와 추가 순서에 따라 제거되는지 확인
      expect(taskQueue.dequeue()).toEqual(task2); // HIGH (첫 번째로 추가된 HIGH)
      expect(taskQueue.dequeue()).toEqual(task4); // HIGH (두 번째로 추가된 HIGH)
      expect(taskQueue.dequeue()).toEqual(task1); // NORMAL (첫 번째로 추가된 NORMAL)
      expect(taskQueue.dequeue()).toEqual(task5); // NORMAL (두 번째로 추가된 NORMAL)
      expect(taskQueue.dequeue()).toEqual(task3); // LOW
    });
  });

  describe("큐 유틸리티 메서드", () => {
    test("ID로 태스크 찾기", () => {
      // 태스크 추가
      const task1 = createTask("task-1");
      const task2 = createTask("task-2");

      taskQueue.enqueue(task1);
      taskQueue.enqueue(task2);

      // 현재 모든 태스크 가져오기
      const allTasks = taskQueue.getAll();

      // ID로 태스크 찾기
      const foundTask = allTasks.find((task) => task.id === "task-2");

      // 결과 확인
      expect(foundTask).toEqual(task2);

      // 큐가 변경되지 않았는지 확인
      expect(taskQueue.size()).toBe(2);
    });

    test("존재하지 않는 ID로 태스크 찾기", () => {
      // 태스크 추가
      const task = createTask("task-1");
      taskQueue.enqueue(task);

      // 현재 모든 태스크 가져오기
      const allTasks = taskQueue.getAll();

      // 존재하지 않는 ID로 태스크 찾기
      const foundTask = allTasks.find(
        (task) => task.id === "non-existent-task"
      );

      // 결과 확인
      expect(foundTask).toBeUndefined();
    });

    test("모든 태스크 가져오기", () => {
      // 태스크 추가
      const task1 = createTask("task-1");
      const task2 = createTask("task-2");
      const task3 = createTask("task-3");

      taskQueue.enqueue(task1);
      taskQueue.enqueue(task2);
      taskQueue.enqueue(task3);

      // 모든 태스크 가져오기
      const allTasks = taskQueue.getAll();

      // 결과 확인
      expect(allTasks.length).toBe(3);
      expect(allTasks).toContainEqual(task1);
      expect(allTasks).toContainEqual(task2);
      expect(allTasks).toContainEqual(task3);

      // 큐가 변경되지 않았는지 확인
      expect(taskQueue.size()).toBe(3);
    });

    test("큐 비우기", () => {
      // 태스크 추가
      const task1 = createTask("task-1");
      const task2 = createTask("task-2");

      taskQueue.enqueue(task1);
      taskQueue.enqueue(task2);

      // 큐 비우기
      taskQueue.clear();

      // 큐 상태 확인
      expect(taskQueue.size()).toBe(0);
      expect(taskQueue.isEmpty()).toBe(true);
    });
  });

  it("should remove task by id", () => {
    const queue = new TaskQueue();
    const task1: Task = {
      id: "task-1",
      type: "test",
      workerType: WorkerType.CALC,
      data: { value: 1 },
      status: TaskStatus.QUEUED,
      priority: TaskPriority.NORMAL,
      submittedAt: Date.now(),
      options: {
        priority: TaskPriority.NORMAL
      }
    };
    const task2: Task = {
      id: "task-2",
      type: "test",
      workerType: WorkerType.CALC,
      data: { value: 2 },
      status: TaskStatus.QUEUED,
      priority: TaskPriority.NORMAL,
      submittedAt: Date.now(),
      options: {
        priority: TaskPriority.NORMAL
      }
    };

    queue.enqueue(task1);
    queue.enqueue(task2);

    queue.remove("task-2");
    const allTasks = queue.getAll();

    expect(allTasks.find((task: Task) => task.id === "task-2")).toBeUndefined();
    expect(allTasks).toHaveLength(1);
    expect(allTasks[0].id).toBe("task-1");
  });

  it("should find task by id", () => {
    const queue = new TaskQueue();
    const task1: Task = {
      id: "task-1",
      type: "test",
      workerType: WorkerType.CALC,
      data: { value: 1 },
      status: TaskStatus.QUEUED,
      priority: TaskPriority.NORMAL,
      submittedAt: Date.now(),
      options: {
        priority: TaskPriority.NORMAL
      }
    };
    const task2: Task = {
      id: "task-2",
      type: "test",
      workerType: WorkerType.CALC,
      data: { value: 2 },
      status: TaskStatus.QUEUED,
      priority: TaskPriority.NORMAL,
      submittedAt: Date.now(),
      options: {
        priority: TaskPriority.NORMAL
      }
    };

    queue.enqueue(task1);
    queue.enqueue(task2);

    const allTasks = queue.getAll();
    const foundTask = allTasks.find((task: Task) => task.id === "task-2");

    expect(foundTask).toBeDefined();
    expect(foundTask?.id).toBe("task-2");
  });

  it("should not find non-existent task", () => {
    const queue = new TaskQueue();
    const allTasks = queue.getAll();
    const task = allTasks.find(
      (task: Task) => task.id === "non-existent-task"
    );
    expect(task).toBeUndefined();
  });
});
