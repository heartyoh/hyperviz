/**
 * WebGL 버퍼 및 VAO 관련 타입 정의
 */

import { WebGLBufferType, WebGLBufferUsage } from '../types.js';

/**
 * 버퍼 생성 매개변수
 */
export interface BufferParams {
  /** 버퍼 ID */
  bufferId: string;
  /** 버퍼 타입 */
  type: WebGLBufferType;
  /** 데이터 */
  data: Float32Array | Uint16Array | Uint32Array;
  /** 사용법 */
  usage: WebGLBufferUsage;
}

/**
 * VAO 생성 매개변수
 */
export interface VAOParams {
  /** VAO ID */
  vaoId: string;
  /** 프로그램 ID */
  programId: string;
  /** 속성 설정 */
  attributes: Array<{
    /** 버퍼 ID */
    bufferId: string;
    /** 속성 이름 */
    name: string;
    /** 속성 크기 (요소 수) */
    size: number;
    /** 속성 타입 */
    type: "FLOAT" | "INT";
    /** 정규화 여부 */
    normalized?: boolean;
    /** 스트라이드 */
    stride?: number;
    /** 오프셋 */
    offset?: number;
  }>;
  /** 인덱스 버퍼 ID (선택적) */
  indexBufferId?: string;
} 