/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import { AnimationConfig, AnimationClient, DeltaFunction } from "../types";
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

/**
 * 여러가지 Animation 동작의 추상클래스
 * Animation 생성자의 client는 delta 메소드를 구현해야 함
 */
export class Animation {
  protected client: AnimationClient | null = null;
  protected config: AnimationConfig;
  protected delta: DeltaFunction;
  protected _started: boolean = false;
  private _raf: number | null = null;
  private _timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(client: AnimationClient, config: AnimationConfig) {
    this.client = client;
    this.config = config;

    const { delta = "linear", options, ease } = this.config;

    let deltaFn: DeltaFunction;
    if (typeof delta === "string" && delta in deltas) {
      deltaFn = deltas[delta as keyof typeof deltas];
    } else if (typeof delta === "function") {
      deltaFn = delta;
    } else {
      deltaFn = deltas.linear;
    }

    if (ease === "out") {
      this.delta = makeEaseOut(deltaFn, options);
    } else if (ease === "inout") {
      this.delta = makeEaseInOut(deltaFn, options);
    } else {
      this.delta = deltaFn;
    }

    this.init();
  }

  /**
   * 자원을 해제하는 함수
   */
  dispose(): void {
    this.stop();
    /* 확인차원에서 this.client 참조를 삭제한다. */
    this.client = null;
  }

  /**
   * 초기화 함수 (자식 클래스에서 재정의)
   */
  init(): void {}

  /**
   * 애니메이션을 시작하는 함수
   */
  start(): void {
    if (this._started) {
      return;
    }

    const {
      duration = 2000,
      delay = 0,
      repeat = false,
      interval = 0,
    } = this.config;

    this._started = true;

    let started_at = 0;
    let prevProgress = 0;

    const stepAnimation = () => {
      this._raf = null;
      this._timeout = null;

      if (!this._started) {
        return;
      }

      if (started_at === 0) {
        started_at = performance.now();
        this.client?.onAnimation?.("start");
      }

      const time_passed = performance.now() - started_at;
      const progress =
        Math.max((time_passed - delay) % (duration + interval), 0) / duration;

      const overflow = interval <= 0 && prevProgress > progress;
      prevProgress = progress;

      if (progress >= 1 || overflow) {
        this.step(1); /* 강제로 delta 값을 1로 설정함 */

        if (!repeat || !this._started) {
          this.stop();
          started_at = 0;
          return;
        } else if (interval > 0) {
          this._timeout = setTimeout(() => {
            /* animation 재생 간격에서 절반은 완료 상태, 절반은 시작 상태로 유지 - 자연스럽다. */
            this.step(0); /* 강제로 delta 값을 0으로 설정함 */
            this._timeout = setTimeout(stepAnimation, interval / 2);
          }, interval / 2);

          return;
        }
      } else {
        this.step(this.delta(progress));
      }

      this._raf = requestAnimationFrame(stepAnimation);
    };

    this._raf = requestAnimationFrame(stepAnimation);
  }

  /**
   * 애니메이션을 정지하는 함수
   */
  stop(): void {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
    }

    if (this._timeout) {
      clearTimeout(this._timeout);
    }

    this._raf = null;
    this._timeout = null;

    this._started = false;

    this.client?.onAnimation?.("stop");
  }

  /**
   * 애니메이션 단계를 처리하는 함수 (자식 클래스에서 재정의)
   */
  step(delta: number): void {}

  /**
   * 애니메이션 시작 여부를 반환
   */
  get started(): boolean {
    return this._started;
  }

  /**
   * 애니메이션 시작 여부를 설정
   */
  set started(started: boolean) {
    if (this.started === !!started) {
      return;
    }

    if (!!started) this.start();
    else this.stop();
  }
}
