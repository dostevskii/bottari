<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/bottari_logo_dark.svg">
    <img src="docs/assets/bottari_logo_light.svg" alt="BOTTARI" width="440">
  </picture>
</p>

<p align="center"><b>보따리</b> — 스킬·설정·세션을 하나의 보따리에 싸서,<br>
내 Google Drive를 통해 여러 컴퓨터 사이를 오갑니다.</p>

<p align="center"><a href="README.md">English</a> · <a href="README.ko.md"><b>한국어</b></a></p>

---

Claude Code와 Codex CLI 환경이 여러 컴퓨터(윈도우, 오래된 리눅스 노트북, 맥)에
흩어져 있을 때, **bottari**가 그것들을 하나로 맞춰줍니다. 스킬·설정·세션 기록·
프로젝트 폴더를 **내 Google Drive**에 암호화된 보따리로 싸두면, 모든 컴퓨터가
그것에 동기화됩니다. 클라우드에는 암호화된 데이터만 올라갑니다.

- **합집합 병합, 삭제 없음.** 한쪽에만 있는 것은 무조건 보존됩니다. 같은 파일이
  두 컴퓨터에서 다르게 바뀐 경우에만 어느 쪽을 남길지 묻습니다.
- **버전 관리.** 모든 동기화가 세대(generation)로 기록되고, `bottari restore`로
  언제든 이전 상태로 되돌릴 수 있습니다.
- **종단 간 암호화.** 클라우드의 평문은 파일 하나(암호화 파라미터와 봉인된 열쇠)
  뿐입니다. 암호를 잊으면 여는 방법이 없습니다 — 백도어가 없습니다.
- **의존성 0개.** Node.js 20 이상만 있으면 됩니다.

> **상태: 0.1.0.** Windows·Linux·macOS에서 매일 쓰고 있습니다. 초기 버전이니
> 거친 부분이 있을 수 있고, 잃으면 안 되는 것을 맡기기 전에
> [SECURITY.md](SECURITY.md)를 먼저 읽어보시길 권합니다.

## 설치

**Node.js 20 이상**과 **Google 계정**이 필요합니다. `node -v`로 확인하고,
없거나 낮으면 아래 OS별 안내대로 먼저 설치하세요.

### 윈도우 (Windows)

```powershell
# 1) Node — `node -v` 가 이미 v20 이상이면 건너뛰기
winget install OpenJS.NodeJS.LTS

# 2) bottari 받기 (둘 중 하나)
git clone https://github.com/dostevskii/bottari.git
#   또는: 초록색 "Code" 버튼에서 ZIP 다운로드 후 압축 풀기
cd bottari
npm link          # 어디서든 `bottari` 명령을 쓸 수 있게 함 (선택)
```

### 맥 (macOS)

```bash
# 1) Node — `node -v` 가 이미 v20 이상이면 건너뛰기
#    Homebrew 사용 시:
brew install node
#    또는 https://nodejs.org 에서 LTS .pkg 다운로드

# 2) bottari 받기
git clone https://github.com/dostevskii/bottari.git
cd bottari
npm link          # 선택; 또는 `node bin/bottari.mjs` 로 직접 실행
```

### 리눅스 (Linux)

```bash
# 1) Node 20+ — 배포판에 맞게 (예시)
#    Arch:   sudo pacman -S nodejs npm
#    데비안/우분투: sudo apt install nodejs npm   (확인: node -v ≥ v20)
#    페도라: sudo dnf install nodejs
# 2) bottari 받기
git clone https://github.com/dostevskii/bottari.git
cd bottari
# 로그인 정보를 안전하게 보관하려면 데스크톱 키링(gnome-keyring + libsecret)을
# 권장합니다. 없으면 0600 파일로 폴백하며 경고를 표시합니다.
```

## 처음 실행

데이터가 가장 많은 컴퓨터(보통 메인 컴퓨터)에서 실행하세요:

```
bottari init --remember-key
```

- 브라우저에서 Google 로그인을 하고 암호를 정합니다.
- **이 암호를 꼭 기억하세요.** 보따리 전체를 잠그며 복구할 수 없습니다.
- `--remember-key`는 열쇠를 OS 자격증명 저장소에 보관해 다시 묻지 않게 하고,
  Claude 데스크톱 확장이 암호 없이 동작할 수 있게 합니다.

다른 모든 컴퓨터에서도 같은 명령을 실행하면, bottari가 보따리를 내려받아 그
컴퓨터와 병합(각자 고유한 것은 모두 보존)한 뒤 결과를 다시 올립니다.

그다음부터는 일상적으로 이것 하나면 됩니다:

```
bottari sync
```

## 명령어

| | |
|---|---|
| `bottari sync` | 동기화 (`--dry-run` 으로 미리보기) |
| `bottari status` | 무엇이 오르내릴지 보기 (아무것도 바꾸지 않음) |
| `bottari restore --generation N` | 이전 버전으로 되돌리기 |
| `bottari generations` | 클라우드의 버전 목록 |
| `bottari doctor` | 환경·저장소 진단 |
| `bottari prune --keep N` | 오래된 세대 정리로 용량 회수 |
| `bottari projects add <경로>` | 프로젝트 폴더를 동기화 대상에 추가 |
| `bottari tools capture` / `show` | 설치 도구 기록·비교 |
| `bottari secrets set <이름>` | 설정에서 분리된 시크릿 값 채우기 |
| `bottari secrets sync --enable` | MCP 토큰도 함께 동기화 (기본 꺼짐, [SECURITY.md](SECURITY.md) 참고) |
| `bottari login` / `logout` | Google Drive 로그인 / 로그아웃 |

## Claude 데스크톱 (MCP)

bottari는 MCP 서버를 내장하고 있어 데스크톱 앱에서 Claude가 직접 조작할 수
있습니다.

1. 번들 빌드: `node scripts/build-mcpb.mjs` → `dist/bottari.mcpb`
2. Claude 데스크톱 → **설정 → 확장(Extensions)** → `bottari.mcpb` 드래그.

터미널에서 `bottari sync --remember-key`를 한 번 실행해 열쇠를 보관해두면,
Claude에게 *"bottari 상태 확인해줘"* 또는 *"bottari 동기화해줘"* 라고 하면 됩니다.
충돌은 목록으로 돌아오고, 선택하면 다음 sync가 적용합니다.

## 무엇이 동기화되나

| | 예 | 방식 |
|---|---|---|
| 자산 | 스킬, CLAUDE.md, AGENTS.md, hooks | 그대로 |
| 설정 | settings.json, config.toml, MCP 서버 | 기계 중립형만 공유. 경로는 자리표시자로, 시크릿은 OS 자격증명 저장소로 분리 |
| 세션 기록 | 대화 `.jsonl` | 8MB 청크, 이어쓰기는 자동 병합 |
| 프로젝트 | 등록한 폴더 | 이름으로 공유, 경로는 컴퓨터마다 |

자격증명 파일(`.credentials.json`, `auth.json` 등)은 절대 올라가지 않으며,
업로드 직전 자격증명 패턴 검사가 fail-closed로 한 번 더 막습니다. 재생성 가능한
폴더(`node_modules`, `dist` 등)와 캐시는 제외됩니다.

## Google 계정

내장된 OAuth 클라이언트는 `drive.file` 스코프로 제한됩니다 — 이 앱이 만든
파일만 볼 수 있고, Drive의 나머지는 보지 못합니다. 어떤 Google 계정으로도
로그인할 수 있습니다. `drive.file`은 Google 검수가 필요 없는 등급이라 검수를
받지 않았으므로, 브라우저에 "확인되지 않은 앱" 안내가 한 번 뜹니다 —
**고급 → 계속**으로 진행하면 됩니다.

설치형 앱이 다 그렇듯 내장 클라이언트는 비밀이 아닙니다(RFC 8252 §8.5).
이것은 bottari를 식별할 뿐 사용자를 보호하는 값이 아닙니다. 포크해서
재배포한다면 자체 클라이언트를 등록해 `BOTTARI_CLIENT_ID` /
`BOTTARI_CLIENT_SECRET`로 지정하세요.

## 보안

설계와 위협 모델: [SECURITY.md](SECURITY.md). 동기화 모델의 정의는
[docs/SYNC-MODEL.md](docs/SYNC-MODEL.md)에 있습니다.

## 라이선스

GPL-3.0-only · Copyright (C) 2026 JUNG HWANGBO &lt;dostevskii@gmail.com&gt;
