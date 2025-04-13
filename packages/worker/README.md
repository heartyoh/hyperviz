# @hyperviz/worker

효율적인 웹 워커 관리 및 병렬 처리를 위한 라이브러리입니다.

## 주요 기능

- 워커 풀 및 작업 큐 관리
- 이벤트 스트림 지원
- 이미지 처리 및 캐싱
- OffscreenCanvas 지원
- 고급 WebGL 렌더링

## WebGL 렌더링 기능

최신 버전에서는 다음과 같은 향상된 WebGL 렌더링 기능을 제공합니다:

### 셰이더 관리 시스템

- 셰이더 프로그램 컴파일 및 링크 자동화
- 유니폼 및 속성 관리 간소화
- WebGL 2.0 셰이더 지원

### VAO 및 지오메트리 시스템

- 버텍스 배열 객체(VAO) 지원
- 효율적인 버퍼 관리
- WebGL 1.0에서 VAO 확장 자동 적용

### 텍스처 관리

- 텍스처 로딩 및 캐싱
- 다양한 포맷 지원
- 자동 밉맵 생성

### 인스턴스 렌더링

- 대량의 객체 효율적 렌더링
- WebGL 2.0 인스턴싱 지원
- WebGL 1.0에서 확장 자동 적용

## 사용 예제

```typescript
import { OffscreenCanvasManager } from "@hyperviz/worker";

const canvas = document.getElementById("canvas");
const manager = new OffscreenCanvasManager({
  canvas,
  contextType: "webgl2",
  autoResize: true,
});

// 준비 완료 시 처리
manager.on("ready", () => {
  // WebGL 렌더링 명령 전송
  manager.sendCommand({
    type: "render",
    params: {
      // 렌더링 파라미터
    },
  });
});
```

## 설치

```bash
npm install @hyperviz/worker
```

## 문서

자세한 API 문서는 [여기](https://example.com/docs)에서 확인하세요.

## 라이센스

MIT
