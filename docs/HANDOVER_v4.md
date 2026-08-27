# bottari 인수인계 문서 v4 (2026-08-27)

> v1~v3은 수정하지 않는다. 실제 경로·주소는 `docs/LOCAL_NOTES.local.md`.

## 상태: 0.1.0 공개 릴리스 완료

- 저장소 **공개(PUBLIC)**: https://github.com/dostevskii/bottari
- 릴리스: https://github.com/dostevskii/bottari/releases/tag/v0.1.0
  (`bottari-0.1.0.mcpb` 129KB 첨부, 외부 다운로드 검증됨)
- 태그 `v0.1.0`, 커밋 37개, 테스트 110개 통과
- Google OAuth 클라이언트 **프로덕션 게시** — 아무 Google 계정으로 로그인 가능
  (drive.file은 비민감이라 검수 불요. "확인되지 않은 앱" 안내는 정상)

## 이번 회차에 있었던 일

### codex 설정 손상 사고 (해결됨)

사용자의 codex가 `node_repl` MCP 기동 실패(os error 123)와
`Error loading config.toml`로 양쪽 머신에서 죽었다. 원인은 전부 bottari의
변환기였고, 결함 **6건**을 찾아 고쳤다:

1. `shrink`가 POSIX 홈의 선행 `/`를 토큰 밖에 남겨, Windows 복원 때
   드라이브 문자 앞에 `/`가 누적 (`//C:\...`)
2. `expand`의 tail이 경로 경계를 넘어 다음 placeholder를 삼킴
   (`;` 구분 PATH 목록에서 두 번째가 미확장)
3. codex 변환기가 OS 전용 실행파일(.exe)을 공유 → 리눅스에 죽은 경로 전파
4. shared가 expand되면 overlay와 같아지는 테이블을 중복 선언 → TOML 거부
5. `pack`이 축약 후 같아지는 헤더를 두 번 기록 (드라이브 문자 대소문자)
6. 키체인 쓰기 실패 시 **Google refresh token이 평문으로 화면 출력**

모두 회귀 테스트로 박제. 양쪽 머신 config.toml 복구 완료
(원본은 `.pre-bottari-repair`, `.pre-dedupe`로 보존).

### 추가된 기능

- **옵트인 시크릿 동기화** (`bottari secrets sync --enable`, 기본 꺼짐).
  `${BOTTARI_SECRET:*}` 만 이동하며 bottari 자신의 로그인·데이터 키는
  이름과 테스트로 격리. 시크릿 수신 시 관련 설정을 즉시 재조립
- **`sync --prefer local|remote|both`** — 비대화형/자동화용 충돌 정책
- 로그인 완료·거부 페이지를 Figma 디자인대로 구현, Inter 폰트 내장
  (SIL OFL, 재배포 허용. Switzer는 라이선스가 저장소 재배포를 금지해 불가)
- 한/영 README 분리, PRIVACY.md, CHANGELOG, 로고, About

## 남은 개선 후보

1. **codex config는 파일 단위 병합** — 머신마다 다른 MCP 서버가 있으면
   충돌 시 한쪽이 통째로 덮인다(실제로 리눅스의 Sanity가 한 번 사라져
   백업에서 복원했다). 섹션 단위 병합이 근본 해결
2. **Node 포함 원클릭 설치 패키지** (작업 #16) — 지금은 사용자가 Node를
   따로 설치해야 함. SEA(단일 실행파일)나 설치 스크립트 검토
3. exec 비트가 변경 감지에 안 들어가 전파되지 않음(수동 chmod로 보정 중)
4. `bottari passwd`(DEK 재래핑) 미구현
5. npm 배포는 하지 않음 — 필요해지면 `npm publish` (package.json 준비됨)

## 일상

세 머신 모두 `bottari sync`. Desktop에선 Claude에게 말로.
릴리스 갱신은 `npm run mcpb` → `gh release upload`.
