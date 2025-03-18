/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import { compile, register, registry } from "../core/compile";
import { AnimationClient, AnimationConfig } from "../types";

// 테스트용 가짜 애니메이션 클래스
class MockAnimation {
  client: AnimationClient;
  config: AnimationConfig;
  started = false;

  constructor(client: AnimationClient, config: AnimationConfig) {
    this.client = client;
    this.config = config;
  }

  start() {
    this.started = true;
    return this;
  }

  stop() {
    this.started = false;
    return this;
  }

  dispose() {}

  get isStarted() {
    return this.started;
  }
}

// 테스트용 클라이언트
const mockClient: AnimationClient = {
  onAnimation: jest.fn(),
  delta: jest.fn(),
};

describe("Animation Compile 테스트", () => {
  // 각 테스트 전에 레지스트리 초기화
  beforeEach(() => {
    // 레지스트리 초기화를 위해 모든 속성 삭제
    Object.keys(registry).forEach((key) => {
      delete registry[key];
    });
  });

  it("애니메이션 클래스를 레지스트리에 등록", () => {
    // 가짜 애니메이션 클래스 등록
    register("mock", MockAnimation);

    // 레지스트리에 등록됐는지 확인
    expect(registry["mock"]).toBe(MockAnimation);
  });

  it("등록된 애니메이션 타입으로 애니메이션 컴파일", () => {
    // 가짜 애니메이션 클래스 등록
    register("mock", MockAnimation);

    // 애니메이션 설정
    const config: AnimationConfig = {
      type: "mock",
      duration: 1000,
    };

    // 애니메이션 컴파일
    const animation = compile(mockClient, config);

    // 컴파일된 애니메이션 확인
    expect(animation).not.toBeNull();
    expect(animation).toBeInstanceOf(MockAnimation);
    expect((animation as any).config).toBe(config);
    expect((animation as any).client).toBe(mockClient);
  });

  it("등록되지 않은 애니메이션 타입은 null 반환", () => {
    // 미등록 애니메이션 타입으로 설정
    const config: AnimationConfig = {
      type: "nonexistent",
      duration: 1000,
    };

    // 애니메이션 컴파일
    const animation = compile(mockClient, config);

    // null 반환 확인
    expect(animation).toBeNull();
  });

  it("type이 없는 애니메이션 설정은 null 반환", () => {
    // type 없는 애니메이션 설정
    const config: AnimationConfig = {
      duration: 1000,
    };

    // 애니메이션 컴파일
    const animation = compile(mockClient, config);

    // null 반환 확인
    expect(animation).toBeNull();
  });
});
