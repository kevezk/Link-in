# LINK-IN 통합 작업 기록

이 문서는 `sample/Link-In-전체 파일` 작업 복사본에서 수행한 모든 변경을 기록한다.
원본 `Downloads/Link-In-전체 파일`은 수정하지 않는다.

## 2026-08-18 — 가입 시 역할 선택 + 교사 코드 검증

### 배경

- 기존에는 `join_class`가 무조건 `student`로 넣고, 반장만 선생님이 임명할 수 있었다.
  선생님이 되는 경로가 DB 직접 조작밖에 없어 실사용이 불가능했다.
- 사용자가 가입 시 역할을 고를 수 있게 요청했다. 다만 아무 검증 없이 열면
  학생이 선생님을 선택해 알림장 작성 권한과 반장 임명 권한을 가져갈 수 있다.
  협의 결과 **선생님은 교사 코드로 검증**하고 반장은 기존 임명 방식을 유지하기로 했다.

### 교사 코드를 DB 안에서 검증하는 이유

- 브라우저가 Supabase RPC를 직접 호출하므로 클라이언트 검사는 콘솔에서 우회된다.
- Node 서버에 검사를 두어도 브라우저가 서버를 거치지 않고 Supabase로 직행할 수 있다.
- 우회 불가능한 지점은 DB 함수 내부뿐이라 거기서 대조한다.

### 마이그레이션 (`20260818093000_add_role_selection_and_teacher_code.sql`)

- `app_config` 테이블 추가. **RLS를 켜고 정책을 하나도 만들지 않았다.**
  Postgres는 RLS가 켜져 있고 허용 정책이 없으면 전면 차단이므로 anon·authenticated 모두 조회 불가.
  `REVOKE`까지 걸어 이중으로 막았다.
- `join_class_with_role(school, grade, class_no, name, role, teacher_code)` 추가.
  `security definer`라 함수만 `app_config`를 읽는다. 코드 불일치면 `raise exception`으로 전체 롤백된다.
  기존 `join_class`(4인자)는 삭제하지 않고 그대로 뒀다. 시그니처 충돌을 피하려고 이름을 달리했다.
- 역할 잠금: 기존 멤버십이 있으면 `resolved_role := existing_membership.role`로 고정한다.
  학급을 옮겨도 유지된다. 단 반장이 이미 반장이 있는 학급으로 옮기면
  `one_president_per_class` 제약 위반을 피하려고 학생으로 내린다.
- `president`는 가입 단계에서 선택할 수 없다. 요청하면 예외를 던진다.
- `is_teacher_signup_enabled()` 추가. **설정 여부(boolean)만 반환하고 코드 값은 절대 반환하지 않는다.**
- 마이그레이션 파일에는 실제 코드값을 넣지 않았다. 저장소에 비밀이 남지 않게 하기 위해서다.
- 붙여넣기 한 번으로 끝나는 `supabase/SETUP_TEACHER_CODE.sql` 합본을 별도로 제공했다.
  마이그레이션 + 코드 등록 + 확인까지 포함하며 여러 번 실행해도 안전하다.

### 클라이언트

- 입장 폼의 "역할은 자동 확인됩니다" 안내문을 학생/선생님 선택 버튼으로 교체했다.
- 선생님을 고를 때만 교사 코드 입력란이 나타난다. 학생으로 되돌리면 입력값도 지운다.
- 이미 가입한 사용자는 `class_memberships`를 조회해 역할을 확인하고,
  선택 버튼 대신 잠긴 배지(`🎒 학생 🔒`)를 보여준다. 반장이면 임명받았다는 문구를 띄운다.
- DB가 던지는 영문 예외를 전부 한글 안내로 변환한다.
  마이그레이션 미적용 상태도 감지해 "역할 기능이 아직 적용되지 않았습니다"로 안내한다.

### 확인된 기존 동작

- 알림장 편집 권한은 이미 선생님·반장 둘 다 허용되어 있었다.
  `upsert_class_notice` RPC와 Node 소켓 핸들러 양쪽에서 `('teacher','president')`로 검증한다.
  추가 작업이 필요 없어 그대로 뒀다.

### 검증

- 28개 항목 통과. UI 구조뿐 아니라 **SQL 안전성도 테스트로 고정**했다.
  `app_config` 정책 부재, `authenticated` 권한 회수, `security definer`와 `search_path` 고정,
  president 가입 차단, 기존 역할 유지, 마이그레이션 내 코드값 부재 등.
- 기존 캐릭터 14개·로그아웃 15개 테스트도 회귀 없이 통과했다.

### 미완료

- **원격 DB 적용은 사용자가 직접 해야 한다.** 이 세션에는 Supabase MCP가 없다.
- 선생님의 학급 추방 기능은 사용자 요청으로 다음 작업으로 미뤘다.

### 자산 버전

- `online.js?v=9`, `online.css?v=6`, Service Worker 캐시 `link-in-integrated-v16`.

## 2026-08-18 — 로그아웃 노출 개선 및 태극기 교체

### 로그아웃

- 로그아웃 기능 자체는 이미 있었으나 도달 경로가 **헤더의 동기화 상태 텍스트 클릭** 하나뿐이었다.
  클릭 가능하다는 표시가 없어 사실상 숨겨진 기능이었다.
- 상단에 계정 버튼(`#accountBtn`)을 새로 추가했다. 로그인 상태면 계정명과 강조색,
  게스트면 '게스트'로 표시해 현재 상태를 한눈에 보여준다. 긴 계정명은 10자에서 말줄임한다.
- 로그아웃에 확인 모달을 넣었다. 실수 클릭을 막고, 무엇이 일어나는지 미리 알려준다.
  - 계정 이메일 표시
  - 게스트 모드로 전환된다는 안내
  - 클라우드 기록은 지워지지 않는다는 안내
  - **학급 서버 접속 중이면 "연결도 함께 끊긴다"는 경고를 맨 위에 추가**
- 확인 모달은 배경 클릭과 ESC로 닫히며, 처리 중에는 두 버튼이 모두 비활성화된다.
- 실패 시 모달을 닫고 계정 창을 다시 열어 오류 메시지를 보여준다.
  기존에는 실패해도 사용자가 원인을 볼 방법이 없었다.
- `logoutCurrentUser()`를 `openLogoutConfirm()` / `performLogout()`으로 분리했다.
- 확인 모달은 `.modal-overlay`가 아니라 `.confirm-modal` 클래스를 쓴다.
  `online.css`의 학급 다크 테마가 `.modal-overlay`를 전역으로 덮어써서
  그대로 쓰면 밝은 루틴 화면에서 대비가 깨진다.
- 데스크톱에서는 `.sync-status`가 absolute로 배치돼 있어, 래퍼 `.account-row`가
  같은 앵커를 이어받고 내부 상태 표시는 static으로 되돌리도록 했다.
- jsdom으로 실제 `index.html` DOM에 붙여 15개 항목을 검증했다.

### 태극기

- 픽셀 교실 칠판 옆 국기가 **흰 바탕에 빨간 원, 즉 일장기**로 그려져 있던 것을 태극기로 교체했다.
- `drawKoreanFlag()`를 추가했다. 규격을 지켜 그린다.
  - 가로세로 3:2, 태극 지름은 깃발 높이의 1/2
  - 태극은 깃발 대각선 각도(`atan(2/3)` ≈ 33.69°)만큼 반시계로 기울여 빨강이 위·왼쪽에 오게 함
  - 반지름 절반 원 두 개로 S자 경계 생성
  - 4괘는 건(왼쪽 위) · 감(오른쪽 위) · 리(왼쪽 아래) · 곤(오른쪽 아래).
    위키백과 기준으로 배치를 확인했다. 네 괘 모두 상하 대칭이라 막대 순서는 영향이 없다.
  - 막대는 각 모서리에서 태극을 향하도록 반지름 방향에 수직으로 회전시킨다
- 국기 크기를 50x35에서 60x40으로 키워 4괘가 식별되게 했다.
- 렌더링 후 픽셀 샘플링으로 위=빨강, 아래=파랑, 왼쪽=빨강, 오른쪽=파랑을 확인했다.

### 자산 버전

- `app.js?v=31`, `style.css?v=30`, `pixelClassroom.js?v=5`,
  Service Worker 캐시 `link-in-integrated-v15`로 올렸다.

## 2026-08-18 — 학급 캐릭터 6종 도입

- 학급 서버의 절차적 도형 캐릭터를 사용자가 제공한 3D 렌더 캐릭터 6종으로 교체했다.
- 사용자가 올린 `characters.png`(2680x874) 한 장을 6개 투명 PNG/WebP로 분할했다.
  - 균등 6분할은 캐릭터 간격이 불규칙해 3번·6번이 잘리는 것을 확인하고,
    배경이 아닌 픽셀의 열 프로파일로 **실제 경계를 자동 검출**하도록 바꿨다.
  - 배경 제거는 단순 임계값이 아니라 **테두리에서 시작하는 flood fill**을 썼다.
    임계값 방식은 눈·안경 반사 같은 캐릭터 내부의 흰색까지 지운다.
  - 높이 256px로 통일, WebP 기준 개당 약 10KB(6종 합계 66KB).
- `public/characters.js`를 추가해 카탈로그와 스프라이트 캐시를 한 곳에서 관리한다.
  입장 선택 화면·구성원 목록·픽셀 교실이 모두 이 정의를 공유한다.
- 입장 폼의 색상 선택기(`<input type="color">`)를 6종 썸네일 선택 UI로 교체했다.
  미선택은 흑백, 선택은 원색과 테두리로 표시하며 좌우 방향키 조작을 지원한다.
- 서버는 `avatarColor` 정규식 검증 대신 **6개 ID 화이트리스트**로 검증한다.
  목록 밖 값은 기본값으로 대체하고, 대표색은 서버가 ID에서 결정한다.
- 픽셀 교실은 스프라이트를 그리되, 로딩 전이나 실패 시 기존 도형으로 폴백한다.
  왼쪽 이동 시 좌우 반전, 걷는 동안 위아래 hop 애니메이션을 적용했다.
- 반장 왕관과 선생님 안경을 캔버스에 덧그리던 코드를 제거했다.
  3D 스프라이트 위의 벡터 장식이 이름표와 겹치고 재질도 겉돌았으며,
  이름표에 이미 역할 아이콘이 있어 중복이었다.
- 이름표 테두리에 캐릭터 대표색을 반영해 멀리서도 구분되게 했다.
- Playwright로 선택 UI와 6명이 입장한 픽셀 교실을 실제 렌더링해 확인했다. 콘솔 오류 없음.
- 신규 검증 14개 항목 통과: 화이트리스트 검증, 클라이언트·서버 ID/색상 일치,
  참조 이미지 존재, SW 캐시 등록, 스크립트 로드 순서, 구 색상 선택기 제거 등.
- 기존 46개 테스트(프록시 19, Push 11, AI 7, 유출가드 9)도 회귀 없이 통과했다.
- `online.js?v=8`, `pixelClassroom.js?v=4`, `online.css?v=5`, `characters.js?v=1`,
  Service Worker 캐시 `link-in-integrated-v14`로 올리고 이미지 6종을 캐시 목록에 추가했다.

## 2026-08-18 — service_role 키 미도입 결정

- `SUPABASE_SERVICE_ROLE_KEY` 도입을 검토하다 위험 대비 이득이 맞지 않아 **넣지 않기로 결정**했다.
- 재검토 근거: `online.js`의 `restoreExistingPushSubscription()`이 앱 로드 시 자동 실행되어
  대기 중인 예약을 이미 복원한다. 키가 메꾸는 공백은 "서버 재시작 + 유예 10분 초과 +
  해당 사용자가 알람 시각 전까지 미접속"이 모두 겹칠 때로 한정된다.
- 반면 이 키는 RLS를 전면 우회해 유출 시 전체 사용자 데이터가 노출된다. 프로토타입 단계에서
  평문 `.env`에 둘 만한 교환비가 아니라고 판단했다.
- `.env`의 빈 항목을 제거하고 판단 근거를 주석으로 남겼다. 나중에 다시 검토할 때
  같은 논의를 반복하지 않도록 대안(Edge Function + cron)도 함께 적었다.
- sweep 코드 자체는 그대로 둔다. opt-in 구조라 키가 없으면 경고 로그만 남기고 동작하지 않는다.
- 직전 커밋에서 추가한 `assertNoSecretLeak()` 유출 가드는 유지한다. `GEMINI_API_KEY`와
  `VAPID_PRIVATE_KEY`에도 동일하게 적용되므로 service_role 도입 여부와 무관하게 가치가 있다.

## 2026-08-18 — 비밀값 유출 가드 추가

- `SUPABASE_SERVICE_ROLE_KEY`를 도입하기로 하면서, 이 키가 실수로 클라이언트에 새는 경로를 코드로 차단했다.
- `assertNoSecretLeak()`을 추가해 서버 부팅 시 `/runtime-config.js` 응답 본문을 검사한다.
  `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `VAPID_PRIVATE_KEY` 중 하나라도 포함되어 있으면
  예외를 던져 포트를 열지 않는다. 오류 메시지에도 키 값 자체는 출력하지 않는다.
- `server.listen()` 이전에 실행하므로, 향후 누군가 `publicRuntimeConfig()`에 비밀값을 추가하면
  배포가 아니라 로컬 기동 단계에서 즉시 실패한다.
- 검증 9개 항목 통과: 정상 기동, 세 비밀값 각각 미노출, anon 키와 VAPID 공개키는 정상 포함,
  일부러 유출 코드를 심었을 때 기동 차단, 차단 사유 명시, 차단 메시지에 키 값 미출력.
- `.env`에 `SUPABASE_SERVICE_ROLE_KEY=` 빈 항목과 발급 위치 주석만 추가했다.
  값은 사용자가 직접 입력한다. 이 키는 RLS를 전면 우회하므로 대화·문서·저장소 어디에도 남기지 않는다.
- 기존 테스트 46개(프록시 19, Push 11, AI 7, 패널 9)도 회귀 없이 통과했다.

## 2026-08-18 — Gemini 모델 교체 (2.5-flash 404 해결)

- 프록시 전환 후 실기기에서 `AI 판독 서비스 오류 (HTTP 404)`가 발생했다.
- `diagnose-gemini.js`로 확인한 결과 키·엔드포인트·인증은 모두 정상이었고
  (`/v1beta/models` HTTP 200, generateContent 지원 모델 37개), 모델 하나만 문제였다.
- Gemini 응답: `This model models/gemini-2.5-flash is no longer available to new users.
  Please update your code to use models/gemini-3.6-flash`
- `gemini-2.5-flash`는 목록 API에는 나타나지만 신규 사용자에게는 차단된 상태다.
  v1beta와 v1 양쪽 모두 동일하게 404였다.
- 기본 모델을 `gemini-3.6-flash`로 바꿨다. `.env`의 `GEMINI_MODEL`도 함께 갱신했다.
- 모델명을 `/runtime-config.js`로 내려보내 BYOK 경로가 서버와 같은 모델을 쓰도록 했다.
  기존에는 `ai.js`에 `gemini-2.5-flash`가 하드코딩되어 있어 따로 관리해야 했다.
- 3.x 계열의 내부 추론 시간을 고려해 `AI_TIMEOUT_MS` 기본값을 25초에서 30초로 올렸다.
- 재현 가능한 진단 도구로 `Link-In-온라인 시스템/diagnose-gemini.js`를 남겼다.
  키 값은 출력에서 마스킹하며, 사용 가능한 모델을 나열하고 동작하는 조합을 자동 탐색한다.
- 프록시 19개, Push 11개, AI 판정 7개 테스트가 모두 통과했다.
- `ai.js?v=31`, Service Worker 캐시 `link-in-integrated-v13`으로 올렸다.

## 2026-08-18 — Gemini 판독 서버 프록시 전환

### 배경

- 사용자가 AI Studio에서 발급한 키가 신형 `AQ.` 형식이었다. Google이 legacy `AIza` 키 발급을
  중단하면서 전환한 형식이며, 공식 문서도 `?key=` 쿼리 대신 `x-goog-api-key` 헤더를 안내한다.
- 기존 `ai.js`는 `?key=`를 쓰고 있어 신형 키로는 동작하지 않을 가능성이 높았다.
- 겸사겸사 AUDIT 7번(브라우저 localStorage BYOK)을 함께 해소했다.

### 서버

- `POST /api/ai/analyze`를 추가했다. 키는 `.env`의 `GEMINI_API_KEY`로만 존재하며
  `/runtime-config.js`에는 `AI_PROXY_ENABLED` 불리언만 내보낸다. 키 값은 클라이언트로 가지 않는다.
- Supabase 세션을 검증해 로그인 사용자만 허용한다. 비로그인 요청은 상류 호출 없이 401로 끊는다.
- 사용자별 호출 한도(기본 5회/분, 40회/시간)를 적용한다. 형식 검증을 통과한 요청만 한도에 계산하고,
  한도 판정은 Gemini 호출 직전에 두어 비용이 새지 않게 했다.
- 이미지 크기 상한(기본 2MB 디코딩 기준)과 mime 화이트리스트를 검증한다.
- `/api/ai/analyze`에만 4MB 본문 파서를 앞에 두었다. 기존 64kb 전역 한도는 다른 경로에 그대로 유지된다.
- 상류 오류 메시지를 그대로 내보내지 않는다. 서버 로그에만 남기고 클라이언트에는 일반화된 문구를 준다.
- 응답 점수를 0~100으로 clamp하고, `pass`가 점수와 어긋나면 점수(70점 기준)를 우선한다.
- 호출 기록 Map은 10분마다 정리해 무한 증가를 막는다.

### 클라이언트

- `ai.js`에 `analyzeWithProxy()`를 추가했다. `AI_PROXY_ENABLED`가 참이면 항상 프록시를 쓴다.
- 전송 전에 긴 변 768px, JPEG 품질 0.8로 축소한다. 원본은 `toDataURL('image/jpeg')` 기본 품질에
  카메라 해상도 그대로라 1080p에서 base64 1MB를 넘길 수 있었다.
- BYOK 경로도 `?key=` 쿼리를 `x-goog-api-key` 헤더로 바꿨다. URL에 키가 남지 않는다.
- 프록시 실패는 기존 정책대로 `errored`로 처리한다. 난수 mock 보상은 어느 경로에서도 주지 않는다.

### 검증

- 가짜 Supabase auth와 Gemini 스텁으로 17개 항목 통합 테스트를 작성해 전부 통과했다.
  (비로그인·잘못된 토큰 차단, 차단 시 상류 미호출, 정상 판정 전달, 응답·URL·runtime-config 키 미노출,
  헤더 전송 확인, 모델 유지, 이미지 초과 413, 빈 미션 400, 분당 한도 통과/초과, 한도 초과 시 상류 미호출,
  1.5MB 본문이 전역 64kb 파서에 막히지 않고 앱 검증에 도달, 프록시 플래그 노출)
- Push 복원 11개, ai.js 판정 모드 7개, 패널 DOM 9개 기존 테스트도 회귀 없이 통과했다.
- 실제 Gemini 호출은 이 작업 환경에서 `generativelanguage.googleapis.com` 이그레스가 막혀 있어
  검증하지 못했다. 신형 `AQ.` 키의 실제 동작은 로컬 서버 실행으로 확인해야 한다.

### 자산 버전

- `ai.js?v=30`, Service Worker 캐시 `link-in-integrated-v12`로 올렸다.
- `.env`에 `GEMINI_API_KEY`, `GEMINI_MODEL`을 추가했다. `.env`는 `.gitignore` 대상이다.

## 2026-08-18 — 리스크 3건 해소 (Push 복원 / AI fallback / 코드 맵)

### 1. Push 예약 복원을 서버 주도로 변경

- 기존에는 `push_jobs`에 예약을 영속 저장해도 타이머 복원 트리거가 사용자의 `/api/push/subscribe`
  재호출뿐이어서, 서버를 재시작한 뒤 사용자가 접속하지 않으면 예약이 조용히 사라졌다.
- `SUPABASE_SERVICE_ROLE_KEY`가 설정된 경우 서버 부팅 시 `sweepPendingPushJobs()`가 대기 작업을
  직접 조회해 복원하고, 이후 `PUSH_SWEEP_INTERVAL_MS`(기본 5분)마다 다시 점검한다.
- 키가 없으면 기존 동작을 유지하고 부팅 로그에 경고만 남긴다. 동작을 강제로 바꾸지 않는다.
- 서버가 멈춰 있는 동안 지나간 예약은 `PUSH_OVERDUE_GRACE_MS`(기본 10분) 안이면 지연 발송하고,
  넘겼으면 `failed`로 기록한다. 상태값은 기존 check 제약(`pending/sent/failed/cancelled`) 안에서만 쓴다.
- 예약은 최대 7일 뒤까지 잡히는데 발송 시점에는 예약 당시의 access token이 이미 만료돼 있어
  상태 기록이 실패하던 문제를 함께 고쳤다. service role이 있으면 그 자격으로 기록한다.
- `setTimeout` 지평선을 sweep 주기의 2배로 제한해 먼 미래 예약을 프로세스 메모리에 쌓지 않는다.
- 한 사용자의 여러 구독 엔드포인트 전부로 발송하고, `404/410` 응답을 받은 죽은 구독은 삭제한다.
- 같은 작업이 sweep과 타이머에서 중복 발송되지 않도록 in-flight 집합으로 막았다.
- 구독이 아직 없는 미래 예약은 그 사이에 구독이 생길 수 있으므로 `pending`으로 남긴다.
- 가짜 Supabase REST 서버와 web-push 스텁으로 11개 시나리오 통합 테스트를 작성해 전부 통과했다.
  (타이머 복원, 유예 내 지연 발송, 유예 초과 만료, 구독 없음 분기 2종, 지평선 밖 미변경,
  죽은 구독 정리, 다중 엔드포인트 발송, service role 자격 사용, 중복 발송 없음)
- DB 스키마 변경은 없다. 신규 migration을 만들지 않았다.

### 2. AI 판독 실패 시 난수 mock 보상 제거

- 기존에는 Gemini 호출이 실패하면 키워드 정규식과 `Math.random()`으로 만든 mock 판정을 그대로
  반환해, 판독이 안 된 상태에서도 통과 판정과 코인 보상이 나갈 수 있었다.
- `ai.js`의 `analyze()`가 실패 시 `errored: true`, `pass: false`, `score: null`을 반환하도록 바꿨다.
- `app.js`는 이 경우 실패 패널을 '판독 오류' 모드로 띄운다. 점수 배지와 '실패 확정' 버튼을 감추고
  재촬영 버튼만 남겨, 성공·실패 어느 쪽으로도 기록되지 않음을 명시한다.
- API 키가 없는 사용자의 데모 판정은 그대로 두되 결과에 `[데모 판정]` 표시를 붙였다.
- `ai.js` 판정 모드 3종과 실제 `index.html` DOM 기준 패널 동작 9개 항목을 검증해 전부 통과했다.

### 3. 활성 코드와 보존 원본을 구분하는 코드 맵 추가

- `sha256sum`으로 실제 중복을 확인해 `CODE_MAP.md`를 작성했다. 원본 보존 원칙에 따라 삭제는 없다.
- 완전 동일로 확인된 쌍: `login/src` ≡ `Link-In-온라인 시스템/src`의 TS 파일 4개,
  두 `sql/schema.sql`, `category_gacha_part` 3파일 2벌, `complete/`의 `store.js`·`avatar.js`·`manifest.json`.
- 이미 갈라진 파일: `app.js`, `index.html`, `style.css`, `sw.js`. `complete/` 쪽이 옛 버전이다.
- 실행 금지 SQL 2개와 Service Worker 캐시 버전 규칙을 문서에 명시했다.
- `README.md`에 `CODE_MAP.md` 링크와 서버 전용 환경변수 표를 추가했다.
- 원격 migration이 아직 적용되지 않았다는 오래된 서술을 정정했다. `supabase/README.md` 기준
  모든 migration은 Supabase MCP로 적용 완료 상태다.

### 자산 버전

- `ai.js?v=29`, `app.js?v=30`, Service Worker 캐시 `link-in-integrated-v11`로 올렸다.

## 2026-08-18 — 반응형 대시보드 UI 개편

- 데스크톱에서도 강제되던 `390×844px` 휴대폰 목업, 검은 테두리, 과도한 둥근 프레임을 제거했다.
- 900px 이상 화면에는 어두운 좌측 내비게이션과 최대 1280px 콘텐츠 대시보드 구조를 적용했다.
- 오늘 화면은 아바타와 루틴 작업 영역을 2열로, 기록 화면은 카드 2열로, 상점은 화면 폭에 따라 3~4열로 배치했다.
- 카드 반경, 그림자, 배경, 텍스트 대비와 간격을 한 디자인 체계로 정리했다.
- 학급 서버는 데스크톱 가용 폭 전체를 사용하도록 변경했다.
- 모바일에서는 기존 하단 탭과 단일 열 구조를 유지했다.
- 스타일 및 Service Worker 캐시 버전을 올려 기존 캐시 영향을 방지했다.
- 390px 모바일 검증에서 숨김 알람 패널이 강제 표시되어 수평 overflow를 만들던 문제를 발견해 `[hidden]` 규칙과 세로 입력 배치를 보강했다.
- 학급 서버용 `online.css`가 전역 색상 토큰과 `body` 테마를 덮어써 밝은 루틴 화면의 텍스트 대비를 깨뜨리던 문제를 발견했다.
- 학급 다크 테마 토큰을 학급 탭과 관련 모달 범위로 한정해 루틴·기록·상점 UI와 스타일이 충돌하지 않게 했다.
- 학급용 전역 텍스트 입력·선택·색상 입력 규칙도 학급 탭과 모달로 제한해 루틴 입력창이 어두운 학급 스타일로 덮이는 문제를 수정했다.

## 2026-08-18 — 재감사 문서 및 검사 범위 보정

- `AUDIT.md`를 최초 발견 목록이 아닌 현재 구현 상태 기준으로 다시 정리했다.
- 이미 해결된 인증·역할·알림장·WebRTC·Pixel Classroom·Push 항목을 완료 상태로 옮겼다.
- 기준 앱의 가챠가 실제 카탈로그, Supabase `user_items`, 옷장 장착 흐름에 연결되어 있음을 재확인했다.
- `npm run check`에서 누락됐던 `public/pixelClassroom.js`를 검사 대상에 추가했다.
- 서버와 기준 앱 JavaScript 전체의 `node --check`가 통과했다.

## 2026-08-18 — 실기기 기능 검증 환경 확인

- 로컬 서버를 실행해 통합 화면이 정상 렌더링되고 브라우저 콘솔 경고·오류가 없음을 확인했다.
- 테스트에 연결된 Codex 인앱 브라우저에는 `mediaDevices`, `getUserMedia`, Notification, PushManager, Service Worker API가 모두 제공되지 않았다.
- 연결 가능한 일반 Chrome/Edge 브라우저 확장 인스턴스도 없는 것을 확인했다.
- 이 컴퓨터에는 카메라가 없다는 사용자 확인을 반영해 카메라는 환경 제한으로 분류한다.
- 따라서 실제 마이크 스트림과 Windows Push 알림은 일반 Chrome/Edge 연결 또는 사용자 수동 검증이 필요하다.

## 2026-08-18 — 카메라 없는 기기의 마이크 fallback

- 연결된 Edge에서 미디어 시작 시 `Requested device not found`가 발생하는 것을 재현했다.
- 기존 구현이 카메라와 마이크를 동시에 필수 요청해 카메라가 없으면 마이크까지 시작할 수 없는 것이 원인이었다.
- 카메라 장치 없음 또는 제약 불일치일 때 오디오 전용으로 재요청하도록 수정했다.
- 오디오 전용 연결 시 버튼과 상태 문구가 마이크 모드임을 명확히 표시하도록 수정했다.
- Service Worker 캐시와 `online.js` 자산 버전을 올려 기존 캐시가 수정 사항을 가리지 않게 했다.
- Edge 실검증에서 카메라가 없는 상태에서도 오디오 전용 스트림이 시작되고 `마이크 끄기` 및 음성 연결 상태가 표시됨을 확인했다.
- Edge 알림 권한을 허용한 뒤 재시도했으나 `Notification.requestPermission()`이 계속 거부 상태를 반환해 Push 구독은 생성되지 않았다.
- Supabase MCP 읽기 조회로 `push_subscriptions`가 0건임을 확인해 실패한 구독이 원격에 부분 저장되지 않았음을 검증했다.
- 실제 Windows Push 알림의 추가 수동 검증은 사용자 요청에 따라 제외했다.

## 2026-08-18 — 미요청 Edge Push 초안 정리

- 별도 기능 구현으로 잘못 해석해 추가했던 Edge Push 클레임 RPC 3개, 인덱스 1개, `push_jobs` 클레임 컬럼 2개를 제거하는 rollback migration을 작성했다.
- 배포되지 않았던 로컬 `dispatch-push-jobs` Edge Function 초안 파일을 삭제했다.
- 기존 `push_jobs`, Push 구독, 학급 및 알림장 기능은 유지한다.

## 2026-08-18 — 로컬 E2E 재검사

- 로그인하지 않은 상태에서 학급 입장을 시도하면 경고 후 계정 모달이 실제로 보이도록 수정했다. 기존 구현은 `aria-hidden` 속성만 변경하고 표시용 `show` 클래스를 누락해 모달이 열리지 않았다.
- 수정된 학급 스크립트가 기존 Service Worker 캐시에서 계속 제공되지 않도록 `online.js` 버전과 통합 캐시 버전을 올렸다.
- 두 테스트 계정으로 동일 학급 접속, 구성원 목록 동기화, 픽셀 이동 화면 반영, 학생/반장 권한 구분, 공지 실시간 수신 및 Supabase 영속 저장을 확인했다.
- 다른 탭에서 계정이 로그아웃돼도 기존 학급 Socket.IO 연결이 유지되던 문제를 발견했다. `lockin-auth-changed` 이벤트에서 소켓, 픽셀 교실, WebRTC 미디어와 피어를 종료하고 학급 로그인 화면으로 복귀하도록 수정했다.
- 수정 후 다른 탭에서 로그아웃했을 때 연결된 학급 화면이 즉시 닫히고 학급 입장 화면으로 돌아오는 것을 브라우저에서 재검증했다.
- Supabase 테스트 데이터로 `LINKIN E2E 학교 / 6학년 / 6반`, 테스트 계정 2개 및 공지 1건이 생성되었다. 두 번째 계정에는 권한 검증을 위해 반장 역할을 부여했다.
- 인앱 브라우저에는 Notification API와 미디어 장치가 없어 실제 OS 알림·화상 스트림 수신은 실행하지 못했지만, 권한/장치 부재 시 오류 UI와 구독 미저장을 확인했다.
- 서버 메모리에만 있던 Push 예약을 `push_jobs`에 저장하도록 변경했다. 기존 Push 구독이 있는 사용자가 앱에 다시 접속하면 미래의 대기 작업을 서버 타이머로 복원하며, 성공·실패·시도 횟수를 DB에 기록한다.
- `push_jobs` 적용 후 권한 검증에서 `anon`의 테이블 권한 상속을 발견해 별도 보강 migration에서 `PUBLIC`/`anon` 권한을 명시적으로 회수했다.
- 수정된 서버에서 인증된 예약 요청이 저장된 Push 구독을 먼저 확인하고, 구독이 없으면 DB에 잘못된 예약을 만들지 않은 채 안내 오류를 반환하는 것을 확인했다.
- 최종 로컬 페이지 로딩과 브라우저 콘솔을 다시 검사했으며 오류가 없었다.

## 2026-08-18

### 작업 원칙

- 기존 Supabase 객체를 삭제하거나 초기화하지 않는다.
- DB 변경은 `supabase/migrations`의 추가 SQL로만 작성한다.
- 원격 Supabase 적용과 Vercel 배포는 로컬 검증 완료 전 수행하지 않는다.
- 공개 클라이언트에는 Supabase publishable/anon key만 사용하고 secret/service-role key는 사용하지 않는다.
- 환경변수 값은 Git 추적 대상 파일과 이 문서에 기록하지 않는다.

### 조사 및 준비

- 원본 폴더 전체를 동일한 이름으로 이 위치에 복사했다.
- HTML, JavaScript, TypeScript, SQL, 문서, 로컬 자산 참조와 Git 상태를 재검사했다.
- 기존 `sample/backend/.env`가 가리키는 Supabase 프로젝트를 MCP로 식별했다.
- Supabase 원격 스키마와 migration 목록, 보안·성능 advisor를 읽기 전용으로 확인했다.
- 추가 전용 migration `20260818033334_integrate_link_in_classrooms_and_alarms.sql`을 Supabase CLI로 생성했다.

### 아직 원격에 적용하지 않은 DB 설계

- 기존 `profiles` 테이블을 재정의하지 않고 별도 `classes`, `class_memberships` 테이블을 추가한다.
- 학급 역할은 클라이언트가 선택하지 못하며 DB membership에서만 결정한다.
- 학급 가입과 반장 임명은 검증된 RPC로 처리한다.
- 기존 `tasks`, `routine_templates`에는 알람 JSON 컬럼만 추가한다.

### 로컬 통합 변경

- 온라인 시스템의 기존 `public/app.js`, `public/style.css`를 각각 `online.js`, `online.css`로 분리했다.
- LOCK-IN 실행 파일과 PWA 자산을 온라인 서버의 `public` 폴더에 모아 단일 실행 루트를 구성했다.
- 통합 HTML이 LOCK-IN과 온라인 학급 스크립트 및 두 CSS를 모두 로드하도록 변경했다.
- 사용자가 학급 역할을 직접 선택하던 UI를 제거하고 DB 권한에서 확인한다는 안내로 교체했다.
- LOCK-IN Supabase 세션을 온라인 모듈이 안전하게 전달받을 수 있도록 세션 변경 이벤트를 추가했다.
- 온라인 학급 입장 전에 Supabase `join_class` RPC로 membership을 저장하도록 변경했다.
- Socket.IO 연결이 Supabase access token을 요구하도록 변경했다.
- 서버가 클라이언트의 학교·학년·반·이름·역할을 신뢰하지 않고 인증된 membership에서 읽도록 변경했다.
- 이동 좌표·방향, 아바타 색, 알림장 길이와 빈 내용을 서버에서 검증하도록 보강했다.
- `/runtime-config.js`를 서버 환경변수에서 동적으로 제공하며 캐시하지 않도록 구성했다.
- 온라인 서버의 로컬 실행이 `.env`를 읽도록 start/dev 명령을 변경하고 JavaScript 검사 명령을 추가했다.
- `.env`와 `node_modules`를 Git 추적에서 제외했다.
- 로그인하지 않은 사용자가 학급 서버 탭을 열면 학급 입장 모달을 표시하고 빈 학급 화면은 숨기도록 수정했다.
- migration의 재실행 안전성을 유지하면서도 기존 정책·제약을 삭제하지 않도록 카탈로그 존재 검사 방식으로 정리했다.
- 통합 온라인 JavaScript/CSS가 PWA 앱 셸에 포함되도록 Service Worker 캐시 목록과 버전을 갱신했다.
- 쿼리 버전이 붙은 runtime config도 항상 네트워크 우선 처리하도록 Service Worker URL 판정을 수정하고 통합 자산 버전을 올렸다.
- 학급명과 사용자 이름을 HTML로 직접 삽입하지 않도록 textContent/escape 처리를 적용했다.
- 우회 가능한 localStorage 기반 30일 제한 표시를 제거하고 DB `join_class` RPC를 단일 기준으로 사용하도록 정리했다.

### 배포 상태

- Supabase 원격 변경: `integrate_link_in_classrooms_and_alarms` migration을 MCP로 적용함
- Vercel 배포: 수행하지 않음

### Supabase 적용 후 검증

- `classes`, `class_memberships` 테이블과 RLS 활성화를 확인했다.
- `tasks.alarm`, `routine_templates.alarm` JSONB 컬럼 추가를 확인했다.
- 원격 migration history 등록을 확인했다.
- advisor에서 새 SECURITY DEFINER RPC의 익명 실행 권한 경고를 발견했다.
- 이를 수정하기 위해 `20260818041503_harden_classroom_rpc_permissions.sql` 후속 migration을 추가했다.
- 후속 migration을 Supabase MCP로 적용했다.
- 재검사에서 두 학급 RPC의 `anon` 실행 권한이 제거되고 `authenticated` 실행 권한만 남은 것을 SQL로 확인했다.
- 신규 RPC에 대한 익명 실행 advisor 경고가 사라진 것을 확인했다.

### 로컬 검증 결과

- `npm run check`: 통과
- 통합 HTML 로컬 자산 검사: 누락 없음
- `/`, CSS, JavaScript, manifest, Service Worker, runtime config: 모두 HTTP 200
- runtime config: 기존 sample Supabase URL/anon key가 값 노출 없이 로드되는 것을 응답 길이와 존재 여부로 확인
- 인앱 브라우저: 빈 화면·오류 overlay·console error·깨진 이미지 없음
- 학급 서버 탭: 비로그인 상태에서 학급 입장 모달 표시, 학급 본 화면 숨김 확인
- 역할 radio input: 0개 확인
- Vercel 배포: 수행하지 않음

## 2026-08-18 — 남은 기능 구현

- 알림장 영속화를 위한 `class_notices`와 사용자별 Web Push 구독을 위한 `push_subscriptions` migration을 추가했다.
- 알림장 수정 권한을 DB에서 teacher/president membership으로 검증하는 `upsert_class_notice` RPC를 추가했다.
- Pixel Classroom 캔버스와 모바일 방향키를 통합 학급 화면에 추가하고 Socket.IO 이동 이벤트에 연결했다.
- WebRTC mesh 화상 그리드와 Socket.IO offer/answer/ICE 시그널링을 구현했다.
- VAPID 키를 로컬 `.env`에 생성하고 `web-push` 고정 버전을 설치했다.
- Push 구독 저장 및 최대 7일 이내 루틴 알림 예약 API와 Service Worker push 수신을 구현했다.
- 지난 루틴 알람이 다음 날로 잘못 예약되던 로직을 수정했다.
- `persist_class_notices_and_push_subscriptions` migration을 Supabase MCP로 적용했다.
- `class_notices`, `push_subscriptions`의 RLS 활성화와 `upsert_class_notice`의 anon 실행 차단을 검증했다.
- 변경된 통합 자산을 즉시 받도록 HTML 버전과 Service Worker 캐시 버전을 갱신했다.

### 남은 기능 로컬 검증

- JavaScript 문법 검사 통과, 브라우저 console error 없음
- Pixel canvas 900×560, WebRTC video grid, 미디어 버튼, Push 버튼 렌더링 확인
- runtime config에서 Supabase 공개 설정과 VAPID 공개키 존재 확인(값 미출력)
- Pixel/online/Service Worker 파일 HTTP 200 확인
- 인증 없는 Push 구독·예약 API가 각각 401/400으로 거부되는 것을 확인
