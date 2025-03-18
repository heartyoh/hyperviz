/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import { DeltaFunction, BackOptions, ElasticOptions } from "../types";

export function linear(progress: number): number {
  return progress;
}

export function quad(progress: number): number {
  return Math.pow(progress, 2);
}

export function circ(progress: number): number {
  return 1 - Math.sin(Math.acos(progress));
}

export function back(
  progress: number,
  options: BackOptions = { x: 1.5 }
): number {
  return Math.pow(progress, 2) * ((options.x + 1) * progress - options.x);
}

export function bounce(progress: number): number {
  for (let a = 0, b = 1; 1; a += b, b /= 2) {
    if (progress >= (7 - 4 * a) / 11) {
      return -Math.pow((11 - 6 * a - 11 * progress) / 4, 2) + Math.pow(b, 2);
    }
  }
  // TypeScript requires a return statement, but this should not reach this point
  return 0;
}

export function elastic(
  progress: number,
  options: ElasticOptions = { x: 1.5 }
): number {
  return (
    Math.pow(2, 10 * (progress - 1)) *
    Math.cos(((20 * Math.PI * options.x) / 3) * progress)
  );
}

// Named exports for individual deltas
export const deltas = {
  linear,
  quad,
  circ,
  back,
  bounce,
  elastic,
};

// For backward compatibility and to maintain the original API style
export default deltas;
