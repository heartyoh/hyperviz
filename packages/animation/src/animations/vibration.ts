/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import { Animation } from "../core/Animation";
import { AnimationClient, AnimationConfig } from "../types";

export interface VibrationConfig extends AnimationConfig {
  /**
   * 진동 강도
   */
  theta?: number;
}

export class Vibration extends Animation {
  protected config!: VibrationConfig;

  constructor(client: AnimationClient, config: VibrationConfig) {
    super(client, config);
    this.config = config;
  }

  step(delta: number): void {
    var {
      theta = 0.2617993877991494, // 15 dgree
    } = this.config;

    var total_theta = theta * 4;
    var current = delta * total_theta;

    // 1단계 : 점차로 감소한다.
    if (delta < 1 / 4) current *= -1;
    else if (delta < 3 / 4)
      // 2단계 : 점차 증가한다.
      current -= theta * 2;
    // 3단계 : 점차 감소한다.
    else current = total_theta - current;

    this.client?.delta("theta", current);
  }
}
