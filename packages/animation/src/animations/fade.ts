/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import { Animation } from "../core/Animation";
import { AnimationClient, AnimationConfig } from "../types";

export interface FadeConfig extends AnimationConfig {
  /**
   * 최소 불투명도 (0~1)
   */
  startAlpha?: number;

  /**
   * 최대 불투명도 (0~1)
   */
  endAlpha?: number;
}

export class Fade extends Animation {
  protected config!: FadeConfig;

  constructor(client: AnimationClient, config: FadeConfig) {
    super(client, config);
    this.config = config;
  }

  step(delta: number): void {
    var { startAlpha = 1, endAlpha = 0 } = this.config;

    var min = Math.max(Math.min(startAlpha, endAlpha, 1), 0);
    var max = Math.min(Math.max(startAlpha, endAlpha, 1), 1);
    var range = (max - min) * 2;
    var fade;

    if (delta < 0.5) fade = range * delta;
    else fade = (1 - delta) * range;

    this.client?.delta("fade", fade);
  }
}
