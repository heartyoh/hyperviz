# @hyperviz/worker-pool

통합 워커 풀 관리 시스템

## 소개

`@hyperviz/worker-pool`은 Node.js 애플리케이션과 브라우저 환경에서 Worker를 효율적으로 관리하기 위한 통합 시스템입니다. 이 패키지는 다음과 같은 기능을 제공합니다:

- 다양한 유형의 워커를 관리하는 통합 시스템
- Worker Pool 생성 및 효율적인 재사용
- 작업 자동 배정 및 부하 분산
- 워커 상태 모니터링 및 성능 로깅
- 오류 관리 및 워커 자동 재시작
- **Node.js와 브라우저 환경 모두 지원**

## 설치

```bash
npm install @hyperviz/worker-pool
# 또는
yarn add @hyperviz/worker-pool
```

## 사용법

### 기본 사용법

```javascript
import { UnifiedWorkerPoolManager, WorkerType } from "@hyperviz/worker-pool";

// 통합 매니저 생성
const manager = new UnifiedWorkerPoolManager({
  // 기본 풀 설정
  poolConfig: {
    minWorkers: 2,
    maxWorkers: 8,
  },
  // 자동 워커 재시작 활성화
  autoRestart: true,
});

// 초기화
manager.initialize();

// 이미지 처리 작업 제출
const taskId = manager.submitTask("resize", {
  width: 800,
  height: 600,
  format: "jpg",
});

// 태스크 상태 조회
const status = manager.getTaskStatus(taskId);
console.log("태스크 상태:", status);

// 작업이 완료되면 종료
setTimeout(async () => {
  await manager.shutdown();
}, 5000);
```

### 브라우저 환경에서 사용

```javascript
import { UnifiedWorkerPoolManager, WorkerType } from "@hyperviz/worker-pool";

// 브라우저에서 사용할 워커 스크립트 경로 지정
const manager = new UnifiedWorkerPoolManager({
  poolConfig: {
    minWorkers: 1,
    maxWorkers: 4,
  },
  // 브라우저에서는 상대 경로 또는 절대 URL 사용
  workerScripts: {
    [WorkerType.CALC]: "/workers/calc-worker.js",
    [WorkerType.IMAGE]: "/workers/image-worker.js",
    [WorkerType.MONITOR]: "/workers/monitor-worker.js",
  },
});

// 초기화 및 사용은 Node.js와 동일
manager.initialize();

// 계산 작업 제출
const taskId = manager.submitTask("matrix", {
  size: [100, 100],
  operation: "multiply",
});

// 이벤트 리스닝
manager.getDispatcher().on("taskCompleted", (event) => {
  console.log("계산 완료:", event.result);
});
```

### 고급 사용법

#### 커스텀 워커 등록

```javascript
// 커스텀 워커 등록
manager.registerCustomWorker("audio", "/path/to/audio-worker.js");

// 태스크 유형과 워커 유형 매핑
manager.registerTaskType("audioProcess", "audio");

// 오디오 처리 태스크 제출
manager.submitTask("audioProcess", {
  format: "mp3",
  duration: 120,
});
```

#### 이벤트 리스닝

```javascript
// 디스패처 이벤트 리스닝
const dispatcher = manager.getDispatcher();

dispatcher.on("taskCompleted", (event) => {
  console.log(`태스크 완료: ${event.taskId}`);
});

dispatcher.on("taskFailed", (event) => {
  console.log(`태스크 실패: ${event.taskId}, 오류: ${event.error}`);
});

// 모니터 이벤트 리스닝
const monitor = manager.getMonitor();

monitor.on("log", (entry) => {
  console.log(`[${entry.level}] ${entry.message}`);
});

monitor.on("metricsCollected", (event) => {
  console.log(`${event.workerType} 풀 상태:`, event.stats);
});
```

#### 풀 재설정

```javascript
// 특정 풀 재설정
manager.reconfigurePool(WorkerType.IMAGE, {
  minWorkers: 4,
  maxWorkers: 10,
  idleTimeout: 120000, // 2분
});
```

## 아키텍처

```
UnifiedWorkerPoolManager
│
├─ Worker Registry (Worker 유형별 등록 관리)
│    ├── ImageProcessing → [workers/image.js]
│    ├── DataProcessing → [workers/data.js]
│    └── Calculation → [workers/calc.js]
│
├─ Worker Pool Factory (Worker Pool 생성 및 관리)
│    ├── Pool 생성 (유형별 Worker 개수 동적 설정 가능)
│    └── Pool 재사용 및 재설정 관리
│
├─ Task Dispatcher (작업 배정)
│    └── 유형별 Pool 선택 및 작업 할당 (least-busy or 큐 방식)
│
├─ Worker Adapter (Node.js/브라우저 환경 통합)
│    ├── 환경 감지 및 적절한 Worker API 사용
│    └── 일관된 인터페이스 제공
│
└─ Monitoring & Logger (통합 모니터링 및 성능 로깅)
     ├── Worker 상태 및 성능 기록
     ├── 오류 통합 관리 및 경고
     └── Worker 자동 재시작 및 최적화 수행
```

## 브라우저 호환성

이 라이브러리는 다음 브라우저 환경을 지원합니다:

- Chrome 60 이상
- Firefox 55 이상
- Safari 10.1 이상
- Edge 16 이상

Web Worker API를 지원하는 모든 최신 브라우저에서 사용 가능합니다.

## API 참조

### UnifiedWorkerPoolManager

통합 워커 풀 관리자 클래스입니다.

#### 생성자

```javascript
const manager = new UnifiedWorkerPoolManager(config);
```

#### 메서드

- `initialize()`: 관리자 초기화 및 시작
- `shutdown(force?)`: 관리자 종료
- `createPool(type, config?)`: 새 워커 풀 생성
- `submitTask(taskType, data, options?)`: 태스크 제출
- `getTaskStatus(taskId)`: 태스크 상태 조회
- `cancelTask(taskId)`: 태스크 취소
- `registerTaskType(taskType, workerType)`: 태스크 유형 매핑 등록
- `registerCustomWorker(name, scriptPath)`: 커스텀 워커 등록
- `setLogLevel(level)`: 로그 레벨 설정
- `getLogs(limit?, level?, workerType?, taskId?, workerId?)`: 로그 조회
- `getPoolStats()`: 풀 통계 조회
- `reconfigurePool(type, config)`: 풀 재설정
- `getPool(type)`: 워커 풀 가져오기
- `getRegistry()`: 워커 레지스트리 가져오기
- `getPoolFactory()`: 풀 팩토리 가져오기
- `getDispatcher()`: 디스패처 가져오기
- `getMonitor()`: 모니터 가져오기

## 라이선스

MIT
