/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import { Animation } from "../core/Animation";
import { AnimationClient, AnimationConfig } from "../types";

export interface MovingConfig extends AnimationConfig {
  /**
   * X축 이동 거리
   */
  x?: number;

  /**
   * Y축 이동 거리
   */
  y?: number;

  /**
   * 이동 경로 (linear, curve)
   */
  path?: "linear" | "curve";
}

export class Moving extends Animation {
  protected config!: MovingConfig;

  constructor(client: AnimationClient, config: MovingConfig) {
    super(client, config);
    this.config = config;
  }

  step(delta: number): void {
    var { x = 0, y = 0 } = this.config;

    this.client?.delta?.({
      tx: x * delta,
      ty: y * delta,
    });
  }
}
