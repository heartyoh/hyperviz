# HyperViz 확장 프로그램 모듈 개발 가이드

이 문서는 HyperViz 크롬 확장 프로그램을 위한 새 모듈을 개발하는 방법을 설명합니다.

## 목차

1. [모듈 아키텍처 개요](#모듈-아키텍처-개요)
2. [모듈 개발 시작하기](#모듈-개발-시작하기)
3. [핵심 API 참조](#핵심-api-참조)
4. [모듈 등록 및 통합](#모듈-등록-및-통합)
5. [모듈 간 통신](#모듈-간-통신)
6. [모범 사례](#모범-사례)

## 모듈 아키텍처 개요

HyperViz 크롬 확장 프로그램은 플러그인 아키텍처를 기반으로 합니다. 각 모듈은 독립적인 기능 단위로, 다음 주요 부분으로 구성됩니다:

1. **모듈 매니페스트**: 모듈 이름, 버전, 의존성 등 메타데이터
2. **백그라운드 스크립트**: 백그라운드에서 실행되는 모듈 로직
3. **콘텐츠 스크립트**: 웹 페이지에 삽입되는 모듈 로직
4. **UI 컴포넌트**: 확장 프로그램 팝업에 표시되는 사용자 인터페이스

모든 모듈은 코어 프레임워크를 통해 등록되고 통신합니다.

## 모듈 개발 시작하기

### 1. 모듈 폴더 구조 생성

```
src/modules/your-module-name/
├── manifest.json       # 모듈 메타데이터
├── background/         # 백그라운드 스크립트
│   └── index.ts
├── content/            # 콘텐츠 스크립트
│   └── index.ts
├── components/         # UI 컴포넌트
│   ├── Main.tsx        # 메인 UI 컴포넌트
│   └── ...
└── utils/              # 유틸리티 함수
    └── ...
```

### 2. 모듈 매니페스트 정의

`manifest.json` 파일에 모듈에 대한 기본 정보를 정의합니다:

```json
{
  "name": "your-module-name",
  "displayName": "모듈 표시 이름",
  "version": "0.1.0",
  "description": "모듈 설명",
  "icon": "icon.svg",
  "entryPoints": {
    "background": "./background/index.ts",
    "content": "./content/index.ts",
    "ui": "./components/Main.tsx"
  },
  "permissions": ["storage"],
  "dependencies": []
}
```

### 3. 모듈 등록

백그라운드 스크립트에서 모듈을 등록합니다:

```typescript
// background/index.ts
import { registerModule } from "../../core/registry";

class YourModuleBackground {
  initialize() {
    console.log("모듈 초기화됨");

    // 모듈 이벤트 리스너 설정
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.module !== "your-module-name") return false;

      // 메시지 처리
      if (message.type === "yourAction") {
        // 작업 수행
        sendResponse({ success: true });
        return true;
      }

      return false;
    });
  }
}

// 모듈 등록
registerModule("your-module-name", new YourModuleBackground());
```

### 4. UI 컴포넌트 개발

```tsx
// components/Main.tsx
import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useModuleContext } from "../../core/context";

export function Main() {
  const [data, setData] = useState(null);
  const { sendMessage } = useModuleContext("your-module-name");

  useEffect(() => {
    // 초기 데이터 로드
    sendMessage({ type: "getData" }).then((response) => {
      setData(response.data);
    });
  }, []);

  return (
    <div className="your-module">
      <h2>모듈 UI</h2>
      {/* 모듈 UI 컴포넌트 */}
    </div>
  );
}
```

## 핵심 API 참조

### 모듈 등록

```typescript
import { registerModule } from '../../core/registry';
registerModule(name: string, instance: any, options?: ModuleOptions);
```

### 메시지 전송

```typescript
import { sendModuleMessage } from '../../core/messaging';
sendModuleMessage(moduleName: string, message: any): Promise<any>;
```

### 모듈 설정 저장/로드

```typescript
import { saveModuleSettings, loadModuleSettings } from '../../core/storage';
saveModuleSettings(moduleName: string, settings: any): Promise<void>;
loadModuleSettings(moduleName: string): Promise<any>;
```

### UI 컨텍스트 훅

```typescript
import { useModuleContext } from '../../core/context';
const { sendMessage, settings, isActive } = useModuleContext(moduleName: string);
```

## 모듈 등록 및 통합

모듈을 개발한 후에는 확장 프로그램 코어에 등록해야 합니다. `src/core/modules.ts` 파일에 모듈을 추가합니다:

```typescript
// 모듈 가져오기
import "./modules/worker-pool/background";
import "./modules/your-module-name/background";

// 모듈 UI 컴포넌트 등록
import { WorkerPoolMonitor } from "./modules/worker-pool/components/Main";
import { YourModuleUI } from "./modules/your-module-name/components/Main";

export const moduleUIComponents = {
  "worker-pool": WorkerPoolMonitor,
  "your-module-name": YourModuleUI,
};
```

## 모듈 간 통신

모듈 간 통신은 메시징 시스템을 통해 이루어집니다:

```typescript
import { sendModuleMessage } from "../../core/messaging";

// 다른 모듈에 메시지 전송
sendModuleMessage("other-module", {
  type: "someAction",
  data: {
    /* ... */
  },
}).then((response) => {
  console.log("응답:", response);
});
```

## 모범 사례

1. **모듈 격리**: 각 모듈은 독립적으로 동작해야 합니다.
2. **공유 코드 최소화**: 공유 코드는 코어 라이브러리에 배치합니다.
3. **모듈 크기 최적화**: 필요한 기능만 포함하여 확장 프로그램 크기를 최소화합니다.
4. **모듈 문서화**: 각 모듈에 대한 문서를 작성합니다.
5. **오류 처리**: 모든 비동기 작업과 메시지 처리에 적절한 오류 처리를 포함합니다.
6. **테스트**: 각 모듈에 대한 단위 테스트와 통합 테스트를 작성합니다.

---

추가적인 질문이나 도움이 필요한 경우 HyperViz 팀에 문의하세요.
