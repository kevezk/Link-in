'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { appointPresident } from '../api/classService';

type Student = {
  id: string;
  role: 'student' | 'teacher' | 'president';
  // 실제 서비스에서는 users(혹은 auth.users)와 JOIN하여 이름, 이메일 등을 가져와야 합니다.
  // 예제에서는 id를 렌더링에 사용합니다.
};

export default function TeacherDashboard({ classId }: { classId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchStudents();
  }, [classId]);

  const fetchStudents = async () => {
    setLoading(true);
    // 현재 학급의 학생 및 반장만 조회 (선생님 제외)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('class_id', classId)
      .in('role', ['student', 'president']);
      
    if (error) {
      console.error(error);
    } else {
      setStudents(data || []);
    }
    setLoading(false);
  };

  const handleAppointPresident = async (studentId: string) => {
    if (!confirm('해당 학생을 반장으로 임명하시겠습니까? 기존 반장은 일반 학생으로 강등됩니다.')) return;
    
    setProcessingId(studentId);
    try {
      await appointPresident(studentId, classId);
      // 성공 후 목록 재로딩 (또는 로컬 상태 업데이트)
      await fetchStudents();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <div className="p-4 text-gray-600">로딩 중...</div>;

  return (
    <div className="max-w-4xl mx-auto mt-8 p-6 bg-white rounded-xl shadow-sm border border-gray-100">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">학급 관리 대시보드</h2>
      
      <div className="overflow-hidden border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">학생 ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">역할</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {students.map((student) => (
              <tr key={student.id} className={student.role === 'president' ? 'bg-amber-50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 truncate max-w-[200px]" title={student.id}>
                  {student.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {student.role === 'president' ? (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">
                      반장
                    </span>
                  ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                      학생
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {student.role !== 'president' ? (
                    <button
                      onClick={() => handleAppointPresident(student.id)}
                      disabled={processingId === student.id}
                      className="text-blue-600 hover:text-blue-900 disabled:text-gray-400 transition-colors"
                    >
                      {processingId === student.id ? '처리 중...' : '반장 임명'}
                    </button>
                  ) : (
                    <span className="text-gray-400 font-medium">현재 반장</span>
                  )}
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                  학급에 학생이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
