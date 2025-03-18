/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import { Rotation } from "../animations/rotation";
import { AnimationClient } from "../types";

describe("Rotation 애니메이션 테스트", () => {
  // 테스트용 클라이언트 객체
  let mockClient: AnimationClient & { deltaValues: Record<string, number> };

  beforeEach(() => {
    mockClient = {
      onAnimation: jest.fn(),
      delta: jest.fn((property, value) => {
        if (property === undefined) {
          return mockClient.deltaValues;
        } else if (typeof property === "string") {
          mockClient.deltaValues[property] = value as number;
        } else {
          mockClient.deltaValues = { ...mockClient.deltaValues, ...property };
        }
      }),
      deltaValues: {},
    };
  });

  it("기본 회전 설정 테스트", () => {
    // 기본 설정으로 회전 애니메이션 생성
    const rotation = new Rotation(mockClient, {});

    // delta 값이 0일 때 (시작 시점)
    rotation.step(0);
    expect(mockClient.delta).toHaveBeenCalledWith("theta", 0);

    // delta 값이 0.5일 때 (중간 시점)
    rotation.step(0.5);
    expect(mockClient.delta).toHaveBeenCalledWith("theta", 0.5 * 6.28);

    // delta 값이 1일 때 (완료 시점)
    rotation.step(1);
    expect(mockClient.delta).toHaveBeenCalledWith("theta", 6.28);
  });

  it("사용자 정의 회전 각도 테스트", () => {
    // 사용자 정의 각도 설정 (180도 = 약 3.14 라디안)
    const rotation = new Rotation(mockClient, {
      theta: 3.14,
    });

    // delta 값이 0일 때 (시작 시점)
    rotation.step(0);
    expect(mockClient.delta).toHaveBeenCalledWith("theta", 0);

    // delta 값이 0.5일 때 (중간 시점)
    rotation.step(0.5);
    expect(mockClient.delta).toHaveBeenCalledWith("theta", 0.5 * 3.14);

    // delta 값이 1일 때 (완료 시점)
    rotation.step(1);
    expect(mockClient.delta).toHaveBeenCalledWith("theta", 3.14);
  });
});
