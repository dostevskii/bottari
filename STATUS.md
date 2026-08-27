# STATUS

프로젝트 진행 히스토리. **새 항목은 위에 쌓고, 지난 항목은 고치지 않는다** —
그때 무엇이 사실이었는지가 기록의 가치이기 때문이다.

상세한 재개 지침은 `docs/HANDOVER_v4.md`(최신 판)에 있다.

---

## 2026-08-27 · 0.1.0 공개 릴리스

**저장소 공개, 릴리스 발행, 세 머신 동일 구조 통일까지 완료.**

- 릴리스: https://github.com/dostevskii/bottari/releases/tag/v0.1.0
  (`bottari-0.1.0.mcpb` 129KB 첨부, 외부 다운로드 검증)
- 저장소 PUBLIC 전환 — PRIVACY.md 링크가 살아나 Google 동의 화면의
  개인정보처리방침 링크가 실제로 열린다
- OAuth 클라이언트 **프로덕션 게시** — 아무 Google 계정으로 로그인 가능
  (`drive.file`은 비민감이라 검수 불요)
- 공개 전 전체 히스토리 개인정보·시크릿 검사: 0건
  (`GOCSPX-` 1건은 "소스에 시크릿이 없는지" 검사하는 테스트 코드였음)

### 이날 고친 실제 사고 — codex 설정 손상

사용자의 codex가 양쪽 머신에서 기동 실패(`os error 123`,
`Error loading config.toml`). 원인은 전부 bottari 변환기였고 **6건**을
찾아 고쳤다. 모두 회귀 테스트로 박제:

1. `shrink`가 POSIX 홈의 선행 `/`를 토큰 밖에 남겨, Windows 복원 때
   드라이브 문자 앞에 `/`가 왕복 1회당 1개씩 누적 (`//C:\...`)
2. `expand`의 tail이 경로 경계를 넘어 다음 placeholder를 삼킴
3. codex 변환기가 OS 전용 실행파일(.exe)을 공유 → 리눅스에 죽은 경로 전파
4. 공유본이 확장되면 오버레이와 같아지는 테이블을 중복 선언 → TOML 거부
5. `pack`이 축약 후 같아지는 헤더를 두 번 기록(드라이브 문자 대소문자)
6. 키체인 쓰기 실패 시 **Google refresh token이 평문으로 화면 출력**

양쪽 config.toml 복구 완료(원본은 `.pre-bottari-repair`,
`.pre-dedupe`로 보존). 리눅스의 Sanity MCP 서버가 병합 중 한 번
사라져 백업에서 복원 — 이것이 남은 개선 과제 1번의 근거다.

### 추가된 것

- **옵트인 시크릿 동기화** (`bottari secrets sync --enable`, 기본 꺼짐).
  `${BOTTARI_SECRET:*}`만 이동하며 bottari 자신의 로그인·데이터 키는
  이름과 테스트로 격리. 수신 즉시 관련 설정을 재조립
- **`sync --prefer local|remote|both`** — 비대화형/자동화용 충돌 정책
- 로그인 완료·거부 페이지를 Figma 디자인대로 구현. Inter 폰트 내장
  (SIL OFL은 재배포 허용. Switzer는 저장소 재배포를 금지해 불가했다)
- 한/영 README 분리, PRIVACY.md, CHANGELOG, BOTTARI 로고, GitHub About
- 세 머신 모두 git 저장소로 통일 — 업데이트가 `git pull` 한 줄
- `bin/bottari.mjs`에 실행 비트 기록(clone 후 chmod 불요)

**상태:** 테스트 110개 통과, 세대 18, Windows·Linux·macOS 실사용.

---

## 2026-08-27 · 3-OS 합류 완료

macOS(맥북프로 arm64)가 "일반인 경로" 그대로 합류: GitHub ZIP → Node
설치 → `init --remember-key` → 브라우저 로그인 → 676MB 수신 → 세대 8.

- 세 키체인 백엔드 모두 실기기 검증
  (Windows DPAPI · Linux 파일 폴백 · macOS Keychain)
- Claude Desktop에 MCPB 설치 후 `bottari_status` 실호출 성공
- 티어 A 327파일이 Windows↔Linux 해시 완전 일치

## 2026-08-26 · 첫 실사용

- Windows 진짜 `init`: 세대 1, 807객체, 원본 613MB → 실저장 338MB, 약 7분
- Arch Linux 정식 합류: 649MB 수신, 충돌 18건 해소, 고유 파일 64개 보존
- 진행 바 도입(scan/upload/download, %·MB·ETA)
- OAuth 클라이언트 내장, Drive API 활성화

## 2026-08-26 · 계획부터 M0~M7 구현

폐기된 agentrc의 교훈("저장 위치부터 만들고 동기화 모델을 나중에 정했다")을
반전시켜, **동기화 데이터 모델을 먼저 확정하고** 시작.

- 합집합 병합 15케이스 판정표가 곧 명세이자 테스트
- 단일 정본 카탈로그 + 세대 체인, 콘텐츠 주소화(CAS)
- 암호화 봉투(AES-256-GCM + scrypt DEK/KEK), 개인정보 게이트
