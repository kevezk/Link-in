// Gemini 키/모델 진단 스크립트 (일회성 도구)
// 실행: cd "Link-In-온라인 시스템" && node --env-file=.env diagnose-gemini.js
//
// 키 값은 화면에 출력하지 않는다. 응답 본문에 키가 섞여 있으면 마스킹한다.

const KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const HOST = 'https://generativelanguage.googleapis.com';

function mask(text) {
  if (!KEY) return text;
  return String(text).split(KEY).join('***KEY***');
}

function short(text, n = 700) {
  const s = mask(text);
  return s.length > n ? s.slice(0, n) + ' …(생략)' : s;
}

// 1x1 흰색 JPEG
const TINY_JPEG =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

async function main() {
  console.log('='.repeat(60));
  console.log('LINK-IN Gemini 진단');
  console.log('='.repeat(60));

  if (!KEY) {
    console.log('❌ GEMINI_API_KEY 를 읽지 못했습니다.');
    console.log('   --env-file=.env 를 붙여 실행했는지, .env 에 해당 줄이 있는지 확인하세요.');
    process.exit(1);
  }
  console.log(`키 접두사 : ${KEY.slice(0, 3)}… (총 ${KEY.length}자)`);
  console.log(`키 형식   : ${KEY.startsWith('AIzaSy') ? 'legacy AIza' : KEY.startsWith('AQ.') ? '신형 AQ (Authentication Key)' : '알 수 없음'}`);
  console.log(`대상 모델 : ${MODEL}`);
  console.log('');

  // --- 1) 키 자체가 유효한가 + 어떤 모델을 쓸 수 있는가 (v1beta / v1 둘 다) ---
  const byVersion = {};
  for (const version of ['v1beta', 'v1']) {
    console.log(`[1] 모델 목록 조회 (GET /${version}/models)`);
    try {
      const res = await fetch(`${HOST}/${version}/models?pageSize=200`, {
        headers: { 'x-goog-api-key': KEY }
      });
      console.log(`    HTTP ${res.status}`);
      const text = await res.text();
      if (!res.ok) {
        console.log('    ❌ 응답:', short(text));
      } else {
        const data = JSON.parse(text);
        const models = (data.models || [])
          .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map(m => m.name.replace('models/', ''));
        byVersion[version] = models;
        console.log(`    ✅ generateContent 지원 모델 ${models.length}개`);
        const flash = models.filter(n => n.includes('flash'));
        console.log('    flash 계열:', flash.length ? flash.join(', ') : '(없음)');
        console.log(`    "${MODEL}" 포함 여부: ${models.includes(MODEL) ? '✅ 있음' : '❌ 없음'}`);
      }
    } catch (error) {
      console.log('    ❌ 네트워크 오류:', mask(error.message));
    }
    console.log('');
  }

  // --- 2) 실제 판정 호출 (버전별로 시도) ---
  let working = null;
  for (const version of ['v1beta', 'v1']) {
    console.log(`[2] generateContent 호출 (/${version}/models/${MODEL})`);
    try {
      const res = await fetch(`${HOST}/${version}/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: '이 이미지를 한 단어로 묘사하고 JSON {"ok":true} 형식으로만 답하세요.' },
              { inlineData: { mimeType: 'image/jpeg', data: TINY_JPEG } }
            ]
          }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });
      console.log(`    HTTP ${res.status}`);
      const text = await res.text();
      if (res.ok) {
        console.log('    ✅ 호출 성공');
        console.log('    응답:', short(text, 300));
        if (!working) working = { version, model: MODEL };
      } else {
        console.log('    ❌ 응답:', short(text));
      }
    } catch (error) {
      console.log('    ❌ 네트워크 오류:', mask(error.message));
    }
    console.log('');
  }

  // --- 3) 현재 모델이 안 되면 사용 가능한 모델로 재시도 ---
  if (!working) {
    const candidates = [];
    for (const [version, models] of Object.entries(byVersion)) {
      for (const name of models) {
        if (name.includes('flash')) candidates.push({ version, model: name });
      }
    }
    if (candidates.length) {
      console.log('[3] 현재 모델이 실패했습니다. 사용 가능한 flash 모델로 재시도합니다.');
      for (const candidate of candidates.slice(0, 5)) {
        try {
          const res = await fetch(
            `${HOST}/${candidate.version}/models/${candidate.model}:generateContent`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: '한 단어로 답하세요.' },
                    { inlineData: { mimeType: 'image/jpeg', data: TINY_JPEG } }
                  ]
                }]
              })
            }
          );
          console.log(`    ${candidate.version}/${candidate.model} → HTTP ${res.status}`);
          if (res.ok && !working) working = candidate;
        } catch (error) {
          console.log(`    ${candidate.version}/${candidate.model} → 오류: ${mask(error.message)}`);
        }
      }
      console.log('');
    }
  }

  // --- 4) 결론 ---
  console.log('[결론]');
  if (working) {
    console.log(`    ✅ 동작하는 조합: API ${working.version} / 모델 ${working.model}`);
    if (working.model !== MODEL) {
      console.log(`    → .env 의 GEMINI_MODEL 을 "${working.model}" 로 바꾸세요.`);
    }
    if (working.version !== 'v1beta') {
      console.log(`    → server.js 의 엔드포인트 버전을 ${working.version} 로 바꿔야 합니다. 이 줄을 알려주세요.`);
    }
  } else {
    console.log('    ❌ 동작하는 조합을 찾지 못했습니다. 위 [1] 응답 본문을 그대로 공유해주세요.');
    console.log('       모델 목록 조회까지 실패했다면 키 권한 또는 프로젝트 설정 문제입니다.');
  }
  console.log('='.repeat(60));
}

main();
