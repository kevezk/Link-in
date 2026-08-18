# LINK-IN 코드 맵 — 활성 코드와 보존 원본 구분

이 문서는 "어떤 파일을 고쳐야 실제 앱이 바뀌는가"를 한눈에 구분하기 위한 것이다.
원본 보존 원칙(`AUDIT.md`)에 따라 중복 파일을 **삭제하지 않는다.** 대신 여기에 역할을 명시한다.

기준: 2026-08-18, `sha256sum` 앞 12자리로 실제 동일 여부를 확인했다.

---

## 1. 활성 코드 (Active) — 여기를 고쳐야 앱이 바뀐다

실행 진입점은 **`Link-In-온라인 시스템`** 하나뿐이다.

```powershell
cd "Link-In-온라인 시스템"
npm start   # http://localhost:3000
```

| 경로 | 역할 |
| --- | --- |
| `Link-In-온라인 시스템/server.js` | Express + Socket.IO 서버, Supabase 인증 검증, Push 예약/발송 |
| `Link-In-온라인 시스템/package.json` | 실행 스크립트와 의존성. `npm run check`가 활성 JS 전체를 문법 검사 |
| `Link-In-온라인 시스템/public/index.html` | 통합 UI. 오늘·기록·상점·학급 4개 탭과 모든 모달 |
| `Link-In-온라인 시스템/public/app.js` | 루틴, 알람, 카메라 인증, 가챠, 잔디/통계 메인 엔진 |
| `Link-In-온라인 시스템/public/store.js` | 코인·아이템·잔디 저장소. localStorage ↔ Supabase 동기화 |
| `Link-In-온라인 시스템/public/avatar.js` | 4단계 캐릭터 성장, 스킨·장신구 렌더링 |
| `Link-In-온라인 시스템/public/ai.js` | Gemini Vision 사진 판정 + 키 없는 사용자용 데모 판정 |
| `Link-In-온라인 시스템/public/online.js` | 학급 소켓 클라이언트, 알림장, WebRTC, Push 구독 |
| `Link-In-온라인 시스템/public/pixelClassroom.js` | 2D Canvas 픽셀 교실 이동 엔진 |
| `Link-In-온라인 시스템/public/style.css`, `online.css` | 메인 / 학급 전용 스타일 |
| `Link-In-온라인 시스템/public/sw.js` | Service Worker. 캐시 버전을 올려야 수정이 반영된다 |
| `supabase/migrations/*.sql` | 원격 DB에 실제 적용된 스키마 이력 |

`runtime-config.js`는 파일이 아니라 서버가 `/runtime-config.js`로 동적 생성한다.
공개되는 값은 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY` 세 개뿐이며
`SUPABASE_SERVICE_ROLE_KEY`와 `VAPID_PRIVATE_KEY`는 서버에만 머문다.

---

## 2. 보존 원본 (Preserved) — 수정해도 앱에 반영되지 않는다

### 2-1. `Link-In-알림 기능 추가 버전/complete/` — PWA 원본 스냅샷

활성 `public/`의 조상이다. 아래 파일들은 아직 **바이트 단위로 동일**하다.

| 파일 | 상태 |
| --- | --- |
| `store.js` | `public/store.js`와 동일 (`ae3702e70924`) |
| `avatar.js` | `public/avatar.js`와 동일 (`af9d808b0628`) |
| `manifest.json` | `public/manifest.json`과 동일 (`f790514ff01d`) |

아래 파일들은 통합 과정에서 **이미 갈라졌다.** `complete/` 쪽이 옛 버전이다.

| 파일 | complete | public |
| --- | --- | --- |
| `app.js` | `d162345a1cf9` | `f82e1e1ca45b` |
| `index.html` | `b26ed77268a5` | `67f4de48c40e` |
| `style.css` | `1f07499714dd` | `0e304915d47b` |
| `sw.js` | `60147852f4eb` | `e359b35b7d51` |
| `ai.js` | `d8299cb5334a` | 2026-08-18 mock fallback 정책 변경으로 분기 |

`complete/`에는 자체 `.git`과 `vercel.json`, `CNAME`이 있다. 별도 배포 이력이 있는
독립 저장소이므로 통합본과 혼동하지 않는다.

### 2-2. `login/` 과 `Link-In-온라인 시스템/src/` — 동일한 미연결 샘플

두 폴더의 TS/React 파일 4개는 **완전히 같은 파일**이다. 어느 쪽도 빌드 대상이 아니며
(`package.json`에 번들러·React 의존성이 없다), 현재 로그인은 `public/app.js`와
`public/online.js`가 Supabase JS SDK로 직접 처리한다.

| 파일 | 해시 |
| --- | --- |
| `src/api/classService.ts` | `1782ecbac6d8` |
| `src/components/LoginForm.tsx` | `478d89d6bf40` |
| `src/components/TeacherDashboard.tsx` | `0bfb921a7098` |
| `src/lib/supabase.ts` | `8e1a6a455537` |

### 2-3. `category_gacha_part/` — 3벌 존재, 전부 미연결

| 위치 | 상태 |
| --- | --- |
| `category_gacha_part/` (최상위) | 원본 |
| `Link-In-알림 기능 추가 버전/complete/category_gacha_part/category_gacha_part/` | 최상위와 완전 동일 (중첩 경로는 압축 해제 사고로 보임) |

실제 가챠는 `public/app.js`의 `triggerLuckyBox` / `start3DGachaAnimation`과
`public/store.js`의 `playLuckyBox`가 담당하며, Supabase `user_items`에 연결되어 있다.
이 샘플 폴더는 어디에서도 로드되지 않는다.

### 2-4. 최상위 `index.html`

`644ce28744bd`. 어느 활성 파일과도 일치하지 않는 초기 전달본이다. 서버가 서빙하지 않는다.

---

## 3. ⛔ 실행 금지 파일

| 파일 | 이유 |
| --- | --- |
| `Link-In-온라인 시스템/sql/schema.sql` | 원격에 이미 존재하는 `public.profiles`를 새로 생성하려 한다 |
| `login/sql/schema.sql` | 위 파일과 완전 동일 (`c4e1391290e6`) |

DB 변경은 반드시 `supabase/migrations/`에 추가 SQL로 작성하고 Supabase MCP로 적용한다.

---

## 4. 파일을 고칠 때의 판단 기준

1. 실행되는 앱을 바꾸려는가 → `Link-In-온라인 시스템` 안에서만 고친다.
2. 정적 자산(JS/CSS/HTML)을 고쳤는가 → `public/sw.js`의 `CACHE_NAME` 버전을 올린다.
   올리지 않으면 기존 Service Worker 캐시가 수정본을 가린다.
3. DB 스키마를 바꾸는가 → 새 migration 파일을 만든다. 기존 파일을 수정하지 않는다.
4. `complete/`, `login/`, `src/`, `category_gacha_part/`를 고쳤다면
   → 그 변경은 앱에 반영되지 않는다. 활성 경로에 다시 적용해야 한다.
