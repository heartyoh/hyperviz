/**
 * 태스크 큐 관리
 * 우선순위 기반 태스크 큐 구현
 */

import { Task, TaskPriority } from "../../types/index.js";

/**
 * 태스크 큐 인터페이스
 */
export interface ITaskQueue<T = any, R = any> {
  /** 태스크 추가 */
  enqueue(task: Task<T, R>): void;

  /** 우선순위가 가장 높은 태스크 반환 및 제거 */
  dequeue(): Task<T, R> | undefined;

  /** 큐가 비어있는지 확인 */
  isEmpty(): boolean;

  /** 큐의 크기 반환 */
  size(): number;

  /** 특정 태스크 ID로 태스크 제거 */
  remove(taskId: string): boolean;

  /** 모든 태스크 반환 */
  getAll(): Task<T, R>[];

  /** 큐 비우기 */
  clear(): void;
}

/**
 * 우선순위 기반 태스크 큐 클래스
 */
export class TaskQueue<T = any, R = any> implements ITaskQueue<T, R> {
  /** 태스크 배열 */
  private queue: Task<T, R>[] = [];

  /** 태스크 추가 */
  enqueue(task: Task<T, R>): void {
    this.queue.push(task);
    this.sort();
  }

  /** 우선순위가 가장 높은 태스크 반환 및 제거 */
  dequeue(): Task<T, R> | undefined {
    return this.queue.shift();
  }

  /** 큐가 비어있는지 확인 */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /** 큐의 크기 반환 */
  size(): number {
    return this.queue.length;
  }

  /** 특정 태스크 ID로 태스크 제거 */
  remove(taskId: string): boolean {
    const initialSize = this.queue.length;
    this.queue = this.queue.filter((task) => task.id !== taskId);
    return this.queue.length < initialSize;
  }

  /** 모든 태스크 반환 */
  getAll(): Task<T, R>[] {
    return [...this.queue];
  }

  /** 큐 비우기 */
  clear(): void {
    this.queue = [];
  }

  /** 우선순위에 따라 큐 정렬 */
  private sort(): void {
    this.queue.sort((a, b) => {
      // 우선순위 비교 (낮은 값이 높은 우선순위)
      const priorityA =
        a.priority !== undefined ? a.priority : TaskPriority.NORMAL;
      const priorityB =
        b.priority !== undefined ? b.priority : TaskPriority.NORMAL;

      // 우선순위가 다르면 우선순위로 정렬
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // 우선순위가 같으면 제출 시간으로 정렬 (먼저 제출된 것이 우선)
      return a.submittedAt - b.submittedAt;
    });
  }
}
