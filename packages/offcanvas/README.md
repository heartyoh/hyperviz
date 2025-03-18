# @things-scene/offcanvas

웹워커를 사용한 고성능 캔버스 렌더링 라이브러리로, 수만 개의 2D 컴포넌트를 효율적으로 렌더링할 수 있습니다.

## 특징

- 웹워커를 활용한 멀티스레드 렌더링
- OffscreenCanvas API 지원
- 수만 개의 2D 컴포넌트를 효율적으로 렌더링
- 다양한 도형 지원 (사각형, 원, 텍스트, 이미지, 경로)
- 컴포넌트 기반 렌더링
- 고성능 최적화

## 설치

```bash
npm install @things-scene/offcanvas
# 또는
yarn add @things-scene/offcanvas
```

## 기본 사용법

```typescript
import { OffCanvas } from "@things-scene/offcanvas";

// 컨테이너 요소 가져오기
const container = document.getElementById("canvas-container");

// OffCanvas 인스턴스 생성
const canvas = new OffCanvas(container, {
  width: 800,
  height: 600,
  background: "#ffffff",
  useOffscreenCanvas: true, // 웹워커와 OffscreenCanvas 사용
  maxWorkers: 4, // 사용할 웹워커 수
  batchSize: 1000, // 배치 크기
});

// 컴포넌트 추가
canvas.addComponent({
  id: "rect1",
  type: "rect",
  x: 100,
  y: 100,
  width: 200,
  height: 150,
  fillStyle: "red",
  strokeStyle: "black",
  lineWidth: 2,
});

// 컴포넌트 일괄 추가
const components = [];
for (let i = 0; i < 10000; i++) {
  components.push({
    id: `circle${i}`,
    type: "circle",
    x: Math.random() * 800,
    y: Math.random() * 600,
    width: 20,
    height: 20,
    fillStyle: `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${
      Math.random() * 255
    }, 0.7)`,
  });
}
canvas.addComponents(components);

// 렌더링 성능 통계 확인
console.log(canvas.getPerformanceStats());

// 자원 해제
// canvas.destroy();
```

## 고급 사용법

### 컴포넌트 업데이트

```typescript
canvas.updateComponent("rect1", {
  x: 150,
  y: 150,
  fillStyle: "blue",
});
```

### 캔버스 리사이징

```typescript
window.addEventListener("resize", () => {
  canvas.resize(window.innerWidth, window.innerHeight);
});
```

## 브라우저 지원

- Chrome 69+
- Firefox 62+
- Safari 12.1+
- Edge 79+

OffscreenCanvas와 웹워커를 지원하는 최신 브라우저에서 최적의 성능을 발휘합니다.
지원하지 않는 브라우저에서는 메인 스레드에서 렌더링됩니다.
