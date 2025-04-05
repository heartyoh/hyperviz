/**
 * OffscreenCanvas 매니저
 * HTML Canvas 요소에서 OffscreenCanvas를 생성하고 워커를 통해 관리합니다.
 */
import { EventEmitter } from "eventemitter3";
import {
  CanvasCommand,
  CanvasCommandType,
  CanvasContextType,
  CanvasEventType,
  CanvasInitCommand,
  CanvasResizeCommand,
  OffscreenCanvasManagerOptions,
  WorkerMessage,
  WorkerMessageType,
} from "./types.js";

/**
 * OffscreenCanvas 매니저 클래스
 * HTML Canvas 요소의 OffscreenCanvas 버전을 생성하고 워커와 통신합니다.
 */
export class OffscreenCanvasManager extends EventEmitter {
  /** 원본 캔버스 요소 */
  private canvas: HTMLCanvasElement | null = null;
  /** 워커 인스턴스 */
  private worker: Worker | null = null;
  /** 매니저 옵션 */
  private options: OffscreenCanvasManagerOptions;
  /** 오프스크린 캔버스가 전송되었는지 여부 */
  private canvasTransferred = false;
  /** 워커 준비 완료 상태 */
  private workerReady = false;
  /** 명령 ID 카운터 */
  private commandIdCounter = 0;
  /** 대기 중인 명령 */
  private pendingCommands = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
    }
  >();
  /** 애니메이션 프레임 ID */
  private animationFrameId: number | null = null;
  /** 애니메이션 콜백 */
  private animationCallback:
    | ((timestamp: number) => CanvasCommand | null)
    | null = null;
  /** 마지막 애니메이션 타임스탬프 */
  private lastAnimationTimestamp = 0;
  /** 애니메이션 시작 시간 */
  private animationStartTime = 0;
  /** 리사이즈 옵저버 */
  private resizeObserver: ResizeObserver | null = null;
  /** 폴백 모드 사용 여부 */
  private useFallbackMode = false;
  /** 2D 컨텍스트 (폴백 모드용) */
  private fallbackContext: CanvasRenderingContext2D | null = null;

  /**
   * OffscreenCanvasManager 생성자
   * @param options 캔버스 매니저 옵션
   */
  constructor(options: OffscreenCanvasManagerOptions) {
    super();

    this.options = {
      contextType: CanvasContextType.CONTEXT_2D,
      workerCount: 1,
      autoResize: true,
      debug: false,
      ...options,
    };

    this.initialize();
  }

  /**
   * 매니저 초기화
   * @private
   */
  private async initialize(): Promise<void> {
    try {
      // 캔버스 요소 가져오기
      await this.setupCanvas();

      // OffscreenCanvas 지원 확인
      if (!this.isOffscreenCanvasSupported()) {
        this.log(
          "OffscreenCanvas API가 지원되지 않습니다. 폴백 모드로 전환합니다."
        );
        this.useFallbackMode = true;
        this.setupFallbackContext();
        this.emit("ready");
        return;
      }

      // 워커 생성
      await this.setupWorker();

      // 자동 리사이즈 설정
      if (this.options.autoResize && this.canvas) {
        this.setupResizeObserver();
      }

      this.log("OffscreenCanvasManager 초기화 완료");
      this.emit("ready");
    } catch (error) {
      this.error("초기화 실패:", error);
      this.emit("error", error);

      // 오류 발생 시 폴백 모드로 전환 시도
      try {
        this.useFallbackMode = true;
        this.setupFallbackContext();
        this.log("오류로 인해 폴백 모드로 전환되었습니다.");
        this.emit("ready");
      } catch (fallbackError) {
        this.error("폴백 모드 설정 실패:", fallbackError);
        this.emit("error", fallbackError);
      }
    }
  }

  /**
   * 브라우저가 OffscreenCanvas API를 지원하는지 확인
   * @private
   * @returns API 지원 여부
   */
  private isOffscreenCanvasSupported(): boolean {
    // 브라우저 환경 확인
    if (typeof window === "undefined" || typeof document === "undefined") {
      return false;
    }

    // Canvas 요소 생성 및 API 확인
    const canvas = document.createElement("canvas");
    return (
      typeof canvas.transferControlToOffscreen === "function" &&
      typeof window.OffscreenCanvas !== "undefined"
    );
  }

  /**
   * 폴백 컨텍스트 설정
   * @private
   */
  private setupFallbackContext(): void {
    if (!this.canvas) {
      throw new Error("캔버스가 초기화되지 않았습니다.");
    }

    // 2D 컨텍스트만 지원
    if (this.options.contextType !== CanvasContextType.CONTEXT_2D) {
      this.log(
        "폴백 모드에서는 2D 컨텍스트만 지원됩니다. 컨텍스트 타입을 2D로 변경합니다."
      );
      this.options.contextType = CanvasContextType.CONTEXT_2D;
    }

    // 컨텍스트 생성 - 명시적 타입 캐스팅 사용
    const ctx = this.canvas.getContext(
      "2d",
      this.options.contextAttributes
    ) as CanvasRenderingContext2D;
    if (!ctx) {
      throw new Error("캔버스 2D 컨텍스트를 생성할 수 없습니다.");
    }

    this.fallbackContext = ctx;
    this.log("폴백 렌더링 컨텍스트가 설정되었습니다.");
  }

  /**
   * 기본 워커 URL 생성
   * @private
   * @returns 기본 워커 URL
   */
  private getDefaultWorkerUrl(): string {
    // 기본 워커 스크립트 내용
    const workerScript = `
      // OffscreenCanvas 워커 스크립트
      let canvas = null;
      let ctx = null;
      let contextType = null;
      let renderId = 0;
      
      // 메시지 처리
      self.onmessage = function(event) {
        const message = event.data;
        
        try {
          if (message.type === 'command') {
            const command = message.data;
            
            // 명령 처리
            const result = processCommand(command);
            
            // 결과 반환
            self.postMessage({
              type: 'response',
              id: message.id,
              data: {
                commandId: command.id,
                success: true,
                data: result
              }
            });
          }
        } catch (error) {
          self.postMessage({
            type: 'response',
            id: message.id,
            data: {
              commandId: message.data.id,
              success: false,
              error: error.message
            }
          });
        }
      };
      
      // 명령 처리 함수
      function processCommand(command) {
        switch (command.type) {
          case 'init':
            return initCanvas(command.params);
          case 'resize':
            return resizeCanvas(command.params);
          case 'clear':
            return clearCanvas();
          case 'render':
            return render(command.params);
          case 'dispose':
            return disposeCanvas();
          default:
            throw new Error(\`지원되지 않는 명령: \${command.type}\`);
        }
      }
      
      // 캔버스 초기화
      function initCanvas(params) {
        if (!canvas) {
          throw new Error('OffscreenCanvas가 전송되지 않았습니다.');
        }
        
        contextType = params.contextType;
        
        // 컨텍스트 생성
        ctx = canvas.getContext(contextType, params.contextAttributes);
        
        if (!ctx) {
          throw new Error(\`컨텍스트를 생성할 수 없습니다: \${contextType}\`);
        }
        
        return { width: canvas.width, height: canvas.height };
      }
      
      // 캔버스 크기 조정
      function resizeCanvas(params) {
        if (!canvas) return;
        
        canvas.width = params.width;
        canvas.height = params.height;
        
        // 2D 컨텍스트 재설정
        if (contextType === '2d' && ctx) {
          // 컨텍스트 상태 재설정
        }
        
        return { width: canvas.width, height: canvas.height };
      }
      
      // 캔버스 지우기
      function clearCanvas() {
        if (!ctx) return;
        
        if (contextType === '2d') {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
        }
        
        return true;
      }
      
      // 렌더링
      function render(params) {
        if (!ctx) return;
        
        renderId++;
        
        // 각 컨텍스트 유형에 맞게 렌더링
        if (contextType === '2d') {
          render2D(params);
        } else {
          renderWebGL(params);
        }
        
        self.postMessage({
          type: 'event',
          data: {
            type: 'renderComplete',
            renderId
          }
        });
        
        return { renderId };
      }
      
      // 2D 렌더링
      function render2D(params) {
        // 2D 렌더링 코드
      }
      
      // WebGL 렌더링
      function renderWebGL(params) {
        // WebGL 렌더링 코드
      }
      
      // 캔버스 정리
      function disposeCanvas() {
        // 리소스 정리
        ctx = null;
        canvas = null;
        return true;
      }
      
      // 워커 준비 완료 메시지 전송
      self.postMessage({
        type: 'ready'
      });
    `;

    // Blob URL 생성
    const blob = new Blob([workerScript], { type: "application/javascript" });
    return URL.createObjectURL(blob);
  }

  /**
   * 캔버스 요소 설정
   * @private
   */
  private async setupCanvas(): Promise<void> {
    // 캔버스 선택자 또는 직접 요소
    if (typeof this.options.canvas === "string") {
      const element = document.querySelector(this.options.canvas);
      if (!element || !(element instanceof HTMLCanvasElement)) {
        throw new Error(
          `선택자 "${this.options.canvas}"로 유효한 캔버스 요소를 찾을 수 없습니다.`
        );
      }
      this.canvas = element;
    } else if (this.options.canvas instanceof HTMLCanvasElement) {
      this.canvas = this.options.canvas;
    } else {
      throw new Error("유효한 캔버스 요소나 선택자가 필요합니다.");
    }
  }

  /**
   * 워커 설정
   * @private
   */
  private async setupWorker(): Promise<void> {
    if (!this.canvas) {
      throw new Error("캔버스가 초기화되지 않았습니다.");
    }

    // OffscreenCanvas API 지원 확인
    if (!("transferControlToOffscreen" in this.canvas)) {
      throw new Error("OffscreenCanvas API가 지원되지 않는 브라우저입니다.");
    }

    // 워커 스크립트 URL 결정
    const workerUrl = this.options.workerUrl || this.getDefaultWorkerUrl();

    // 워커 생성
    try {
      this.worker = new Worker(workerUrl);

      // 메시지 핸들러 설정
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);

      // 워커 준비 대기
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("워커 초기화 타임아웃"));
        }, 5000);

        const readyHandler = (event: MessageEvent) => {
          const message = event.data as WorkerMessage;
          if (message.type === WorkerMessageType.READY) {
            this.worker?.removeEventListener("message", readyHandler);
            clearTimeout(timeoutId);
            this.workerReady = true;
            resolve();
          }
        };

        this.worker?.addEventListener("message", readyHandler);
      });

      // 캔버스 전송 및 초기화
      await this.transferCanvasToWorker();
    } catch (error) {
      this.error("워커 초기화 실패:", error);
      throw error;
    }
  }

  /**
   * 캔버스를 워커로 전송
   * @private
   */
  private async transferCanvasToWorker(): Promise<void> {
    if (!this.canvas || !this.worker || this.canvasTransferred) {
      return;
    }

    try {
      // OffscreenCanvas API 지원 확인
      if (!("transferControlToOffscreen" in this.canvas)) {
        throw new Error("OffscreenCanvas API가 지원되지 않습니다.");
      }

      // OffscreenCanvas 생성
      let offscreen;
      try {
        offscreen = this.canvas.transferControlToOffscreen();
      } catch (error) {
        throw new Error(`OffscreenCanvas 생성 실패: ${error}`);
      }

      this.canvasTransferred = true;

      // 워커에 캔버스 전송 (drawer-worker.ts 방식과 동일하게)
      return new Promise<void>((resolve, reject) => {
        // 초기화 완료 이벤트 핸들러
        const initHandler = (event: MessageEvent) => {
          const message = event.data;

          if (message.type === "initialized") {
            if (this.worker) {
              this.worker.removeEventListener("message", initHandler);
            }
            this.log("캔버스가 워커로 전송되고 초기화되었습니다.");
            resolve();
          } else if (message.type === "error") {
            if (this.worker) {
              this.worker.removeEventListener("message", initHandler);
            }
            reject(new Error(message.data?.message || "캔버스 초기화 실패"));
          }
        };

        if (this.worker) {
          this.worker.addEventListener("message", initHandler);

          // init 메시지 전송 (drawer-worker.ts 방식과 유사하게)
          this.worker.postMessage(
            {
              type: "init",
              canvas: offscreen,
              contextType: this.options.contextType,
              contextAttributes: this.options.contextAttributes,
              width: this.canvas ? this.canvas.width : 300,
              height: this.canvas ? this.canvas.height : 150,
              devicePixelRatio: window.devicePixelRatio || 1,
            },
            [offscreen]
          );
        } else {
          reject(new Error("워커 인스턴스가 없습니다."));
        }
      });
    } catch (error) {
      this.error("캔버스 전송 실패:", error);
      throw error;
    }
  }

  /**
   * 명령 ID 생성
   * @private
   * @returns 고유 명령 ID
   */
  private generateCommandId(): string {
    return `cmd-${Date.now()}-${this.commandIdCounter++}`;
  }

  /**
   * 명령을 워커에 전송
   * @param command 캔버스 명령
   * @param transferables 전송 가능한 객체 배열 (옵션)
   * @returns 명령 실행 결과
   */
  public async sendCommand<T = any>(
    command: CanvasCommand,
    transferables: Transferable[] = []
  ): Promise<T> {
    // 폴백 모드에서는 직접 처리
    if (this.useFallbackMode) {
      return this.executeFallbackCommand<T>(command);
    }

    if (!this.worker || !this.workerReady) {
      throw new Error("워커가 준비되지 않았습니다.");
    }

    const commandId = command.id || this.generateCommandId();
    command.id = commandId;

    return new Promise<T>((resolve, reject) => {
      const messageId = `msg-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // 명령 응답 대기
      this.pendingCommands.set(messageId, { resolve, reject });

      // 워커에 명령 전송
      const message: WorkerMessage = {
        type: WorkerMessageType.COMMAND,
        id: messageId,
        data: command,
      };

      this.worker!.postMessage(message, transferables);
    });
  }

  /**
   * 폴백 모드에서 명령 실행
   * @private
   * @param command 캔버스 명령
   * @returns 명령 실행 결과
   */
  private async executeFallbackCommand<T = any>(
    command: CanvasCommand
  ): Promise<T> {
    if (!this.canvas || !this.fallbackContext) {
      throw new Error("폴백 컨텍스트가 초기화되지 않았습니다.");
    }

    const ctx = this.fallbackContext;
    const startTime = performance.now();

    try {
      let result: any = null;

      // 명령 타입에 따라 처리
      switch (command.type) {
        case CanvasCommandType.CLEAR:
          // 화면 지우기
          ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          result = true;
          break;

        case CanvasCommandType.RESIZE:
          // 크기 조정
          const resizeCmd = command as CanvasResizeCommand;
          const width = resizeCmd.params.width;
          const height = resizeCmd.params.height;

          this.canvas.width = width;
          this.canvas.height = height;

          // 리사이즈 이벤트 발생
          this.emit(CanvasEventType.RESIZE, {
            width,
            height,
          });

          result = { width, height };
          break;

        case CanvasCommandType.RENDER:
          // 렌더링 - 실제 렌더링 로직은 구현이 필요함
          // 여기서는 간단히 처리
          result = { renderId: Date.now() };

          // 렌더링 완료 이벤트
          this.emit(CanvasEventType.RENDER_COMPLETE, {
            renderId: result.renderId,
            time: performance.now() - startTime,
          });
          break;

        default:
          this.log(`폴백 모드에서 지원하지 않는 명령: ${command.type}`);
          break;
      }

      return result as T;
    } catch (error) {
      this.error("폴백 명령 실행 실패:", error);
      throw error;
    }
  }

  /**
   * 워커 메시지 핸들러
   * @private
   * @param event 메시지 이벤트
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const message = event.data as WorkerMessage;

    if (!message || !message.type) {
      return;
    }

    switch (message.type) {
      case WorkerMessageType.RESPONSE:
      case "response":
        this.handleCommandResponse(message);
        break;

      case WorkerMessageType.EVENT:
      case "event":
        this.handleWorkerEvent(message);
        break;

      case WorkerMessageType.ERROR:
      case "error":
        this.error("워커 오류:", message.data);
        this.emit("error", message.data);
        break;
    }
  }

  /**
   * 명령 응답 처리
   * @private
   * @param message 워커 메시지
   */
  private handleCommandResponse(message: WorkerMessage): void {
    const pendingCommand = this.pendingCommands.get(message.id!);

    if (!pendingCommand) {
      return;
    }

    this.pendingCommands.delete(message.id!);

    const { success, data, error } = message.data;

    if (success) {
      pendingCommand.resolve(data);
    } else {
      pendingCommand.reject(new Error(error || "명령 실행 실패"));
    }
  }

  /**
   * 워커 이벤트 처리
   * @private
   * @param message 워커 메시지
   */
  private handleWorkerEvent(message: WorkerMessage): void {
    const event = message.data;

    if (!event || !event.type) {
      return;
    }

    // 이벤트 전달
    this.emit(event.type, event);
  }

  /**
   * 워커 오류 핸들러
   * @private
   * @param error 오류 이벤트
   */
  private handleWorkerError(error: ErrorEvent): void {
    this.error("워커 오류:", error);
    this.emit("error", error);
  }

  /**
   * 리사이즈 옵저버 설정
   * @private
   */
  private setupResizeObserver(): void {
    if (!this.canvas || typeof ResizeObserver === "undefined") {
      return;
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this.canvas) {
          const width = entry.contentRect.width;
          const height = entry.contentRect.height;

          this.resize(width, height).catch((err) => {
            this.error("리사이즈 실패:", err);
          });
        }
      }
    });

    this.resizeObserver.observe(this.canvas);
  }

  /**
   * 캔버스 크기 변경
   * @param width 새 너비 (픽셀)
   * @param height 새 높이 (픽셀)
   * @returns 크기 변경 결과
   */
  public async resize(width: number, height: number): Promise<any> {
    if (!this.worker || !this.workerReady || !this.canvasTransferred) {
      throw new Error("워커가 준비되지 않았습니다.");
    }

    const dpr = window.devicePixelRatio || 1;

    // 크기 변경 명령 생성
    const resizeCommand: CanvasResizeCommand = {
      id: this.generateCommandId(),
      type: CanvasCommandType.RESIZE,
      params: {
        width: Math.floor(width * dpr),
        height: Math.floor(height * dpr),
        devicePixelRatio: dpr,
      },
    };

    // 워커에 명령 전송
    return this.sendCommand(resizeCommand);
  }

  /**
   * 캔버스 지우기
   * @returns 지우기 결과
   */
  public async clear(): Promise<any> {
    return this.sendCommand({
      type: CanvasCommandType.CLEAR,
    });
  }

  /**
   * 렌더링 명령 전송
   * @param params 렌더링 매개변수
   * @returns 렌더링 결과
   */
  public async render(params?: any): Promise<any> {
    return this.sendCommand({
      type: CanvasCommandType.RENDER,
      params,
    });
  }

  /**
   * 애니메이션 시작
   * @param callback 애니메이션 프레임마다 호출될 콜백 함수
   */
  public startAnimation(
    callback: (timestamp: number) => CanvasCommand | null
  ): void {
    if (this.animationFrameId !== null) {
      this.stopAnimation();
    }

    this.animationCallback = callback;
    this.animationStartTime = performance.now();
    this.lastAnimationTimestamp = this.animationStartTime;

    this.animationLoop(this.animationStartTime);
  }

  /**
   * 애니메이션 루프
   * @private
   * @param timestamp 현재 타임스탬프
   */
  private animationLoop(timestamp: number): void {
    this.animationFrameId = requestAnimationFrame(
      this.animationLoop.bind(this)
    );

    const deltaTime = timestamp - this.lastAnimationTimestamp;
    this.lastAnimationTimestamp = timestamp;

    if (!this.animationCallback) {
      return;
    }

    // 콜백 실행하여 다음 명령 가져오기
    const command = this.animationCallback(timestamp - this.animationStartTime);

    if (command) {
      // 비동기로 명령 전송 (응답 대기 없음)
      this.sendCommand(command).catch((err) => {
        this.error("애니메이션 명령 실패:", err);
      });
    }
  }

  /**
   * 애니메이션 중지
   */
  public stopAnimation(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.animationCallback = null;
  }

  /**
   * 리소스 정리
   */
  public dispose(): void {
    // 애니메이션 중지
    this.stopAnimation();

    // 리사이즈 옵저버 정리
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // 워커 정리
    if (this.worker) {
      this.sendCommand({
        type: CanvasCommandType.DISPOSE,
      })
        .catch((err) => {
          this.error("워커 정리 실패:", err);
        })
        .finally(() => {
          this.worker?.terminate();
          this.worker = null;
        });
    }

    // 대기 명령 정리
    this.pendingCommands.forEach(({ reject }) => {
      reject(new Error("매니저가 정리되었습니다."));
    });
    this.pendingCommands.clear();

    // 이벤트 리스너 정리
    this.removeAllListeners();

    this.log("캔버스 매니저 정리 완료");
  }

  /**
   * 디버그 로그 출력
   * @private
   * @param message 로그 메시지
   * @param args 추가 매개변수
   */
  private log(message: string, ...args: any[]): void {
    if (this.options.debug) {
      console.log(`[OffscreenCanvasManager] ${message}`, ...args);
    }
  }

  /**
   * 오류 로그 출력
   * @private
   * @param message 오류 메시지
   * @param args 추가 매개변수
   */
  private error(message: string, ...args: any[]): void {
    console.error(`[OffscreenCanvasManager] ${message}`, ...args);
  }
}
