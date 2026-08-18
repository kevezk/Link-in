# 학급 기반 자동 로그인 및 권한 관리 시스템 모듈

이 폴더는 독립적으로 개발된 **'학급 기반 자동 로그인 및 권한 관리 시스템'**의 코드 모음입니다.
이 폴더 자체를 압축하거나 복사하여 메인 프로젝트 담당자에게 전달하시면 됩니다.

## 📂 폴더 구조 및 파일 설명

- `sql/schema.sql`: Supabase 테이블, 제약조건, RLS 정책, 그리고 핵심인 `set_class_president` RPC 트랜잭션 함수가 포함된 SQL 쿼리입니다. Supabase SQL Editor에 복사하여 실행해야 합니다.
- `src/lib/supabase.ts`: Supabase 클라이언트 초기화 코드입니다.
- `src/api/classService.ts`: 클래스 할당 및 반장 임명을 위한 API 호출 로직입니다.
- `src/components/LoginForm.tsx`: 로그인과 동시에 [학교/학년/반]을 입력받아 학급에 자동으로 입장시키는 온보딩 폼 컴포넌트입니다.
- `src/components/TeacherDashboard.tsx`: 특정 학급(`classId`)을 기반으로 학생 목록을 불러오고 한 명에게 반장 권한을 부여하는 대시보드 컴포넌트입니다.

## 🚀 메인 프로젝트에 병합(Merge)하는 방법

1. **환경 변수 추가**
   메인 프로젝트의 `.env.local` 파일에 아래 환경 변수를 추가하세요.
   ```env
   NEXT_PUBLIC_SUPABASE_URL=당신의_프로젝트_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY=당신의_ANON_KEY
   ```

2. **패키지 설치 확인**
   이 모듈은 `@supabase/supabase-js`, `react`, `next`, `tailwindcss` 환경을 전제로 작성되었습니다. 패키지가 없다면 설치해 주세요.

3. **코드 이식**
   - `src/` 내부에 있는 코드들을 메인 프로젝트의 적절한 위치(예: `src/features/class-management/`)에 복사합니다.
   - `src/lib/supabase.ts`는 기존 메인 프로젝트에 이미 Supabase 클라이언트 로직이 있다면 해당 파일을 사용하도록 임포트(import) 경로만 수정하시면 됩니다.
   - `LoginForm.tsx`는 기존 회원가입/로그인 페이지에 통합시키거나 리다이렉트 용도로 커스텀하여 사용합니다.

4. **주의사항 (보안)**
   - `sql/schema.sql` 안의 RPC 함수 `set_class_president`는 `SECURITY DEFINER`로 설정되어 RLS를 우회하므로, 쿼리 내부의 `IF NOT EXISTS` 조건문(실제 선생님인지 확인하는 방어 로직)을 절대 삭제하지 마세요.
