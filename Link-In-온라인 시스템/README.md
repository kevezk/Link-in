# Link-In 온라인 시스템 (통합 프로젝트)

학교-학년-반 기반 자동 회원가입/로그인, 실시간 픽셀 교실(화상 Grid & 아바타 이동), 알림장 및 권한 관리 시스템이 통합된 온라인 학습 환경 프로젝트입니다.

---

## 📁 통합 프로젝트 워크트리 (Worktree) 구조

```text
Link-In-온라인 시스템/
├── 📄 package.json          # Node.js 패키지 및 의존성 정의
├── 📄 package-lock.json     # 의존성 버전 잠금 파일
├── 📄 server.js             # Express & Socket.IO 백엔드 실시간 소켓 서버
├── 📄 README.md             # 프로젝트 통합 안내 문서
├── 📁 public/               # 메인 프론트엔드 정적 웹 서버 자원 (Vanilla JS/HTML/CSS)
│   ├── 📄 index.html        # 온라인 시스템 UI (로그인, 픽셀 교실, 알림장)
│   ├── 📄 app.js            # Socket.IO 메인 클라이언트 핸들러
│   ├── 📄 pixelClassroom.js # 픽셀 교실 Canvas 2D 아바타 & 타일맵 랜더링 엔진
│   └── 📄 style.css         # 스타일시트 & 애니메이션 디자인
├── 📁 sql/                  # 데이터베이스 스크립트 모듈 (Supabase)
│   └── 📄 schema.sql        # Supabase RLS 정책, 테이블, 반장 임명 RPC 함수
└── 📁 src/                  # 인증 & 학급 관리 모듈 (TypeScript / React)
    ├── 📁 api/
    │   └── 📄 classService.ts     # 학급 생성/조회 및 반장 임명 API 함수
    ├── 📁 components/
    │   ├── 📄 LoginForm.tsx        # 학교/학년/반 자동 할당 로그인/회원가입 폼
    │   └── 📄 TeacherDashboard.tsx # 선생님 학급 학생 관리 & 반장 부여 대시보드
    └── 📁 lib/
        └── 📄 supabase.ts         # Supabase JS Client 초기화 설정
```

---

## 🚀 주요 구성 요소 및 기능

### 1. 백엔드 실시간 소켓 서버 (`server.js`)
- Express web server + Socket.IO 기반
- 학교-학년-반 (`${school}-${grade}학년-${classNum}반`) 별 동적 소켓 룸(Room) 할당
- 픽셀 교실 아바타 위치 (`x`, `y`, `direction`, `isMoving`) 실시간 동기화
- 알림장 권한 제어 (선생님 `teacher` 및 반장 `president` 권한 보유자만 작성/수정 가능)

### 2. 메인 웹 인터페이스 (`public/`)
- `index.html`: 학교/학년/반/역할 입력 온보딩 폼, 실시간 캔버스 교실, 공지 알림장 게시판
- `pixelClassroom.js`: HTML5 Canvas 2D 기반 격자 맵 및 타일, 4방향 키보드 이동, 네임택 렌더링
- `app.js`: 웹 소켓 이벤트를 연동한 사용자 입장/퇴장/이동/공지 업데이트 UI 동기화

### 3. 인증 및 학급 관리 모듈 (`sql/`, `src/`)
- `schema.sql`: Supabase `classes`, `profiles` 테이블 및 `set_class_president` 트랜잭션 함수
- `classService.ts`: 학급 자동 매칭 및 반장 지정 API
- `LoginForm.tsx`: React/Next.js 기반 자동 학급 할당 로그인 UI
- `TeacherDashboard.tsx`: 학급 구성원 목록 확인 및 단일 반장 지정 관리 화면
