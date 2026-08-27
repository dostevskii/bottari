# bottari 인수인계 문서 v3 (2026-08-27)

> v1·v2는 수정하지 않는다. 실제 경로·주소는 `docs/LOCAL_NOTES.local.md`.

## 상태: 3-OS 합류 완료 — 계획서의 모든 검증 항목 종료

macOS(맥북프로, arm64)가 오늘 "일반인 경로" 그대로 합류했다: GitHub ZIP →
Node 설치 → `init --remember-key` → 브라우저 로그인 → 암호(★ 마스킹) →
충돌 1건(프레시 claude.json)을 r로 → 676.2MB 다운로드 → 세대 8 수신.

- 재sync 멱등 확인(up 3·down 0 → 세대 9), doctor 전항목 ok
  (macOS Keychain, 매니페스트 834엔트리 복호·검증, 객체 834개 전부 존재)
- Windows 교차 회수 → 세대 10, `tools show`에 darwin/arm64 머신 표시
- 이로써 Windows(DPAPI) · Arch Linux(파일 폴백) · macOS(Keychain)
  세 백엔드 모두 실기기 검증됨

## 남은 관찰·개선 후보 (기능 아님, 여유 있을 때)

1. 맥 인벤토리에 claude "not installed" — 사용자는 설치했다고 함.
   zsh PATH에 안 잡힌 것(새 터미널 필요하거나 앱 설치형). 재캡처 안내
2. exec 비트가 변경 감지에 안 들어가 전파되지 않음(수동 chmod로 보정 중)
   → entry 비교에 exec 포함 또는 복원 시 .sh 파일 휴리스틱 검토
3. `bottari passwd`(DEK 재래핑) 미구현
4. doctor의 "HEAD 미참조 17객체" → 세대 쌓이면 `prune --keep N`
5. 공개 릴리스 시: npm publish 여부, MCPB를 GitHub Release 자산으로

## 일상

세 머신 모두 `bottari sync` (맥은 `node ~/bottari/bin/bottari.mjs sync`,
원하면 npm link). Desktop에선 Claude에게 말로. 끝.
