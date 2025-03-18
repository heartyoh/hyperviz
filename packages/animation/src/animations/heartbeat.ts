/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import { Animation } from "../core/Animation";
import { AnimationClient, AnimationConfig } from "../types";

export interface HeartbeatConfig extends AnimationConfig {
  /**
   * 박동 크기 (스케일 변화량)
   */
  scale?: number;
}

export class Heartbeat extends Animation {
  protected config!: HeartbeatConfig;

  constructor(client: AnimationClient, config: HeartbeatConfig) {
    super(client, config);
    this.config = config;
  }

  step(delta: number): void {
    var { scale = 1.3 } = this.config;

    var total_scale = (scale - 1) * 2;

    var ratio;

    // 0 ~ 1/2 까지는 점차로 증가한다. 그 이후로는 점차로 감소한다.
    if (delta < 1 / 2) ratio = 1 + total_scale * delta;
    else ratio = 1 + (1 - delta) * total_scale;

    // scaleX와 scaleY 값을 동시에 업데이트
    this.client?.delta?.({
      sx: scale,
      sy: scale,
      sz: scale,
    });
  }
}
