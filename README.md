# 🌐 LINK-IN — 통합 워크트리 (Ecosystem Master Worktree)

**LINK-IN (오늘의 갓생 & 온라인 학급 시스템)** 프로젝트 전체 파일에 대한 통합 워크트리 및 모듈별 맵 문서입니다.

---

## 🌳 LINK-IN 전체 워크트리 (Master Directory Structure)

```text
Link-In-전체 파일/
│
├── 📄 README.md                                  # [마스터] 전체 프로젝트 통합 워크트리 및 가이드 문서
│
├── 📁 Link-In-알림 기능 추가 버전/                # 📱 [메인 웹/PWA 서비스 모듈]
│   ├── 📄 README.md                              # 모바일 갓생 웹앱 기능 및 Vercel/Supabase 설정 가이드
│   └── 📁 complete/                              # 🚀 PWA 웹 서비스 핵심 소스 코드
│       ├── 📄 index.html                         # 메인 갓생/루틴 UI 및 모달 화면
│       ├── 📄 style.css                          # LOCK-IN 메인 반응형 CSS 및 애니메이션
│       ├── 📄 app.js                             # 루틴, 사진 인증, 보상, 카메라 제어 메인 엔진
│       ├── 📄 store.js                           # 로컬 저장소 및 Supabase 데이터 동기화 계층
│       ├── 📄 avatar.js                          # 4단계 캐릭터 성장, 스킨 및 장신구 렌더링
│       ├── 📄 ai.js                              # Gemini Vision API 사진 인증 피드백 판정 모듈
│       ├── 📄 runtime-config.js                  # 런타임 환경 설정
│       ├── 📄 manifest.json                      # PWA 웹 앱 매니페스트 (홈 화면 추가)
│       ├── 📄 sw.js                              # PWA 서비스워커 (오프라인 캐시 & Push 알림)
│       ├── 📄 vercel.json                        # Vercel 배포 설정
│       ├── 📄 CNAME                              # 커스텀 도메인 설정
│       ├── 🖼️ cover_gatsaeng.jpg / .webp         # 커버 이미지 자원
│       ├── 🖼️ icon-192.png / icon-512.png         # PWA 앱 아이콘
│       ├── 🖼️ sprout_stage1~4 png / webp         # 캐릭터 성장 4단계 그래픽 패키지
│       └── 📁 category_gacha_part/               # PWA 연동 가챠 서브모듈
│
├── 📁 Link-In-온라인 시스템/                      # 🏫 [실시간 화상 & 픽셀 교실 서버/클라이언트 모듈]
│   ├── 📄 README.md                              # 온라인 시스템 & 통합 워크트리 설명
│   ├── 📄 server.js                              # Express + Socket.IO 백엔드 실시간 소켓 서버
│   ├── 📄 package.json                           # Node.js 설정 및 의존성 패키지 정의
│   ├── 📄 package-lock.json                      # 의존성 잠금 파일
│   ├── 📁 public/                                # 실시간 픽셀 교실 웹 인터페이스
│   │   ├── 📄 index.html                         # 학급 방 입장 폼, 픽셀 교실 Canvas, 알림장 UI
│   │   ├── 📄 app.js                             # Socket.IO 연동 클라이언트 이벤트 핸들러
│   │   ├── 📄 pixelClassroom.js                  # 2D Canvas 격자 맵 및 아바타 이동 엔진
│   │   └── 📄 style.css                          # 픽셀 교실 전용 스타일시트
│   ├── 📁 sql/                                   # 데이터베이스 모듈
│   │   └── 📄 schema.sql                         # Supabase classes, profiles 테이블 및 반장 임명 RPC
│   └── 📁 src/                                   # TS/React 학급 관리 & 인증 모듈
│       ├── 📁 api/
│       │   └── 📄 classService.ts                # 학급 조회/생성 및 반장 부여 API
│       ├── 📁 components/
│       │   ├── 📄 LoginForm.tsx                   # 학급 입력 로그인/회원가입 컴포넌트
│       │   └── 📄 TeacherDashboard.tsx            # 선생님 전용 학급 대시보드
│       └── 📁 lib/
│           └── 📄 supabase.ts                    # Supabase JS Client
│
├── 📁 category_gacha_part/                       # 🎲 [독립 카테고리 가챠 (뽑기) 모듈]
│   ├── 📄 README_INTEGRATION_GUIDE.md            # 가챠 모듈 연동 안내서
│   ├── 📄 index.html                             # 가챠 UI 메인 인터페이스
│   ├── 📄 script.js                              # 가챠 확률 및 애니메이션 인터랙션 로직
│   └── 📄 style.css                              # 가챠 컴포넌트 전용 스타일
│
└── 📁 login/                                     # 🔐 [독립 학급 자동 로그인 & 권한 모듈]
    ├── 📄 README.md                              # 모듈 연동 및 RLS 정책 가이드
    ├── 📁 sql/
    │   └── 📄 schema.sql                         # 학급 & 프로필 테이블 SQL 스키마
    └── 📁 src/
        ├── 📁 api/
        │   └── 📄 classService.ts                # API 서비스 인터페이스
        ├── 📁 components/
        │   ├── 📄 LoginForm.tsx                   # 로그인 온보딩 UI
        │   └── 📄 TeacherDashboard.tsx            # 학급 구성원 대시보드
        └── 📁 lib/
            └── 📄 supabase.ts                    # Supabase 초기화 설정
```

---

## 🛠️ 서브시스템별 핵심 역할

1. **Link-In-알림 기능 추가 버전 (`complete/`)**:
   - 모바일 최적화 반응형 PWA (Vercel 배포)
   - 루틴 체크, 사진 인증 AI 판정 (Gemini Vision), 4단계 캐릭터 성장, 잔디 차트 및 서비스워커 알림 기능
2. **Link-In-온라인 시스템**:
   - 학교-학년-반 단위 소켓 룸 분리 (`server.js`)
   - 2D Canvas 기반 픽셀 교실 실시간 동기화 (`pixelClassroom.js`)
   - 학급 알림장 작성 및 권한 제어
3. **login**:
   - Supabase RLS(Row Level Security) 정책 적용
   - `set_class_president` 단일 반장 임명 RPC 함수
   - 자동 학급 할당 회원가입 폼
4. **category_gacha_part**:
   - 카테고리 무작위 가챠 룰렛 모듈

---

## 현재 통합 작업본 실행

실제 로컬 통합 진입점은 `Link-In-온라인 시스템/public`이며 Express/Socket.IO 서버가 이를 제공합니다.

```powershell
cd "Link-In-온라인 시스템"
npm start
```

브라우저에서 `http://localhost:3000`을 엽니다.

- `.env`에는 기존 sample 프로젝트의 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`가 필요합니다.
- `.env`는 Git에서 제외됩니다. **브라우저로 내려가는 값은 anon key뿐이며**, secret/service-role key는 어떤 경우에도 클라이언트 자산이나 `/runtime-config.js`에 포함되지 않습니다.
- 변경 이력은 `CHANGELOG.md`, 재검사 결과는 `AUDIT.md`, DB 적용 주의사항은 `supabase/README.md`를 확인합니다.
- **어떤 파일이 실제 실행되는 코드이고 어떤 파일이 보존용 원본인지는 `CODE_MAP.md`를 확인합니다.**
- **사용 중인 기술 스택 전체는 `TECH_STACK.md`, 구현된 기능 명세는 `FEATURES.md`를 확인합니다.**

### 선택 환경변수 (서버 전용)

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | 없음 (**의도적 미설정**) | 설정하면 서버 부팅 시 `push_jobs`의 대기 예약을 사용자 재접속 없이 복원합니다. 아래 사유로 현재 사용하지 않습니다. |
| `PUSH_SWEEP_INTERVAL_MS` | `300000` | 예약 점검 주기 |
| `PUSH_OVERDUE_GRACE_MS` | `600000` | 서버 중단 중 지나간 예약을 늦게라도 발송할 유예 시간. 초과분은 `failed`로 기록합니다. |
| `GEMINI_API_KEY` | 없음 | 설정하면 사진 판독을 서버 프록시(`POST /api/ai/analyze`)로 처리합니다. 없으면 클라이언트는 데모 판정으로 동작합니다. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | 판독에 사용할 모델. `gemini-2.5-flash`는 신규 사용자에게 404를 반환하므로 사용할 수 없습니다. |
| `AI_RATE_PER_MINUTE` / `AI_RATE_PER_HOUR` | `5` / `40` | 사용자당 판독 호출 한도 |
| `AI_MAX_IMAGE_BYTES` | `2097152` | 판독 이미지 디코딩 후 최대 크기 |
| `AI_JSON_LIMIT` | `4mb` | `/api/ai/analyze` 전용 본문 한도 (다른 경로는 64kb 유지) |
| `AI_TIMEOUT_MS` | `30000` | Gemini 호출 타임아웃 |

`SUPABASE_SERVICE_ROLE_KEY`와 `GEMINI_API_KEY`는 서버 프로세스만 읽습니다.
로컬 `.env`에만 두고 저장소·문서·클라이언트 어디에도 값을 남기지 않습니다.
`/runtime-config.js`가 내보내는 것은 키 값이 아니라 `AI_PROXY_ENABLED` 불리언 플래그와 모델명뿐입니다.

#### `SUPABASE_SERVICE_ROLE_KEY`를 쓰지 않는 이유 (2026-08-18 결정)

이 키를 넣으면 서버가 부팅할 때 대기 중인 Push 예약을 한 번에 복원할 수 있습니다.
하지만 사용자가 앱을 열면 `online.js`의 `restoreExistingPushSubscription()`이
이미 예약을 복원하므로, 키가 실제로 메꾸는 공백은 아래가 **모두 겹칠 때**뿐입니다.

1. 서버가 재시작되고 (`PUSH_OVERDUE_GRACE_MS` 10분도 초과)
2. 해당 사용자가 알람 시각 전까지 앱을 한 번도 열지 않고
3. 그 사이에 예약된 알람이 있음

반면 이 키는 RLS를 전면 우회하므로 유출되면 전체 사용자 데이터가 열립니다.
좁은 이득 대비 위험이 커서 현재는 설정하지 않습니다.

상시 백그라운드 발송이 실제로 필요해지면, 키를 서버에 두는 대신
**Supabase Edge Function + cron**으로 옮기는 편이 안전합니다.
그 경우 키가 Supabase 인프라 밖으로 나오지 않습니다.

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY`는 모든 RLS 정책을 우회하는 DB 마스터 키입니다.
> 이 값이 유출되면 전체 사용자 데이터가 노출됩니다. Vercel 등에 배포할 때도
> 클라이언트 번들이 아니라 **서버 환경변수**로만 설정하세요.
>
> 안전장치로 서버는 기동 직전 `assertNoSecretLeak()`을 실행합니다.
> `/runtime-config.js` 응답에 위 비밀값 중 하나라도 섞이면 예외를 던지고 포트를 열지 않습니다.
> 즉 실수로 노출 코드를 넣으면 배포가 아니라 로컬 실행 단계에서 바로 실패합니다.

### AI 사진 판독 동작

1. `GEMINI_API_KEY`가 설정되어 있으면 브라우저는 키를 전혀 보지 못하고 `/api/ai/analyze`를 호출합니다.
   서버가 Supabase 세션을 검증하고, 사용자별 호출 한도를 적용한 뒤 Gemini를 대신 호출합니다.
   클라이언트는 전송 전에 이미지를 긴 변 768px로 축소합니다.
2. 키가 없으면 종전처럼 사용자가 앱에 직접 넣은 키(localStorage)를 쓰고, 그것도 없으면 데모 판정으로 동작합니다.
3. 판독이 실패하면 성공·실패 어느 쪽으로도 기록하지 않고 재촬영만 안내합니다. 난수 보상은 주지 않습니다.

> AI Studio가 발급하는 신형 `AQ.` 키는 `?key=` 쿼리 파라미터를 받지 않습니다.
> 서버와 클라이언트 모두 `x-goog-api-key` 헤더로 전송합니다.
>
> `gemini-2.5-flash`는 모델 목록에는 보이지만 신규 사용자에게는 차단되어
> `404 NOT_FOUND ... no longer available to new users`를 반환합니다.
> 모델 문제를 다시 만나면 `node --env-file=.env diagnose-gemini.js`로 사용 가능한 조합을 찾을 수 있습니다.

## 배포 원칙

1. 로컬 문법 검사와 브라우저 검증을 먼저 완료합니다.
2. Supabase migration은 SQL 파일 검토 후 Supabase MCP로 적용합니다.
3. DB 검증이 끝난 뒤에만 Vercel MCP를 사용해 배포합니다.
4. 기존 스키마 삭제나 초기화가 필요하면 작업 전에 별도 승인을 받습니다.
