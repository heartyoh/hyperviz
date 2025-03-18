/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import {
  AnimationConfig,
  AnimationClient,
  Animation,
  AnimationRegistry,
} from "../types";

/**
 * 애니메이션 레지스트리
 * 이 레지스트리는 animations 디렉토리의 애니메이션 클래스들을 동적으로 등록합니다.
 */
export const registry: AnimationRegistry = {};

/**
 * 애니메이션 컴파일 함수
 *
 * @param client - 애니메이션을 적용할 클라이언트
 * @param animationConfig - 애니메이션 설정
 * @returns Animation 인스턴스 또는 null
 */
export function compile(
  client: AnimationClient,
  animationConfig: AnimationConfig
): Animation | null {
  const animationType = animationConfig.type;

  if (!animationType || !registry[animationType]) {
    return null;
  }

  const AnimationClass = registry[animationType];
  return new AnimationClass(client, animationConfig);
}

/**
 * 애니메이션 등록 함수
 *
 * @param name - 애니메이션 이름
 * @param animationClass - 애니메이션 클래스
 */
export function register(name: string, animationClass: any): void {
  registry[name] = animationClass;
}

export default compile;
