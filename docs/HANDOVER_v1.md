# bottari 인수인계 문서 v1 (2026-08-26)

> 이 문서는 덮어쓰지 않는다. 다음 갱신은 HANDOVER_v2.md 로 새 파일을 만든다.

## 프로젝트가 무엇인가

Windows 11 / Arch Linux / macOS 세 컴퓨터에서 Claude Code · Codex CLI의
스킬·설정·세션 기록·프로젝트 폴더를 **Google Drive를 허브로** 동기화하는
CLI + MCP 서버. 승인된 전체 계획서와 실제 경로·주소는 `docs/LOCAL_NOTES.local.md`
(gitignore 대상)에 있다.

- 저장소: <저장소 루트> (로컬 git, main 브랜치. GitHub에는 아직 없음)
- 라이선스 GPL-3.0-only, 저작권 JUNG HWANGBO <dostevskii@gmail.com>
- 절대 규칙: 소스·주석·문서·픽스처에 실제 사용자명/컴퓨터명/폴더명 금지
  (`scripts/check-pii.mjs` 가 강제. 실식별자 목록은 gitignore된 `.pii-denylist.local`)

## 핵심 설계 (요약)

- 클라우드 = 단일 정본: `bottari/` 폴더에 평문은 `bottari.meta.json` 하나
  (KDF 파라미터 + 래핑된 DEK + HEAD). 매니페스트는 세대(generation)별 봉인,
  **고유 이름 + 생성 전용**으로 올리고 meta가 fileId를 가리킴(경합 시 패자는
  자기 파일을 지우고 재병합 — Drive는 동명 파일을 허용하기 때문)
- 병합 = **합집합 + 충돌 시 질문**. 삭제는 절대 전파되지 않음.
  판정표 15케이스가 `src/core/merge.js` + `test/merge.test.mjs`에 정본으로 있음
- 암호화: DEK(무작위 32B)로 객체 봉인(AES-256-GCM, 헤더=AAD, oid 결속),
  패스워드→scrypt(2^17)→KEK가 DEK를 래핑. 객체 파일명 = HMAC(파생키, 평문해시)
- 티어: A 자산(그대로) / B 설정(변환: 자리표시자·시크릿 분리·머신 오버레이) /
  C 시크릿(절대 금지) / D 세션(8MB 청크 CAS, jsonl 자동 병합) / P 프로젝트(슬러그별)

## 완료된 것 (커밋 순, 테스트 90개 전부 통과)

| 커밋 | 내용 | 검증 |
|---|---|---|
| M0 | 봉투·DEK/KEK·PII 게이트 | 왕복·변조 거부·게이트 음성 대조 |
| M1 | OAuth PKCE 루프백, OS별 키체인, Drive 클라이언트 | **실기기**: 로그인→재실행 무로그인, 실제 Drive 300KB 왕복 바이트 동일 |
| M2 | 3-way 병합·세대 커밋·init/sync/status/generations | **실기기**: Win 327파일 업→Arch 바이트 동일 수신(전수 해시 일치)→멱등→Linux 편집이 세대2→Win 회수. 이후 테스트 보따리는 Drive에서 삭제함 |
| M3 | 티어 B 변환·시크릿 게이트·secrets 명령 | **실데이터**: 진짜 settings/claude.json/config.toml → 리눅스 복원본 누출 0건. Git Bash `/c/Users/…` 철자 누출을 실데이터로 발견해 수정 |
| M4 | 세션 8MB 청크 CAS·resumable·jsonl 자동 병합·병렬 4 | 17MB+1KB append→청크 1개만 재업로드, 자동 해소 5시나리오 무프롬프트 (**601MB 실측은 미실시** — 아래 M7 참조) |
| M5 | projects add/list/remove, tools capture/show, 한글 NFC | NFD→NFC 왕복, node_modules 제외, 실명령 스모크 |
| M6 | MCP 서버(stdio JSON-RPC 직접 구현, 도구 7개) | 실프로세스 골든 테스트. **Claude 데스크톱 실연결은 미실시** |

발견해 고친 실버그: 매니페스트 동명 덮어쓰기 파손 / keep-alive·unhandled rejection(전 프로젝트 교훈 반영) / 자기 자신과의 대소문자 충돌 오탐 / expand가 JSON 따옴표 이스케이프를 삼킴 / `https:/`의 `s:/` 드라이브 오탐 / MSYS 경로 미축약.

## 지금 환경 상태 (중요)

- **OAuth 클라이언트**: 사용자가 만든 전용 프로젝트 `bottari-506707`.
  `src/auth/client-id.js` 에 XOR+base64로 **내장 완료**. 원본 JSON 백업:
  `~/.bottari/client_secret.json`. Drive API 활성화됨
- **Windows**: 로그인 유지됨(refresh token이 DPAPI vault `~/.bottari/vault.win.json`).
  `~/.bottari/` 에 machine-overlay, secret-names(팩 중 Sanity 토큰이 DPAPI로 이동됨)
- **Linux**(주소는 로컬 노트): 저장소 사본 `/tmp/bottari` + 로그인 파일폴백 `/tmp/bottari-home/.bottari` —
  **둘 다 /tmp라 재부팅하면 사라짐**. 재개 시 다시 복사하면 됨(로그인도 다시)
- **Drive**: 현재 bottari 폴더 없음(검증용은 임시 암호였고 통째로 삭제). 진짜 init은 아직
- 검증용 임시 암호는 폐기됨. **진짜 init은 사용자가 직접 자기 암호로** 실행해야 함

## 남은 일 (M7) — 여기서부터 시작

1. **`bottari restore --generation N`**: meta.headManifestId에서 parentManifestId
   체인을 걸어 N세대 매니페스트 확보 → 로컬과 해시 다른 항목만 물질화(삭제 없음,
   --dry-run/--force). MCP `bottari_restore` 도구(dryRun 기본, confirm:true 재호출)도 추가
2. **`bottari doctor`**: meta/HEAD 매니페스트 읽힘, HEAD가 참조하는 oid 전부
   objects/에 존재?, lock 잔존, 키체인 백엔드, 로그인 상태
3. **`bottari prune --keep N`**: 체인 기준 최근 N세대만 보존, 미참조 객체 삭제
   (삭제 전 참조 재검증 2회, --yes 없이는 확인 질의)
4. **문서**: README 사용법 확장, SECURITY.md(키 계층·위협 모델·클라이언트ID 방침),
   docs/SYNC-MODEL.md(판정표·커밋 프로토콜·실기기 체크리스트 9항목 — 계획서에 있음)
5. **GitHub private 레포 생성 + push** (사용자 방침: 완성 전까지 비공개)
6. **실측 겸 진짜 init**: 사용자가 Windows에서 `bottari init` (본인 암호,
   `--remember-key` 권장 — MCP 필수). 601MB 세션 포함 소요·전송량 계측
   → 5,000파일/30분 초과 시에만 팩파일 도입(계획서의 게이트)
7. **Claude 데스크톱 연결**: 설정에 `{"command":"node","args":["<repo>/bin/bottari.mjs","mcp"]}`
   (npm 전역 설치 후엔 `bottari mcp`) → status→sync→충돌 diff→resolve→재sync 시나리오
8. **Linux 정식 동기화**(실제 홈으로) / **macOS**는 기기 준비 후 전면 검증(NFD 주의)

## 재개 절차 (다음 세션 첫 명령)

```
cd <저장소 루트>   # docs/LOCAL_NOTES.local.md 참조
git log --oneline        # M0~M6 커밋 확인
npm test                 # 90개 통과 확인
node scripts/check-pii.mjs
```
그다음 위 "남은 일" 1번부터. 계획서와 이 문서만 읽으면 맥락이 복원된다.

## 주의사항

- 커밋 전 반드시 `npm test` + `node scripts/check-pii.mjs`
- `.pii-denylist.local` 은 절대 커밋 금지(게이트가 gitignore 여부도 검사함)
- 셸에 백슬래시를 통과시키지 말 것(이 세션에서도 두 번 깨짐) — 파일 조작은
  Write/Edit 도구, 검증 스크립트는 node -e 안에서 문자열 조립
- 문서/주석 예시 경로는 `example` 홈만 사용 (check-pii 규약)
