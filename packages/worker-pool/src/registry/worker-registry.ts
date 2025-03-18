/**
 * Worker Registry
 *
 * Worker 유형별 등록 관리를 담당하는 클래스
 */

import { isNode } from "../utils/env-detector.js";

// Node.js 환경에서만 path 모듈 동적 로드
let path: any;
if (isNode()) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    path = require("path");
  } catch (e) {
    console.error("Failed to load path module:", e);
  }
}

import { WorkerType } from "../types/index.js";

// 경로 조합 유틸리티 함수
function joinPaths(base: string, relative: string): string {
  if (isNode() && path) {
    return path.resolve(base, relative);
  } else {
    // 브라우저 환경에서는 단순 상대 경로 사용
    return relative;
  }
}

export class WorkerRegistry {
  private workerPaths: Map<WorkerType, string>;
  private customWorkers: Map<string, string>;

  constructor() {
    // 기본 워커 경로 초기화 - 브라우저 환경에 맞게 상대 경로 사용
    const basePath = isNode() && path ? __dirname : ".";

    this.workerPaths = new Map([
      [WorkerType.IMAGE, joinPaths(basePath, "../workers/image.js")],
      [WorkerType.DATA, joinPaths(basePath, "../workers/data.js")],
      [WorkerType.CALC, joinPaths(basePath, "../workers/calc.js")],
    ]);

    // 커스텀 워커 저장소 초기화
    this.customWorkers = new Map();
  }

  /**
   * 특정 워커 유형의 경로 반환
   *
   * @param type 워커 유형
   * @returns 워커 스크립트 경로
   */
  getWorkerPath(type: WorkerType | string): string {
    // 기본 워커인 경우
    if (Object.values(WorkerType).includes(type as WorkerType)) {
      const path = this.workerPaths.get(type as WorkerType);
      if (!path) {
        throw new Error(`워커 유형 '${type}'에 대한 경로를 찾을 수 없습니다.`);
      }
      return path;
    }

    // 커스텀 워커인 경우
    const customPath = this.customWorkers.get(type as string);
    if (!customPath) {
      throw new Error(`커스텀 워커 '${type}'에 대한 경로를 찾을 수 없습니다.`);
    }
    return customPath;
  }

  /**
   * 새로운 커스텀 워커 등록
   *
   * @param name 커스텀 워커 이름
   * @param scriptPath 워커 스크립트 경로
   */
  registerCustomWorker(name: string, scriptPath: string): void {
    // 이미 존재하는 워커 타입인지 확인
    if (
      this.customWorkers.has(name) ||
      Object.values(WorkerType).includes(name as any)
    ) {
      throw new Error(`이미 존재하는 워커 이름입니다: ${name}`);
    }

    // 파일 존재 여부는 실제 구현에서 확인해야 함
    this.customWorkers.set(name, scriptPath);
  }

  /**
   * 커스텀 워커 제거
   *
   * @param name 커스텀 워커 이름
   */
  unregisterCustomWorker(name: string): boolean {
    return this.customWorkers.delete(name);
  }

  /**
   * 기본 워커 경로 변경
   *
   * @param type 워커 유형
   * @param scriptPath 새 스크립트 경로
   */
  updateWorkerPath(type: WorkerType, scriptPath: string): void {
    if (!Object.values(WorkerType).includes(type)) {
      throw new Error(`유효하지 않은 워커 유형입니다: ${type}`);
    }

    this.workerPaths.set(type, scriptPath);
  }

  /**
   * 등록된 모든 워커 유형 목록 반환
   */
  getAllWorkerTypes(): (WorkerType | string)[] {
    return [
      ...Object.values(WorkerType),
      ...Array.from(this.customWorkers.keys()),
    ];
  }

  /**
   * 기본 워커 유형 목록 반환
   */
  getDefaultWorkerTypes(): WorkerType[] {
    return Object.values(WorkerType);
  }

  /**
   * 커스텀 워커 유형 목록 반환
   */
  getCustomWorkerTypes(): string[] {
    return Array.from(this.customWorkers.keys());
  }

  /**
   * 특정 워커 유형이 등록되어 있는지 확인
   *
   * @param type 워커 유형
   */
  hasWorkerType(type: WorkerType | string): boolean {
    return (
      this.workerPaths.has(type as WorkerType) ||
      this.customWorkers.has(type as string)
    );
  }
}
