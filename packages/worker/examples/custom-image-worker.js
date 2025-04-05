// 이미지 처리를 위한 워커 스크립트
// ImageData 오류를 방지하기 위해 OffscreenCanvas API 사용

// 이미지 처리 상태 상수
const STATUS = {
  SUCCESS: "success",
  ERROR: "error",
  PROGRESS: "progress",
};

// 스케일링 알고리즘 품질 설정
const SMOOTHING_QUALITY = {
  nearest: "low", // 최근접 이웃
  bilinear: "medium", // 바이리니어
  bicubic: "high", // 바이큐빅
  lanczos: "high", // 랑초스
};

// 타스크 처리를 위한 메시지 핸들러
self.addEventListener("message", async (event) => {
  const { type, taskId, data } = event.data;

  // 작업 시작 메시지 수신 확인
  if (type === "task" && data.type === "scale") {
    try {
      // 진행 상황 0% 보고
      reportProgress(taskId, 0);

      // 입력 데이터 가져오기
      const { imageData, options } = data;

      // 이미지 처리 수행
      const result = await processImage(imageData, options, (progress) => {
        reportProgress(taskId, progress);
      });

      // 성공 메시지 전송
      self.postMessage({
        type: "taskCompleted",
        taskId,
        result,
      });
    } catch (error) {
      // 오류 메시지 전송
      self.postMessage({
        type: "taskFailed",
        taskId,
        error: error.message || "이미지 처리 중 오류 발생",
      });
    }
  } else if (type === "ping") {
    // 워커 활성 상태 테스트용 응답
    self.postMessage({ type: "pong", timestamp: Date.now() });
  }
});

// 이미지 처리 함수
async function processImage(imageData, options, progressCallback) {
  // 시작 시간 기록
  const startTime = performance.now();

  // Blob을 ImageBitmap으로 변환
  let imageBitmap;
  if (imageData instanceof ImageData) {
    // ImageData 직접 처리
    reportProgress(taskId, 0.1);
    imageBitmap = await createImageBitmap(imageData);
  } else {
    // ArrayBuffer를 Blob으로 변환
    const blob = new Blob([imageData], {
      type: options.format || "image/jpeg",
    });
    reportProgress(taskId, 0.1);
    imageBitmap = await createImageBitmap(blob);
  }

  // 원본 크기 저장
  const originalWidth = imageBitmap.width;
  const originalHeight = imageBitmap.height;

  // 대상 크기 계산
  let targetWidth = options.width || originalWidth;
  let targetHeight = options.height || originalHeight;

  // 비율 유지 적용
  if (options.maintainAspectRatio) {
    if (options.width && !options.height) {
      targetHeight = Math.round(originalHeight * (targetWidth / originalWidth));
    } else if (!options.width && options.height) {
      targetWidth = Math.round(originalWidth * (targetHeight / originalHeight));
    } else if (options.width && options.height) {
      // 가로세로 비율 유지하면서 지정된 영역에 맞추기
      const originalRatio = originalWidth / originalHeight;
      const targetRatio = targetWidth / targetHeight;

      if (originalRatio > targetRatio) {
        targetHeight = Math.round(targetWidth / originalRatio);
      } else {
        targetWidth = Math.round(targetHeight * originalRatio);
      }
    }
  }

  // OffscreenCanvas 생성 (최신 브라우저/워커 지원)
  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext("2d");

  // 스케일링 품질 설정
  ctx.imageSmoothingEnabled = true; // 기본 활성화

  // 스케일링 알고리즘에 따른 설정
  if (options.algorithm === "nearest") {
    ctx.imageSmoothingEnabled = false; // 최근접 이웃 알고리즘은 스무딩 비활성화
  } else {
    ctx.imageSmoothingQuality =
      SMOOTHING_QUALITY[options.algorithm] || "medium";
  }

  // 25% 진행 보고
  progressCallback(0.25);

  // 이미지 리사이징
  ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

  // 50% 진행 보고
  progressCallback(0.5);

  // 출력 포맷 및 품질 설정
  const format = options.format || "image/jpeg";
  const quality = options.quality !== undefined ? options.quality : 0.8;

  // 75% 진행 보고
  progressCallback(0.75);

  // 처리된 이미지를 Blob으로 변환
  const blob = await canvas.convertToBlob({ type: format, quality });

  // 처리 시간 계산
  const processingTime = performance.now() - startTime;

  // 100% 진행 보고
  progressCallback(1.0);

  // 결과 반환
  return {
    data: await blob.arrayBuffer(), // ArrayBuffer로 변환하여 반환
    metadata: {
      originalWidth,
      originalHeight,
      originalFormat: format,
      processedWidth: targetWidth,
      processedHeight: targetHeight,
      processingTime,
      fromCache: false,
    },
  };
}

// 진행 상황 보고 함수
function reportProgress(taskId, progress) {
  self.postMessage({
    type: "taskProgress",
    taskId,
    progress,
  });
}

// 워커 초기화 완료 메시지
self.postMessage({
  type: "workerReady",
  workerType: "image",
  timestamp: Date.now(),
});
