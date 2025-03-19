/**
 * 워커풀 상태 관리 모듈
 *
 * DevTools 및 팝업 간 공유 상태를 관리하는 중앙 집중식 상태 관리자
 */

import { LogLevel, WorkerStatus } from "../types";

// 워커 정보 인터페이스
export interface WorkerInfo {
  id: string;
  type: string;
  status: WorkerStatus;
  tasks: Record<string, any>;
  performance: {
    cpu?: number;
    memory?: number;
    lastActive?: number;
  };
}

// 풀 통계 인터페이스
export interface PoolStats {
  activeWorkers: number;
  idleWorkers: number;
  pendingTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgTaskDuration: number;
  timestamp: number;
}

// 로그 엔트리 인터페이스
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  workerType?: string;
  workerId?: string;
  taskId?: string;
}

// 모니터 설정 인터페이스
export interface MonitorSettings {
  logLevel: string;
  updateInterval: number;
  maxLogEntries: number;
  autoRestart: boolean;
}

// 워커풀 상태 타입 정의
export interface WorkerPoolState {
  // 연결 상태
  connected: boolean;
  connecting: boolean;
  lastConnection: number | null;
  currentTabId: number | null;

  // 워커 상태 및 통계
  workers: Record<string, WorkerInfo>;
  stats: Record<string, PoolStats>;

  // 로그 정보
  logs: LogEntry[];

  // 설정
  settings: MonitorSettings;
}

/**
 * 워커풀 상태 관리자 클래스
 */
export class WorkerStateManager {
  private static instance: WorkerStateManager;

  // 상태 저장소
  private state: WorkerPoolState = {
    connected: false,
    connecting: false,
    lastConnection: null,
    currentTabId: null,
    workers: {},
    stats: {},
    logs: [],
    settings: {
      logLevel: "info",
      updateInterval: 1000,
      maxLogEntries: 1000,
      autoRestart: true,
    },
  };

  // 상태 변경 리스너
  private listeners: Map<string, ((state: WorkerPoolState) => void)[]> =
    new Map();

  // 싱글톤 인스턴스 접근자
  public static getInstance(): WorkerStateManager {
    if (!this.instance) {
      this.instance = new WorkerStateManager();
    }
    return this.instance;
  }

  // 상태 가져오기
  public getState(): WorkerPoolState {
    return { ...this.state };
  }

  // 상태 부분 업데이트
  public setState(newState: Partial<WorkerPoolState>): void {
    this.state = { ...this.state, ...newState };
    this.notifyListeners();

    // 크롬 스토리지에 상태 저장 (세션 스토리지)
    if (chrome?.storage?.session) {
      chrome.storage.session.set({
        workerPoolState: {
          ...this.state,
          timestamp: Date.now(),
        },
      });
    }
  }

  // 상태 변경 이벤트 구독
  public subscribe(
    componentId: string,
    callback: (state: WorkerPoolState) => void
  ): void {
    if (!this.listeners.has(componentId)) {
      this.listeners.set(componentId, []);
    }
    this.listeners.get(componentId)!.push(callback);

    // 초기 상태 즉시 전달
    callback(this.state);
  }

  // 구독 해제
  public unsubscribe(componentId: string): void {
    this.listeners.delete(componentId);
  }

  // 저장된 상태 복원
  public async restoreState(): Promise<void> {
    try {
      if (chrome?.storage?.session) {
        const result = await chrome.storage.session.get("workerPoolState");
        if (result.workerPoolState) {
          this.state = result.workerPoolState;
          this.notifyListeners();
        }
      }
    } catch (error) {
      console.error("상태 복원 중 오류 발생:", error);
    }
  }

  // 특정 탭의 상태만 업데이트
  public updateTabState(
    tabId: number,
    stateUpdate: Partial<WorkerPoolState>
  ): void {
    // 현재 탭과 일치하면 전체 상태 업데이트
    if (this.state.currentTabId === tabId) {
      this.setState(stateUpdate);
    }

    // 어떤 경우든 탭별 상태는 저장
    if (chrome?.storage?.session) {
      chrome.storage.session.set({
        [`tabState:${tabId}`]: {
          ...stateUpdate,
          timestamp: Date.now(),
        },
      });
    }
  }

  // 특정 탭으로 상태 전환
  public async switchToTab(tabId: number): Promise<void> {
    try {
      if (chrome?.storage?.session) {
        const result = await chrome.storage.session.get(`tabState:${tabId}`);
        if (result[`tabState:${tabId}`]) {
          this.setState({
            ...result[`tabState:${tabId}`],
            currentTabId: tabId,
          });
        } else {
          // 해당 탭의 이전 상태가 없으면 초기화
          this.setState({
            connected: false,
            connecting: false,
            workers: {},
            stats: {},
            logs: [],
            currentTabId: tabId,
          });
        }
      }
    } catch (error) {
      console.error("탭 상태 전환 중 오류 발생:", error);
    }
  }

  // 리스너에게 상태 변경 알림
  private notifyListeners(): void {
    for (const callbacks of this.listeners.values()) {
      callbacks.forEach((callback) => callback({ ...this.state }));
    }
  }
}

// 기본 인스턴스 내보내기
export default WorkerStateManager.getInstance();
