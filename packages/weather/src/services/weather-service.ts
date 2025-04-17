import {
  WeatherDataBase,
  WeatherGridDataBase,
  WeatherServiceOptions,
  LocationBase,
} from "../types/index.js";

// IndexedDB 캐시 설정
const DB_NAME = "hyperviz-weather-cache";
const DB_VERSION = 1;
const STORE_WEATHER = "weather-data";
const MAX_CACHE_AGE = 30 * 60 * 1000; // 30분 (밀리초)

/**
 * 날씨 데이터를 가져오고 관리하는 서비스 클래스
 */
export class WeatherService {
  private apiKey?: string;
  private endpoint: string;
  private cachedData: WeatherDataBase[] = [];
  private lastUpdated?: Date;
  private updateInterval: number = 30 * 60 * 1000; // 기본 30분
  private updateTimer?: number;
  private onDataUpdate?: (data: WeatherDataBase[]) => void;
  private db?: IDBDatabase;

  /**
   * 날씨 서비스 생성자
   * @param options 날씨 서비스 설정 옵션
   */
  constructor(options: WeatherServiceOptions = {}) {
    this.apiKey = options.apiKey;
    this.endpoint =
      options.endpoint || "https://api.open-meteo.com/v1/forecast";

    if (options.updateInterval) {
      this.updateInterval = options.updateInterval * 1000; // 초 단위를 밀리초로 변환
    }

    if (options.mockData) {
      // mockData의 타입을 확인하고 필요시 변환
      this.cachedData = options.mockData.map((item) =>
        this.convertToWeatherData(item)
      );
      this.lastUpdated = new Date();
    }

    // IndexedDB 초기화
    this.initIndexedDB().catch((err) => {
      console.error("날씨 캐시 데이터베이스 초기화 실패:", err);
    });
  }

  /**
   * 외부 데이터를 내부 WeatherData 형식으로 변환
   * @param data 변환할 데이터
   */
  private convertToWeatherData(data: any): WeatherDataBase {
    return {
      timestamp:
        typeof data.timestamp === "number" ? data.timestamp : Date.now(),
      location: {
        lat: data.location?.lat || data.location?.latitude || 0,
        lon: data.location?.lon || data.location?.longitude || 0,
      },
      ...data,
    };
  }

  /**
   * IndexedDB 데이터베이스 초기화
   */
  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      // IndexedDB가 지원되지 않는 환경이면 무시
      if (!window.indexedDB) {
        console.warn("이 브라우저는 IndexedDB를 지원하지 않습니다.");
        resolve();
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // 날씨 데이터 저장소 생성
        if (!db.objectStoreNames.contains(STORE_WEATHER)) {
          const store = db.createObjectStore(STORE_WEATHER, {
            keyPath: "cacheKey",
          });
          store.createIndex("timestamp", "timestamp", { unique: false });
          console.log("날씨 데이터 저장소 생성됨");
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log("날씨 캐시 데이터베이스 연결 성공");

        // 오래된 캐시 데이터 정리
        this.cleanupOldCache().catch((err) => {
          console.error("캐시 정리 중 오류:", err);
        });

        resolve();
      };

      request.onerror = () => {
        console.error("IndexedDB 연결 실패:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 오래된 캐시 데이터 정리
   */
  private async cleanupOldCache(): Promise<void> {
    if (!this.db) return;

    try {
      const tx = this.db.transaction(STORE_WEATHER, "readwrite");
      const store = tx.objectStore(STORE_WEATHER);
      const index = store.index("timestamp");
      const cutoffTime = Date.now() - MAX_CACHE_AGE;

      // 오래된 항목 찾기
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      tx.oncomplete = () => {
        console.log("오래된 캐시 데이터 정리 완료");
      };

      tx.onerror = () => {
        console.error("캐시 정리 중 오류:", tx.error);
      };
    } catch (err) {
      console.error("캐시 정리 예외:", err);
    }
  }

  /**
   * 캐시에서 날씨 데이터 가져오기
   * @param cacheKey 캐시 키
   */
  private async getFromCache(
    cacheKey: string
  ): Promise<WeatherDataBase[] | null> {
    if (!this.db) return null;

    try {
      const tx = this.db.transaction(STORE_WEATHER, "readonly");
      const store = tx.objectStore(STORE_WEATHER);

      return new Promise((resolve) => {
        const request = store.get(cacheKey);

        request.onsuccess = () => {
          const data = request.result;
          if (data && Date.now() - data.timestamp < MAX_CACHE_AGE) {
            resolve(data.weatherData);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error("캐시 조회 오류:", request.error);
          resolve(null);
        };
      });
    } catch (err) {
      console.error("캐시 조회 예외:", err);
      return null;
    }
  }

  /**
   * 날씨 데이터를 캐시에 저장
   * @param cacheKey 캐시 키
   * @param data 날씨 데이터
   */
  private async saveToCache(
    cacheKey: string,
    data: WeatherDataBase[]
  ): Promise<void> {
    if (!this.db) return;

    try {
      const tx = this.db.transaction(STORE_WEATHER, "readwrite");
      const store = tx.objectStore(STORE_WEATHER);

      const cacheData = {
        cacheKey,
        weatherData: data,
        timestamp: Date.now(),
      };

      return new Promise((resolve) => {
        const request = store.put(cacheData);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          console.error("캐시 저장 오류:", request.error);
          resolve();
        };
      });
    } catch (err) {
      console.error("캐시 저장 예외:", err);
    }
  }

  /**
   * 캐시 키 생성
   * @param params 요청 파라미터
   */
  private generateCacheKey(params: any): string {
    return `weather-${JSON.stringify(params)}`;
  }

  /**
   * 날씨 데이터 업데이트
   * @param location 위치 정보
   * @param forceUpdate 강제 업데이트 여부
   */
  async updateWeatherData(
    location: LocationBase,
    forceUpdate = false
  ): Promise<WeatherDataBase[]> {
    // 위치 검증
    if (
      !location ||
      typeof location.lat !== "number" ||
      typeof location.lon !== "number"
    ) {
      throw new Error("유효한 위치 정보가 필요합니다.");
    }

    const now = new Date().getTime();

    // 업데이트가 필요한지 확인
    if (
      !forceUpdate &&
      this.lastUpdated &&
      now - this.lastUpdated.getTime() < this.updateInterval &&
      this.cachedData.length > 0
    ) {
      console.log("캐시된 날씨 데이터 사용");
      return this.cachedData;
    }

    // 캐시 키 생성
    const params = { lat: location.lat, lon: location.lon };
    const cacheKey = this.generateCacheKey(params);

    // 캐시 확인
    const cachedData = await this.getFromCache(cacheKey);
    if (cachedData && !forceUpdate) {
      console.log("IndexedDB 캐시에서 날씨 데이터 검색됨");
      this.cachedData = cachedData;
      this.lastUpdated = new Date();
      return cachedData;
    }

    // 실제 API 호출
    try {
      const url = new URL(`${this.endpoint}`);
      url.searchParams.append("lat", location.lat.toString());
      url.searchParams.append("lon", location.lon.toString());

      if (this.apiKey) {
        url.searchParams.append("key", this.apiKey);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`날씨 API 오류: ${response.status}`);
      }

      const data = await response.json();

      // API 응답 변환
      const weatherData: WeatherDataBase[] = Array.isArray(data)
        ? data.map((item) => this.convertToWeatherData(item))
        : [this.convertToWeatherData(data)];

      // 데이터 캐싱
      this.cachedData = weatherData;
      this.lastUpdated = new Date();

      // IndexedDB에 저장
      await this.saveToCache(cacheKey, weatherData);

      // 콜백 호출
      if (this.onDataUpdate) {
        this.onDataUpdate(weatherData);
      }

      console.log("날씨 데이터 업데이트됨:", weatherData);
      return weatherData;
    } catch (error) {
      console.error("날씨 데이터 가져오기 오류:", error);

      // 오류 발생 시 빈 데이터 반환
      return [];
    }
  }

  /**
   * 가장 가까운 날씨 데이터 찾기
   * @param location 위치 정보
   */
  findNearestData(location: LocationBase): WeatherDataBase | null {
    if (this.cachedData.length === 0) return null;

    let nearestData = this.cachedData[0];
    let minDistance = Number.MAX_VALUE;

    for (const data of this.cachedData) {
      // 위치 프로퍼티가 없으면 건너뜀
      if (
        !data.location ||
        typeof data.location.lat !== "number" ||
        typeof data.location.lon !== "number"
      ) {
        continue;
      }

      // 거리 계산 (단순 유클리드 거리)
      const distance = Math.sqrt(
        Math.pow(data.location.lon - location.lon, 2) +
          Math.pow(data.location.lat - location.lat, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestData = data;
      }
    }

    return nearestData;
  }

  /**
   * 위치 기반 날씨 그리드 데이터 생성
   * @param location 중심 위치
   * @param width 그리드 너비
   * @param height 그리드 높이
   * @param resolution 해상도 (격자 크기)
   */
  generateGridData(
    location: LocationBase,
    width = 10,
    height = 10,
    resolution = 1
  ): WeatherGridDataBase | null {
    // 데이터가 없으면 테스트용 모의 데이터 생성
    if (this.cachedData.length === 0) {
      const mockData = this.generateMockWeatherData(location);
      return {
        centerLocation: { lat: location.lat, lon: location.lon },
        width,
        height,
        resolution,
        timestamp: Date.now(),
        data: [[mockData]],
      };
    }

    // 가장 가까운 데이터 찾기
    const data = this.findNearestData(location);
    if (!data) return null;

    // 그리드 데이터 생성
    return {
      centerLocation: { lat: location.lat, lon: location.lon },
      width,
      height,
      resolution,
      timestamp: data.timestamp,
      data: [[data]],
    };
  }

  /**
   * 테스트용 모의 날씨 데이터 생성
   * @param location 위치 정보
   */
  private generateMockWeatherData(location: LocationBase): WeatherDataBase {
    const now = Date.now();
    const seed = Math.sin(location.lon * 0.1) * Math.cos(location.lat * 0.1);

    // 간단한 노이즈 함수
    const noise = (x: number) => Math.sin(seed * x) * 0.5 + 0.5;

    return {
      timestamp: now,
      location: {
        lat: location.lat,
        lon: location.lon,
      },
      // 테스트용 추가 데이터
      temperatureValue: 15 + 10 * noise(location.lon + location.lat),
      windSpeed: 5 + 5 * noise(location.lon * location.lat),
      windDirection: 360 * noise(location.lat),
      humidity: 60 + 30 * noise(location.lon),
      cloudCoverage: 100 * noise(location.lat * 0.2),
      precipitation: 10 * noise(location.lon * 0.3),
      solarRadiation: 1000 * noise(location.lat + location.lon),
    };
  }

  /**
   * 서비스 구독
   * @param callback 데이터 업데이트 콜백
   */
  subscribe(callback: (data: WeatherDataBase[]) => void): void {
    this.onDataUpdate = callback;
  }

  /**
   * 자동 업데이트 시작
   * @param location 위치 정보
   * @param interval 업데이트 간격 (초)
   */
  startAutoUpdate(location: LocationBase, interval?: number): void {
    // 기존 타이머 중지
    this.stopAutoUpdate();

    // 간격 설정
    const updateInterval = interval ? interval * 1000 : this.updateInterval;

    // 즉시 첫 업데이트 실행
    this.updateWeatherData(location).catch((err) => {
      console.error("날씨 자동 업데이트 오류:", err);
    });

    // 타이머 설정
    this.updateTimer = window.setInterval(() => {
      this.updateWeatherData(location).catch((err) => {
        console.error("날씨 자동 업데이트 오류:", err);
      });
    }, updateInterval);
  }

  /**
   * 자동 업데이트 중지
   */
  stopAutoUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
  }

  /**
   * 서비스 리소스 정리
   */
  dispose(): void {
    // 타이머 정리
    this.stopAutoUpdate();

    // DB 연결 닫기
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }
}
