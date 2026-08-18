# Supabase 변경 관리

## 적용 대상

기존 `sample/backend/.env`가 사용하는 Supabase 프로젝트를 대상으로 한다.
환경변수 실제 값은 이 저장소의 문서나 migration에 기록하지 않는다.

## 신규 migration

- `migrations/20260818033334_integrate_link_in_classrooms_and_alarms.sql`
  - 기존 객체를 삭제하지 않는 추가·업데이트 전용 migration이다.
  - Supabase MCP로 원격 프로젝트에 적용했다.
- `migrations/20260818041503_harden_classroom_rpc_permissions.sql`
  - 적용 후 advisor가 발견한 학급 RPC의 익명 실행 권한을 명시적으로 회수한다.
  - Supabase MCP로 적용했으며 `anon=false`, `authenticated=true` 권한 검증을 완료했다.
- `migrations/20260818041809_persist_class_notices_and_push_subscriptions.sql`
  - 학급 알림장과 Push 구독을 영속화한다.
  - Supabase MCP로 적용했으며 두 테이블의 RLS와 알림장 RPC 권한을 검증했다.
- `migrations/20260818044007_persist_push_jobs.sql`
  - 루틴 Push 예약 작업과 처리 상태를 사용자별로 영속 저장한다.
  - 기존 테이블을 변경하거나 삭제하지 않고 `push_jobs` 테이블과 RLS 정책만 추가한다.
  - Supabase MCP로 적용했다.
- `migrations/20260818044505_harden_push_jobs_permissions.sql`
  - `push_jobs`의 `PUBLIC`/`anon` 테이블 권한을 명시적으로 회수하고 인증 사용자 권한만 유지한다.
  - Supabase MCP로 적용했으며 `RLS=true`, `anon SELECT=false`, `authenticated SELECT=true`를 검증했다.
- `migrations/20260818045207_add_edge_push_dispatch.sql`
  - 서버리스 Push dispatch 검토 중 추가했던 이력 보존용 migration이다.
  - 요구 범위가 아니라는 확인 후 아래 rollback migration으로 되돌렸다.
- `migrations/20260818045843_remove_unrequested_edge_push_dispatch.sql`
  - 사용자에게 삭제 대상을 알리고 승인을 받은 뒤, 위 migration이 추가한 RPC·컬럼·인덱스만 제거했다.
  - Supabase MCP로 적용했으며 대상 객체가 제거되고 기존 `push_jobs` 테이블이 유지됨을 검증했다.

## 레거시 SQL 주의

`login/sql/schema.sql`과 `Link-In-온라인 시스템/sql/schema.sql`은 전달받은 원본 참고 자료다.
두 파일은 기존 `public.profiles`를 새로 생성하려 하므로 현재 프로젝트에 실행하면 안 된다.
원본 보존 원칙에 따라 삭제하지 않고 그대로 둔다.

## 원칙

- DROP TABLE, DROP COLUMN, 데이터 초기화는 사용자 승인 없이 수행하지 않는다.
- 모든 DDL은 먼저 SQL 파일에 기록한다.
- 원격 적용은 Supabase MCP를 사용한다.
- 적용 전후 security/performance advisor와 실제 테스트 쿼리를 확인한다.
