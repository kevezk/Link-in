'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { getOrCreateClassId, assignUserToClass } from '../api/classService';

export default function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    schoolName: '',
    grade: '',
    classNumber: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Auth 로그인 (또는 회원가입 분기)
      let authData, authError;
      
      if (isLoginMode) {
        const result = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password
        });
        authData = result.data;
        authError = result.error;
      } else {
        const result = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password
        });
        authData = result.data;
        authError = result.error;
      }

      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error('유저 정보를 가져오지 못했습니다.');

      // 2. 학급 조회 및 생성
      const classId = await getOrCreateClassId(
        formData.schoolName,
        parseInt(formData.grade),
        parseInt(formData.classNumber)
      );

      // 3. 프로필에 학급 할당
      await assignUserToClass(userId, classId);

      // 4. 할당된 학급 페이지로 리다이렉트
      router.push(`/class/${classId}`);
      
    } catch (error: any) {
      alert(error.message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900/60 p-4">
      <div className="w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl relative">
        {/* 모달 닫기 버튼 (장식용) */}
        <button className="absolute top-6 right-6 text-gray-400 hover:text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 아이콘 및 타이틀 */}
        <div className="flex flex-col items-center mb-6">
          <div className="text-green-500 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22c4-4.5 7-9 7-12a7 7 0 1 0-14 0c0 3 3 7.5 7 12z"></path>
              <path d="M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">LOCK-IN 계정</h2>
          <p className="text-xs text-gray-500 text-center mt-3 px-2 leading-relaxed">
            이메일과 비밀번호로 로그인하면 다른 기기에서도 기록을 이어갈 수 있어요. 이메일 인증은 필요하지 않아요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-gray-700 ml-1">이메일</label>
            <input required type="email" name="email" placeholder="name@example.com" value={formData.email} onChange={handleChange} 
              className="w-full px-4 py-3 rounded-full border border-gray-200 bg-gray-50 text-sm focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-transparent outline-none transition-all" />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-gray-700 ml-1">비밀번호</label>
            <input required type="password" name="password" placeholder="6자 이상 입력" value={formData.password} onChange={handleChange} 
              className="w-full px-4 py-3 rounded-full border border-gray-200 bg-gray-50 text-sm focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-transparent outline-none transition-all" />
          </div>

          <div className="pt-2">
            <label className="block text-xs font-bold text-gray-700 ml-1 mb-1">학교 정보 (학급 서버 접속용)</label>
            <input required type="text" name="schoolName" placeholder="예: 한국고등학교" value={formData.schoolName} onChange={handleChange} 
              className="w-full px-4 py-3 mb-3 rounded-full border border-gray-200 bg-gray-50 text-sm focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-transparent outline-none transition-all" />
            <div className="flex space-x-3">
              <input required type="number" name="grade" placeholder="학년" min="1" max="6" value={formData.grade} onChange={handleChange} 
                className="w-1/2 px-4 py-3 rounded-full border border-gray-200 bg-gray-50 text-sm focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-transparent outline-none transition-all text-center" />
              <input required type="number" name="classNumber" placeholder="반" min="1" max="20" value={formData.classNumber} onChange={handleChange} 
                className="w-1/2 px-4 py-3 rounded-full border border-gray-200 bg-gray-50 text-sm focus:bg-white focus:ring-2 focus:ring-green-400 focus:border-transparent outline-none transition-all text-center" />
            </div>
          </div>

          <div className="pt-6 space-y-3">
            <button disabled={loading} type="submit" 
              className="w-full py-3.5 bg-[#E8F5E9] hover:bg-[#C8E6C9] text-green-700 font-bold text-sm rounded-full transition-colors disabled:opacity-50">
              {loading ? '처리 중...' : (isLoginMode ? '로그인 및 입장' : '새 계정 만들기')}
            </button>
            
            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-gray-100"></div>
              <span className="flex-shrink-0 mx-4 text-xs text-gray-400">또는</span>
              <div className="flex-grow border-t border-gray-100"></div>
            </div>

            <button type="button" onClick={() => setIsLoginMode(!isLoginMode)}
              className="w-full py-3.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-sm rounded-full transition-colors">
              {isLoginMode ? '새 계정 만들기' : '기존 계정으로 로그인'}
            </button>
          </div>
        </form>
        
        <div className="mt-4 text-center">
          <p className="text-[10px] text-gray-400">게스트 기록은 이 기기에만 저장됩니다.</p>
        </div>
      </div>
    </div>
  );
}
