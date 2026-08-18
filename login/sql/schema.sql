-- 확장 기능(uuid 생성) 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. classes 테이블 생성
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_name TEXT NOT NULL,
  grade INT NOT NULL,
  class_number INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 복합 고유키 설정: 같은 학교-학년-반은 유일해야 함
ALTER TABLE public.classes ADD CONSTRAINT classes_school_grade_class_key UNIQUE (school_name, grade, class_number);

-- RLS 활성화
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- classes 조회 정책: 인증된(또는 모든) 사용자가 클래스 목록을 조회하거나 가입 시 확인할 수 있음
CREATE POLICY "Anyone can view classes" ON public.classes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert classes" ON public.classes FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2. profiles 테이블 확장
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id),
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'president')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 데이터 무결성: 동일한 class_id를 가진 유저 중 role이 'president'인 유저는 반드시 1명만 존재 (Partial Unique Index)
CREATE UNIQUE INDEX one_president_per_class ON public.profiles (class_id) WHERE role = 'president';

-- RLS 활성화
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 조회 정책: 유저는 자신이 속한 class_id의 데이터만 읽을 수 있음 (선생님/학생 공통)
CREATE POLICY "Users can view profiles in their class" ON public.profiles FOR SELECT USING (
  class_id = (SELECT class_id FROM public.profiles WHERE id = auth.uid())
);

-- 자신 프로필 조회 (학급 할당 전에도 내 정보는 볼 수 있어야 함)
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (
  id = auth.uid()
);

-- 프로필 생성 (회원가입 트리거로 생성될 때 필요)
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (
  id = auth.uid()
);

-- 선생님만이 자신의 학급 프로필(role 등)을 업데이트 할 수 있는 정책
CREATE POLICY "Teachers can update profiles in their class" ON public.profiles FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles AS p 
    WHERE p.id = auth.uid() AND p.role = 'teacher' AND p.class_id = public.profiles.class_id
  )
);

-- 3. 단일 반장 임명 트랜잭션 (RPC 함수)
CREATE OR REPLACE FUNCTION set_class_president(target_user_id UUID, target_class_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. 실행자(auth.uid())가 해당 학급의 선생님(teacher)인지 확인
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND class_id = target_class_id AND role = 'teacher'
  ) THEN
    RAISE EXCEPTION 'Only teachers of this class can set the president';
  END IF;

  -- 2. 타겟 유저가 해당 학급의 구성원인지 확인
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = target_user_id AND class_id = target_class_id
  ) THEN
    RAISE EXCEPTION 'Target user is not in this class';
  END IF;

  -- 3. 기존 반장을 학생(student)으로 강등
  UPDATE public.profiles 
  SET role = 'student' 
  WHERE class_id = target_class_id AND role = 'president';

  -- 4. 선택된 학생을 반장(president)으로 승급
  UPDATE public.profiles 
  SET role = 'president' 
  WHERE id = target_user_id AND class_id = target_class_id;
END;
$$;
