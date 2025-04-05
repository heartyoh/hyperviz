/**
 * 이미지 처리 워커 스크립트
 * 웹 워커 내에서 이미지 스케일링 및 처리 작업 수행
 */
import { scaleImage } from "../scaling-algorithms.js";
import {
  ImageTaskType,
  ImageProcessingOptions,
  ImageTaskRequest,
  ImageTaskResponse,
  ScalingAlgorithm,
  ImageFormat,
} from "../types.js";

// 디버그 로그 활성화
const DEBUG = true;

// 디버그 로그 함수
function debug(...args: any[]) {
  if (DEBUG) {
    console.log("[이미지워커]", ...args);
  }
}

// 이미지 처리 워커 - 메인 함수
async function processImageTask(
  task: ImageTaskRequest
): Promise<ImageTaskResponse> {
  try {
    const { taskId, type, imageData, options } = task;
    const startTime = performance.now();
    debug("작업 시작:", taskId, type);

    // 진행상황 보고 함수
    const reportProgress = (progress: number) => {
      self.postMessage({
        type: "taskProgress",
        taskId,
        progress,
      } as ImageTaskResponse);
    };

    // 초기 진행상황 보고
    reportProgress(0.1);

    // 이미지 데이터 처리하기
    const imageBlob =
      imageData instanceof ArrayBuffer
        ? new Blob([imageData], { type: options.format || "image/jpeg" })
        : new Blob([imageData.data.buffer], {
            type: options.format || "image/jpeg",
          });

    debug("Blob 생성됨:", imageBlob.size, "바이트");
    reportProgress(0.2);

    // Blob에서 ImageBitmap 생성
    const imageBitmap = await createImageBitmap(imageBlob).catch((error) => {
      debug("ImageBitmap 생성 오류:", error);
      throw new Error("이미지를 처리할 수 없습니다: " + error.message);
    });

    debug("ImageBitmap 생성됨:", imageBitmap.width, "x", imageBitmap.height);
    reportProgress(0.3);

    // 원본 크기 저장
    const originalWidth = imageBitmap.width;
    const originalHeight = imageBitmap.height;

    // 대상 크기 계산
    let targetWidth = options.width || originalWidth;
    let targetHeight = options.height || originalHeight;

    // 비율 유지 적용
    if (options.maintainAspectRatio !== false) {
      const aspectRatio = originalWidth / originalHeight;

      if (options.width && !options.height) {
        targetHeight = Math.round(options.width / aspectRatio);
      } else if (!options.width && options.height) {
        targetWidth = Math.round(options.height * aspectRatio);
      } else if (options.width && options.height) {
        // 비율 계산 및 적용
        const targetAspectRatio = targetWidth / targetHeight;

        if (aspectRatio > targetAspectRatio) {
          // 너비에 맞추기
          targetHeight = Math.round(targetWidth / aspectRatio);
        } else {
          // 높이에 맞추기
          targetWidth = Math.round(targetHeight * aspectRatio);
        }
      }
    }

    // 정수로 변환
    targetWidth = Math.max(1, Math.round(targetWidth));
    targetHeight = Math.max(1, Math.round(targetHeight));

    debug("대상 크기:", targetWidth, "x", targetHeight);
    reportProgress(0.4);

    // OffscreenCanvas 생성
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext("2d", { alpha: true });

    if (!ctx) {
      throw new Error("캔버스 컨텍스트를 생성할 수 없습니다");
    }

    // 이미지 스무딩 설정
    ctx.imageSmoothingEnabled = options.algorithm !== "nearest";
    if (ctx.imageSmoothingEnabled && ctx.imageSmoothingQuality) {
      // 품질 설정 (nearest, bilinear, bicubic)
      ctx.imageSmoothingQuality =
        options.algorithm === "bicubic" || options.algorithm === "lanczos"
          ? "high"
          : options.algorithm === "bilinear"
          ? "medium"
          : "low";
    }

    // 캔버스 초기화 (투명하게)
    ctx.clearRect(0, 0, targetWidth, targetHeight);

    // 이미지 그리기
    ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
    reportProgress(0.6);

    debug("캔버스에 그려짐");

    // 이미지 데이터를 요청된 포맷으로 변환
    const format = options.format || ImageFormat.PNG;
    const quality = options.quality !== undefined ? options.quality : 0.9;

    debug("Blob 변환 시작:", format, quality);

    // 캔버스를 Blob으로 변환
    const blob = await canvas
      .convertToBlob({ type: format, quality })
      .catch((error) => {
        debug("Blob 변환 오류:", error);
        throw new Error("이미지 변환 실패: " + error.message);
      });

    debug("Blob 변환 완료:", blob.size, "바이트");
    reportProgress(0.8);

    // Blob을 ArrayBuffer로 변환
    const resultBuffer = await blob.arrayBuffer();

    // 처리 시간 계산
    const processingTime = performance.now() - startTime;
    debug("처리 완료:", processingTime.toFixed(2), "ms");

    // 결과 반환
    reportProgress(1.0);
    return {
      type: "taskCompleted",
      taskId,
      result: {
        data: resultBuffer,
        metadata: {
          originalWidth,
          originalHeight,
          originalFormat: format,
          processedWidth: targetWidth,
          processedHeight: targetHeight,
          processingTime,
        },
      },
    };
  } catch (error) {
    debug("작업 실패:", error);
    return {
      type: "taskFailed",
      taskId: task.taskId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// 메시지 리스너 설정
self.addEventListener("message", async (event) => {
  const message = event.data;

  try {
    // 태스크 시작 메시지 처리
    if (message && message.type === "startTask") {
      const taskId = message.taskId;
      const taskData = message.data as ImageTaskRequest;

      debug("작업 수신:", taskId, taskData.type);

      // 태스크 처리 및 결과 반환
      const response = await processImageTask({
        ...taskData,
        taskId,
      });

      debug("작업 응답 전송:", response.type);
      self.postMessage(response);
    } else if (message && message.type === "ping") {
      // 워커 활성 상태 확인
      self.postMessage({ type: "pong", timestamp: Date.now() });
    }
  } catch (error) {
    console.error("Worker 글로벌 오류:", error);
    if (message && message.taskId) {
      self.postMessage({
        type: "taskFailed",
        taskId: message.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

// 초기화 완료 알림
debug("워커 초기화 완료");
self.postMessage({
  type: "workerReady",
  timestamp: Date.now(),
});
