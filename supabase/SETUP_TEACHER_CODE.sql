-- ============================================================================
-- LINK-IN 교사 코드 설정 — Supabase SQL Editor 에 통째로 붙여넣고 한 번만 Run
-- ============================================================================
--
--  ⚠️  아래 [1단계] 의 'CHANGE_ME_교사코드' 를 원하는 코드로 먼저 바꾸세요.
--      학생이 찍어 맞히기 어렵게 8자 이상을 권합니다.
--
--  이 스크립트는 여러 번 실행해도 안전합니다.
--  (테이블은 없을 때만 생성, 함수는 덮어쓰기, 코드는 최신 값으로 갱신)
--
--  코드만 나중에 바꾸고 싶으면 맨 아래 [1단계] 블록만 다시 실행하면 됩니다.
-- ============================================================================


-- ============================================================================
-- [0단계] 테이블과 함수 만들기
-- ============================================================================

-- 가입 시 역할(학생/선생님) 선택과 교사 코드 검증을 추가한다.
-- 추가 전용 migration: 기존 테이블·함수·정책을 삭제하지 않는다.
--
-- 설계 요지
--   * 교사 코드는 DB 안에서 검증한다. 브라우저가 RPC를 직접 호출할 수 있으므로
--     클라이언트나 Node 서버에서만 검사하면 우회가 가능하다.
--   * 코드는 app_config 테이블에 두고 RLS 정책을 하나도 만들지 않는다.
--     security definer 함수만 읽을 수 있고 authenticated/anon 은 조회할 수 없다.
--   * 반장은 여기서 선택할 수 없다. 기존대로 set_class_president 로 선생님이 임명한다.
--   * 기존 join_class(4인자)는 그대로 남긴다. 신규 함수는 이름을 달리해 충돌을 피한다.

create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

-- 정책을 만들지 않는다. RLS가 켜져 있고 정책이 없으면 어떤 역할도 행을 볼 수 없다.
revoke all on public.app_config from public;
revoke all on public.app_config from anon;
revoke all on public.app_config from authenticated;

create or replace function public.join_class_with_role(
  input_school_name text,
  input_grade integer,
  input_class_number integer,
  input_display_name text,
  input_role text default 'student',
  input_teacher_code text default null
)
returns public.class_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_school text := btrim(input_school_name);
  normalized_name text := btrim(input_display_name);
  requested_role text := coalesce(nullif(btrim(input_role), ''), 'student');
  target_class_id uuid;
  existing_membership public.class_memberships;
  configured_code text;
  resolved_role text;
  result_membership public.class_memberships;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;
  if char_length(normalized_school) not between 1 and 100 then
    raise exception 'School name must be between 1 and 100 characters';
  end if;
  if input_grade not between 1 and 12 then
    raise exception 'Grade must be between 1 and 12';
  end if;
  if input_class_number not between 1 and 99 then
    raise exception 'Class number must be between 1 and 99';
  end if;
  if char_length(normalized_name) not between 1 and 40 then
    raise exception 'Display name must be between 1 and 40 characters';
  end if;

  select * into existing_membership
  from public.class_memberships
  where user_id = caller_id;

  -- 대상 학급 id를 먼저 확보한다 (30일 제한 판정과 반장 중복 확인에 쓰인다).
  select id into target_class_id
  from public.classes
  where school_name = normalized_school
    and grade = input_grade
    and class_number = input_class_number;

  if existing_membership.user_id is not null then
    -- 역할은 최초 가입 때 결정되며 이후 사용자가 바꿀 수 없다.
    resolved_role := existing_membership.role;

    if existing_membership.class_changed_at > now() - interval '30 days'
       and target_class_id is distinct from existing_membership.class_id then
      raise exception 'Class can only be changed once every 30 days';
    end if;
  else
    if requested_role = 'teacher' then
      select value into configured_code
      from public.app_config
      where key = 'teacher_code';

      if configured_code is null or btrim(configured_code) = '' then
        raise exception 'Teacher signup is not configured';
      end if;
      if btrim(coalesce(input_teacher_code, '')) <> btrim(configured_code) then
        raise exception 'Invalid teacher code';
      end if;
      resolved_role := 'teacher';
    elsif requested_role = 'student' then
      resolved_role := 'student';
    else
      -- 반장은 선생님이 임명한다. 가입 단계에서 선택할 수 없다.
      raise exception 'Role must be student or teacher';
    end if;
  end if;

  insert into public.classes (school_name, grade, class_number)
  values (normalized_school, input_grade, input_class_number)
  on conflict (school_name, grade, class_number)
  do update set school_name = excluded.school_name
  returning id into target_class_id;

  -- 한 학급에 반장은 한 명뿐이다. 반장이 이미 있는 반으로 옮기면 학생으로 내린다.
  if resolved_role = 'president'
     and target_class_id is distinct from existing_membership.class_id
     and exists (
       select 1 from public.class_memberships
       where class_id = target_class_id and role = 'president'
     ) then
    resolved_role := 'student';
  end if;

  insert into public.class_memberships (
    user_id, class_id, role, display_name, joined_at, class_changed_at, updated_at
  ) values (
    caller_id, target_class_id, resolved_role, normalized_name, now(), now(), now()
  )
  on conflict (user_id) do update
  set class_id = excluded.class_id,
      display_name = excluded.display_name,
      role = resolved_role,
      class_changed_at = case
        when public.class_memberships.class_id = excluded.class_id
          then public.class_memberships.class_changed_at
        else now()
      end,
      updated_at = now()
  returning * into result_membership;

  return result_membership;
end;
$$;

revoke all on function public.join_class_with_role(text, integer, integer, text, text, text) from public;
revoke all on function public.join_class_with_role(text, integer, integer, text, text, text) from anon;
grant execute on function public.join_class_with_role(text, integer, integer, text, text, text) to authenticated;

-- 교사 코드가 설정되어 있는지만 알려준다. 코드 값 자체는 절대 반환하지 않는다.
create or replace function public.is_teacher_signup_enabled()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_code text;
begin
  select value into configured_code from public.app_config where key = 'teacher_code';
  return configured_code is not null and btrim(configured_code) <> '';
end;
$$;

revoke all on function public.is_teacher_signup_enabled() from public;
revoke all on function public.is_teacher_signup_enabled() from anon;
grant execute on function public.is_teacher_signup_enabled() to authenticated;


-- ============================================================================
-- [1단계] 교사 코드 등록  ←←← 이 줄의 코드를 바꾸세요
-- ============================================================================

insert into public.app_config (key, value)
values ('teacher_code', 'CHANGE_ME_교사코드')
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();


-- ============================================================================
-- [2단계] 확인 — true 가 나오면 성공입니다 (코드 값은 표시되지 않습니다)
-- ============================================================================

select public.is_teacher_signup_enabled() as "교사 가입 준비됨";
