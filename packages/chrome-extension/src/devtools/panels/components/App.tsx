import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { WorkerMonitorLayout } from "../../../common/layouts/WorkerMonitorLayout";
import { stateManager, workerConnector } from "../../../common/services";
import { PopupActions } from "../../../devtools/panels/components/PopupActions";
import "../../../common/styles";

/**
 * DevTools 패널 메인 애플리케이션 컴포넌트
 */
export function App() {
  const [connected, setConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [tabId, setTabId] = useState<number | null>(null);

  // 상태 초기화 및 구독
  useEffect(() => {
    // 상태 구독
    const handleStateUpdate = (state: any) => {
      setConnected(state.connected);
      setConnecting(state.connecting);
      setTabId(state.currentTabId);
    };

    stateManager.subscribe("devtools-app", handleStateUpdate);

    // DevTools에서는 inspectedWindow.tabId를 사용하여 현재 탭 ID 직접 가져오기
    const getCurrentTab = async () => {
      try {
        // DevTools 환경에서는 chrome.devtools.inspectedWindow.tabId 사용
        if (chrome.devtools && chrome.devtools.inspectedWindow) {
          const inspectedTabId = chrome.devtools.inspectedWindow.tabId;
          console.log(
            `[HyperViz] DevTools에서 가져온 검사 중인 탭 ID: ${inspectedTabId}`
          );

          if (typeof inspectedTabId === "number" && inspectedTabId > 0) {
            setTabId(inspectedTabId);

            // 자동 연결 시도 (세션 스토리지 확인)
            chrome.storage.session.get(["autoConnectDevTools"], (result) => {
              if (result.autoConnectDevTools) {
                handleConnect();
              }
            });
          } else {
            console.error(
              "[HyperViz] 유효하지 않은 검사 탭 ID:",
              inspectedTabId
            );
          }
        } else {
          // 폴백: DevTools API를 사용할 수 없는 경우 기존 방식 사용
          const currentTabId = await workerConnector.getCurrentTabId();
          if (currentTabId) {
            console.log(
              `[HyperViz] 폴백 방식으로 가져온 탭 ID: ${currentTabId}`
            );
            setTabId(currentTabId);

            // 자동 연결 시도 (세션 스토리지 확인)
            chrome.storage.session.get(["autoConnectDevTools"], (result) => {
              if (result.autoConnectDevTools) {
                handleConnect();
              }
            });
          }
        }
      } catch (error) {
        console.error("[HyperViz] 탭 ID 가져오기 실패:", error);
      }
    };

    getCurrentTab();

    // 주기적으로 데이터 새로고침
    const refreshInterval = setInterval(() => {
      if (connected) {
        workerConnector.requestWorkerData();
      }
    }, 3000);

    return () => {
      stateManager.unsubscribe("devtools-app");
      clearInterval(refreshInterval);
    };
  }, [connected]);

  // 워커풀 연결
  const handleConnect = async () => {
    setConnecting(true);
    try {
      if (!tabId) {
        console.error("[HyperViz] 유효한 탭 ID가 없습니다");
        throw new Error("유효한 탭 ID가 없습니다");
      }

      console.log(`[HyperViz] 탭 ${tabId}에 연결 시도 중...`);

      // 확장 프로그램 컨텍스트 유효성 검증
      try {
        if (!chrome.runtime || chrome.runtime.id === undefined) {
          throw new Error("Extension context invalidated");
        }
      } catch (contextError) {
        console.error("[HyperViz] 확장 프로그램 컨텍스트 오류:", contextError);
        throw new Error(
          "확장 프로그램 컨텍스트가 무효화되었습니다. 페이지를 새로고침하세요."
        );
      }

      // 페이지 준비 상태 확인
      if (chrome.devtools && chrome.devtools.inspectedWindow) {
        try {
          await new Promise<void>((resolve, reject) => {
            chrome.devtools.inspectedWindow.eval(
              "window.document.readyState",
              (result, exceptionInfo) => {
                if (exceptionInfo || result !== "complete") {
                  reject(new Error("검사 중인 페이지가 준비되지 않았습니다."));
                  return;
                }
                console.log("[HyperViz] 페이지 준비 상태: complete");
                resolve();
              }
            );
          });

          // 페이지에 워커풀이 있는지 확인 - 디버깅
          await new Promise<void>((resolve) => {
            chrome.devtools.inspectedWindow.eval(
              "typeof window.hyperVizWorkerPool !== 'undefined'",
              (result, exceptionInfo) => {
                console.log(
                  `[HyperViz] 페이지에 워커풀 존재 여부: ${result}`,
                  exceptionInfo
                );
                resolve();
              }
            );
          });
        } catch (evalError) {
          console.error(
            "[HyperViz] 검사 중인 페이지 상태 확인 실패:",
            evalError
          );
          // 계속 진행: 오류가 있어도 연결은 시도
        }
      }

      // 연결 시도
      const diagnosticInfo = { tabId, context: "devtools" };
      console.log("[HyperViz] 연결 시도 전 진단 정보:", diagnosticInfo);

      const connected = await workerConnector.connectToTab(tabId);

      if (connected) {
        // 자동 연결 설정 저장
        chrome.storage.session.set({ autoConnectDevTools: true });
        console.log(`[HyperViz] 탭 ${tabId}에 성공적으로 연결됨`);
      } else {
        throw new Error(
          "워커풀 연결에 실패했습니다. 워커풀이 웹 페이지에 존재하는지 확인하세요."
        );
      }
    } catch (error) {
      console.error("[HyperViz] 워커풀 연결 실패:", error);

      // 연결 상태 초기화
      setConnecting(false);
      setConnected(false);

      // 오류 메시지 추출
      let errorMessage = "알 수 없는 오류";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error && typeof error === "object") {
        errorMessage = JSON.stringify(error);
      }

      // 특정 오류에 대한 사용자 친화적인 메시지
      if (errorMessage.includes("Extension context invalidated")) {
        errorMessage =
          "확장 프로그램 컨텍스트가 무효화되었습니다. 페이지를 새로고침하세요.";
      } else if (errorMessage.includes("message port closed")) {
        errorMessage =
          "통신 채널이 닫혔습니다. 페이지를 새로고침하거나 확장 프로그램을 다시 로드하세요.";
      } else if (errorMessage.includes("Could not establish connection")) {
        errorMessage =
          "연결을 설정할 수 없습니다. 페이지에 워커풀이 있는지 확인하세요.";
      }

      // 진단 정보 포함
      const diagnosticInfo = {
        tabId,
        runtimeId: chrome.runtime?.id,
        isDevTools: !!chrome.devtools,
        timestamp: new Date().toISOString(),
      };

      // 오류 메시지 표시
      alert(
        `연결 실패: ${errorMessage}\n\n진단 정보: ${JSON.stringify(
          diagnosticInfo
        )}`
      );

      // 테스트 워커풀 주입 제안 (개발 환경에서만)
      if (confirm("테스트 워커풀을 페이지에 주입하시겠습니까? (디버깅 용도)")) {
        try {
          // tabId가 null이 아님을 확인
          if (tabId === null) {
            throw new Error("유효한 탭 ID가 없습니다");
          }

          await new Promise<void>((resolve, reject) => {
            chrome.tabs.sendMessage(
              tabId,
              { type: "inject_test_worker_pool", timestamp: Date.now() },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "[HyperViz] 테스트 워커풀 주입 실패:",
                    chrome.runtime.lastError
                  );
                  reject(new Error(chrome.runtime.lastError.message));
                  return;
                }
                console.log("[HyperViz] 테스트 워커풀 주입 응답:", response);
                resolve();
              }
            );
          });

          alert("테스트 워커풀이 주입되었습니다. 다시 연결을 시도하세요.");
        } catch (injectError) {
          console.error("[HyperViz] 테스트 워커풀 주입 중 오류:", injectError);
          alert(
            `테스트 워커풀 주입 실패: ${
              injectError instanceof Error
                ? injectError.message
                : "알 수 없는 오류"
            }`
          );
        }
      }
    } finally {
      // 연결 중 상태 종료
      setConnecting(false);
    }
  };

  // 워커풀 연결 해제
  const handleDisconnect = async () => {
    try {
      // 확장 프로그램 컨텍스트 확인
      if (!chrome.runtime || chrome.runtime.id === undefined) {
        throw new Error("확장 프로그램 컨텍스트가 무효화되었습니다.");
      }

      await workerConnector.disconnect();
      // 자동 연결 설정 제거
      chrome.storage.session.remove(["autoConnectDevTools"]);
    } catch (error) {
      console.error("[HyperViz] 워커풀 연결 해제 실패:", error);

      // 연결이 이미 끊어진 경우 UI 상태 업데이트
      setConnected(false);

      let errorMessage =
        error instanceof Error ? error.message : "알 수 없는 오류";
      if (errorMessage.includes("Extension context invalidated")) {
        alert(
          "확장 프로그램 컨텍스트가 무효화되었습니다. 페이지를 새로고침하세요."
        );
      }
    }
  };

  // 팝업 관련 핸들러
  const handleOpenPopup = () => {
    console.log("팝업이 열렸습니다.");
  };

  const handleCopyLink = () => {
    console.log("링크가 복사되었습니다.");
  };

  return (
    <div class="devtools-panel">
      <div class="devtools-header">
        <h1 class="devtools-title">HyperViz 워커풀 모니터링</h1>
        <div class="devtools-actions">
          <PopupActions
            onOpenPopup={handleOpenPopup}
            onCopyLink={handleCopyLink}
          />
        </div>
      </div>

      <WorkerMonitorLayout
        showLogs={true}
        showControls={true}
        showStats={true}
        maxHeight="calc(100vh - 80px)"
      />
    </div>
  );
}
