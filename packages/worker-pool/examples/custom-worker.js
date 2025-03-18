/**
 * @hyperviz/worker-pool 커스텀 워커 등록 예시
 */

const fs = require("fs");
const path = require("path");
const { UnifiedWorkerPoolManager, LogLevel } = require("@hyperviz/worker-pool");

async function main() {
  console.log("커스텀 워커 등록 예시 시작");

  // 커스텀 워커 파일 생성 (예시 목적)
  await createCustomWorkerFile();

  // 통합 매니저 생성
  const manager = new UnifiedWorkerPoolManager({
    logLevel: LogLevel.DEBUG,
  });

  // 매니저 초기화
  manager.initialize();

  // 커스텀 워커 등록
  const customWorkerPath = path.join(__dirname, "temp", "audio-worker.js");
  manager.registerCustomWorker("audio", customWorkerPath);

  console.log(`'audio' 커스텀 워커가 등록되었습니다: ${customWorkerPath}`);

  // 태스크 유형과 워커 유형 매핑
  manager.registerTaskType("audioProcess", "audio");
  manager.registerTaskType("audioConvert", "audio");

  console.log(
    "'audioProcess'와 'audioConvert' 태스크가 'audio' 워커에 매핑되었습니다"
  );

  // 태스크 제출
  console.log("\n----- 오디오 처리 태스크 제출 -----");
  const audioTaskId = manager.submitTask("audioProcess", {
    format: "mp3",
    duration: 120,
    bitrate: "320kbps",
  });
  console.log(`오디오 처리 태스크 ID: ${audioTaskId}`);

  // 잠시 대기
  await delay(500);

  console.log("\n----- 오디오 변환 태스크 제출 -----");
  const convertTaskId = manager.submitTask("audioConvert", {
    inputFormat: "wav",
    outputFormat: "mp3",
    sampleRate: 44100,
  });
  console.log(`오디오 변환 태스크 ID: ${convertTaskId}`);

  // 디스패처 이벤트 핸들러 등록
  const dispatcher = manager.getDispatcher();

  dispatcher.on("taskCompleted", (event) => {
    console.log(`[이벤트] 태스크 완료됨: ${event.taskId}`);

    // 태스크 결과 조회
    const task = manager.getTaskStatus(event.taskId);
    console.log("태스크 결과:", task?.result);
  });

  // 작업이 완료될 때까지 대기
  console.log("\n태스크 처리 중...");
  await delay(2000);

  // 풀 상태 출력
  console.log("\n----- 풀 상태 -----");
  const audioPool = manager.getPool("audio");
  if (audioPool) {
    console.log("audio 풀 상태:", audioPool.getPoolStats());
    console.log("audio 워커 목록:", audioPool.getWorkers());
  }

  // 3초 후 종료
  console.log("\n3초 후 종료합니다...");
  await delay(3000);

  // 종료
  await manager.shutdown();

  console.log("커스텀 워커 등록 예시 종료");

  // 임시 파일 정리
  cleanupTempFiles();
}

// 커스텀 워커 파일 생성 함수
async function createCustomWorkerFile() {
  const tempDir = path.join(__dirname, "temp");

  // temp 디렉토리 생성
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 워커 파일 내용
  const workerContent = `
/**
 * 오디오 처리 워커
 */

const { parentPort, workerData } = require('worker_threads');

// 워커가 초기화될 때 로그
console.log(\`오디오 처리 워커 [\${workerData?.id || 'unknown'}] 초기화\`);

// 메시지 수신 처리
parentPort.on('message', async (message) => {
  try {
    const { taskId, type, data } = message;
    
    // 작업 유형에 따른 처리
    let result;
    switch (type) {
      case 'audioProcess':
        result = await simulateAudioProcessing(data);
        break;
      case 'audioConvert':
        result = await simulateAudioConversion(data);
        break;
      default:
        throw new Error(\`지원하지 않는 오디오 작업 유형: \${type}\`);
    }
    
    // 결과 반환
    parentPort.postMessage({
      taskId,
      status: 'completed',
      result
    });
  } catch (error) {
    // 오류 처리
    parentPort.postMessage({
      taskId: message.taskId,
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 오디오 처리 시뮬레이션 함수
async function simulateAudioProcessing(data) {
  await new Promise(resolve => setTimeout(resolve, 500)); // 500ms 지연
  return {
    format: data.format,
    duration: data.duration,
    processed: true,
    effects: ['normalize', 'compress'],
    timestamp: new Date().toISOString()
  };
}

// 오디오 변환 시뮬레이션 함수
async function simulateAudioConversion(data) {
  await new Promise(resolve => setTimeout(resolve, 800)); // 800ms 지연
  return {
    inputFormat: data.inputFormat,
    outputFormat: data.outputFormat,
    sampleRate: data.sampleRate,
    converted: true,
    size: Math.floor(Math.random() * 10000) + 1000, // 임의의 파일 크기
    timestamp: new Date().toISOString()
  };
}

// 워커 종료 처리
parentPort.on('close', () => {
  console.log(\`오디오 처리 워커 [\${workerData?.id || 'unknown'}] 종료\`);
});
  `;

  // 파일 저장
  const filePath = path.join(tempDir, "audio-worker.js");
  fs.writeFileSync(filePath, workerContent);

  console.log(`임시 워커 파일이 생성되었습니다: ${filePath}`);
}

// 임시 파일 정리 함수
function cleanupTempFiles() {
  try {
    const filePath = path.join(__dirname, "temp", "audio-worker.js");
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const tempDir = path.join(__dirname, "temp");
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }

    console.log("임시 파일이 정리되었습니다");
  } catch (error) {
    console.error("임시 파일 정리 중 오류 발생:", error);
  }
}

// 지연 유틸리티 함수
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 메인 함수 실행
main().catch((err) => {
  console.error("오류 발생:", err);
  process.exit(1);
});
