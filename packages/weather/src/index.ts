// 타입 내보내기
export * from "./types/index.js";

// 레이어 내보내기
export { BaseWeatherLayer } from "./layers/base-layer.js";
export { WindLayer } from "./layers/wind-layer.js";
// 향후 추가될 다른 레이어도 여기에서 내보냄

// 서비스 내보내기 (구현되면)
// export { WeatherService } from './services/weather-service';

// 유틸리티 내보내기
export {
  initializeWorkerSystem,
  cleanupWorkerSystem,
  registerWeatherProcessors,
} from "./utils/worker-registry.js";

// 워커 진입점 - 워커 스크립트 생성에 사용됨
import { registerWeatherProcessors } from "./utils/worker-registry.js";

// 워커 컨텍스트에서 실행 중인지 확인
const isWorker =
  typeof self !== "undefined" &&
  typeof Window === "undefined" &&
  typeof self.WorkerGlobalScope !== "undefined";

// 워커 컨텍스트에서 실행 중이면 프로세서 등록
if (isWorker) {
  registerWeatherProcessors();
  console.log("날씨 모듈 워커 프로세서 등록됨");
}
