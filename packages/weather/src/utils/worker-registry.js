"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeWorkerSystem = initializeWorkerSystem;
exports.registerWeatherProcessors = registerWeatherProcessors;
exports.submitTask = submitTask;
exports.cleanupWorkerSystem = cleanupWorkerSystem;
const worker_1 = require("@hyperviz/worker");
// 워커 풀 인스턴스 저장
let workerPool = null;
/**
 * 워커 시스템 초기화
 * @param options 워커 시스템 옵션
 */
function initializeWorkerSystem(options = {}) {
    // 기본 옵션
    const defaultOptions = {
        minWorkers: 1,
        maxWorkers: navigator.hardwareConcurrency || 2,
        idleTimeout: 30000, // 30초
        ...options,
    };
    // 이미 초기화되어 있으면 기존 인스턴스 반환
    if (workerPool) {
        return Promise.resolve(workerPool);
    }
    // 워커 풀 생성
    workerPool = new worker_1.WorkerPool(defaultOptions);
    return Promise.resolve(workerPool);
}
/**
 * 프로세서 등록 함수 - 현재 Worker 모듈에서는 직접 프로세서 등록이 다른 방식으로 이루어짐
 * 이 함수는 향후 확장을 위해 스텁으로 남겨둠
 */
function registerWeatherProcessors() {
    try {
        console.log("날씨 프로세서 등록 - 현재는 직접 구현되지 않음");
        // 이 함수는 WorkerPool이 내부적으로 프로세서를 관리하므로
        // 현재는 아무 작업도 수행하지 않지만 향후 확장을 위해 유지
    }
    catch (err) {
        console.error("프로세서 등록 중 오류 발생:", err);
    }
}
/**
 * 태스크 제출 헬퍼 함수
 * @param processor 프로세서 타입
 * @param data 태스크 데이터
 */
async function submitTask(processor, data) {
    if (!workerPool) {
        throw new Error("Worker system not initialized");
    }
    return workerPool.submitTask({
        type: processor,
        data,
        workerType: "weather",
    });
}
/**
 * 워커 시스템 정리
 */
function cleanupWorkerSystem() {
    if (workerPool) {
        workerPool.shutdown();
        workerPool = null;
    }
    return Promise.resolve();
}
//# sourceMappingURL=worker-registry.js.map