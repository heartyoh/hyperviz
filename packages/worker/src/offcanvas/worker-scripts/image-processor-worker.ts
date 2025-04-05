// 이미지 프로세싱 워커 - OffscreenCanvas 활용
// 다양한 이미지 처리 필터 구현

// 상태 코드 정의
enum ProcessStatus {
  SUCCESS = "success",
  ERROR = "error",
  PROGRESS = "progress",
}

// 필터 타입 정의
enum FilterType {
  GRAYSCALE = "grayscale",
  SEPIA = "sepia",
  INVERT = "invert",
  BLUR = "blur",
  BRIGHTNESS = "brightness",
  CONTRAST = "contrast",
  HUE_ROTATE = "hueRotate",
  SATURATION = "saturation",
  THRESHOLD = "threshold",
  PIXELATE = "pixelate",
  EDGE_DETECT = "edgeDetect",
  EMBOSS = "emboss",
}

// 메시지 타입 정의
interface InitMessage {
  type: "init";
  canvas: OffscreenCanvas;
}

interface ProcessImageMessage {
  type: "processImage";
  imageData?: ImageData;
  imageBitmap?: ImageBitmap;
  imageUrl?: string;
  filters: Array<{
    type: FilterType;
    options?: any;
  }>;
  returnType?: "imageData" | "blob";
  blobOptions?: {
    type?: string;
    quality?: number;
  };
}

type WorkerMessage = InitMessage | ProcessImageMessage;

// 상태 변수
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

// 메시지 핸들러
self.onmessage = async (event: MessageEvent) => {
  const message = event.data as WorkerMessage;

  try {
    switch (message.type) {
      case "init":
        initializeCanvas(message.canvas);
        break;

      case "processImage":
        await processImage(message);
        break;

      default:
        throw new Error("알 수 없는 메시지 타입");
    }
  } catch (error) {
    self.postMessage({
      type: ProcessStatus.ERROR,
      error: error instanceof Error ? error.message : "알 수 없는 오류",
    });
  }
};

// 캔버스 초기화
function initializeCanvas(offscreenCanvas: OffscreenCanvas): void {
  canvas = offscreenCanvas;
  ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("2D 컨텍스트를 생성할 수 없습니다.");
  }

  self.postMessage({ type: "initialized" });
}

// 이미지 처리 메인 함수
async function processImage(message: ProcessImageMessage): Promise<void> {
  if (!canvas || !ctx) {
    throw new Error("캔버스가 초기화되지 않았습니다.");
  }

  // 진행 상황 보고 - 0%
  reportProgress(0);

  try {
    // 이미지 로드
    let imageSource: ImageBitmap | ImageData | null = null;

    if (message.imageBitmap) {
      imageSource = message.imageBitmap;
    } else if (message.imageData) {
      imageSource = message.imageData;
    } else if (message.imageUrl) {
      imageSource = await loadImageFromUrl(message.imageUrl);
    }

    if (!imageSource) {
      throw new Error("유효한 이미지 소스가 없습니다.");
    }

    // 캔버스 크기 조정
    if (imageSource instanceof ImageBitmap) {
      canvas.width = imageSource.width;
      canvas.height = imageSource.height;
      ctx.drawImage(imageSource, 0, 0);
    } else {
      canvas.width = imageSource.width;
      canvas.height = imageSource.height;
      ctx.putImageData(imageSource, 0, 0);
    }

    // 진행 상황 보고 - 25%
    reportProgress(25);

    // 필터 적용
    if (message.filters && message.filters.length > 0) {
      for (let i = 0; i < message.filters.length; i++) {
        const filter = message.filters[i];
        await applyFilter(filter.type, filter.options);

        // 필터 적용 진행 상황 보고
        const progressPercent = 25 + 50 * ((i + 1) / message.filters.length);
        reportProgress(Math.round(progressPercent));
      }
    }

    // 결과 반환
    const returnType = message.returnType || "imageData";
    let result;

    if (returnType === "blob") {
      const options = message.blobOptions || { type: "image/png" };
      result = await canvas.convertToBlob(options);

      // Blob 객체는 직접 전송할 수 없으므로 ArrayBuffer로 변환
      const arrayBuffer = await result.arrayBuffer();

      self.postMessage(
        {
          type: ProcessStatus.SUCCESS,
          result: {
            type: "blob",
            data: arrayBuffer,
            mimeType: options.type,
            width: canvas.width,
            height: canvas.height,
          },
        },
        { transfer: [arrayBuffer] }
      );
    } else {
      result = ctx.getImageData(0, 0, canvas.width, canvas.height);

      self.postMessage(
        {
          type: ProcessStatus.SUCCESS,
          result: {
            type: "imageData",
            data: result,
            width: canvas.width,
            height: canvas.height,
          },
        },
        { transfer: [result.data.buffer] }
      );
    }

    // 진행 상황 보고 - 100%
    reportProgress(100);
  } catch (error) {
    self.postMessage({
      type: ProcessStatus.ERROR,
      error:
        error instanceof Error ? error.message : "이미지 처리 중 오류 발생",
    });
  }
}

// URL로부터 이미지 로드
async function loadImageFromUrl(url: string): Promise<ImageBitmap> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `이미지 로드 실패: ${response.status} ${response.statusText}`
      );
    }

    const blob = await response.blob();
    return await createImageBitmap(blob);
  } catch (error) {
    throw new Error(
      `이미지 로드 오류: ${
        error instanceof Error ? error.message : "알 수 없는 오류"
      }`
    );
  }
}

// 필터 적용
async function applyFilter(
  filterType: FilterType,
  options: any = {}
): Promise<void> {
  if (!canvas || !ctx) {
    throw new Error("캔버스 컨텍스트가 없습니다.");
  }

  // 이미지 데이터 가져오기
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  switch (filterType) {
    case FilterType.GRAYSCALE:
      applyGrayscale(data);
      break;

    case FilterType.SEPIA:
      applySepia(data);
      break;

    case FilterType.INVERT:
      applyInvert(data);
      break;

    case FilterType.BLUR:
      applyBlur(imageData, options.radius || 5);
      break;

    case FilterType.BRIGHTNESS:
      applyBrightness(data, options.value || 0);
      break;

    case FilterType.CONTRAST:
      applyContrast(data, options.value || 0);
      break;

    case FilterType.HUE_ROTATE:
      applyHueRotate(data, options.angle || 0);
      break;

    case FilterType.SATURATION:
      applySaturation(data, options.value || 1);
      break;

    case FilterType.THRESHOLD:
      applyThreshold(data, options.threshold || 128);
      break;

    case FilterType.PIXELATE:
      applyPixelate(imageData, options.pixelSize || 8);
      break;

    case FilterType.EDGE_DETECT:
      applyEdgeDetection(imageData);
      break;

    case FilterType.EMBOSS:
      applyEmboss(imageData);
      break;

    default:
      throw new Error(`지원하지 않는 필터 타입: ${filterType}`);
  }

  // 변환된 이미지 데이터 적용
  ctx.putImageData(imageData, 0, 0);
}

// 그레이스케일 필터
function applyGrayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    data[i] = avg; // R
    data[i + 1] = avg; // G
    data[i + 2] = avg; // B
    // A는 변경하지 않음
  }
}

// 세피아 필터
function applySepia(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189); // R
    data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168); // G
    data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131); // B
  }
}

// 색상 반전 필터
function applyInvert(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]; // R
    data[i + 1] = 255 - data[i + 1]; // G
    data[i + 2] = 255 - data[i + 2]; // B
  }
}

// 블러 필터 (박스 블러)
function applyBlur(imageData: ImageData, radius: number): void {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const pixels = [...data];

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        count = 0;

      // 주변 픽셀 평균
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const posX = clamp(x + kx, 0, width - 1);
          const posY = clamp(y + ky, 0, height - 1);

          const idx = (posY * width + posX) * 4;
          r += pixels[idx];
          g += pixels[idx + 1];
          b += pixels[idx + 2];
          a += pixels[idx + 3];
          count++;
        }
      }

      // 현재 픽셀의 인덱스
      const idx = (y * width + x) * 4;
      data[idx] = r / count;
      data[idx + 1] = g / count;
      data[idx + 2] = b / count;
      data[idx + 3] = a / count;
    }
  }
}

// 밝기 조정
function applyBrightness(data: Uint8ClampedArray, value: number): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clampColor(data[i] + value); // R
    data[i + 1] = clampColor(data[i + 1] + value); // G
    data[i + 2] = clampColor(data[i + 2] + value); // B
  }
}

// 대비 조정
function applyContrast(data: Uint8ClampedArray, value: number): void {
  const factor = (259 * (value + 255)) / (255 * (259 - value));

  for (let i = 0; i < data.length; i += 4) {
    data[i] = clampColor(factor * (data[i] - 128) + 128); // R
    data[i + 1] = clampColor(factor * (data[i + 1] - 128) + 128); // G
    data[i + 2] = clampColor(factor * (data[i + 2] - 128) + 128); // B
  }
}

// 색상 회전
function applyHueRotate(data: Uint8ClampedArray, angle: number): void {
  const radian = (angle * Math.PI) / 180;
  const cos = Math.cos(radian);
  const sin = Math.sin(radian);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // RGB -> HSL 변환, 색상 회전, HSL -> RGB 변환
    // (이 예제에서는 단순화된 행렬 변환 사용)
    const matrix = [
      0.213 + cos * 0.787 - sin * 0.213,
      0.213 - cos * 0.213 + sin * 0.143,
      0.213 - cos * 0.213 - sin * 0.787,
      0.715 - cos * 0.715 - sin * 0.715,
      0.715 + cos * 0.285 + sin * 0.14,
      0.715 - cos * 0.715 + sin * 0.715,
      0.072 - cos * 0.072 + sin * 0.928,
      0.072 - cos * 0.072 - sin * 0.283,
      0.072 + cos * 0.928 + sin * 0.072,
    ];

    data[i] = clampColor(r * matrix[0] + g * matrix[1] + b * matrix[2]); // R
    data[i + 1] = clampColor(r * matrix[3] + g * matrix[4] + b * matrix[5]); // G
    data[i + 2] = clampColor(r * matrix[6] + g * matrix[7] + b * matrix[8]); // B
  }
}

// 채도 조정
function applySaturation(data: Uint8ClampedArray, value: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const gray = 0.2989 * r + 0.587 * g + 0.114 * b; // 가중 평균

    data[i] = clampColor(gray + value * (r - gray)); // R
    data[i + 1] = clampColor(gray + value * (g - gray)); // G
    data[i + 2] = clampColor(gray + value * (b - gray)); // B
  }
}

// 임계값 필터
function applyThreshold(data: Uint8ClampedArray, threshold: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const value = avg >= threshold ? 255 : 0;

    data[i] = value; // R
    data[i + 1] = value; // G
    data[i + 2] = value; // B
  }
}

// 픽셀화 필터
function applyPixelate(imageData: ImageData, pixelSize: number): void {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const pixels = [...data];

  for (let y = 0; y < height; y += pixelSize) {
    for (let x = 0; x < width; x += pixelSize) {
      // 블록의 중심 픽셀 색상 가져오기
      const centerX = Math.min(x + Math.floor(pixelSize / 2), width - 1);
      const centerY = Math.min(y + Math.floor(pixelSize / 2), height - 1);

      const centerIdx = (centerY * width + centerX) * 4;
      const r = pixels[centerIdx];
      const g = pixels[centerIdx + 1];
      const b = pixels[centerIdx + 2];
      const a = pixels[centerIdx + 3];

      // 블록 내 모든 픽셀에 중심 색상 적용
      for (
        let blockY = 0;
        blockY < pixelSize && y + blockY < height;
        blockY++
      ) {
        for (
          let blockX = 0;
          blockX < pixelSize && x + blockX < width;
          blockX++
        ) {
          const idx = ((y + blockY) * width + (x + blockX)) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        }
      }
    }
  }
}

// 경계 감지 필터
function applyEdgeDetection(imageData: ImageData): void {
  const kernel = [-1, -1, -1, -1, 8, -1, -1, -1, -1]; // 라플라시안 커널
  applyConvolution(imageData, kernel);
}

// 엠보스 효과
function applyEmboss(imageData: ImageData): void {
  const kernel = [-2, -1, 0, -1, 1, 1, 0, 1, 2]; // 엠보스 커널
  applyConvolution(imageData, kernel);
}

// 컨볼루션 필터 적용
function applyConvolution(
  imageData: ImageData,
  kernel: number[],
  divisor: number = 1
): void {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const pixels = [...data];

  const kernelSize = Math.sqrt(kernel.length);
  const halfKernelSize = Math.floor(kernelSize / 2);

  if (divisor === 0) divisor = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0;

      // 컨볼루션 적용
      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          const posX = Math.min(
            Math.max(x + kx - halfKernelSize, 0),
            width - 1
          );
          const posY = Math.min(
            Math.max(y + ky - halfKernelSize, 0),
            height - 1
          );

          const idx = (posY * width + posX) * 4;
          const kernelValue = kernel[ky * kernelSize + kx];

          r += pixels[idx] * kernelValue;
          g += pixels[idx + 1] * kernelValue;
          b += pixels[idx + 2] * kernelValue;
        }
      }

      // 결과 적용
      const idx = (y * width + x) * 4;
      data[idx] = clampColor(r / divisor);
      data[idx + 1] = clampColor(g / divisor);
      data[idx + 2] = clampColor(b / divisor);
      // A는 변경하지 않음
    }
  }
}

// 색상 값 범위 제한 (0-255)
function clampColor(value: number): number {
  return Math.min(255, Math.max(0, value));
}

// 진행 상황 보고
function reportProgress(percent: number): void {
  self.postMessage({
    type: ProcessStatus.PROGRESS,
    percent: percent,
  });
}

// 워커 초기 메시지
self.postMessage({ type: "ready" });
