/** @jsxImportSource preact */
import { h, render } from "preact";
import { App } from "./components/App";
import "./styles/devtools.scss";

// DevTools 패널 초기화 함수
function initializePanel() {
  render(<App />, document.getElementById("app")!);
}

// 패널 초기화 함수를 전역 객체에 할당하여 HTML에서 접근할 수 있도록 함
(window as any).initializePanel = initializePanel;

// 페이지가 로드되면 자동으로 앱 렌더링
if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  initializePanel();
} else {
  document.addEventListener("DOMContentLoaded", initializePanel);
}
