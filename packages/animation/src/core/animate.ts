/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import { AnimationConfig, DeltaFunction } from "../types";
import { deltas } from "./delta";

function makeEaseOut(delta: DeltaFunction, options?: any): DeltaFunction {
  return function (progress: number): number {
    return 1 - delta(1 - progress, options);
  };
}

function makeEaseInOut(delta: DeltaFunction, options?: any): DeltaFunction {
  return function (progress: number): number {
    if (progress < 0.5) return delta(2 * progress, options) / 2;
    else return (2 - delta(2 * (1 - progress), options)) / 2;
  };
}

export function animate(config: AnimationConfig) {
  const {
    duration = 1000 /* 1 sec by default */,
    delay = 30,
    step /* step function */,
    delta /* delta function */,
    ease /* ease function */,
    options,
    repeat = false,
  } = config;

  let deltaFn: DeltaFunction;

  if (typeof delta === "string" && delta in deltas) {
    deltaFn = deltas[delta as keyof typeof deltas];
  } else if (typeof delta === "function") {
    deltaFn = delta;
  } else {
    deltaFn = deltas.linear;
  }

  if (ease === "out") deltaFn = makeEaseOut(deltaFn, options);
  else if (ease === "inout") deltaFn = makeEaseInOut(deltaFn, options);

  let started = false;

  return {
    start: function () {
      if (started) return this;

      started = true;

      let started_at = 0;

      const _ = () => {
        if (!started) return;

        if (started_at === 0) started_at = performance.now();

        const time_passed = performance.now() - started_at;
        const progress = time_passed / duration;
        const dx = repeat ? progress % 1 : Math.min(progress, 1);

        step?.(deltaFn(dx, options));

        if (progress >= 1 && (!repeat || !started)) {
          this.stop();
          started_at = 0;
        }

        if (started) requestAnimationFrame(_);
      };

      requestAnimationFrame(_);

      return this;
    },

    stop: function () {
      started = false;

      return this;
    },
  };
}
