const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const webpush = require('web-push');

const app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@link-in.local';
// 서버 전용 키. publicRuntimeConfig()나 클라이언트 자산에 절대 포함하지 않는다.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUSH_SWEEP_INTERVAL_MS = Number(process.env.PUSH_SWEEP_INTERVAL_MS || 5 * 60 * 1000);
// 서버가 멈춰 있던 동안 지나간 예약을 그래도 보낼지 판단하는 유예 시간.
const PUSH_OVERDUE_GRACE_MS = Number(process.env.PUSH_OVERDUE_GRACE_MS || 10 * 60 * 1000);
// setTimeout이 32bit 범위를 넘기면 즉시 실행되므로 sweep 주기 안쪽만 타이머로 잡는다.
const PUSH_TIMER_HORIZON_MS = Math.max(PUSH_SWEEP_INTERVAL_MS * 2, 10 * 60 * 1000);
const pushSubscriptions = new Map();
const pushTimers = new Map();

// ---- Gemini Vision 프록시 설정 (서버 전용) ----
// 키는 서버 프로세스에만 존재하며 클라이언트로 내려가지 않는다.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// gemini-2.5-flash는 2026-08 기준 신규 사용자에게 차단되어 404를 반환한다.
// Google이 안내한 이전 대상이 gemini-3.6-flash다.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const AI_JSON_LIMIT = process.env.AI_JSON_LIMIT || '4mb';
const AI_MAX_IMAGE_BYTES = Number(process.env.AI_MAX_IMAGE_BYTES || 2 * 1024 * 1024);
const AI_RATE_PER_MINUTE = Number(process.env.AI_RATE_PER_MINUTE || 5);
const AI_RATE_PER_HOUR = Number(process.env.AI_RATE_PER_HOUR || 40);
// 3.x 계열은 내부 추론 시간이 붙을 수 있어 2.5 대비 여유를 둔다.
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 30000);

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// 사진 판정 요청만 큰 본문을 허용한다. 이 미들웨어가 먼저 req.body를 채우므로
// 아래의 64kb 파서는 해당 경로에서 다시 파싱하지 않는다.
app.use('/api/ai/analyze', express.json({ limit: AI_JSON_LIMIT }));
app.use(express.json({ limit: '64kb' }));

function publicRuntimeConfig() {
  return `window.LOCKIN_CONFIG = ${JSON.stringify({
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    VAPID_PUBLIC_KEY,
    // 키 값이 아니라 '프록시를 쓸 수 있는지' 여부만 노출한다.
    AI_PROXY_ENABLED: Boolean(GEMINI_API_KEY),
    AI_MAX_IMAGE_BYTES,
    // 모델명은 비밀이 아니다. BYOK 경로가 서버와 같은 모델을 쓰도록 내려준다.
    GEMINI_MODEL
  })};`;
}

// 서버 전용 비밀값이 클라이언트로 나가는 경로에 섞이지 않았는지 부팅 시 검사한다.
// 실수로 publicRuntimeConfig에 키를 추가하면 서버가 아예 뜨지 않도록 막는다.
function assertNoSecretLeak() {
  const secrets = [
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
    ['GEMINI_API_KEY', GEMINI_API_KEY],
    ['VAPID_PRIVATE_KEY', VAPID_PRIVATE_KEY]
  ];
  const payload = publicRuntimeConfig();
  for (const [name, value] of secrets) {
    if (value && payload.includes(value)) {
      throw new Error(`치명적: ${name} 값이 /runtime-config.js 응답에 포함되어 있습니다. 서버를 중단합니다.`);
    }
  }
}

app.get('/runtime-config.js', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('application/javascript').send(publicRuntimeConfig());
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// 학급 캐릭터 화이트리스트. public/characters.js 의 정의와 ID가 일치해야 한다.
// 값은 이름표 테두리 등에 쓰는 대표 색이다.
const CLASS_CHARACTERS = {
  red: '#D2544F',
  orange: '#E4823C',
  yellow: '#EFC33F',
  green: '#4E7346',
  blue: '#2F80B4',
  purple: '#9187AE'
};
const DEFAULT_CLASS_CHARACTER = 'red';

// In-memory data store for rooms and notice boards
// roomsData[roomId] = { users: { socketId: userObj }, notice: { title, content, updatedAt, authorName, authorRole } }
const roomsData = {};

async function getAuthenticatedUser(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('서버의 Supabase 환경변수가 설정되지 않았습니다.');
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) throw new Error('유효한 로그인 세션이 필요합니다.');
  return response.json();
}

function bearerToken(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function supabaseUserHeaders(accessToken, prefer) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {})
  };
}

function hasPushAdminAccess() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function supabaseAdminHeaders(prefer) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {})
  };
}

// 예약은 최대 7일 뒤까지 잡히므로, 발송 시점에는 예약 당시의 사용자 access token이
// 이미 만료되어 있을 수 있다. service role 자격이 있으면 그 쪽을 우선 사용한다.
async function updatePushJob(jobId, userId, values, accessToken) {
  const params = new URLSearchParams({ id: `eq.${jobId}`, user_id: `eq.${userId}` });
  const attempts = [];
  if (hasPushAdminAccess()) attempts.push(supabaseAdminHeaders());
  if (accessToken) attempts.push(supabaseUserHeaders(accessToken));
  if (!attempts.length) throw new Error('Push 예약 상태를 저장할 자격 증명이 없습니다.');

  let lastError = null;
  for (const headers of attempts) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/push_jobs?${params}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ...values, updated_at: new Date().toISOString() })
      });
      if (response.ok) return;
      lastError = new Error((await response.json().catch(() => ({}))).message || 'Push 예약 상태 저장 실패');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Push 예약 상태 저장 실패');
}

async function dropDeadSubscription(endpoint) {
  if (!hasPushAdminAccess() || !endpoint) return;
  const params = new URLSearchParams({ endpoint: `eq.${endpoint}` });
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?${params}`, {
    method: 'DELETE',
    headers: supabaseAdminHeaders()
  }).catch(error => console.error('[Web Push cleanup]', error.message));
}

const inFlightPushJobs = new Set();

async function deliverPushJob(job, subscriptions, accessToken) {
  if (inFlightPushJobs.has(job.id)) return;
  inFlightPushJobs.add(job.id);

  const payload = JSON.stringify({ title: job.title, body: job.body, url: '/' });
  const targets = subscriptions.filter(Boolean);
  let delivered = false;
  let lastError = null;

  for (const subscription of targets) {
    try {
      await webpush.sendNotification(subscription, payload);
      delivered = true;
    } catch (error) {
      lastError = error;
      console.error('[Web Push]', error.statusCode || error.message);
      if (error.statusCode === 404 || error.statusCode === 410) {
        await dropDeadSubscription(subscription.endpoint);
      }
    }
  }

  try {
    if (delivered) {
      await updatePushJob(job.id, job.user_id, {
        status: 'sent',
        attempts: Number(job.attempts || 0) + 1,
        processed_at: new Date().toISOString(),
        last_error: null
      }, accessToken);
    } else {
      await updatePushJob(job.id, job.user_id, {
        status: 'failed',
        attempts: Number(job.attempts || 0) + 1,
        processed_at: new Date().toISOString(),
        last_error: String(lastError?.message || lastError || '전송 가능한 Push 구독이 없습니다.').slice(0, 500)
      }, accessToken);
    }
  } catch (updateError) {
    console.error('[Web Push status]', updateError.message);
  } finally {
    inFlightPushJobs.delete(job.id);
  }
}

function schedulePushTimer(job, subscriptions, accessToken) {
  const userId = job.user_id;
  const timerKey = `${userId}:${job.task_id}`;
  if (pushTimers.has(timerKey)) clearTimeout(pushTimers.get(timerKey));

  const delay = new Date(job.scheduled_at).getTime() - Date.now();
  if (!Number.isFinite(delay)) return false;
  // 아직 한참 남은 예약은 다음 sweep이 다시 집어간다.
  if (delay > PUSH_TIMER_HORIZON_MS) return false;

  pushTimers.set(timerKey, setTimeout(async () => {
    pushTimers.delete(timerKey);
    await deliverPushJob(job, subscriptions, accessToken);
  }, Math.max(delay, 0)));
  return true;
}

async function fetchSubscriptionsForUsers(userIds) {
  const byUser = new Map();
  if (!userIds.length || !hasPushAdminAccess()) return byUser;
  const params = new URLSearchParams({
    select: 'user_id,endpoint,subscription',
    user_id: `in.(${userIds.join(',')})`
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?${params}`, {
    headers: supabaseAdminHeaders()
  });
  if (!response.ok) throw new Error('Push 구독 목록 조회 실패');
  for (const row of await response.json()) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push(row.subscription);
  }
  return byUser;
}

// 서버 부팅 시와 주기적으로 실행한다. 사용자의 재접속을 기다리지 않고
// push_jobs에 남아 있는 대기 작업을 직접 집어간다.
async function sweepPendingPushJobs() {
  if (!hasPushAdminAccess()) return { scheduled: 0, overdue: 0, expired: 0 };

  const now = Date.now();
  const params = new URLSearchParams({
    select: 'id,user_id,task_id,title,body,scheduled_at,status,attempts',
    status: 'eq.pending',
    scheduled_at: `lte.${new Date(now + PUSH_TIMER_HORIZON_MS).toISOString()}`,
    order: 'scheduled_at.asc',
    limit: '500'
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/push_jobs?${params}`, {
    headers: supabaseAdminHeaders()
  });
  if (!response.ok) throw new Error('Push 예약 목록 조회 실패');
  const jobs = await response.json();
  if (!jobs.length) return { scheduled: 0, overdue: 0, expired: 0 };

  const userIds = [...new Set(jobs.map(job => job.user_id))];
  const subscriptionsByUser = await fetchSubscriptionsForUsers(userIds);

  let scheduled = 0;
  let overdue = 0;
  let expired = 0;

  for (const job of jobs) {
    const subscriptions = subscriptionsByUser.get(job.user_id) || [];
    const dueAt = new Date(job.scheduled_at).getTime();

    if (!subscriptions.length) {
      // 아직 시각이 남았다면 그 사이에 구독이 생길 수 있으므로 pending으로 둔다.
      if (dueAt > now) continue;
      await updatePushJob(job.id, job.user_id, {
        status: 'failed',
        processed_at: new Date().toISOString(),
        last_error: '저장된 Push 구독이 없습니다.'
      }).catch(error => console.error('[Push sweep]', error.message));
      continue;
    }

    if (dueAt <= now) {
      if (now - dueAt <= PUSH_OVERDUE_GRACE_MS) {
        overdue += 1;
        await deliverPushJob(job, subscriptions);
      } else {
        expired += 1;
        await updatePushJob(job.id, job.user_id, {
          status: 'failed',
          processed_at: new Date().toISOString(),
          last_error: '서버 중단으로 예약 시각이 유예 시간을 넘겨 지났습니다.'
        }).catch(error => console.error('[Push sweep]', error.message));
      }
      continue;
    }

    if (schedulePushTimer(job, subscriptions)) scheduled += 1;
  }

  return { scheduled, overdue, expired };
}

async function runPushSweep(label) {
  try {
    const result = await sweepPendingPushJobs();
    if (result.scheduled || result.overdue || result.expired) {
      console.log(`[Push sweep:${label}] 예약 ${result.scheduled}건 복원, 지연 발송 ${result.overdue}건, 만료 처리 ${result.expired}건`);
    }
  } catch (error) {
    console.error(`[Push sweep:${label}]`, error.message);
  }
}

function startPushScheduler() {
  if (!hasPushAdminAccess()) {
    console.warn('[Push] SUPABASE_SERVICE_ROLE_KEY가 없어 서버 주도 예약 복원이 비활성화됩니다. 사용자가 재접속할 때만 예약이 복원됩니다.');
    return;
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[Push] VAPID 키가 없어 예약 복원을 건너뜁니다.');
    return;
  }
  runPushSweep('boot');
  const timer = setInterval(() => runPushSweep('interval'), PUSH_SWEEP_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

// 사용자가 재접속했을 때의 복원 경로. service role이 없는 환경의 fallback이기도 하다.
async function restorePendingPushJobs(userId, accessToken, subscription) {
  const params = new URLSearchParams({
    select: 'id,user_id,task_id,title,body,scheduled_at,status,attempts',
    user_id: `eq.${userId}`,
    status: 'eq.pending',
    scheduled_at: `gt.${new Date().toISOString()}`,
    order: 'scheduled_at.asc'
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/push_jobs?${params}`, {
    headers: supabaseUserHeaders(accessToken)
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Push 예약 복원 실패');
  const jobs = await response.json();
  jobs.forEach(job => schedulePushTimer(job, [subscription], accessToken));
  return jobs.length;
}

async function getStoredPushSubscription(userId, accessToken) {
  const params = new URLSearchParams({ select: 'subscription', user_id: `eq.${userId}`, limit: '1' });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?${params}`, {
    headers: supabaseUserHeaders(accessToken)
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Push 구독 조회 실패');
  return (await response.json())[0]?.subscription || null;
}

app.post('/api/push/subscribe', async (req, res) => {
  try {
    const accessToken = bearerToken(req);
    const user = await getAuthenticatedUser(accessToken);
    const subscription = req.body?.subscription;
    if (!subscription?.endpoint || !subscription?.keys) throw new Error('올바른 Push 구독이 필요합니다.');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ endpoint: subscription.endpoint, user_id: user.id, subscription, updated_at: new Date().toISOString() })
    });
    if (!response.ok) throw new Error((await response.json()).message || 'Push 구독 저장 실패');
    pushSubscriptions.set(user.id, subscription);
    const restoredJobs = await restorePendingPushJobs(user.id, accessToken, subscription);
    res.json({ ok: true, restoredJobs });
  } catch (error) { res.status(401).json({ error: error.message }); }
});

app.post('/api/push/schedule', async (req, res) => {
  try {
    const accessToken = bearerToken(req);
    const user = await getAuthenticatedUser(accessToken);
    const { taskId, title, body, scheduledAt } = req.body || {};
    const when = new Date(scheduledAt).getTime();
    if (!taskId || !Number.isFinite(when) || when <= Date.now() || when > Date.now() + 7 * 86400000) throw new Error('예약 시간이 올바르지 않습니다.');
    const subscription = pushSubscriptions.get(user.id) || await getStoredPushSubscription(user.id, accessToken);
    if (!subscription) throw new Error('저장된 Push 구독이 없습니다. 먼저 백그라운드 알림을 활성화해주세요.');
    pushSubscriptions.set(user.id, subscription);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/push_jobs?on_conflict=user_id,task_id`, {
      method: 'POST',
      headers: supabaseUserHeaders(accessToken, 'resolution=merge-duplicates,return=representation'),
      body: JSON.stringify({
        user_id: user.id, task_id: String(taskId), title: String(title || '').slice(0, 120),
        body: String(body || '').slice(0, 500), scheduled_at: new Date(when).toISOString(),
        status: 'pending', attempts: 0, last_error: null, processed_at: null, updated_at: new Date().toISOString()
      })
    });
    if (!response.ok) throw new Error((await response.json()).message || 'Push 예약 저장 실패');
    const job = (await response.json())[0];
    schedulePushTimer({ ...job, user_id: job.user_id || user.id }, [subscription], accessToken);
    res.json({ ok: true, scheduledAt: new Date(when).toISOString() });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// ============================================================
// Gemini Vision 판정 프록시
// 브라우저에 API 키를 내려보내지 않기 위해 서버가 대신 호출한다.
// ============================================================

// 사용자별 호출 기록. 단일 프로세스 메모리이므로 재시작 시 초기화되고
// 수평 확장 시에는 인스턴스별로 따로 집계된다. 남용 방지용 1차 방어선이다.
const aiCallLog = new Map();

function enforceAiRateLimit(userId) {
  const now = Date.now();
  const recent = (aiCallLog.get(userId) || []).filter(at => now - at < 3600000);
  if (recent.filter(at => now - at < 60000).length >= AI_RATE_PER_MINUTE) {
    throw Object.assign(new Error('잠시 후 다시 시도해주세요. 1분 안에 너무 많이 요청했습니다.'), { status: 429 });
  }
  if (recent.length >= AI_RATE_PER_HOUR) {
    throw Object.assign(new Error('시간당 AI 판독 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'), { status: 429 });
  }
  recent.push(now);
  aiCallLog.set(userId, recent);
}

function pruneAiCallLog() {
  const now = Date.now();
  for (const [userId, calls] of aiCallLog) {
    const recent = calls.filter(at => now - at < 3600000);
    if (recent.length) aiCallLog.set(userId, recent);
    else aiCallLog.delete(userId);
  }
}

function buildVisionPrompt(missionText) {
  return `당신은 갓생 살기 앱의 깐깐하고 위트 있는 AI 감독관입니다. 유저가 입력한 미션 주제와 촬영된 사진(부메랑 움짤의 대표 프레임)이 일치하는지 분석해야 합니다.

유저가 제출한 미션: "${missionText}"

다음 조건에 맞게 JSON 형식으로만 응답하세요. 다른 텍스트는 앞뒤에 절대 추가하지 마세요. 마크다운 기호(\`\`\`json)도 적지 말고 순수 JSON만 반환하세요.

응답 JSON 스키마:
{
  "score": 0~100 사이의 정수 (미션과 사진 속 맥락이 일치하는지 판별한 점수. 관련 물건(책, 필기구, 모니터, 덤벨, 운동화 등)이 보이면 높은 점수, 빈 방이나 어두운 화면, 관련 없는 사진은 낮은 점수),
  "pass": score가 70점 이상이면 true, 미만이면 false,
  "feedback": "성공 시(pass=true)에는 힙하고 유머러스하게 칭찬하는 멘트, 실패 시(pass=false)에는 유머러스하고 얄미운 팩폭 피드백을 1~2문장의 한국어 구어체로 작성"
}`;
}

async function callGeminiVision(missionText, base64Data, mimeType) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      // AI Studio가 발급하는 신형 AQ. 키는 ?key= 쿼리 대신 이 헤더를 사용한다.
      // URL에 키를 넣지 않으므로 로그·referrer로 새어나가지도 않는다.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: buildVisionPrompt(missionText) },
            { inlineData: { mimeType, data: base64Data } }
          ]
        }],
        generationConfig: { responseMimeType: 'application/json' }
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS)
    }
  );

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    // 상류 오류 메시지를 그대로 노출하지 않는다. 키나 프로젝트 정보가 섞일 수 있다.
    console.error('[Gemini]', response.status, detail?.error?.message || '');
    throw Object.assign(new Error(`AI 판독 서비스 오류 (HTTP ${response.status})`), { status: 502 });
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw Object.assign(new Error('AI 응답 구조가 올바르지 않습니다.'), { status: 502 });

  let parsed;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    throw Object.assign(new Error('AI 응답을 해석하지 못했습니다.'), { status: 502 });
  }

  const score = Number(parsed.score);
  if (!Number.isFinite(score)) throw Object.assign(new Error('AI 점수를 해석하지 못했습니다.'), { status: 502 });
  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score: boundedScore,
    // 점수와 통과 여부가 어긋나면 점수를 기준으로 삼는다.
    pass: typeof parsed.pass === 'boolean' ? parsed.pass && boundedScore >= 70 : boundedScore >= 70,
    feedback: String(parsed.feedback || '판독 결과 설명을 받지 못했습니다.').slice(0, 500)
  };
}

app.post('/api/ai/analyze', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      throw Object.assign(new Error('서버에 AI 판독이 설정되어 있지 않습니다.'), { status: 503 });
    }

    const accessToken = bearerToken(req);
    let user;
    try {
      user = await getAuthenticatedUser(accessToken);
    } catch {
      throw Object.assign(new Error('AI 판독은 로그인 후 이용할 수 있습니다.'), { status: 401 });
    }

    const missionText = String(req.body?.missionText || '').trim().slice(0, 200);
    const rawImage = String(req.body?.image || '');
    if (!missionText) throw Object.assign(new Error('판독할 미션 내용이 없습니다.'), { status: 400 });

    const match = rawImage.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
    const mimeType = match ? match[1].replace('image/jpg', 'image/jpeg') : 'image/jpeg';
    const base64Data = match ? match[2] : rawImage;
    if (!base64Data || !/^[A-Za-z0-9+/=\s]+$/.test(base64Data.slice(0, 256))) {
      throw Object.assign(new Error('올바른 이미지가 필요합니다.'), { status: 400 });
    }

    const decodedBytes = Math.floor(base64Data.length * 3 / 4);
    if (decodedBytes > AI_MAX_IMAGE_BYTES) {
      throw Object.assign(
        new Error(`이미지가 너무 큽니다. (${Math.round(decodedBytes / 1024)}KB / 최대 ${Math.round(AI_MAX_IMAGE_BYTES / 1024)}KB)`),
        { status: 413 }
      );
    }

    // 형식 검증을 통과한 요청만 한도에 계산한다. 잘못 만든 요청 때문에
    // 사용자 할당량이 깎이지 않게 하되, 상류 호출 직전에 두어 비용은 반드시 막는다.
    enforceAiRateLimit(user.id);

    const verdict = await callGeminiVision(missionText, base64Data, mimeType);
    res.json({ ok: true, ...verdict });
  } catch (error) {
    const status = error.status || (error.name === 'TimeoutError' ? 504 : 500);
    if (!error.status) console.error('[AI proxy]', error.message);
    res.status(status).json({
      error: error.name === 'TimeoutError' ? 'AI 판독 시간이 초과되었습니다.' : error.message
    });
  }
});

async function getClassMembership(accessToken, userId) {
  const params = new URLSearchParams({
    select: 'user_id,class_id,role,display_name,classes(school_name,grade,class_number)',
    user_id: `eq.${userId}`,
    limit: '1'
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/class_memberships?${params}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) throw new Error('학급 정보를 확인하지 못했습니다.');
  const rows = await response.json();
  if (!rows[0]?.classes) throw new Error('먼저 학급 가입 정보를 저장해주세요.');
  return rows[0];
}

async function getClassNotice(accessToken, classId) {
  const params = new URLSearchParams({ select: '*', class_id: `eq.${classId}`, limit: '1' });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/class_notices?${params}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  return (await response.json())[0] || null;
}

async function saveClassNotice(accessToken, title, content) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_class_notice`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input_title: title, input_content: content })
  });
  if (!response.ok) throw new Error((await response.json()).message || '알림장 저장에 실패했습니다.');
  return response.json();
}

io.use(async (socket, next) => {
  try {
    const accessToken = socket.handshake.auth?.accessToken;
    if (!accessToken || typeof accessToken !== 'string') throw new Error('로그인이 필요합니다.');
    socket.accessToken = accessToken;
    socket.authUser = await getAuthenticatedUser(accessToken);
    next();
  } catch (error) {
    next(new Error(error.message || '학급 서버 인증에 실패했습니다.'));
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // 1. Join School-Grade-Class Room
  socket.on('join-class', async (data = {}) => {
    try {
      const membership = await getClassMembership(socket.accessToken, socket.authUser.id);
      const classInfo = membership.classes;
      const cleanSchool = classInfo.school_name;
      const cleanGrade = String(classInfo.grade);
      const cleanClass = String(classInfo.class_number);
      const roomId = membership.class_id;
      // 클라이언트가 보낸 캐릭터 값은 화이트리스트로만 받는다.
      const requestedCharacter = typeof data.character === 'string' ? data.character : '';
      const character = CLASS_CHARACTERS[requestedCharacter] ? requestedCharacter : DEFAULT_CLASS_CHARACTER;
      const avatarColor = CLASS_CHARACTERS[character];

      if (socket.roomId && roomsData[socket.roomId]?.users[socket.id]) {
        delete roomsData[socket.roomId].users[socket.id];
        socket.leave(socket.roomId);
      }

      socket.roomId = roomId;
      socket.userInfo = {
      id: socket.id,
      userId: socket.authUser.id,
      username: membership.display_name,
      role: membership.role,
      school: cleanSchool,
      grade: cleanGrade,
      classNum: cleanClass,
      character,
      avatarColor,
      // Pixel Classroom initial position
      x: 300 + Math.random() * 200,
      y: 250 + Math.random() * 150,
      direction: 'down',
      isMoving: false
      };

    socket.join(roomId);

      if (!roomsData[roomId]) {
        const persistedNotice = await getClassNotice(socket.accessToken, roomId);
        roomsData[roomId] = {
        users: {},
          notice: persistedNotice ? {
            title: persistedNotice.title, content: persistedNotice.content,
            authorName: persistedNotice.author_name,
            authorRole: persistedNotice.author_role === 'teacher' ? '선생님' : '반장',
            updatedAt: new Date(persistedNotice.updated_at).toLocaleString('ko-KR')
          } : {
          title: `📌 [${cleanSchool} ${cleanGrade}학년 ${cleanClass}반] 오늘의 알림장`,
          content: '선생님과 반장님이 작성한 학급 공지사항이 이곳에 표시됩니다.',
          authorName: '시스템',
          authorRole: 'system',
          updatedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        }
      };
    }

    // Add user to room store
    roomsData[roomId].users[socket.id] = socket.userInfo;

    console.log(`[Room Joined] User "${socket.userInfo.username}" (${socket.userInfo.role}) -> Room: "${roomId}"`);

    // Send room info & existing notice back to joined user
    socket.emit('joined-success', {
      roomId,
      user: socket.userInfo,
      notice: roomsData[roomId].notice,
      allUsers: Object.values(roomsData[roomId].users)
    });

    // Notify other users in the room
      socket.to(roomId).emit('user-joined', {
      user: socket.userInfo,
      allUsers: Object.values(roomsData[roomId].users)
      });
    } catch (error) {
      socket.emit('join-error', { message: error.message || '학급 입장에 실패했습니다.' });
    }
  });

  // 2. Pixel Classroom Character Movement Synchronization
  socket.on('pixel-move', (moveData) => {
    const roomId = socket.roomId;
    if (!roomId || !roomsData[roomId] || !roomsData[roomId].users[socket.id]) return;

    const user = roomsData[roomId].users[socket.id];
    const x = Number(moveData?.x);
    const y = Number(moveData?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    user.x = Math.max(0, Math.min(1200, x));
    user.y = Math.max(0, Math.min(800, y));
    user.direction = ['up', 'down', 'left', 'right'].includes(moveData.direction) ? moveData.direction : 'down';
    user.isMoving = Boolean(moveData.isMoving);

    // Broadcast updated position to others in room
    socket.to(roomId).emit('pixel-user-moved', {
      id: socket.id,
      x: user.x,
      y: user.y,
      direction: user.direction,
      isMoving: user.isMoving
    });
  });

  // 3. Notice Board Update (Only Teacher or Class President)
  socket.on('update-notice', async (noticePayload) => {
    const roomId = socket.roomId;
    const user = socket.userInfo;

    if (!roomId || !user) {
      socket.emit('notice-error', { message: '방 접속 정보를 찾을 수 없습니다.' });
      return;
    }

    // Permission check: only teacher or president
    if (user.role !== 'teacher' && user.role !== 'president') {
      socket.emit('notice-error', { message: '알림장은 선생님과 반장만 작성/수정할 수 있습니다.' });
      return;
    }

    const title = typeof noticePayload?.title === 'string' ? noticePayload.title.trim().slice(0, 100) : '';
    const content = typeof noticePayload?.content === 'string' ? noticePayload.content.trim().slice(0, 5000) : '';
    if (!content) {
      socket.emit('notice-error', { message: '알림장 내용을 입력해주세요.' });
      return;
    }
    try {
      const saved = await saveClassNotice(socket.accessToken, title || '우리 반 알림장', content);
      const updatedNotice = {
      title: title || `📌 [${user.school} ${user.grade}-${user.classNum}] 알림장`,
      content,
      authorName: user.username,
      authorRole: user.role === 'teacher' ? '선생님' : '반장',
      updatedAt: new Date(saved.updated_at || Date.now()).toLocaleString('ko-KR')
      };

    roomsData[roomId].notice = updatedNotice;

    // Broadcast new notice to all users in the room
    io.in(roomId).emit('notice-updated', updatedNotice);
    console.log(`[Notice Updated] Room "${roomId}" by ${user.username} (${user.role})`);
    } catch (error) {
      socket.emit('notice-error', { message: error.message });
    }
  });

  ['webrtc-offer', 'webrtc-answer', 'webrtc-ice'].forEach(eventName => {
    socket.on(eventName, ({ targetId, payload }) => {
      const target = io.sockets.sockets.get(targetId);
      if (!target || target.roomId !== socket.roomId) return;
      target.emit(eventName, { fromId: socket.id, payload });
    });
  });

  // 4. Disconnect Handling
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && roomsData[roomId] && roomsData[roomId].users[socket.id]) {
      const leavingUser = roomsData[roomId].users[socket.id];
      delete roomsData[roomId].users[socket.id];

      console.log(`[User Left] "${leavingUser.username}" left Room "${roomId}"`);

      io.in(roomId).emit('user-left', {
        id: socket.id,
        username: leavingUser.username,
        allUsers: Object.values(roomsData[roomId].users)
      });

      // Cleanup empty room if needed
      if (Object.keys(roomsData[roomId].users).length === 0) {
        delete roomsData[roomId];
      }
    }
  });
});

// listen 전에 검사한다. 통과하지 못하면 포트를 열지 않는다.
assertNoSecretLeak();

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Link-In Online System Server Running on Port ${PORT}`);
  console.log(`🌐 Local Access: http://localhost:${PORT}`);
  console.log(`====================================================`);
  startPushScheduler();
  if (GEMINI_API_KEY) {
    console.log(`🤖 AI 판독 프록시 활성 (model: ${GEMINI_MODEL}, ${AI_RATE_PER_MINUTE}회/분 · ${AI_RATE_PER_HOUR}회/시간)`);
    const pruneTimer = setInterval(pruneAiCallLog, 10 * 60 * 1000);
    if (typeof pruneTimer.unref === 'function') pruneTimer.unref();
  } else {
    console.warn('[AI] GEMINI_API_KEY가 없어 서버 판독 프록시가 비활성입니다. 클라이언트는 데모 판정으로 동작합니다.');
  }
});
