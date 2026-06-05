
# AI Flow Debug Agent UI

## 프로젝트 목적

이 프로젝트는 Electron 앱 안에서 회사 웹서비스를 실행하고, 사용자가 지정한
시작 지점부터 종료 지점까지 JavaScript 함수 흐름, 전달 파라미터, API
요청/응답, console error를 수집한 뒤 AI가 원인 분석과 디버깅 가이드를
제공하는 개발자용 디버깅 Agent UI를 만드는 것이 목적입니다.

초기 디자인 시안은 Figma에서 생성된 React/Vite UI를 기반으로 합니다.
https://www.figma.com/design/mGm2O6Ze8HcfTKeXfmVuxY/AI-Flow-Debug-Agent-UI

## 개발 스텝

1. UI 프로토타입을 실제 동작하는 React 상태 기반 화면으로 전환
2. Trace session 모델과 더미 데이터 구성
3. Start Trace / Stop Trace 흐름 구현
4. Console error 수집 기능 구현
5. API 요청/응답 수집 기능 구현
6. Timeline에서 function call, API call, error를 하나의 흐름으로 통합
7. SDK 기반 함수 trace 기능 구현
8. AI 분석 MVP 구현
9. Export / Report / Open in Editor 같은 개발자 액션 추가
10. Electron WebView 연동 및 자동 instrumentation 고도화

## 실행 방법

의존성 설치:

```bash
npm install
```

개발 서버 실행:

```bash
npm run dev
```

Electron 환경에서 실제 사이트 테스트:

```bash
npm run electron:dev
```

실행하면 터미널에서 디버깅 브라우저 런타임을 선택합니다. 숫자를 입력하지 않고
방향키 `↑` / `↓`로 이동한 뒤 Enter로 선택합니다. 현재 선택된 항목은 글자색으로
강조됩니다.

선택 목록에는 Electron 버전과 해당 Electron에 포함된 Chromium 버전이 함께 표시됩니다.
현재 제공하는 관리형 후보는 Electron 43 alpha/42/41/40/39/38이며, 각각 Chromium
149/148/146/144/142/140 계열을 사용합니다. 프로젝트에 이미 설치된 Electron 버전은
중복 항목 없이 해당 후보에서 바로 재사용하고, 로컬에 없는 버전은 다운로드 여부를 한 번 더
물어본 뒤 승인 시 `.debug-browser-runtimes/`에 설치해 실행합니다.

AI 분석을 사용하려면 프로젝트 루트의 `.env` 또는 `.env.local`에 OpenAI API 설정을
추가합니다.

```bash
OPENAI_API_KEY=발급받은_API_키
# 선택 사항
OPENAI_MODEL=gpt-4.1-mini
```

API 키는 renderer 화면에 노출하지 않고 Electron main process에서만 읽습니다. 키가
없거나 호출에 실패하면 분석 카드에 OpenAI 오류 메시지를 표시합니다.

현재 기본 테스트 URL은 `https://ims.hwgeneralins.com/general/jsp/smartScanner.jsp`입니다. 일반 브라우저의 iframe은
외부 사이트 보안 정책 때문에 막힐 수 있으므로, 실제 사이트 테스트는 Electron
webview 환경에서 진행합니다.

프로덕션 빌드:

```bash
npm run build
```

## 개발 기록

### 2026-05-07

오늘은 첫 번째 개발 단계인 "UI 프로토타입을 실제 동작하는 상태 기반 화면으로
전환"하는 작업을 진행했습니다.

완료된 기능:

- 프로젝트 의존성을 `npm install`로 설치하고 `package-lock.json`을 생성했습니다.
- Trace session 타입과 재사용 가능한 데모 trace 데이터를
  `src/app/lib/trace-data.ts`에 추가했습니다.
- 상단 URL 입력값을 React state와 연결했습니다.
- `Start Trace` / `Stop` 버튼이 실제 trace 상태를 변경하도록 구현했습니다.
- trace 기록 중에는 브라우저 영역에 `Recording` 배지가 표시되도록 했습니다.
- `Stop`을 누르면 데모 trace 결과가 화면에 채워지도록 연결했습니다.
- trace header의 duration, error count, API call count가 trace 데이터 기반으로
  표시되도록 변경했습니다.
- Analysis Panel의 Flow Graph, Timeline, Errors, API Calls, AI Insights 탭이
  하드코딩된 값이 아니라 trace session 데이터를 렌더링하도록 변경했습니다.
- trace 데이터가 없을 때 각 탭에 빈 상태 안내 메시지가 보이도록 추가했습니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.
- 로컬 개발 서버를 `http://127.0.0.1:5173/`에서 실행했습니다.

추가 작업:

- 실제 사이트 테스트를 위해 Electron 개발 실행 환경을 추가했습니다.
- `electron/main.cjs`, `electron/preload.cjs`, `scripts/electron-dev.cjs`를
  추가했습니다.
- `npm run electron:dev` 스크립트를 추가했습니다.
- 기본 테스트 URL을 `https://www.naver.com`으로 변경했습니다.
- BrowserView를 Electron 환경에서는 실제 `webview`로 렌더링하고, 일반 브라우저
  환경에서는 Electron 실행 안내를 보여주도록 변경했습니다.

Console error 수집 작업:

- Electron `webview`의 `did-start-loading`, `did-stop-loading`,
  `did-fail-load`, `console-message` 이벤트를 수집하도록 연결했습니다.
- `Start Trace` 이후 발생한 page load 이벤트를 Timeline에 기록하도록
  구현했습니다.
- `console-message` 중 error level 이벤트를 Errors 탭과 Timeline에 기록하도록
  구현했습니다.
- `Stop`을 누르면 더 이상 데모 데이터를 덮어쓰지 않고, 실제 수집된 trace
  session을 completed 상태로 유지하도록 변경했습니다.

현재 단계 UI 정리 및 브라우저 컨트롤 수정:

- 현재 수집 검증 단계에서 필요 없는 Projects, Export, Data Masking, Flow Graph,
  API Calls, AI Insights UI를 제거했습니다.
- 화면을 URL 입력/Start Trace/Stop, 실제 webview, Timeline, Console Errors 중심으로
  단순화했습니다.
- URL 입력은 타이핑 즉시 이동하지 않고 Enter 또는 이동 버튼으로 이동하도록
  변경했습니다.
- webview 새로고침 버튼이 실제 `reload()`를 호출하도록 수정했습니다.
- 뒤로가기, 앞으로가기, 홈 버튼을 실제 webview navigation API에 연결했습니다.
- 새 탭/새 창 링크가 외부 창으로 튀는 상황에 대비해 webview `new-window`
  이벤트를 같은 webview 안에서 열도록 처리하고, Electron main process에서도
  미처리 popup을 차단하도록 보강했습니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.

흰 화면 문제 수정:

- Electron `webview`가 `dom-ready` 되기 전에 `getURL()`, `canGoBack()`,
  `canGoForward()` 같은 API를 호출하면서 React 렌더러가 크래시하던 문제를
  수정했습니다.
- webview 준비 상태를 추적하고, 준비 전에는 navigation API를 호출하지 않도록
  방어 코드를 추가했습니다.
- `https://www.naver.com`과 `https://www.naver.com/`처럼 같은 URL이지만 표기가
  다른 경우 중복 `loadURL()`이 발생하지 않도록 URL 비교를 정규화했습니다.
- `5173` 포트가 이미 사용 중일 때 Electron 개발 앱이 실패하지 않도록 빈 포트를
  자동으로 찾아 실행하도록 `scripts/electron-dev.cjs`를 수정했습니다.
- `npm run build`로 빌드가 정상 통과하는 것을 다시 확인했습니다.

페이지 이동 문제 수정:

- webview의 `src` 속성은 최초 로드에만 사용하고, 이후 URL 입력/페이지 이동은
  `loadURL()`과 webview navigation 이벤트로만 처리하도록 변경했습니다.
- 페이지가 이동하면서 URL state가 갱신될 때 React가 `src` 속성을 다시 바꿔
  webview를 중복 로드하던 문제를 제거했습니다.
- URL 입력 이동 요청이 webview `dom-ready` 이전에 발생해도 준비 이후 처리될 수
  있도록 webview ready 상태를 React state로 관리했습니다.
- 새 탭 링크는 Electron main process에서 외부 창을 열지 않고 현재 webview가
  해당 URL로 이동하도록 보강했습니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.

주소창 입력 개선:

- webview 브라우저 컨트롤 영역의 URL 표시부를 입력 가능한 주소창으로
  변경했습니다.
- 주소창에 URL을 입력한 뒤 Enter 또는 `Go` 버튼을 누르면 해당 주소로 이동하도록
  구현했습니다.
- 뒤로가기/앞으로가기/새로고침/홈 버튼이 주소창 form submit으로 오동작하지
  않도록 버튼 타입을 정리했습니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.

정확한 오류 수집 및 Electron 경고 정리:

- 다음 단계 작업으로 target page 내부에 webview preload script를 주입하는 구조를
  추가했습니다.
- `electron/target-preload.cjs`에서 `window.onerror`와 `unhandledrejection`을
  감지해 `[AI_FLOW_DEBUG:*]` 형식의 console error로 전달하도록 구현했습니다.
- renderer의 BrowserView에서 해당 메시지를 파싱해 `WindowError`,
  `UnhandledPromiseRejection`, `ConsoleError` 타입으로 구분해 Errors 탭에
  기록하도록 변경했습니다.
- Electron 개발 실행 시 `Electron Security Warning` 로그가 뜨지 않도록
  `ELECTRON_DISABLE_SECURITY_WARNINGS`를 설정했습니다.
- webview preload는 Electron 요구사항에 맞춰 `file://` URL로 전달하도록
  수정했습니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.

Network / API Params / Flow 추가:

- 오른쪽 분석 패널에 `Network`, `API Params`, `Flow` 탭을 추가했습니다.
- target page preload에서 `fetch`와 `XMLHttpRequest`를 감싸 method, URL, status,
  latency, request headers/body, response preview를 수집하도록 구현했습니다.
- 수집된 네트워크 이벤트를 trace session의 `apiCalls`와 Timeline에 누적하도록
  연결했습니다.
- `Network` 탭에서는 요청 목록, 상태, latency를 빠르게 볼 수 있도록 구성했습니다.
- `API Params` 탭에서는 요청 파라미터와 응답 preview를 JSON 형태로 확인할 수
  있도록 구성했습니다.
- `Flow` 탭에서는 page, API, error 이벤트가 발생한 순서대로 흐름을 볼 수 있도록
  구성했습니다.
- trace header에 request count를 추가했습니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.

Network/API 수집 누락 수정:

- Naver 같은 실제 사이트에서는 target page의 `fetch`/`XMLHttpRequest` wrapping만으로
  놓치는 요청이 많아 Electron main process의 `session.webRequest` 기반 수집을
  추가했습니다.
- `persist:debug-agent-target` webview session의 HTTP/HTTPS 요청을 수집해 renderer로
  전달하도록 `debug-agent:network-event` IPC 채널을 추가했습니다.
- renderer preload에서 `debugAgentRuntime.onNetworkEvent` API를 노출하고, App에서
  해당 이벤트를 기존 trace session의 `apiCalls`와 Flow/Timeline에 누적하도록
  연결했습니다.
- 수집 항목에는 method, URL, status, resourceType, latency, upload body 일부,
  cache 여부, IP 등이 포함됩니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.

Network/API/Flow 가시성 개선:

- Network 탭은 요청별 요약 리스트만 보여주도록 정리했습니다.
- API Params 탭은 상단에 요청 리스트를 두고, 선택한 요청 하나만 하단 상세 영역에서
  Request/Response JSON을 펼쳐 보도록 변경했습니다.
- Flow 탭도 이벤트 전체를 한꺼번에 펼치지 않고, 선택한 이벤트 하나만 상세 영역에서
  확인하도록 변경했습니다.
- 선택된 요청/이벤트는 강조 표시되도록 스타일을 추가했습니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.

디버깅 / 상세보기 영역 분리 및 리사이즈:

- 오른쪽 패널을 `디버깅` 영역과 `상세보기` 영역으로 분리했습니다.
- `디버깅` 영역에는 Timeline, Flow, Errors 탭만 두어 흐름 파악에 집중하도록
  정리했습니다.
- `상세보기` 영역에는 Network, API Detail, Event Detail 탭을 두어 선택한 요청
  또는 이벤트 하나만 자세히 확인하도록 변경했습니다.
- 브라우저 영역과 오른쪽 분석 패널 사이를 드래그로 리사이즈할 수 있게
  변경했습니다.
- 오른쪽 분석 패널 내부에서도 `디버깅` 영역과 `상세보기` 영역의 높이를
  드래그로 조절할 수 있게 변경했습니다.
- Network 리스트에서 요청을 클릭하면 자동으로 API Detail 탭으로 이동해 해당
  요청 상세를 보여주도록 구성했습니다.
- Timeline/Flow 이벤트를 클릭하면 Event Detail 탭에서 해당 이벤트 상세를 볼 수
  있도록 구성했습니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.

디버깅 탭 / 상세보기 동작 재정리:

- Network와 API 목록은 다시 위쪽 `디버깅` 영역의 탭으로 이동했습니다.
- 아래 `상세보기` 영역은 탭을 제거하고, 위에서 선택한 단일 요청 또는 이벤트의
  상세만 보여주도록 단순화했습니다.
- Network/API 항목을 클릭하면 아래 상세보기에서 해당 요청의 Request/Response를
  확인할 수 있습니다.
- Timeline/Flow 이벤트를 클릭하면 아래 상세보기에서 해당 이벤트의 상세 정보를
  확인할 수 있습니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.

API 탭 제거 및 함수 흐름/파라미터 수집 추가:

- Network와 API가 같은 데이터를 보여주고 있어 중복되는 API 탭을 제거했습니다.
- Electron `webRequest` 기반 요청은 응답 body를 제공하지 않기 때문에, 상세보기의
  webRequest 응답은 `Response Metadata`로 명확히 표시하도록 변경했습니다.
- fetch/XHR hook에서 잡힌 요청은 가능한 경우 response body preview를 계속
  표시합니다.
- Network 목록의 URL이 앞부분만 보이며 구분되지 않던 문제를 줄이기 위해,
  hostname보다 path tail과 query 일부를 더 눈에 띄게 표시하도록 변경했습니다.
- target page preload에서 `addEventListener`를 wrapping해 click/input/submit 같은
  이벤트 핸들러 실행을 함수 흐름으로 수집하도록 구현했습니다.
- Flow 탭은 이제 page/network 이벤트가 아니라 함수 흐름 중심으로 표시합니다.
- 함수 상세보기에서는 function name, event type, target selector, value/key/href 등
  파라미터 정보를 JSON으로 확인할 수 있습니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.

Flow 수집 보강 및 인라인 상세보기 전환:

- Flow 탭이 비어 보이는 문제를 줄이기 위해 target page에서 발생하는 `click`,
  `input`, `change`, `submit`, `keydown` 이벤트를 capture 단계에서 추가 수집하도록
  보강했습니다.
- 이벤트 핸들러 wrapping으로 잡히지 않는 단순 사용자 동작도 함수 흐름 후보로
  기록되도록 변경했습니다.
- 별도의 `상세보기` 영역을 제거하고, Timeline/Network/Flow 항목을 클릭하면 해당
  항목 아래에서 바로 상세 정보가 펼쳐지도록 UI를 단순화했습니다.
- 오른쪽 패널은 Timeline, Network, Flow, Errors 탭만 유지합니다.
- Network 항목은 요청 경로와 query 일부가 먼저 보이도록 정리해, 같은 도메인의
  요청도 목록에서 더 쉽게 구분할 수 있게 했습니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.

함수 단위 Flow 수집 방향 수정:

- 기존 Flow가 사용자 `click`/`input` 이벤트 위주로 쌓이던 문제를 확인하고,
  원하는 목적에 맞게 "어떤 파일의 어떤 함수가 어떤 파라미터로 실행됐는지"를
  수집하는 방향으로 수정했습니다.
- Electron webview preload에서 대상 페이지에 `window.__AI_FLOW_DEBUG__` SDK를
  주입하도록 구현했습니다.
- 대상 서비스 코드에서 `window.__AI_FLOW_DEBUG__.traceFunction(...)`으로 함수를
  감싸면 함수명, source file, line, column, parameters, return value, error,
  duration을 Flow 탭에 기록할 수 있습니다.
- 단순 전역 click/input capture는 제거해 Flow가 사용자 이벤트 목록으로 오염되지
  않도록 정리했습니다.
- Flow UI는 `instrumented`, `manual`, `event-listener` call type을 구분하고,
  가능한 경우 코드 위치를 목록과 펼침 상세에 표시합니다.
- `npm run build`로 빌드가 정상 통과하는 것을 확인했습니다.

DevTools 방식 Flow 분석 기반 추가:

- 함수 Flow를 개발자도구와 같은 방식으로 분석하기 위해 Electron main process에서
  webview의 Chrome DevTools Protocol `Debugger`에 attach하는 구조를 추가했습니다.
- webview가 `dom-ready` 되면 renderer가 target `webContentsId`를 main process에
  전달하고, main process가 `Runtime.enable`, `Debugger.enable`,
  `Debugger.setPauseOnExceptions`를 설정합니다.
- target page가 `debugger` statement, breakpoint, uncaught exception 등으로
  pause되면 `Debugger.paused` 이벤트의 top call frame과 call stack을 읽어 Flow에
  기록합니다.
- pause된 call frame의 local scope와 closure scope를 `Runtime.getProperties`로
  조회해 파라미터/지역 변수 후보로 표시합니다.
- 이전에 Flow를 흐리게 만들던 전역 click/input 이벤트 자동 수집은 제거했습니다.
- 현재 단계에서는 DevTools처럼 "멈춘 지점"의 함수/파일/스코프를 가져오는
  기반이며, 다음 단계에서 UI에서 파일/라인 breakpoint 또는 logpoint를 지정하는
  기능을 추가할 예정입니다.
- `node --check electron/main.cjs`와 `npm run build`로 검증했습니다.

선택 구간 자동 Logpoint MVP:

- Flow 탭에 `선택 구간 Logpoint` 입력 UI를 추가했습니다.
- Electron main process가 CDP `Debugger.scriptParsed` 이벤트로 감지한 script 목록을
  renderer로 전달하고, Flow 탭에서 URL 일부를 선택/입력할 수 있게 했습니다.
- Flow 탭에서 감지된 스크립트 목록을 직접 보여주고, 스크립트를 클릭하면 해당
  script URL과 기본 라인 범위가 자동으로 입력되도록 개선했습니다.
- 스크립트 선택 영역의 글씨가 보이지 않던 문제를 해결하기 위해 Logpoint 패널을
  밝은 배경과 명확한 텍스트 색상으로 분리했습니다.
- 사용자가 어떤 순서로 조작해야 하는지 알 수 있도록 Logpoint 패널 상단에
  `1. 스크립트 선택`, `2. 라인 지정`, `3. 적용 후 실행` 단계를 표시했습니다.
- 스크립트를 선택하지 않은 상태에서는 `적용` 버튼이 비활성화되도록 했습니다.
- 스크립트를 선택하면 CDP `Debugger.getScriptSource`로 실제 코드를 불러와 라인
  번호와 함께 보여주도록 개선했습니다.
- 사용자가 라인 수를 직접 추측하지 않아도 되도록 코드 뷰어에서 라인을 클릭하면
  시작/종료 라인 범위가 자동으로 지정됩니다.
- 사용자가 script URL 일부와 시작/종료 라인을 입력하면
  `Debugger.setBreakpointByUrl`로 해당 라인 범위에 breakpoint 후보를 자동 적용합니다.
- breakpoint가 hit되면 앱은 pause된 call frame의 함수명, 파일, 라인, local scope,
  closure scope, call stack을 Flow에 기록하고 즉시 `Debugger.resume`을 호출합니다.
- Flow 상세에서 파라미터 정보를 JSON 원본만 보여주지 않고, `Local Variables /
  Parameters`, `Closure Variables`, `Call Stack` 영역으로 나누어 먼저 읽기 쉽게
  표시하도록 변경했습니다.
- 기존 breakpoint는 새 logpoint 적용 시 제거해 너무 많은 중복 pause가 쌓이지 않도록
  했습니다.
- 현재 MVP는 sourcemap 원본 파일 매핑 전 단계라, 우선 브라우저가 로드한 script URL
  또는 URL 일부 기준으로 동작합니다.
- `node --check electron/main.cjs`와 `npm run build`로 검증했습니다.

선택 구간 Logpoint 사용 방법:

1. `npm run electron:dev`로 Electron 앱을 실행합니다.
2. 대상 웹서비스 URL로 이동합니다.
3. Flow 탭에서 감지된 script 수가 표시될 때까지 페이지 로드를 기다립니다.
4. `선택 구간 Logpoint`에서 스크립트 목록을 검색하거나 원하는 스크립트를 클릭합니다.
5. 아래 코드 뷰어에서 실제 코드를 확인하고 원하는 라인을 클릭해 시작/종료 범위를
   선택합니다.
6. `적용`을 누릅니다.
7. `Start Trace`를 누른 뒤 페이지에서 해당 코드 경로가 실행되는 행동을 합니다.
8. breakpoint가 hit되면 Flow에 함수명, 파일, 라인, scope, call stack이 기록됩니다.

Flow Story View 고도화:

- Flow 탭을 단순 함수 프레임 목록에서 `Scenario Flow` 중심 화면으로 재구성했습니다.
- Timeline, 함수 frame, Network 요청, Console/Error 이벤트를 시간순으로 합쳐
  하나의 실행 시나리오 카드 흐름으로 보여줍니다.
- Flow 상단에 규칙 기반 진단 요약을 추가했습니다.
  - 실패한 API가 있으면 실패 요청과 직전 함수 파라미터 확인을 안내합니다.
  - 에러가 있으면 에러 직전 함수와 에러 위치를 함께 보도록 안내합니다.
- 각 Flow 카드에는 이벤트 종류별 시각 구분을 적용했습니다.
  - page/scenario
  - function
  - API
  - error
- 함수 카드에는 local 변수/파라미터 핵심값을 chip 형태로 먼저 보여주고, 클릭 시
  자세한 scope와 raw data를 확인할 수 있게 했습니다.
- API 카드는 method, path, status, latency를 먼저 보여주고, 클릭 시 request/response
  상세를 확인할 수 있게 했습니다.
- 기존 Logpoint/코드 선택 UI는 Flow의 주 화면에서 내려 `수집 범위 설정` 접힘 영역으로
  이동했습니다.
- 기존 함수 frame 원본 목록도 `원본 함수 프레임` 접힘 영역으로 이동해, 기본 화면은
  실행 흐름 해석에 집중하도록 정리했습니다.
- `npm run build`로 검증했습니다.

화이트 / 오렌지 키 컬러 테마 정리:

- 전체 앱에서 강제로 적용하던 dark 테마를 제거하고 화이트 기반 테마로 전환했습니다.
- 제품 키 컬러를 `#f36910`으로 지정하고 기존 blue 계열 포인트 컬러가 이 색상으로
  동작하도록 테마 변수를 수정했습니다.
- 상단 URL 바, 앱 헤더, 브라우저 컨트롤, 분석 패널 헤더, JSON Viewer를 밝은 배경에
  맞게 조정했습니다.
- Flow Story, 진단 요약, Logpoint 설정 영역의 하이라이트 색상을 오렌지 계열로
  통일했습니다.
- Electron BrowserWindow 배경색도 흰색으로 변경했습니다.
- `node --check electron/main.cjs`와 `npm run build`로 검증했습니다.

사용자 행동 기반 시나리오 시작점 추가:

- Flow Story가 단순 함수/API 나열이 아니라 "사용자가 어떤 행동을 했는지"부터
  시작되도록 target page에서 의미 있는 사용자 행동을 수집하는 `action` 이벤트를
  추가했습니다.
- 전체 click/input을 무차별 수집하지 않고 다음 행동만 시나리오 시작점으로 기록합니다.
  - button/link/role button click
  - form submit
  - input/textarea Enter
  - input/select/textarea change
- action 이벤트에는 action type, label, target selector, page URL, 주요 event
  parameter를 포함합니다.
- renderer가 `[AI_FLOW_DEBUG:action]` 메시지를 파싱해 Timeline에 `action` 타입으로
  저장하도록 연결했습니다.
- Flow Story에서 action 이벤트를 오렌지 사용자 행동 카드로 표시하도록 추가했습니다.
- 이제 Flow는 `사용자 행동 -> 함수 -> API -> 에러` 흐름으로 읽을 수 있습니다.
- `node --check electron/target-preload.cjs`와 `npm run build`로 검증했습니다.

API 호출 원인 함수 연결:

- CDP `Network.requestWillBeSent` 이벤트를 활성화해 API 요청의 `initiator.stack`을
  수집하도록 추가했습니다.
- request URL 기준으로 CDP initiator stack과 기존 Electron `webRequest` 결과를
  병합해 Network 이벤트에 `initiator` 정보를 포함했습니다.
- API 요청 카드와 Network 목록에 `Called by 함수명() · 파일:라인` 형태의 호출 함수
  후보를 표시하도록 개선했습니다.
- API 상세를 펼치면 `Called By / Initiator Stack`에서 전체 initiator stack을 확인할
  수 있습니다.
- 실패 API가 있을 때 Flow Story에서 어떤 함수가 요청을 만들었는지 더 빠르게
  추적할 수 있게 되었습니다.
- `node --check electron/main.cjs`와 `npm run build`로 검증했습니다.

API 파라미터 요약 및 호출 지점 추적:

- Flow의 API 상세 카드에 `API Parameter Summary` 영역을 추가했습니다.
- query string과 request body를 먼저 사람이 읽기 쉬운 key/value 형태로 보여주고,
  원본 request/response JSON은 아래에서 확인하도록 정리했습니다.
- body가 JSON 문자열이나 form-urlencoded 문자열이면 가능한 범위에서 구조화해
  표시합니다.
- API initiator stack에서 호출 함수의 source file과 line을 찾을 수 있으면
  `이 호출 지점 추적` 버튼을 표시합니다.
- 버튼을 누르면 해당 API 호출 라인 주변에 logpoint를 자동 적용해, 다음 실행부터
  그 함수의 local 변수/파라미터를 Flow 함수 카드로 수집할 수 있습니다.
- `npm run build`로 검증했습니다.

Flow 원툴 전환 및 Trace Report 추가:

- 오른쪽 분석 패널에서 Timeline, Network, Errors 탭을 제거하고 Flow 단일 화면으로
  정리했습니다.
- 함수 카드의 초록색 표현을 제거하고 화이트/오렌지 키 컬러 체계에 맞게 통일했습니다.
- 파라미터와 변수 값이 길 경우 UI에서 자동으로 말줄임표 처리되도록
  `truncateText` 유틸을 추가했습니다.
- 변수 테이블, 함수 요약 chip, API query/body preview에서 긴 값은 요약 표시하고,
  raw JSON 영역에서 원본을 계속 확인할 수 있게 했습니다.
- Trace를 Stop해서 completed 상태가 되면 Flow 상단에 `Trace Report`가 표시됩니다.
- Trace Report에는 사용자 행동/함수/API/에러 수, 시작 행동, 결론, 간단한 Flow Diagram,
  Root Cause Candidate가 표시됩니다.
- `node --check electron/main.cjs`와 `npm run build`로 검증했습니다.

React Flow 스타일 도식 보기:

- Flow 패널 상단에 `도식 보기` 버튼을 추가했습니다.
- 버튼을 누르면 화면 대부분을 사용하는 큰 모달 창에서 사용자 행동, 함수, API, 에러를
  노드와 연결선으로 도식화해 볼 수 있습니다.
- 도식 모달 우하단에 크기 조절 핸들을 추가해 드래그로 창 크기를 조절할 수 있습니다.
- 노드는 action/function/API/error 타입별로 행을 나누어 배치하고, 이벤트 순서에 따라
  곡선 edge로 연결합니다.
- 노드를 클릭하면 오른쪽 상세 패널에서 함수 scope, API parameter summary,
  initiator stack, error 상세를 확인할 수 있습니다.
- 현재는 별도 라이브러리 없이 자체 구현한 React Flow 스타일 캔버스이며, 추후
  `reactflow` 패키지로 교체하기 쉬운 구조로 분리했습니다.
- `npm run build`로 검증했습니다.

Flow / 분석 탭 분리:

- 오른쪽 패널을 `Flow`와 `분석` 탭으로 분리하고, 토글 형태가 아니라 명확한 탭 바로
  보이도록 변경했습니다.
- `Flow` 탭은 Scenario Flow, 도식 보기, 수집 범위 설정에 집중하도록 정리했습니다.
- `분석` 탭은 Trace 종료 후 리포트, 진단 요약, 원본 함수 프레임 확인에 집중하도록
  분리했습니다.
- Trace가 진행 중일 때 분석 탭에는 Stop 후 리포트가 생성된다는 안내를 표시합니다.
- `npm run build`로 검증했습니다.

도식 보기 탐색 개선 및 수집 범위 설정 제거:

- `도식 보기` 버튼을 Flow 탭뿐 아니라 분석 탭에서도 사용할 수 있게 변경했습니다.
- 도식 보기 모달 오른쪽에 전체 흐름 목록을 추가했습니다.
- 오른쪽 흐름 목록의 항목을 클릭하면 해당 노드가 선택되고 캔버스가 해당 노드 위치로
  부드럽게 이동합니다.
- 기존 `수집 범위 설정` UI는 제거했습니다.
- `npm run build`로 검증했습니다.

Action Timeline 흰 화면 오류 수정 및 기본 URL 변경:

- 사용자 행동 수집으로 Timeline에 `action` 타입 이벤트가 추가되었지만,
  TimelineItem이 `action` 아이콘을 알지 못해 렌더링 오류가 날 수 있던 문제를
  수정했습니다.
- TimelineItem에 `action` 타입과 MousePointer 아이콘 fallback을 추가했습니다.
- 기본 진입 URL을 `https://ims.hwgeneralins.com/general/jsp/smartScanner.jsp`로
  변경했습니다.
- BrowserView 주소창 placeholder도 동일한 URL로 변경했습니다.
- `node --check electron/target-preload.cjs`와 `npm run build`로 검증했습니다.

### 2026-05-12

Flow 도식 가시성 및 네트워크 필터 개선:

- Flow 카드, Trace Report의 간단 도식, `도식 보기` 모달 노드에 타입별 색상을
  분리 적용했습니다. 전체 톤앤매너는 키 컬러 `#f36910`을 중심으로 오렌지/앰버/뉴트럴
  계열 안에서 구분되도록 정리했습니다.
- 도식 보기의 연결선도 다음 노드 타입 색상을 따르도록 변경해 API, 버튼 클릭,
  함수 실행, 에러 흐름이 더 쉽게 구분되도록 했습니다.
- 오른쪽 패널 상단에 DevTools 스타일 `Network Filter`를 추가했습니다.
- 필터 옵션은 `XHR/Fetch`, `Doc`, `JS`, `CSS`, `Img`, `Font`, `Other`로 구성했습니다.
- 필터는 단일 선택이 아니라 다중 선택 방식입니다.
- 최초 상태는 모든 타입이 선택된 상태이고, 사용자가 필요 없는 타입을 클릭해
  제외하는 방식으로 동작합니다.
- resourceType이 명확하지 않은 요청도 URL 확장자를 기준으로 image/font/script/css
  유형을 추론하도록 보강했습니다.
- 필터는 Flow 카드 목록, 분석 탭 리포트, 도식 보기 모달에 공통 적용됩니다.
- 도식 보기 모달 내부에도 동일한 Network Filter를 추가해 큰 도식 화면 안에서도
  바로 필터를 조정할 수 있게 했습니다.
- 도식 보기 모달에서는 Network Filter를 우측 상단으로 이동하고, Node Detail을
  화면 하단 전체 폭 영역으로 분리해 상세 정보를 더 넓게 확인할 수 있게 했습니다.
- Flow / 분석 탭은 카드형 탭으로 변경해 현재 선택된 탭과 각 탭의 역할이 더 잘
  보이도록 개선했습니다.
- 사용자 이벤트/action 노드는 오렌지 계열에서 회색 계열로 바꿔 함수/API와 더
  분리되어 보이도록 조정했습니다.
- 분석 탭의 `Flow Diagram` 요약 영역은 제거하고, 에러 메시지를 기반으로 원인 후보,
  먼저 볼 지점, 디버깅 체크리스트를 제안하는 `AI Error Analyzer` 패널을 추가했습니다.
- 현재 AI Error Analyzer는 외부 API 없이 수집된 에러 메시지/직전 함수/실패 API를
  규칙 기반으로 분석하는 로컬 MVP이며, 추후 LLM API 연동 지점으로 확장할 수 있습니다.
- 메인 패널 상단의 `분석 / 수집된 흐름...` 설명 영역은 제거하고, `도식 보기` 버튼은
  분석 탭 내부의 분석 도구 영역으로 이동했습니다.
- 도식 보기 모달에 명시적인 `닫기` 버튼을 추가했습니다.
- AI Error Analyzer가 추가되면서 중복되는 `에러 발생 흐름이 감지되었습니다` 진단
  카드는 분석 탭에서 제거했습니다.
- 도식 보기 모달의 기본 X 닫기 버튼은 숨기고, 새로 추가한 `닫기` 버튼만 보이도록
  정리했습니다.
- 분석 탭은 주황색 배경/테두리를 줄이고 뉴트럴 톤 위주로 조정해 가시성을
  개선했습니다.
- 도식 보기 기본 X 버튼을 Dialog 컴포넌트 옵션으로 확실히 숨기도록 보강했습니다.
- 사용자 이벤트/action 노드의 회색 대비를 더 진하게 조정했습니다.
- AI Error Analyzer의 긴 텍스트, 파일 경로, 분석 문장이 카드 밖으로 빠져나가지
  않도록 줄바꿈 처리를 보강했습니다.
- AI Error Analyzer 헤더는 오렌지 톤으로 유지하고, 네트워크 필터 활성 상태는
  연한 파란색으로 변경해 오렌지 포인트 과밀도를 낮췄습니다.
- OpenAI Responses API 기반 실제 AI 분석 호출을 Electron main process에 추가했습니다.
- `OPENAI_API_KEY`와 선택 사항인 `OPENAI_MODEL`은 `.env`, `.env.local`, 또는 실행
  환경변수에서 읽도록 구성했습니다.
- renderer는 `debugAgentRuntime.analyzeError(...)` IPC만 호출하고, API 키는 main
  process 밖으로 노출하지 않습니다.
- OpenAI로 보내기 전 password/token/cookie/authorization 등 민감정보 키는 `***`로
  마스킹하고 긴 문자열은 잘라서 전송합니다.
- 분석 탭의 `AI Error Analyzer`에는 `AI 분석 실행` 버튼, 분석 중/성공/실패 상태,
  AI 결론/원인 후보/판단 근거/디버깅 절차/수정 방향 UI를 추가했습니다.
- AI 분석 경로를 OpenAI 전용으로 정리해 `.env`의 `OPENAI_API_KEY`,
  `OPENAI_MODEL`만 사용하도록 단순화했습니다.
- `도식 보기` 명칭을 `Flow 분석`으로 변경했습니다.
- 네트워크 필터 활성 색상을 채도가 낮은 블루-그레이 톤으로 조정했습니다.
- 도식 보기 내부 네트워크 필터는 3열 그리드로 정렬하고 버튼 크기를 맞췄습니다.
- Flow 분석 캔버스는 빈 영역을 마우스로 잡아 끌어 이동할 수 있도록 드래그 패닝을
  추가했습니다.
- 네트워크 필터는 Flow 탭에서만 보이도록 이동하고, 7개 필터 버튼이 한 줄에
  정렬되어 가로 스크롤이 생기지 않게 조정했습니다.
- Flow 분석 모달의 네트워크 필터는 헤더 바로 아래에서 가로 전체 영역을 사용하도록
  변경했습니다.
- Flow 분석 드래그 이동은 캔버스 내부 요소를 클릭해도 시작될 수 있도록 조건을
  완화하고, 노드 버튼 클릭과만 충돌하지 않도록 보강했습니다.
- Flow 분석 모달 내부에 세로/가로 리사이즈 핸들을 추가해 그래프 영역, 전체 흐름
  영역, Node Detail 영역 크기를 드래그로 조절할 수 있게 했습니다.
- 리사이즈 핸들은 마우스 오버 시 오렌지색으로 강조되어 조절 가능한 영역임을
  더 명확하게 보여줍니다.
- Flow 분석에서 선택된 노드와 바로 앞/뒤 노드는 강조하고, 나머지 노드는 흐림/투명
  처리해 현재 확인 중인 구간이 더 잘 보이도록 했습니다.
- 선택된 노드로 들어오고 나가는 연결선에는 흐르는 dash 애니메이션을 추가했습니다.
- Flow 분석의 활성 연결선 화살표 색상을 선 색상과 어울리는 주황색으로 맞췄습니다.
- 노드 클릭 시 해당 노드가 그래프 뷰포트 중앙에 오도록 스크롤 위치 계산을 개선했습니다.
- 네트워크 필터 버튼은 화면을 꽉 채우는 그리드 대신 작은 pill 형태로 바꿔
  답답함을 줄였습니다.
- 네트워크 필터에 검색 입력과 검색 버튼을 추가해 API 주소, queryString,
  request/response, 호출자 정보를 한 번에 검색할 수 있게 했습니다.
- 중복으로 보이던 상단 전역 주소창을 제거하고, Trace 시작/종료 버튼은 헤더 오른쪽으로
  이동했습니다.
- 메인 화면 좌우 패널 조절 핸들을 Flow 분석 모달과 비슷한 방식으로 변경해,
  마우스 오버와 드래그 시 오렌지색으로 조절 가능 상태가 보이도록 했습니다.
- 메인 화면 좌우 패널 조절 핸들의 hover 스타일을 Flow 분석 모달과 맞춰 중앙 선과
  grip이 선명한 오렌지색으로 바뀌도록 통일했습니다.
- Flow 분석 노드에 함수 실행 시간과 API 응답 시간 정보를 작은 배지로 표시하도록
  추가했습니다.
- 네트워크 검색은 해당 노드만 남기는 방식 대신 전체 흐름을 유지하고, 매칭되는 Flow
  카드/그래프 노드/전체 흐름 항목에 반짝이는 강조 효과를 주도록 변경했습니다.
- 검색 결과 강조 색상은 브랜드 오렌지와 구분되도록 연두색 계열로 변경했습니다.
- 검색 결과의 테두리/glow 효과는 제거하고, 우측 상단의 작은 연두색 배지만 깜빡이도록
  변경했습니다.
- 검색 결과 표시는 텍스트 배지/깜빡임 없이 우측 상단의 작은 초록색 포인트로만
  보이도록 정리했습니다.
- Flow 분석 모달에서 전체 흐름 영역과 Node Detail 영역을 각각 접고 펼칠 수 있도록
  헤더와 영역별 접기 버튼을 추가했습니다.
- Flow 분석 캔버스에 확대/축소/100% 초기화 컨트롤을 추가하고, 마우스 휠로도
  캔버스 줌을 조절할 수 있게 했습니다.
- Flow 분석 캔버스의 스크롤바는 숨기고, 화면 이동은 드래그 패닝 중심으로 사용하도록
  정리했습니다.
- 검색 결과 포인트 색상은 초록색에서 파란색으로 변경하고, 그래프 노드의 시간 배지는
  검색 포인트와 겹치지 않도록 제거했습니다.
- 대상 페이지 내부 DOM 변화를 `MutationObserver`로 수집해 Flow에 DOM 노드로 표시하도록
  추가했습니다. 추가/삭제/속성/텍스트 변경 개수와 대표 selector 샘플을 요약합니다.
- DOM 변경 상세 화면은 원시 JSON 대신 변화 종류별 개수 배지와 대표 selector 리스트로
  읽기 쉽게 표시하도록 개선했습니다.
- DOM 변경 상세에 최근 사용자 액션 기반의 추정 트리거와 attribute/text 변경의
  이전 값/이후 값을 표시하도록 추가했습니다.
- DOM 변경 상세에서 변경 target을 그룹화해 주요 변경 영역을 먼저 보여주고, 추가/삭제된
  노드는 selector와 짧은 preview를 함께 표시하도록 개선했습니다.
- AI 분석 실행 버튼을 제거하고, Trace 종료 후 에러가 있으면 분석 탭으로 자동 전환해
  AI 분석을 자동 실행하도록 변경했습니다.
- AI 분석 payload에 DOM 변경 요약을 포함해 화면 변화와 에러의 연관성을 함께 분석할 수
  있도록 고도화했습니다.
- DOM 변경 상세에서 긴 base64/data URL 값은 타입과 크기 중심으로 요약하고, 긴 문자열이
  카드 밖으로 삐져나가지 않도록 줄바꿈/overflow 처리를 보강했습니다.
- 자동 이상징후 섹션을 Trace Report에서 자동 AI 분석 영역으로 이동하고, AI 분석
  payload에도 포함해 실패 API, 느린 API, DOM 변경 집중, 에러 직전 DOM 변화,
  함수 Flow 수집 부족 신호를 함께 참고하도록 했습니다.
- 상단 헤더에 현재 디버깅 브라우저 앱의 Chromium 버전을 표시하도록 추가했습니다.
- 브라우저 버전 선택 재실행 방안은 검토 결과, Electron은 Chromium이 앱 런타임에
  번들되어 있어 앱 내부에서 엔진만 즉시 교체하기는 어렵습니다. 추후 지원하려면
  `브라우저 버전 선택 → 설정 저장 → 앱 재실행` 구조와 함께 버전별 Electron 빌드 또는
  외부 Chromium/Chrome 실행 경로를 선택하는 방식이 필요합니다.
- `npm run electron:dev` 실행 시 콘솔에서 디버깅 브라우저 런타임을 선택할 수 있는
  프롬프트를 추가했습니다. 기본값은 현재 프로젝트 Electron이며,
  `DEBUG_BROWSER_ELECTRON_BIN=/path/to/electron npm run electron:dev` 또는
  `browser-runtimes.json` 등록을 통해 다른 Electron 실행 파일을 선택할 수 있습니다.
- 런타임 선택 프롬프트를 방향키 기반 메뉴로 개선하고, Electron 버전과 Chromium 버전을
  함께 표시하도록 보강했습니다.
- Electron 43 alpha/42/41/40/39/38 관리형 후보를 추가하고, 선택한 버전이 로컬에
  없으면 승인 후 `.debug-browser-runtimes/`에 다운로드/설치해 실행하도록 구성했습니다.
- 현재 프로젝트 Electron과 관리형 Electron 42가 중복 표시되지 않도록 메뉴를 정리하고,
  직접 경로 입력 항목을 제거했습니다.
- 앱 상단 런타임 배지에서 Chromium 버전이 중복 표시되지 않도록 수정했습니다.
- `npm run build`로 검증했습니다.

### 2026-06-05

최종 제출 전 사용 흐름과 성능 안정성을 정리했습니다.

완료된 작업:

- 기본 진입 URL을 테스트용 `debug-error.html`에서 실제 스마트스캐너 서비스
  `https://ims.hwgeneralins.com/general/jsp/smartScanner.jsp`로 복구했습니다.
- 주소창 placeholder도 스마트스캐너 URL 기준으로 맞춰 최종 실행 시 개발용 URL 흔적이
  보이지 않도록 정리했습니다.
- Trace 수집 중 `timeline`, `apiCalls`, `functions`, `errors`, `codeLocations`가
  무한정 늘어나지 않도록 최근 데이터 기준 상한을 추가했습니다. 장시간 테스트에서도
  분석 패널 렌더링이 과도하게 느려지는 것을 방지하기 위한 제출용 최적화입니다.
- AI 분석 경로는 OpenAI 전용으로 정리하고, 로컬 모델 provider 안내와 코드 분기를
  제거했습니다.
- AI 분석 결과 UI는 로딩 중에는 톱니바퀴 로봇을 유지하고, 완료 후에는 로봇 머리와
  타이핑 애니메이션으로 결과가 표시되도록 정리했습니다.
- `node --check electron/main.cjs`와 `npm run build`로 검증했습니다.

대상 서비스 코드에서 함수 Flow를 기록하는 예시:

```js
const handleLoginSubmit = window.__AI_FLOW_DEBUG__.traceFunction(
  {
    name: "handleLoginSubmit",
    sourceFile: "src/features/login/LoginForm.tsx",
    line: 42,
  },
  async function handleLoginSubmit(form) {
    return login(form.email, form.password);
  }
);
```

수동으로 특정 지점을 기록하는 예시:

```js
window.__AI_FLOW_DEBUG__.recordFunction({
  name: "validateCredentials",
  sourceFile: "src/features/login/validateCredentials.ts",
  line: 12,
  parameters: { email },
  returnValue: { valid: true },
});
```

다음 작업 후보:

- Trace 시작/종료 지점을 명확하게 지정하는 UI 추가
- 대상 서비스에 붙일 npm SDK 또는 Babel/Vite plugin 형태의 자동 instrumentation
  도구 추가
- 민감정보 마스킹을 Network/API 수집 결과에 적용
- API response body 크기 제한 및 JSON preview 개선
