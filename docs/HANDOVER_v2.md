# bottari 인수인계 문서 v2 (2026-08-27)

> v1은 수정하지 않는다. 다음 갱신은 v3로 새 파일. 실제 경로·주소는
> `docs/LOCAL_NOTES.local.md`(gitignore) 참조.

## 상태: 실사용 단계

계획서(M0~M7)의 구현·검증이 **macOS 한 항목만 남기고 전부 완료**되었다.
저장소는 GitHub private `dostevskii/bottari`, 테스트 96개, PII 게이트 상시 통과.

## 오늘까지 실증된 것

| 검증 | 결과 |
|---|---|
| Windows 진짜 init | 세대 1, 807객체, 원본 613MB → 실저장 338MB, 약 7분 |
| 진행 바 | scan/upload/download, TTY 실시간 바(%·MB·ETA), 파이프는 25% 스텝 |
| 리눅스 정식 합류 | 649MB 내림·64개 올림, 충돌 18건 remote 해소, **티어 A 327파일 해시 완전 일치** |
| OS 조건부 복원 | win32 전용 MCP 서버 리눅스 제외, 설정에 Windows 경로 잔재 0건 |
| 시크릿 계층 | Sanity 토큰 자리표시자 복원 + `secrets set` 안내. 게이트 오탐(risk/task-based의 sk-) 실데이터로 발견·수정 |
| Claude Desktop | **MCPB(71KB, 스펙 0.3) 설치 → bottari_status 실호출 성공** (세대 6 요약 수신) |
| 세대 흐름 | 현재 HEAD 6 (1 최초, 2·3 세션 꼬리, 4·5 리눅스 합류, 6 Windows 회수) |

## 머신별 상태

- **Windows**: `npm link`로 `bottari` 명령. DPAPI에 로그인+열쇠. MCPB 설치됨.
  MCPB 재빌드: `node scripts/build-mcpb.mjs` → `dist/bottari.mcpb`
- **Linux**: `~/bottari` + `~/.local/bin/bottari`. 로그인+열쇠는 0600 파일 폴백
  (키링 없음 — gnome-keyring 설치 권장). agentrc 잔재([windows] 섹션,
  drive-archive 서버) 청소 완료
- **macOS**: 미합류. 남은 마지막 검증 항목

## 일상 사용

양쪽 다 `bottari sync` 하나. Desktop에서는 Claude에게 "bottari 상태/동기화"
라고 말하면 됨. 충돌은 CLI에선 즉석 질문, Desktop에선 목록→선택→재sync.

## 남은 일

1. **macOS 합류** (맥북프로 준비되면): Node 20+ 설치 → 저장소 받기 →
   `bottari login`(브라우저) → 열쇠는 ⓐ 암호 입력 or ⓑ DEK 이전(v1의 파일
   경유 절차) → `bottari init` 흐름 B. 한글 NFD 경로가 핵심 관찰 포인트.
   충돌은 첫 합류라면 `scripts/adopt-remote.mjs`(클라우드 우선)가 편함
2. 공개 릴리스 판단 시: README의 설치 절차 보강(npm publish 여부),
   MCPB를 GitHub Release 자산으로 첨부
3. 선택: `bottari passwd`(DEK 재래핑) 명령은 미구현 — 필요해지면 추가

## 이 회차의 교훈

- readline 묵음 입력은 Windows 터미널에서 신뢰 불가 → raw 모드 + `*` 마스킹
- 침묵은 사용자에게 죽음과 구별 불가 → 모든 장시간 단계에 바이트 정확 진행 바
- 게이트·PII 검사는 실데이터에서만 드러나는 오탐/누락이 있다 → 실측 후 회귀 박제
- 머신 오버레이는 옛 쓰레기도 성실히 보존한다 → 신규 머신 합류 시 잔재 청소는 별도 작업
