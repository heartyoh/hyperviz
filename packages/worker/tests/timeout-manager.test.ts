import assert from "assert";
import {
  TimeoutManager,
  TimeoutStatus,
  TimeoutInfo,
} from "../src/core/timeout-manager.js";

// 비동기 지연 함수
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// assert 함수 확장 (chai 스타일 변경)
const expect = (value: any) => ({
  to: {
    be: {
      a: (type: string) =>
        assert(typeof value === type, `Expected ${value} to be a ${type}`),
      true: () => assert(value === true, `Expected ${value} to be true`),
      false: () => assert(value === false, `Expected ${value} to be false`),
      undefined: () =>
        assert(value === undefined, `Expected value to be undefined`),
    },
    equal: (expected: any) =>
      assert.strictEqual(
        value,
        expected,
        `Expected ${value} to equal ${expected}`
      ),
    not: {
      be: {
        undefined: () =>
          assert(value !== undefined, `Expected value to not be undefined`),
        throw: () => {
          /* 구현 생략 - 실제로는 try/catch를 사용해야 함 */
        },
      },
    },
    greaterThan: (expected: any) =>
      assert(
        value > expected,
        `Expected ${value} to be greater than ${expected}`
      ),
  },
});

describe("TimeoutManager", () => {
  let timeoutManager: TimeoutManager;

  beforeEach(() => {
    // 각 테스트 전에 새로운 TimeoutManager 인스턴스 생성
    timeoutManager = new TimeoutManager({
      maxRetries: 3,
      retryDelayBase: 100,
      maxJitter: 10,
      maxBackoffDelay: 5000,
      debug: false,
    });
  });

  afterEach(() => {
    // 각 테스트 후에 타임아웃 매니저 정리
    timeoutManager.clearAll();
  });

  describe("기본 기능", () => {
    it("타임아웃 설정 및 완료 처리", async () => {
      let timeoutTriggered = false;

      const timeoutId = timeoutManager.set(
        "test1",
        () => {
          timeoutTriggered = true;
        },
        50
      );

      expect(timeoutId).to.be.a("number");
      expect(timeoutManager.getTimeoutInfo("test1")).to.not.be.undefined;

      await delay(100);

      expect(timeoutTriggered).to.be.true;
      expect(timeoutManager.getTimeoutInfo("test1")).to.be.undefined;
    });

    it("타임아웃 취소", async () => {
      let timeoutTriggered = false;

      const timeoutId = timeoutManager.set(
        "test2",
        () => {
          timeoutTriggered = true;
        },
        100
      );

      expect(timeoutManager.getTimeoutInfo("test2")).to.not.be.undefined;

      timeoutManager.clear("test2");

      await delay(150);

      expect(timeoutTriggered).to.be.false;
      expect(timeoutManager.getTimeoutInfo("test2")).to.be.undefined;
    });

    it("모든 타임아웃 취소", async () => {
      let count = 0;

      timeoutManager.set(
        "test3a",
        () => {
          count++;
        },
        50
      );
      timeoutManager.set(
        "test3b",
        () => {
          count++;
        },
        50
      );
      timeoutManager.set(
        "test3c",
        () => {
          count++;
        },
        50
      );

      timeoutManager.clearAll();

      await delay(100);

      expect(count).to.equal(0);
    });

    it("타임아웃 정보 조회", () => {
      const callback = () => {};
      const timeoutId = timeoutManager.set("test4", callback, 1000);

      const info = timeoutManager.getTimeoutInfo("test4");

      assert(info !== undefined, "TimeoutInfo should not be undefined");
      expect(info?.id).to.equal("test4");
      expect(info?.status).to.equal(TimeoutStatus.ACTIVE);
      expect(info?.originalDelay).to.equal(1000);
    });

    it("존재하지 않는 타임아웃 정보 조회", () => {
      const info = timeoutManager.getTimeoutInfo("non-existent-id");
      expect(info).to.be.undefined;
    });
  });

  describe("재시도 기능", () => {
    it("타임아웃 실패 후 자동 재시도", async () => {
      let attemptCount = 0;
      let lastDelay = 0;
      let retryData: TimeoutInfo | undefined = undefined;

      // 수정된 방식으로 재시도 콜백 처리
      const timeoutId = timeoutManager.setWithRetry(
        "test5",
        () => {
          // 마지막 콜백 (모든 재시도 실패 시)
          attemptCount++;
        },
        (retryCount, nextDelay) => {
          // 재시도 콜백
          attemptCount++;
          lastDelay = nextDelay;
          retryData = timeoutManager.getTimeoutInfo("test5");
        },
        50,
        2 // 최대 재시도 횟수
      );

      // 초기 실행 + 최대 2회 재시도 = 총 3회 실행
      await delay(500);

      expect(attemptCount).to.equal(3);
      expect(timeoutManager.getTimeoutInfo("test5")).to.be.undefined;

      // 지수 백오프로 인해 마지막 지연 시간은 초기 지연보다 커야 함
      expect(lastDelay).to.greaterThan(50);
    });

    it("최대 재시도 횟수 제한 준수", async () => {
      let attemptCount = 0;

      timeoutManager.setWithRetry(
        "test6",
        () => {
          // 최종 실패 콜백
          attemptCount++;
        },
        (retryCount, nextDelay) => {
          // 재시도 콜백
          attemptCount++;
        },
        50,
        4 // 최대 4회 재시도
      );

      // 초기 실행 + 4회 재시도 = 총 5회 실행
      await delay(1000);

      expect(attemptCount).to.equal(5);
    });

    it("지수 백오프 지연 시간 계산", async () => {
      const delays: number[] = [];

      timeoutManager.setWithRetry(
        "test7",
        () => {
          // 최종 실패 콜백
        },
        (retryCount, nextDelay) => {
          // 재시도 콜백
          delays.push(nextDelay);
        },
        100,
        3 // 최대 3회 재시도
      );

      await delay(1000);

      // 지연 시간이 증가해야 함
      expect(delays.length).to.equal(3);
      expect(delays[1]).to.greaterThan(delays[0]);
      expect(delays[2]).to.greaterThan(delays[1]);
    });
  });

  describe("성능 통계", () => {
    it("타임아웃 통계 추적", async () => {
      // 몇 개의 타임아웃 설정
      const ids = ["test8a", "test8b", "test8c", "test8d", "test8e"];
      for (let i = 0; i < 5; i++) {
        timeoutManager.set(ids[i], () => {}, 20);
      }

      // 일부 타임아웃 취소
      timeoutManager.clear(ids[0]);
      timeoutManager.clear(ids[1]);

      await delay(50);

      const stats = timeoutManager.getStats();

      expect(stats.created).to.equal(5);
      expect(stats.completed).to.equal(3);
      expect(stats.cancelled).to.equal(2);
      expect(stats.active).to.equal(0);
    });

    it("실패한 타임아웃 통계 추적", async () => {
      // 재시도 후 실패하는 타임아웃 설정
      timeoutManager.setWithRetry(
        "test9",
        () => {
          // 최종 실패 콜백
        },
        (retryCount, nextDelay) => {
          // 재시도 콜백
        },
        20,
        2 // 최대 2회 재시도
      );

      await delay(200);

      const stats = timeoutManager.getStats();

      expect(stats.created).to.equal(1);
      expect(stats.failed).to.equal(1);
      expect(stats.retried).to.greaterThan(0);
    });
  });

  describe("경계 조건", () => {
    it("0ms 지연 처리", async () => {
      let executed = false;

      timeoutManager.set(
        "test10",
        () => {
          executed = true;
        },
        0
      );

      await delay(10);

      expect(executed).to.be.true;
    });

    it("음수 지연 처리", () => {
      // 이 테스트는 예외가 발생하지 않는지만 확인합니다
      timeoutManager.set("test11", () => {}, -100);
      // 실제로 테스트할 내용이 없으므로 assert 생략
    });

    it("매우 큰 지연 처리", () => {
      const timeoutId = timeoutManager.set("test12", () => {}, 10000000);
      expect(timeoutManager.getTimeoutInfo("test12")).to.not.be.undefined;

      // 타임아웃 취소하여 테스트가 오래 실행되지 않도록 함
      timeoutManager.clear("test12");
    });
  });
});
