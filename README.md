# AI Debugging Browser

회사 웹서비스를 디버깅 브라우저 앱 안에서 실행하고, Trace 구간 동안 사용자 행동,
함수 흐름, API 요청, DOM 변화, console error를 수집해 문제 원인 파악을 돕는
개발자용 디버깅 도구입니다.

## 주요 기능

- Electron 기반 디버깅 브라우저에서 실제 웹서비스 실행
- Start Trace / Stop Trace 기반 흐름 수집
- 사용자 이벤트, 함수 호출, API 요청, DOM 변화, console error 수집
- Flow 분석 화면을 통한 실행 흐름 도식화
- 에러 목록 기반 AI 디버깅 코멘트 표시
- Electron / Chromium 런타임 버전 선택 실행

## 실행 방법

```bash
npm install
npm run electron:dev
```

개발 서버만 실행하려면 다음 명령을 사용합니다.

```bash
npm run dev
```

프로덕션 빌드는 다음 명령으로 확인합니다.

```bash
npm run build
```

## AI 분석 설정

OpenAI API를 사용하려면 프로젝트 루트에 `.env` 또는 `.env.local` 파일을 만들고
다음 값을 설정합니다.

```bash
OPENAI_API_KEY=발급받은_API_키
OPENAI_MODEL=gpt-4.1-mini
```

API 키가 없거나 호출에 실패하면 앱은 수집된 정보 기반의 기본 분석 안내를 표시합니다.

## 로컬 기록

상세 개발 기록과 패치 내역은 로컬 전용 파일 `README.local-history.md`에 보관합니다.
이 파일은 `.gitignore`에 포함되어 깃에 업로드되지 않습니다.
