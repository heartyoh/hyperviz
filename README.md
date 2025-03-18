# Visualizer 모노리포

`visualizer`는 Yarn Workspaces와 Lerna를 사용하여 구성된 모노리포 프로젝트입니다.

## 구조

```
visualizer/
├── packages/            # 모든 패키지가 저장되는 디렉토리
│   └── animation/       # animation 패키지
├── package.json         # 루트 package.json (workspaces 설정 포함)
├── lerna.json           # Lerna 설정
└── yarn.lock            # 의존성 잠금 파일
```

## 시작하기

### 의존성 설치

```bash
yarn install
```

### 모든 패키지 빌드

```bash
yarn build
```

### 모든 패키지 테스트

```bash
yarn test
```

## 새 패키지 추가하기

새 패키지를 추가하려면:

```bash
mkdir packages/new-package
cd packages/new-package
# package.json 생성 및 설정
```

## 패키지간 의존성

한 패키지가 다른 패키지에 의존할 경우:

```bash
yarn workspace @things-scene/new-package add @things-scene/animation
```

## Lerna 명령어

### 버전 관리

```bash
yarn lerna version
```

### 패키지 게시

```bash
yarn lerna publish
```
