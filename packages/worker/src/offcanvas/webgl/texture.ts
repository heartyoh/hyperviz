/**
 * WebGL 텍스처 관리 시스템
 * 텍스처 로딩, 생성 및 최적화를 위한 유틸리티 제공
 */

/**
 * 텍스처 옵션 인터페이스
 */
export interface TextureOptions {
  /** 너비 (이미지에서 자동 설정) */
  width?: number;
  /** 높이 (이미지에서 자동 설정) */
  height?: number;
  /** 내부 포맷 (WebGL2에서만 사용) */
  internalFormat?: number;
  /** 포맷 (gl.RGB, gl.RGBA 등) */
  format?: number;
  /** 타입 (gl.UNSIGNED_BYTE 등) */
  type?: number;
  /** 밉맵 생성 여부 */
  generateMipmap?: boolean;
  /** 매그니피케이션 필터 */
  magFilter?: number;
  /** 미니피케이션 필터 */
  minFilter?: number;
  /** 가로 랩 모드 */
  wrapS?: number;
  /** 세로 랩 모드 */
  wrapT?: number;
  /** 플립 Y 여부 */
  flipY?: boolean;
  /** 프리멀티플라이드 알파 */
  premultiplyAlpha?: boolean;
}

/**
 * 텍스처 로드 결과
 */
export interface TextureLoadResult {
  /** 성공 여부 */
  success: boolean;
  /** 텍스처 객체 (성공 시) */
  texture?: WebGLTexture;
  /** 너비 (성공 시) */
  width?: number;
  /** 높이 (성공 시) */
  height?: number;
  /** 에러 메시지 (실패 시) */
  errorMessage?: string;
}

/**
 * WebGL 텍스처 도우미 클래스
 */
export class TextureHelper {
  /** WebGL 컨텍스트 */
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  /** WebGL2 컨텍스트 여부 */
  private isWebGL2: boolean;
  /** 임시 캔버스 (텍스처 조작용) */
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  /** 텍스처 캐시 */
  private textureCache: Map<string, WebGLTexture> = new Map();
  /** 비동기 텍스처 로드 프로미스 */
  private loadingTextures: Map<string, Promise<TextureLoadResult>> = new Map();

  /**
   * 생성자
   * @param gl WebGL 렌더링 컨텍스트
   */
  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.gl = gl;
    this.isWebGL2 = "texStorage2D" in gl;

    // 텍스처 조작을 위한 캔버스 생성
    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(1, 1);
    } else {
      this.canvas = document.createElement("canvas");
      this.canvas.width = 1;
      this.canvas.height = 1;
    }
  }

  /**
   * 이미지 URL에서 텍스처 로드
   * @param url 이미지 URL
   * @param options 텍스처 옵션
   * @returns 텍스처 로드 결과 프로미스
   */
  async loadTexture(
    url: string,
    options: TextureOptions = {}
  ): Promise<TextureLoadResult> {
    // 이미 로딩 중인 텍스처면 기존 프로미스 반환
    if (this.loadingTextures.has(url)) {
      return this.loadingTextures.get(url)!;
    }

    // 캐시된 텍스처가 있으면 바로 반환
    if (this.textureCache.has(url)) {
      const texture = this.textureCache.get(url)!;
      return {
        success: true,
        texture,
        width: options.width || 0,
        height: options.height || 0,
      };
    }

    // 새 로딩 프로미스 생성
    const loadPromise = this.loadTextureInternal(url, options);
    this.loadingTextures.set(url, loadPromise);

    try {
      const result = await loadPromise;

      // 로딩 성공 시 캐시에 추가
      if (result.success && result.texture) {
        this.textureCache.set(url, result.texture);
      }

      this.loadingTextures.delete(url);
      return result;
    } catch (error) {
      this.loadingTextures.delete(url);
      return {
        success: false,
        errorMessage:
          error instanceof Error ? error.message : "알 수 없는 오류",
      };
    }
  }

  /**
   * 실제 텍스처 로딩 함수
   * @param url 이미지 URL
   * @param options 텍스처 옵션
   * @returns 텍스처 로드 결과 프로미스
   */
  private async loadTextureInternal(
    url: string,
    options: TextureOptions
  ): Promise<TextureLoadResult> {
    try {
      // 이미지 로딩
      const image = await this.loadImage(url);

      // 이미지로부터 텍스처 생성
      const textureOptions: TextureOptions = {
        ...options,
        width: image.width,
        height: image.height,
      };

      return this.createTextureFromImage(image, textureOptions);
    } catch (error) {
      return {
        success: false,
        errorMessage:
          error instanceof Error ? error.message : "알 수 없는 오류",
      };
    }
  }

  /**
   * 이미지 객체 로딩
   * @param url 이미지 URL
   * @returns 이미지 객체 프로미스
   */
  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous"; // CORS 지원

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`이미지 로딩 실패: ${url}`));

      image.src = url;
    });
  }

  /**
   * 이미지에서 텍스처 생성
   * @param image 이미지 소스
   * @param options 텍스처 옵션
   * @returns 텍스처 생성 결과
   */
  createTextureFromImage(
    image: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas,
    options: TextureOptions = {}
  ): TextureLoadResult {
    try {
      // 기본 옵션 설정
      const defaultOptions: TextureOptions = {
        format: this.gl.RGBA,
        type: this.gl.UNSIGNED_BYTE,
        generateMipmap: true,
        magFilter: this.gl.LINEAR,
        minFilter: this.gl.LINEAR_MIPMAP_LINEAR,
        wrapS: this.gl.CLAMP_TO_EDGE,
        wrapT: this.gl.CLAMP_TO_EDGE,
        flipY: true,
        premultiplyAlpha: false,
      };

      const finalOptions = { ...defaultOptions, ...options };

      // 텍스처 생성
      const texture = this.gl.createTexture();
      if (!texture) {
        throw new Error("텍스처를 생성할 수 없습니다.");
      }

      // 텍스처 바인딩
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

      // 픽셀 스토어 파라미터 설정
      this.gl.pixelStorei(
        this.gl.UNPACK_FLIP_Y_WEBGL,
        finalOptions.flipY ? 1 : 0
      );
      this.gl.pixelStorei(
        this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
        finalOptions.premultiplyAlpha ? 1 : 0
      );

      // 이미지 데이터 업로드
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        finalOptions.format!,
        finalOptions.format!,
        finalOptions.type!,
        image
      );

      // 밉맵 생성 (옵션에 따라)
      if (finalOptions.generateMipmap) {
        this.gl.generateMipmap(this.gl.TEXTURE_2D);
      }

      // 필터링 설정
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MAG_FILTER,
        finalOptions.magFilter!
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MIN_FILTER,
        finalOptions.minFilter!
      );

      // 랩 모드 설정
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_S,
        finalOptions.wrapS!
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_T,
        finalOptions.wrapT!
      );

      // 텍스처 바인딩 해제
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);

      // 이미지 크기 가져오기
      const width = "width" in image ? image.width : 0;
      const height = "height" in image ? image.height : 0;

      return {
        success: true,
        texture,
        width,
        height,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage:
          error instanceof Error ? error.message : "알 수 없는 오류",
      };
    }
  }

  /**
   * 빈 텍스처 생성
   * @param width 너비
   * @param height 높이
   * @param options 텍스처 옵션
   * @returns 텍스처 생성 결과
   */
  createEmptyTexture(
    width: number,
    height: number,
    options: TextureOptions = {}
  ): TextureLoadResult {
    try {
      // 기본 옵션 설정
      const defaultOptions: TextureOptions = {
        format: this.gl.RGBA,
        type: this.gl.UNSIGNED_BYTE,
        generateMipmap: false,
        magFilter: this.gl.LINEAR,
        minFilter: this.gl.LINEAR,
        wrapS: this.gl.CLAMP_TO_EDGE,
        wrapT: this.gl.CLAMP_TO_EDGE,
      };

      const finalOptions = { ...defaultOptions, ...options };

      // 텍스처 생성
      const texture = this.gl.createTexture();
      if (!texture) {
        throw new Error("텍스처를 생성할 수 없습니다.");
      }

      // 텍스처 바인딩
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

      // 빈 텍스처 데이터 업로드
      if (this.isWebGL2 && finalOptions.internalFormat) {
        // WebGL 2.0에서는 texStorage2D 사용 가능
        (this.gl as WebGL2RenderingContext).texStorage2D(
          this.gl.TEXTURE_2D,
          1,
          finalOptions.internalFormat,
          width,
          height
        );
      } else {
        // WebGL 1.0에서는 null 데이터로 크기만 지정
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          0,
          finalOptions.format!,
          width,
          height,
          0,
          finalOptions.format!,
          finalOptions.type!,
          null
        );
      }

      // 필터링 설정
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MAG_FILTER,
        finalOptions.magFilter!
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MIN_FILTER,
        finalOptions.minFilter!
      );

      // 랩 모드 설정
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_S,
        finalOptions.wrapS!
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_T,
        finalOptions.wrapT!
      );

      // 텍스처 바인딩 해제
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);

      return {
        success: true,
        texture,
        width,
        height,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage:
          error instanceof Error ? error.message : "알 수 없는 오류",
      };
    }
  }

  /**
   * 텍스처 삭제
   * @param texture 텍스처 객체
   */
  deleteTexture(texture: WebGLTexture): void {
    this.gl.deleteTexture(texture);

    // 캐시에서 제거
    for (const [url, cachedTexture] of this.textureCache.entries()) {
      if (cachedTexture === texture) {
        this.textureCache.delete(url);
        break;
      }
    }
  }

  /**
   * 모든 텍스처 삭제
   */
  deleteAllTextures(): void {
    for (const texture of this.textureCache.values()) {
      this.gl.deleteTexture(texture);
    }

    this.textureCache.clear();
  }
}
