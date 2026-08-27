# Privacy Policy · 개인정보처리방침

**bottari** · Copyright (C) 2026 JUNG HWANGBO &lt;dostevskii@gmail.com&gt;
Last updated: 2026-08-27

---

## English

bottari is a command-line tool that you run on your own computers. It does
**not** operate any server, and its developer never receives, stores, or has
access to your data.

### What bottari accesses

- **Google Drive (`drive.file` scope only).** bottari can read and write
  **only the files it itself created** in your Google Drive — a single
  `bottari` folder. It cannot see any of your other Drive files. It uses this
  solely to store and retrieve your own encrypted backup.
- **Local files you point it at.** On your computer, bottari reads the CLI
  configuration, skills, session history, and project folders you choose to
  sync, in order to pack them into that encrypted backup.

### Where your data goes

- Your data is uploaded **only to your own Google Drive**, under your own
  Google account. It goes nowhere else. There is no bottari server, analytics,
  telemetry, or third party.
- Everything uploaded is **encrypted on your computer** before it leaves, with
  a key derived from a password only you know. The developer cannot decrypt it.
- **Credentials are never uploaded.** Credential files and secrets are excluded
  and, for configuration files, moved into your operating system's own
  credential store instead.

### Authentication

bottari signs in to Google using OAuth. The resulting sign-in token is stored
**only in your operating system's credential store** (Windows Credential
Manager / macOS Keychain / Linux Secret Service) on your own machine. It is
never transmitted anywhere except to Google's own authentication servers.

### Your control

- You can revoke bottari's access to your Google account at any time at
  <https://myaccount.google.com/permissions>.
- You can delete the `bottari` folder from your Google Drive at any time.
- Because the data is encrypted with your password and stored in your own
  Drive, you are in full control of it at all times.

### Contact

Questions: dostevskii@gmail.com

---

## 한국어

bottari는 사용자가 **자신의 컴퓨터에서 직접 실행**하는 명령줄 도구입니다.
어떠한 서버도 운영하지 않으며, 개발자는 사용자의 데이터를 받거나 저장하거나
접근할 수 없습니다.

### bottari가 접근하는 것

- **Google Drive (`drive.file` 스코프만).** bottari는 사용자의 Google Drive에서
  **자신이 만든 파일만**(하나의 `bottari` 폴더) 읽고 쓸 수 있습니다. 사용자의
  다른 Drive 파일은 볼 수 없습니다. 오직 사용자 본인의 암호화된 백업을 저장·조회
  하는 데에만 사용합니다.
- **사용자가 지정한 로컬 파일.** 사용자의 컴퓨터에서, 동기화하도록 선택한 CLI
  설정·스킬·세션 기록·프로젝트 폴더를 읽어 암호화된 백업으로 묶습니다.

### 데이터가 어디로 가는가

- 사용자의 데이터는 **사용자 본인의 Google 계정, 본인의 Google Drive에만**
  업로드됩니다. 그 외 어디로도 가지 않습니다. bottari 서버, 분석, 텔레메트리,
  제3자는 존재하지 않습니다.
- 업로드되는 모든 것은 컴퓨터를 떠나기 전에 **사용자의 컴퓨터에서 암호화**되며,
  암호는 사용자만 아는 비밀번호에서 유도됩니다. 개발자는 이를 복호화할 수 없습니다.
- **자격증명은 절대 업로드되지 않습니다.** 자격증명 파일과 시크릿은 제외되며,
  설정 파일의 경우 운영체제의 자격증명 저장소로 옮겨집니다.

### 인증

bottari는 OAuth로 Google에 로그인합니다. 발급된 로그인 토큰은 사용자 본인
컴퓨터의 **운영체제 자격증명 저장소**(Windows 자격 증명 관리자 / macOS 키체인 /
Linux Secret Service)에만 보관됩니다. Google의 인증 서버 외에 어디로도 전송되지
않습니다.

### 사용자의 통제권

- <https://myaccount.google.com/permissions> 에서 언제든 bottari의 계정 접근
  권한을 취소할 수 있습니다.
- 언제든 Google Drive에서 `bottari` 폴더를 삭제할 수 있습니다.
- 데이터가 사용자의 비밀번호로 암호화되어 사용자 본인의 Drive에 저장되므로,
  사용자는 항상 데이터를 완전히 통제합니다.

### 문의

dostevskii@gmail.com
