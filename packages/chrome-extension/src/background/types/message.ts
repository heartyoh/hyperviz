/**
 * 메시지 관련 타입 정의
 */

// 메시지 응답 콜백
export type MessageResponse = (response?: any) => void;

// 메시지 인터페이스
export interface Message {
  type: string;
  tabId?: number;
  data?: any;
}

// 메시지 타입 열거형
export enum MessageType {
  CONNECT = "connect",
  DISCONNECT = "disconnect",
  FETCH_DATA = "fetch_worker_pool_data",
  UPDATE_SETTINGS = "update_settings",
  PING = "ping",
  CONTENT_SCRIPT_LOADED = "content_script_loaded",
  WORKER_POOL_DATA = "workerPoolData",
  DEVTOOLS_CONNECT_REQUEST = "devtools_connect_request",
  DEVTOOLS_FETCH_DATA = "devtools_fetch_data",
  DEVTOOLS_CREATE_MOCK_POOL = "devtools_create_mock_pool",
  DEVTOOLS_UPDATE_POOL_SETTINGS = "devtools_update_pool_settings",
  DEVTOOLS_TERMINATE_ALL_WORKERS = "devtools_terminate_all_workers",
  CHECK_WORKER_POOL_IN_PAGE = "check_worker_pool_in_page",
  GET_WORKER_POOL_DATA_FROM_PAGE = "get_worker_pool_data_from_page",
  GET_CURRENT_TAB_ID = "get_current_tab_id",
}
