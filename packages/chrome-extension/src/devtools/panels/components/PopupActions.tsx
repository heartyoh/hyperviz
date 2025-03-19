import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { stateManager } from "../../../common/services";

interface PopupActionsProps {
  onOpenPopup?: () => void;
  onCopyLink?: () => void;
}

/**
 * 팝업 액션 컴포넌트
 *
 * 현재 탭에서 워커풀 정보를 팝업으로 열고 다른 기능을 실행하는 액션 버튼 제공
 */
export function PopupActions({ onOpenPopup, onCopyLink }: PopupActionsProps) {
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);

  useEffect(() => {
    const state = stateManager.getState();
    setCurrentTabId(state.currentTabId);
  }, []);

  const handleOpenPopup = async () => {
    if (!currentTabId) return;

    const popupUrl = chrome.runtime.getURL("popup.html");
    const url = new URL(popupUrl);
    url.searchParams.set("tabId", currentTabId.toString());

    await chrome.windows.create({
      url: url.toString(),
      type: "popup",
      width: 800,
      height: 600,
    });

    onOpenPopup?.();
  };

  const handleCopyLink = async () => {
    if (!currentTabId) return;

    const popupUrl = chrome.runtime.getURL("popup.html");
    const url = new URL(popupUrl);
    url.searchParams.set("tabId", currentTabId.toString());

    await navigator.clipboard.writeText(url.toString());
    onCopyLink?.();
  };

  return (
    <div class="popup-actions">
      <button
        class="action-btn"
        onClick={handleOpenPopup}
        disabled={!currentTabId}
      >
        팝업으로 열기
      </button>
      <button
        class="action-btn"
        onClick={handleCopyLink}
        disabled={!currentTabId}
      >
        링크 복사
      </button>
    </div>
  );
}
