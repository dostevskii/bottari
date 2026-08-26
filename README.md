# bottari · 보따리

Pack up your CLI world — skills, settings and sessions — and carry it between
machines through your own Google Drive.

흩어진 컴퓨터들(Windows / Linux / macOS) 사이에서 Claude Code CLI와 Codex CLI의
스킬·설정·세션 기록·프로젝트 폴더를 하나의 보따리로 싸서, **본인의 Google
Drive**를 허브로 동기화합니다. 클라우드에는 암호화된 데이터만 올라갑니다.

> **상태: 개발 중.** 핵심 기능은 동작하지만 아직 정식 릴리스 전입니다.
> **Status: under development.**

## 시작하기

```
bottari init      # 처음 한 번: 로그인 → 암호 설정 → 올리기(또는 내려받아 병합)
bottari sync      # 그다음부터는 이것 하나
bottari status    # 무엇이 오르내릴지 미리 보기 (아무것도 바꾸지 않음)
```

- 처음 쓰는 컴퓨터에서 `init` 을 실행하면, 클라우드가 비어 있으면 이 컴퓨터의
  데이터를 정리·암호화해 올리고, 이미 보따리가 있으면 내려받아 이 컴퓨터와
  병합한 뒤 다시 올립니다.
- 병합 규칙은 **합집합**입니다: 한쪽에만 있는 것은 무조건 보존되고, 같은
  파일이 양쪽에서 다르게 바뀐 경우에만 어느 쪽을 남길지 묻습니다. **자동으로
  지워지는 일은 없습니다.**
- 모든 동기화는 세대(generation)로 기록되며 `bottari restore --generation N`
  으로 언제든 그 시점의 파일로 되돌릴 수 있습니다.

## 무엇이 동기화되나

| | 예 | 방식 |
|---|---|---|
| 자산 | 스킬, CLAUDE.md, AGENTS.md, hooks | 그대로 |
| 설정 | settings.json, config.toml, MCP 서버 정의 | 경로는 자리표시자로, 시크릿은 OS 자격증명 저장소로 분리한 **기계 중립형**만 공유 |
| 세션 기록 | 대화 .jsonl | 8MB 청크 증분, 이어쓰기는 자동 병합 |
| 프로젝트 | `bottari projects add <경로>` 로 등록한 폴더 | 이름(슬러그)로 공유, 경로는 컴퓨터마다 |
| 도구 목록 | node/git/claude/codex 버전 | `bottari tools capture/show` |

자격증명 파일(.credentials.json, auth.json 등)은 **절대 올라가지 않으며**,
업로드 직전 자격증명 패턴 검사가 fail-closed로 한 번 더 막습니다.
node_modules 같은 재생성 폴더와 캐시·SQLite WAL도 제외됩니다.

## Claude 데스크톱 앱에서 쓰기 (MCP)

```json
{ "mcpServers": { "bottari": { "command": "node", "args": ["<설치 경로>/bin/bottari.mjs", "mcp"] } } }
```

한 번 `bottari sync --remember-key` 로 열쇠를 OS 자격증명 저장소에 보관해두면,
Claude가 status/sync/충돌 해소/세대 복원을 대신 수행할 수 있습니다. 충돌은
목록으로 돌아오고, 사람이 고른 답을 기록한 뒤 다음 sync 가 적용합니다.

## 명령 요약

`init` `sync` `status` `generations` `restore` `doctor` `prune`
`projects` `tools` `secrets` `login` `logout` `mcp` — `bottari --help` 참조.

## 보안

설계 전체는 [SECURITY.md](SECURITY.md), 동기화 모델의 정의는
[docs/SYNC-MODEL.md](docs/SYNC-MODEL.md)에 있습니다. 요점:

- 클라우드의 평문은 메타 파일 하나(암호화 파라미터와 래핑된 키)뿐입니다
- 암호를 잊으면 데이터를 여는 방법이 없습니다 — 어디에도 백도어가 없습니다
- Node.js 20+ 만 필요하고 외부 의존성은 0개입니다

## License

GPL-3.0-only · Copyright (C) 2026 JUNG HWANGBO &lt;dostevskii@gmail.com&gt;
