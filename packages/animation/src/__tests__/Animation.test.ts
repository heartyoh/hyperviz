/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import { Animation } from "../core/Animation";
import {
  AnimationClient,
  AnimationConfig,
  AnimationDeltaObject,
  AnimationPropertyKey,
} from "../types";

// 성능 측정 함수를 모의(mock)합니다.
global.performance.now = jest.fn().mockReturnValue(0);

// requestAnimationFrame을 모의(mock)합니다.
global.requestAnimationFrame = jest.fn((callback) => {
  setTimeout(callback, 0);
  return 1;
});
global.cancelAnimationFrame = jest.fn();

// 테스트용 애니메이션 클라이언트
class TestClient implements AnimationClient {
  public animationEvent = 0;
  public deltaValues: Record<string, number> = {};

  onAnimation(event: string): void {
    if (event == "started") {
      this.animationEvent++;
    }
  }

  delta(
    property: AnimationPropertyKey | AnimationDeltaObject,
    value?: number
  ): AnimationDeltaObject | void {
    if (property === undefined) {
      return this.deltaValues;
    } else if (typeof property === "string") {
      this.deltaValues[property as AnimationPropertyKey] = value as number;
    } else {
      this.deltaValues = { ...this.deltaValues, ...property };
    }
  }

  position(): { x: number; y: number; z: number } {
    return { x: 0, y: 0, z: 0 };
  }
}

// 테스트용 애니메이션 클래스
class TestAnimation extends Animation {
  public stepCalled = 0;
  public lastDelta = 0;

  step(delta: number): void {
    this.stepCalled++;
    this.lastDelta = delta;
  }
}

describe("Animation", () => {
  let client: TestClient;
  let animationConfig: AnimationConfig;
  let animation: TestAnimation;

  beforeEach(() => {
    jest.clearAllMocks();

    client = new TestClient();
    animationConfig = {
      duration: 2000,
      delta: "linear",
      ease: "inout",
    };
    animation = new TestAnimation(client, animationConfig);
  });

  it("애니메이션 생성 후 초기 상태 확인", () => {
    expect(animation.started).toBe(false);
  });

  it("애니메이션 시작", () => {
    animation.start();
    expect(animation.started).toBe(true);
    expect(global.requestAnimationFrame).toHaveBeenCalled();
  });

  it("애니메이션 정지", () => {
    animation.start();
    animation.stop();
    expect(animation.started).toBe(false);
    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("애니메이션 시작 상태 설정", () => {
    animation.started = true;
    expect(animation.started).toBe(true);
    expect(global.requestAnimationFrame).toHaveBeenCalled();

    animation.started = false;
    expect(animation.started).toBe(false);
  });

  it("애니메이션 자원 해제", () => {
    animation.start();
    animation.dispose();
    expect(animation.started).toBe(false);
    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });
});
