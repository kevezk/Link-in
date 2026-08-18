# LOCK-IN — 오늘의 갓생

하루에 가장 중요한 루틴 3개에 집중하고, 사진 인증과 캐릭터 성장 보상으로 꾸준한 실천을 돕는 모바일 중심 웹앱입니다. `Lock-in--main`의 캐릭터·UI 디자인과 8조 발표자료의 서비스 기획을 바탕으로 `complete` 버전을 구현했습니다.

## 배포 주소

- 서비스: https://lock-in-gatsaeng.vercel.app
- 배포 플랫폼: Vercel
- 데이터베이스·인증: Supabase

Android Chrome과 iOS Safari에서 사용할 수 있으며 홈 화면에 추가하면 앱처럼 실행할 수 있습니다. 현재 Google Play·App Store에 등록되는 네이티브 앱은 아니며, 반응형 PWA 형태입니다.

## 구현된 기능

### 계정과 데이터 저장

- Supabase 이메일·비밀번호 회원가입 및 로그인
- 이메일 인증 링크 없이 가입 즉시 계정 활성화
- 로그아웃 후 재로그인 시 계정 데이터 복원
- 로그인하지 않고 이용할 수 있는 게스트 모드
- 로그인 후 이 기기의 게스트 루틴·기록을 계정으로 가져오기
- 사용자별 데이터 분리와 RLS(Row Level Security) 적용
- 네트워크 문제 발생 시 로컬 저장소를 사용하는 로컬 우선 구조

### 오늘의 루틴

- 하루 최대 3개의 핵심 루틴 등록
- 오늘과 미래 날짜의 루틴 생성·수정
- 과거 기록은 조회만 가능하며 수정 방지
- 완료하지 못한 루틴을 다음 날로 이동하는 토스 기능
- 기본 추천 루틴 선택
- 사용자 지정 장기 루틴 저장
- 매일·평일·주말·지정 요일 반복 추천
- 체크박스만으로 자동 완료되지 않으며 인증 절차를 거쳐 완료

### 사진 인증과 AI 피드백

- 모바일 카메라 연결 및 전·후면 카메라 전환
- 부메랑 스타일 촬영 화면
- Gemini Vision API를 이용한 루틴 수행 판정
- 판정 점수와 피드백 표시
- API 키가 없을 때 사용할 수 있는 로컬 Mock 판정
- Gemini API 키는 사용자의 브라우저에만 저장

### 캐릭터와 꾸미기

- 루틴 달성률에 따른 4단계 캐릭터 성장
- 캐릭터와 배경의 시인성 개선
- 스킨 색상 변경 및 자유로운 장착·해제
- 장신구 위치와 크기를 성장 단계별로 조정
- 동시에 착용할 수 있는 아이템 조합 지원
- 칭호 토글 장착
- 배경은 반드시 하나를 유지하면서 다른 배경으로 교체
- 코인 상점, 옷장, 아이템 구매 및 럭키박스

### 기록과 보상

- 최근 7일 기록을 오래된 날부터 왼쪽에 표시
- 날짜와 요일을 함께 표시하는 주간 차트
- 최근 35일 달성도를 위쪽 칸부터 채우는 잔디 기록
- 과거 완료 루틴 보관함
- 루틴 완료 보상과 코인 지급
- 이틀 연속 모든 루틴에 실패했을 때만 게으름 모드 활성화

### 모바일·PWA

- Android Chrome 및 iOS Safari 대응
- 작은 화면에서는 데스크톱용 기기 프레임을 제거하고 전체 화면 사용
- iPhone 안전 영역 대응
- 웹 앱 매니페스트와 홈 화면 아이콘 제공
- 서비스워커 기반 오프라인 자산 캐시
- 새 배포 내용을 즉시 받을 수 있도록 화면과 런타임 설정은 네트워크 우선 갱신
- WebP 이미지 사용으로 초기 다운로드 용량 최적화

## 데이터 동기화 범위

로그인 사용자의 다음 데이터가 Supabase에 저장됩니다.

- 사용자 프로필과 코인
- 오늘·과거·미래 루틴과 완료 상태
- 장기 루틴 및 반복 요일
- 구매한 아이템과 장착 상태
- 스킨과 칭호
- 일별 달성 요약

게스트 데이터는 브라우저의 로컬 저장소에 사용자 계정과 분리해 저장됩니다. 계정으로 가져온 뒤에도 기존 게스트 원본은 자동으로 삭제하지 않습니다.

## 프로젝트 구조

```text
demo/
├─ complete/                 # 실제 서비스 소스
│  ├─ index.html             # 앱 화면과 로그인 UI
│  ├─ style.css              # LOCK-IN 디자인과 모바일 반응형 스타일
│  ├─ app.js                 # 루틴, 인증, 기록, 카메라 제어
│  ├─ store.js               # 로컬 저장소·Supabase 데이터 계층
│  ├─ avatar.js              # 캐릭터와 아이템 렌더링
│  ├─ ai.js                  # Gemini Vision 판정
│  ├─ manifest.json          # PWA 설정
│  └─ sw.js                  # 오프라인 캐시와 업데이트 처리
├─ scripts/
│  └─ generate-runtime-config.mjs
├─ dist/                     # Vercel 배포용 빌드 결과
├─ IMPLEMENT_PLAN.md         # 통합 구현 계획
├─ package.json
└─ vercel.json
```

## 로컬 실행과 빌드

Node.js가 설치된 환경에서 프로젝트 루트에 환경변수를 설정합니다.

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

배포 파일 생성:

```bash
npm run build
```

빌드 결과는 `dist` 폴더에 생성됩니다. 별도 프레임워크가 없는 정적 웹앱이므로 로컬 정적 서버로 `dist`를 열어 확인할 수 있습니다.

## Vercel 배포

Vercel 프로젝트에 다음 환경변수를 Production, Preview, Development 환경에 등록합니다.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

이후 프로젝트 루트에서 배포합니다.

```bash
npx vercel deploy --prod
```

현재 프로덕션 별칭은 https://lock-in-gatsaeng.vercel.app 입니다.

## Supabase 구성

주요 테이블:

- `profiles`
- `tasks`
- `routine_templates`
- `items`
- `user_items`
- `daily_summaries`
- `task_coin_rewards`
- `user_preferences`

클라이언트에는 공개용 Supabase URL과 anon key만 사용합니다. 사용자별 접근 권한은 Supabase Auth 세션과 각 테이블의 RLS 정책으로 제한합니다. `service_role` 키와 개인 API 키는 소스나 README에 저장하지 않습니다.

## 사용 시 참고

- 실제 AI 사진 판정을 사용하려면 앱 설정에서 개인 Gemini API 키를 입력해야 합니다.
- 카메라는 HTTPS로 배포된 서비스 또는 허용된 로컬 개발 환경에서 정상 작동합니다.
- iOS에서는 Safari 공유 메뉴의 **홈 화면에 추가**, Android에서는 Chrome 메뉴의 **앱 설치/홈 화면에 추가**를 사용할 수 있습니다.
- 이전 버전 화면이 남아 있다면 앱을 한 번 새로고침하면 최신 서비스워커와 자산으로 갱신됩니다.

