/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import { Animation } from "../core/Animation";
import { AnimationClient, AnimationConfig } from "../types";

export interface RotationConfig extends AnimationConfig {
  /**
   * 회전 각도 (라디안)
   */
  theta?: number;
}

export class Rotation extends Animation {
  protected config!: RotationConfig;

  constructor(client: AnimationClient, config: RotationConfig) {
    super(client, config);
    this.config = config;
  }

  step(delta: number): void {
    const { theta = 6.28 } = this.config;

    this.client?.delta("theta", delta * theta);
  }
}
