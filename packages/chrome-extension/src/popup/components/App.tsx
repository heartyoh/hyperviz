import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { WorkerMonitorLayout } from "../../common/layouts/WorkerMonitorLayout";
import { stateManager, workerConnector } from "../../common/services";
import "../../common/styles";
import "../styles/popup.css";

/**
 * 팝업 애플리케이션 컴포넌트
 */
export function App() {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // 초기화 및 URL 파라미터 확인
  useEffect(() => {
    const initPopup = async () => {
      try {
        // URL에서 tabId 파라미터 확인 (팝업이 별도 창으로 열렸을 때)
        const params = new URLSearchParams(window.location.search);
        const tabIdParam = params.get("tabId");

        if (tabIdParam) {
          const targetTabId = parseInt(tabIdParam, 10);
          if (!isNaN(targetTabId)) {
            // 지정된 탭으로 연결
            await workerConnector.connectToTab(targetTabId);
          }
        } else {
          // 현재 활성 탭 확인
          await workerConnector.detectActiveTab();
        }

        // 자동 연결 사용 여부 확인
        chrome.storage.local.get(["autoConnectPopup"], (result) => {
          if (result.autoConnectPopup) {
            workerConnector.connectToCurrentTab();
          }
        });

        setIsInitialized(true);
      } catch (error) {
        console.error("팝업 초기화 오류:", error);
        setIsInitialized(true); // 오류가 있어도 초기화 완료로 표시
      }
    };

    initPopup();

    // 사용자가 창을 닫을 때 연결 해제
    const handleBeforeUnload = () => {
      // 별도 창에서 열린 경우에만 연결 해제
      if (window.location.search.includes("tabId")) {
        workerConnector.disconnect();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // 연결 핸들러
  const handleConnect = async () => {
    try {
      await workerConnector.connectToCurrentTab();
      // 자동 연결 설정 저장
      chrome.storage.local.set({ autoConnectPopup: true });
    } catch (error) {
      console.error("연결 실패:", error);
    }
  };

  // 연결 해제 핸들러
  const handleDisconnect = async () => {
    try {
      await workerConnector.disconnect();
      // 자동 연결 설정 제거
      chrome.storage.local.remove(["autoConnectPopup"]);
    } catch (error) {
      console.error("연결 해제 실패:", error);
    }
  };

  if (!isInitialized) {
    return (
      <div className="popup-loading">
        <div className="loading-spinner"></div>
        <p>초기화 중...</p>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <WorkerMonitorLayout
        compact={true}
        showLogs={true}
        showControls={true}
        showStats={true}
        maxHeight="580px"
      />

      <div className="popup-footer">
        <p className="footer-text">HyperViz Worker Pool Monitor</p>
        <button
          className="help-button"
          onClick={() =>
            chrome.tabs.create({ url: "https://hyperviz.io/docs" })
          }
        >
          도움말
        </button>
      </div>
    </div>
  );
}
