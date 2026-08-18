import { supabase } from '../lib/supabase';

/**
 * 학급을 조회하고 없으면 생성하여 class_id를 반환합니다.
 */
export async function getOrCreateClassId(schoolName: string, grade: number, classNumber: number): Promise<string> {
  // 1. 기존 클래스 조회
  const { data: existingClass, error: searchError } = await supabase
    .from('classes')
    .select('id')
    .eq('school_name', schoolName)
    .eq('grade', grade)
    .eq('class_number', classNumber)
    .maybeSingle();

  if (searchError) throw new Error('클래스 조회 중 오류가 발생했습니다.');
  
  if (existingClass) {
    return existingClass.id;
  }

  // 2. 클래스가 없으면 생성 (Insert)
  const { data: newClass, error: insertError } = await supabase
    .from('classes')
    .insert([{ school_name: schoolName, grade, class_number: classNumber }])
    .select('id')
    .single();

  if (insertError) throw new Error('클래스 생성 중 오류가 발생했습니다.');
  
  return newClass.id;
}

/**
 * 유저 프로필에 class_id를 업데이트합니다.
 */
export async function assignUserToClass(userId: string, classId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ class_id: classId })
    .eq('id', userId);

  if (error) throw new Error('학급 배정에 실패했습니다.');
}

/**
 * 선생님 권한으로 특정 학생을 반장으로 임명합니다. (RPC 호출)
 */
export async function appointPresident(targetUserId: string, classId: string) {
  const { error } = await supabase.rpc('set_class_president', {
    target_user_id: targetUserId,
    target_class_id: classId
  });

  if (error) throw new Error(`반장 임명에 실패했습니다: ${error.message}`);
}
