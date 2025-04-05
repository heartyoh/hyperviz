/**
 * 이미지 스케일링 알고리즘 구현
 */
import { ScalingAlgorithm } from "./types.js";

/**
 * ImageData에서 특정 좌표의 픽셀 색상값을 가져옴
 * @param imageData 이미지 데이터
 * @param x X 좌표
 * @param y Y 좌표
 * @returns RGBA 색상값 배열 [r, g, b, a]
 */
function getPixel(
  imageData: ImageData,
  x: number,
  y: number
): [number, number, number, number] {
  const index = (y * imageData.width + x) * 4;
  return [
    imageData.data[index], // R
    imageData.data[index + 1], // G
    imageData.data[index + 2], // B
    imageData.data[index + 3], // A
  ];
}

/**
 * 가장 가까운 이웃 스케일링 알고리즘 구현
 * 가장 빠르지만 품질이 가장 낮은 방식, 픽셀화 현상 발생
 * @param source 원본 이미지 데이터
 * @param targetWidth 대상 너비
 * @param targetHeight 대상 높이
 * @returns 스케일링된 이미지 데이터
 */
export function nearestNeighbor(
  source: ImageData,
  targetWidth: number,
  targetHeight: number
): ImageData {
  const target = new ImageData(targetWidth, targetHeight);

  const xRatio = source.width / targetWidth;
  const yRatio = source.height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      // 원본 이미지에서의 좌표 계산 (가장 가까운 픽셀 선택)
      const srcX = Math.min(Math.floor(x * xRatio), source.width - 1);
      const srcY = Math.min(Math.floor(y * yRatio), source.height - 1);

      // 픽셀 색상 가져오기
      const [r, g, b, a] = getPixel(source, srcX, srcY);

      // 대상 이미지에 색상 설정
      const targetIndex = (y * targetWidth + x) * 4;
      target.data[targetIndex] = r;
      target.data[targetIndex + 1] = g;
      target.data[targetIndex + 2] = b;
      target.data[targetIndex + 3] = a;
    }
  }

  return target;
}

/**
 * 바이리니어 스케일링 알고리즘 구현
 * 중간 품질과 속도를 제공하는 방식, 4개의 인접 픽셀을 보간
 * @param source 원본 이미지 데이터
 * @param targetWidth 대상 너비
 * @param targetHeight 대상 높이
 * @returns 스케일링된 이미지 데이터
 */
export function bilinear(
  source: ImageData,
  targetWidth: number,
  targetHeight: number
): ImageData {
  const target = new ImageData(targetWidth, targetHeight);

  const xRatio = (source.width - 1) / (targetWidth - 1 || 1);
  const yRatio = (source.height - 1) / (targetHeight - 1 || 1);

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      // 원본 이미지에서의 실수 좌표 계산
      const srcX = x * xRatio;
      const srcY = y * yRatio;

      // 보간에 사용할 4개 픽셀의 정수 좌표
      const x1 = Math.floor(srcX);
      const y1 = Math.floor(srcY);
      const x2 = Math.min(x1 + 1, source.width - 1);
      const y2 = Math.min(y1 + 1, source.height - 1);

      // 소수 부분 계산 (보간 가중치)
      const xWeight = srcX - x1;
      const yWeight = srcY - y1;

      // 4개 픽셀 색상 가져오기
      const [r1, g1, b1, a1] = getPixel(source, x1, y1);
      const [r2, g2, b2, a2] = getPixel(source, x2, y1);
      const [r3, g3, b3, a3] = getPixel(source, x1, y2);
      const [r4, g4, b4, a4] = getPixel(source, x2, y2);

      // 바이리니어 보간 계산
      const r = Math.round(
        (1 - xWeight) * (1 - yWeight) * r1 +
          xWeight * (1 - yWeight) * r2 +
          (1 - xWeight) * yWeight * r3 +
          xWeight * yWeight * r4
      );

      const g = Math.round(
        (1 - xWeight) * (1 - yWeight) * g1 +
          xWeight * (1 - yWeight) * g2 +
          (1 - xWeight) * yWeight * g3 +
          xWeight * yWeight * g4
      );

      const b = Math.round(
        (1 - xWeight) * (1 - yWeight) * b1 +
          xWeight * (1 - yWeight) * b2 +
          (1 - xWeight) * yWeight * b3 +
          xWeight * yWeight * b4
      );

      const a = Math.round(
        (1 - xWeight) * (1 - yWeight) * a1 +
          xWeight * (1 - yWeight) * a2 +
          (1 - xWeight) * yWeight * a3 +
          xWeight * yWeight * a4
      );

      // 대상 이미지에 보간된 색상 설정
      const targetIndex = (y * targetWidth + x) * 4;
      target.data[targetIndex] = r;
      target.data[targetIndex + 1] = g;
      target.data[targetIndex + 2] = b;
      target.data[targetIndex + 3] = a;
    }
  }

  return target;
}

/**
 * 바이큐빅 스케일링의 단순화된 구현
 * 높은 품질을 제공하는 방식, 16개의 인접 픽셀 참조
 * 참고: 완전한 바이큐빅 구현은 더 복잡하며 성능 비용이 더 높음
 * @param source 원본 이미지 데이터
 * @param targetWidth 대상 너비
 * @param targetHeight 대상 높이
 * @returns 스케일링된 이미지 데이터
 */
export function bicubic(
  source: ImageData,
  targetWidth: number,
  targetHeight: number
): ImageData {
  // 실제 애플리케이션에서는 완전한 바이큐빅 구현이 필요하지만
  // 여기서는 성능상의 이유로 바이리니어로 대체합니다.
  // 실제 구현에서는 16개 픽셀을 활용한 3차 보간이 필요함
  console.warn("Full bicubic implementation is simplified in this version");
  return bilinear(source, targetWidth, targetHeight);
}

/**
 * 이미지 스케일링 함수 (지정된 알고리즘에 따라 적절한 함수 호출)
 * @param source 원본 이미지 데이터
 * @param targetWidth 대상 너비
 * @param targetHeight 대상 높이
 * @param algorithm 스케일링 알고리즘 (기본값: 바이리니어)
 * @returns 스케일링된 이미지 데이터
 */
export function scaleImage(
  source: ImageData,
  targetWidth: number,
  targetHeight: number,
  algorithm: ScalingAlgorithm = ScalingAlgorithm.BILINEAR
): ImageData {
  // 입력 검증
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error("Target dimensions must be positive");
  }

  // 스케일링이 필요 없는 경우
  if (targetWidth === source.width && targetHeight === source.height) {
    // 원본 이미지 데이터 복사
    const target = new ImageData(
      new Uint8ClampedArray(source.data),
      source.width,
      source.height
    );
    return target;
  }

  // 알고리즘에 따른 처리
  switch (algorithm) {
    case ScalingAlgorithm.NEAREST_NEIGHBOR:
      return nearestNeighbor(source, targetWidth, targetHeight);

    case ScalingAlgorithm.BILINEAR:
      return bilinear(source, targetWidth, targetHeight);

    case ScalingAlgorithm.BICUBIC:
    case ScalingAlgorithm.LANCZOS:
      // 고급 알고리즘은 간소화 구현
      return bicubic(source, targetWidth, targetHeight);

    default:
      // 알 수 없는 알고리즘은 바이리니어 사용
      return bilinear(source, targetWidth, targetHeight);
  }
}
