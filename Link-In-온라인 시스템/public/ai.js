// Vision AI analyzer using Gemini 2.5 Flash API or Local Mock fallback
class VisionAI {
  constructor() {
    this.storageKey = 'godsaeng_api_key';
    this.conscienceKey = 'godsaeng_last_conscience_date';
  }

  // Get saved API Key
  getApiKey() {
    return localStorage.getItem(this.storageKey) || '';
  }

  // Save API Key
  saveApiKey(key) {
    if (key.trim()) {
      localStorage.setItem(this.storageKey, key.trim());
      return true;
    }
    return false;
  }

  // Delete API Key
  deleteApiKey() {
    localStorage.removeItem(this.storageKey);
  }

  // Real Gemini API analysis (Vision)
  async analyzeWithGemini(apiKey, missionText, base64Image) {
    // Strip Base64 header if exists
    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, "");
    
    // 서버가 내려준 모델명을 따른다. gemini-2.5-flash는 신규 사용자에게 404를 반환하므로
    // 기본값도 Google이 안내한 이전 대상으로 둔다.
    const model = window.LOCKIN_CONFIG?.GEMINI_MODEL || 'gemini-3.6-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    
    const prompt = `당신은 갓생 살기 앱의 깐깐하고 위트 있는 AI 감독관입니다. 유저가 입력한 미션 주제와 촬영된 사진(부메랑 움짤의 대표 프레임)이 일치하는지 분석해야 합니다.

유저가 제출한 미션: "${missionText}"

다음 조건에 맞게 JSON 형식으로만 응답하세요. 다른 텍스트는 앞뒤에 절대 추가하지 마세요. 마크다운 기호(\`\`\`json)도 적지 말고 순수 JSON만 반환하세요.

응답 JSON 스키마:
{
  "score": 0~100 사이의 정수 (미션과 사진 속 맥락이 일치하는지 판별한 점수. 관련 물건(책, 필기구, 모니터, 덤벨, 운동화 등)이 보이면 높은 점수, 빈 방이나 어두운 화면, 관련 없는 사진은 낮은 점수),
  "pass": score가 70점 이상이면 true, 미만이면 false,
  "feedback": "성공 시(pass=true)에는 힙하고 유머러스하게 칭찬하는 멘트(예: '형광펜 그어진 거 보소. 진짜 갓생러 인정! 🔥'), 실패 시(pass=false)에는 유머러스하고 얄미운 팩폭 피드백(예: '침대 이불 덮고 공부하는 거 맞음? 눈 반쯤 감겼는데 다시 찍어오셈. 🙄')을 1~2문장의 한국어로 친근한 구어체(~함, ~임, 반말 등 MZ 톤앤매너 권장)로 작성"
}`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // AI Studio 신형 AQ. 키는 ?key= 쿼리를 받지 않는다. 헤더로 보내야 하며
          // URL에 키가 남지 않아 로그·referrer 유출도 막힌다.
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API HTTP Error ${response.status}`);
      }

      const result = await response.json();
      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!responseText) {
        throw new Error("API 응답 구조가 올바르지 않습니다.");
      }

      // Parse JSON from text
      const parsedData = JSON.parse(responseText.trim());
      return {
        success: true,
        score: parsedData.score ?? 50,
        pass: parsedData.pass ?? false,
        feedback: parsedData.feedback || "판독 중 알 수 없는 외계 신호가 감지됨 🛸"
      };
    } catch (error) {
      console.error("Gemini API Error:", error);
      return {
        success: false,
        error: error.message,
        feedback: `Gemini API 오류: ${error.message}`
      };
    }
  }

  // Mock Vision AI System with keyword match and funny messages
  analyzeWithMock(missionText) {
    const text = missionText.toLowerCase();
    
    // Key words lists
    const isStudy = /공부|책|인강|코딩|독서|단어|과제|시험|배움|스터디|개발|코드|노트|필기|영어/.test(text);
    const isWorkout = /운동|헬스|런닝|달리기|산책|푸쉬업|스쿼트|홈트|바이크|필라테스|요가|스트레칭|득근|아령/.test(text);
    const isClean = /청소|정리|빨래|설거지|정돈|물걸레|분리수거|이불/.test(text);
    const isMorning = /미라클|일찍|기상|일어나기|아침|새벽|물/.test(text);

    // Default Mock Responses (75% Chance of Pass)
    const isPass = Math.random() > 0.25;
    const score = isPass ? Math.floor(Math.random() * 25) + 75 : Math.floor(Math.random() * 35) + 30; // 75~99 or 30~65

    let feedback = "";

    if (isStudy) {
      feedback = isPass 
        ? `"${missionText}" 미션 확인 완료! 펜 잡은 손가락에 소름 돋는 집중력이 서려 있네요. 갓생 ㅇㅈ! ✍️🔥`
        : `공부한다더니 펜은 데코레이션이고 사실 스마트폰 쳐다보는 중 맞죠? AI는 다 봅니다. 똑바로 찍으셈 🙄`;
    } else if (isWorkout) {
      feedback = isPass
        ? `와, 근손실 방지 위원회에서 합격 목걸이 줬습니다. 땀방울마저 힙해 보이는 중! 🏋️✨`
        : `운동 자세가 좀 엉성하거나, 그냥 운동기구 옆에 누워있는 거 아닙니까? 득근하고 싶으면 다시 제대로 인증 ㄱ`;
    } else if (isClean) {
      feedback = isPass
        ? `방이 너무 깨끗해서 파리가 낙상하겠습니다. 갓생러의 품격이 느껴지는 청소 본능! 🧹🧼`
        : `정리를 하긴 했는데... 구석에 대충 처박아 둔 거 아닙니까? AI 필터에 게으름 레이더 켜짐 🚨`;
    } else if (isMorning) {
      feedback = isPass
        ? `남들 꿈나라일 때 눈 번쩍 뜬 당신, 진정한 얼리버드! 오늘 하루가 엄청 길겠네요 🔥`
        : `이불 속에 누운 채로 눈만 깜빡인 건 아니겠죠? 기상이란 몸을 일으켜 세우는 것임! 다시!`;
    } else {
      // General Mission Responses
      feedback = isPass
        ? `오, 딱 봐도 갓생의 기운이 모니터를 뚫고 나옴. 이 텐션 그대로 오늘 하루 클리어 해보자고! 🚀`
        : `미션 "${missionText}"... 양심적으로 지금 제대로 한 거 맞음? 딴짓하는 실루엣 다 걸림. 다시 해오셈! 🙄`;
    }

    return {
      success: true,
      score: score,
      pass: isPass,
      feedback: feedback
    };
  }

  // 서버가 판독 프록시를 제공하는지 여부. 키 값이 아니라 플래그만 내려온다.
  isProxyEnabled() {
    return Boolean(window.LOCKIN_CONFIG?.AI_PROXY_ENABLED);
  }

  // 전송 전에 긴 변을 기준으로 축소한다. 판정에는 충분하고 대역폭·비용·지연이 크게 줄어든다.
  async shrinkForUpload(base64Image, maxEdge = 768, quality = 0.8) {
    if (!base64Image) return base64Image;
    try {
      const image = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
        el.src = base64Image;
      });

      const longest = Math.max(image.naturalWidth, image.naturalHeight);
      if (!longest) return base64Image;
      const scale = Math.min(1, maxEdge / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    } catch (error) {
      console.warn('이미지 축소를 건너뜁니다:', error.message);
      return base64Image;
    }
  }

  // 서버 프록시 판정. API 키는 서버에만 있으므로 여기서는 로그인 토큰만 보낸다.
  async analyzeWithProxy(missionText, base64Image) {
    const session = await window.lockinSupabase?.auth?.getSession?.();
    const accessToken = session?.data?.session?.access_token;
    if (!accessToken) {
      return { success: false, error: 'AI 판독은 로그인 후 이용할 수 있습니다.' };
    }

    try {
      const image = await this.shrinkForUpload(base64Image);
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ missionText, image })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { success: false, error: payload.error || `판독 서버 오류 (HTTP ${response.status})` };
      }
      return { success: true, score: payload.score, pass: payload.pass, feedback: payload.feedback };
    } catch (error) {
      return { success: false, error: error.message || '판독 서버에 연결하지 못했습니다.' };
    }
  }

  // Combined Main Entry
  async analyze(missionText, base64Image) {
    const apiKey = this.getApiKey();

    // Add artificial delay for AI analysis feel (1.5s)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 서버에 키가 설정되어 있으면 항상 프록시를 쓴다. 브라우저는 키를 보지 못한다.
    if (this.isProxyEnabled()) {
      const result = await this.analyzeWithProxy(missionText, base64Image);
      if (result.success) return { ...result, mode: 'proxy' };
      return {
        success: false,
        errored: true,
        mode: 'error',
        pass: false,
        score: null,
        error: result.error,
        feedback: `AI 판독을 완료하지 못했습니다. (${result.error})`
      };
    }

    if (apiKey) {
      const result = await this.analyzeWithGemini(apiKey, missionText, base64Image);
      if (result.success) {
        return { ...result, mode: 'gemini' };
      }
      // 실제 판독이 실패한 상태에서 난수 mock 결과로 보상을 주지 않는다.
      // 판정 없이 오류를 알리고 사용자가 다시 촬영하도록 한다.
      return {
        success: false,
        errored: true,
        mode: 'error',
        pass: false,
        score: null,
        error: result.error,
        feedback: `AI 판독을 완료하지 못했습니다. (${result.error})`
      };
    }

    // API 키가 없는 사용자를 위한 데모 모드. 판정 결과에 mock 표시를 남긴다.
    return { ...this.analyzeWithMock(missionText), mode: 'mock' };
  }
}

// Instantiate globally
window.visionAI = new VisionAI();
