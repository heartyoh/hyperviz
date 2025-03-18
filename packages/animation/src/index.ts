/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

// Core 내보내기
export { Animation } from "./core/Animation";
export { animate } from "./core/animate";
export { compile, register, registry } from "./core/compile";
export * as delta from "./core/delta";

// 타입 내보내기
export * from "./types";

// 기본 애니메이션 등록 (자동으로 로드될 애니메이션)
import "./animations";
