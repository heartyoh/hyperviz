// 타입 정의
interface StreamMessage {
  type: string;
  streamId: string;
  data?: any;
  timestamp?: number;
}

interface DataSettings {
  dataPoints?: number;
  noiseLevel?: number;
  updateInterval?: number;
}

interface Stats {
  min: string;
  max: string;
  avg: string;
  processTime: string;
}

// 데이터 및 설정
let dataPoints: number = 100;
let noiseLevel: number = 10;
let updateInterval: number = 100;

// 데이터 시리즈
let dataSeries: number[] = [];

// 통계
let stats: Stats = {
  min: "0",
  max: "0",
  avg: "0",
  processTime: "0",
};

// 타이머
let updateTimer: number | null = null;

// 스트림 관리
const activeStreams = new Set<string>();

// 데이터 초기화
function initializeData(): void {
  // 데이터 배열 생성
  dataSeries = [];
  for (let i = 0; i < dataPoints; i++) {
    // 사인파에 노이즈 추가
    const x = (i / dataPoints) * Math.PI * 4;
    const baseValue = Math.sin(x) * 100;
    const noise = (Math.random() * 2 - 1) * noiseLevel;
    dataSeries.push(baseValue + noise);
  }

  // 통계 계산
  calculateStats();
}

// 통계 계산
function calculateStats(): void {
  const startTime = performance.now();

  // 최소값, 최대값, 평균
  let min = Number.MAX_VALUE;
  let max = Number.MIN_VALUE;
  let sum = 0;

  for (let i = 0; i < dataSeries.length; i++) {
    const value = dataSeries[i];
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  }

  const avg = sum / dataSeries.length;

  // 처리 시간
  const endTime = performance.now();
  const processTime = endTime - startTime;

  // 통계 업데이트
  stats = {
    min: min.toFixed(2),
    max: max.toFixed(2),
    avg: avg.toFixed(2),
    processTime: processTime.toFixed(2),
  };
}

// 데이터 업데이트
function updateData(): void {
  // 새 데이터 포인트 생성
  const newPoint =
    Math.sin(Date.now() / 1000) * 100 + (Math.random() * 2 - 1) * noiseLevel;

  // 첫 데이터 제거하고 새 데이터 추가
  dataSeries.shift();
  dataSeries.push(newPoint);

  // 통계 계산
  calculateStats();

  // 모든 활성 스트림에 데이터 전송
  Array.from(activeStreams).forEach((streamId) => {
    self.postMessage({
      type: "STREAM_MESSAGE",
      streamId,
      data: {
        series: dataSeries,
        stats: stats,
      },
      timestamp: Date.now(),
    });
  });
}

// 업데이트 시작
function startUpdates(): void {
  if (updateTimer) return;

  updateTimer = setInterval(updateData, updateInterval) as unknown as number;
}

// 업데이트 중지
function stopUpdates(): void {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
}

// 설정 업데이트
function updateSettings(settings: DataSettings): void {
  // 중지 후 설정 업데이트
  const wasRunning = !!updateTimer;
  stopUpdates();

  // 파라미터 업데이트
  if (settings.dataPoints !== undefined) {
    dataPoints = settings.dataPoints;
  }

  if (settings.noiseLevel !== undefined) {
    noiseLevel = settings.noiseLevel;
  }

  if (settings.updateInterval !== undefined) {
    updateInterval = settings.updateInterval;
  }

  // 데이터 재초기화
  initializeData();

  // 이전에 실행 중이었다면 재시작
  if (wasRunning) {
    startUpdates();
  }
}

// 메모리 사용량 추정
function getMemoryUsage(): number {
  let usage = 0;

  // 데이터 시리즈 (8바이트 * 길이)
  usage += dataSeries.length * 8;

  // 기타 변수 및 상태
  usage += 1000; // 예상 오버헤드

  return usage;
}

// 메시지 핸들러
self.onmessage = function (event: MessageEvent): void {
  const message = event.data;

  // 스트림 메시지 처리
  if (message.type && message.type.startsWith("STREAM_")) {
    const { type, streamId, data } = message as StreamMessage;

    if (type === "STREAM_INIT") {
      // 스트림 초기화
      activeStreams.add(streamId);

      // 설정 적용
      if (data && data.settings) {
        updateSettings(data.settings);
      } else {
        // 기본 데이터 초기화
        initializeData();
      }

      // 준비 완료 응답
      self.postMessage({
        type: "STREAM_READY",
        streamId,
        data: {
          series: dataSeries,
          stats: stats,
          memoryUsage: getMemoryUsage(),
        },
        timestamp: Date.now(),
      });
    } else if (type === "STREAM_MESSAGE" && activeStreams.has(streamId)) {
      // 명령 처리
      if (data && data.action) {
        switch (data.action) {
          case "start":
            startUpdates();
            break;

          case "stop":
            stopUpdates();
            break;

          case "updateSettings":
            updateSettings(data.settings || {});
            break;

          case "getStats":
            // 현재 통계 전송
            self.postMessage({
              type: "STREAM_MESSAGE",
              streamId,
              data: {
                series: dataSeries,
                stats: stats,
                memoryUsage: getMemoryUsage(),
              },
              timestamp: Date.now(),
            });
            break;
        }
      }
    } else if (type === "STREAM_CLOSE") {
      // 스트림 종료
      activeStreams.delete(streamId);

      // 모든 스트림이 종료되면 업데이트 중지
      if (activeStreams.size === 0) {
        stopUpdates();
      }
    }
  }
};

// 파일을 모듈로 만들기 위한 export 문
export {};
