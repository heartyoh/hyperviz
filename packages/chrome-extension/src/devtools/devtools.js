/**
 * HyperViz DevTools 확장 - 초기화 스크립트
 */

// 워커풀 모니터링 패널 생성
chrome.devtools.panels.create(
  "WorkerPool", // 패널 이름
  "/assets/icons/icon48.png", // 패널 아이콘
  "/devtools/panels/worker-pool-panel.html", // 패널 HTML 페이지
  (panel) => {
    console.log("HyperViz WorkerPool 패널이 생성되었습니다.");

    // 패널이 처음 표시될 때 이벤트
    panel.onShown.addListener((panelWindow) => {
      console.log("WorkerPool 패널이 표시되었습니다.");

      // 패널 창에 참조 전달 (있는 경우)
      if (panelWindow && panelWindow.initializePanel) {
        panelWindow.initializePanel();
      }
    });

    // 패널이 숨겨질 때 이벤트
    panel.onHidden.addListener(() => {
      console.log("WorkerPool 패널이 숨겨졌습니다.");
    });
  }
);

// 백그라운드 페이지와의 통신을 위한 포트 설정
let backgroundPageConnection = chrome.runtime.connect({
  name: "devtools-connection",
});

// 검사 중인 탭 ID 전송
backgroundPageConnection.postMessage({
  type: "devtools-init",
  tabId: chrome.devtools.inspectedWindow.tabId,
});

// 백그라운드로부터 메시지 수신
backgroundPageConnection.onMessage.addListener((message) => {
  // 메시지 처리 (데이터를 패널에 전달할 수 있음)
  console.log("DevTools가 백그라운드로부터 메시지를 수신했습니다:", message);
});

// 콘솔 패널에 메시지 기록
chrome.devtools.inspectedWindow.eval(
  "console.log('HyperViz DevTools 확장이 로드되었습니다.')",
  function (result, isException) {
    if (isException) {
      console.error("HyperViz DevTools 확장 로드 중 오류 발생");
    }
  }
);
