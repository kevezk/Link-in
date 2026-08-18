// LOCK-IN (Complete) Application Controller with Vision AI & 8th PPT Spec Integrations
let currentDateStr = '';
let currentRoutines = [];
let dbSupabase = null;
let lastKnownTodayStr = '';
let currentAuthUser = null;
const TASKS_STORAGE_KEY = 'complete_tasks_map';
const REWARDS_STORAGE_KEY = 'complete_task_rewards';
const CUSTOM_ROUTINES_STORAGE_KEY = 'complete_custom_routines';
const AUTH_CHOICE_STORAGE_KEY = 'complete_auth_choice';

// App Init entry point
window.addEventListener('DOMContentLoaded', async () => {
  // 1. Setup real-time clock and midnight detector
  updateTime();
  setInterval(updateTime, 1000);
  setInterval(checkMidnightUpdate, 5000); // Check midnight transition every 5s

  // 2. Initialize date navigator to today (KST)
  const offset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(Date.now() + offset);
  currentDateStr = kstDate.toISOString().split('T')[0];
  lastKnownTodayStr = currentDateStr;
  document.getElementById('datePicker').value = currentDateStr;

  // 3. Local-first data layer with optional Supabase session sync.
  const SUPABASE_URL = window.LOCKIN_CONFIG?.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = window.LOCKIN_CONFIG?.SUPABASE_ANON_KEY || '';
  
  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof supabase !== 'undefined') {
    try {
      dbSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.lockinSupabase = dbSupabase;
      dbSupabase.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => applySupabaseSession(session?.user || null), 0);
        window.dispatchEvent(new CustomEvent('lockin-auth-changed', { detail: { session } }));
      });
    } catch (e) {
      console.info("오프라인 로컬 모드로 시작합니다.");
    }
  }
  if (dbSupabase) {
    const { data } = await dbSupabase.auth.getSession();
    currentAuthUser = data.session?.user || null;
    window.dispatchEvent(new CustomEvent('lockin-auth-changed', { detail: { session: data.session || null } }));
    if (currentAuthUser) localStorage.setItem(AUTH_CHOICE_STORAGE_KEY, 'account');
  }
  window.godsaengStore.setupSupabase(
    currentAuthUser ? dbSupabase : null,
    currentAuthUser?.id || null
  );
  window.godsaengStore.setLocalScope(getActiveStorageScope());

  // Initialize store configuration
  await window.godsaengStore.init();
  if (currentAuthUser) await loadCustomRoutinesFromCloud();
  updateSyncStatus(window.godsaengStore.isSupabaseActive ? 'cloud' : 'local');
  window.addEventListener('online', () => updateSyncStatus(window.godsaengStore.isSupabaseActive ? 'cloud' : 'local'));
  window.addEventListener('offline', () => updateSyncStatus('offline'));

  // Load saved API key in UI
  document.getElementById('apiKeyInput').value = window.visionAI.getApiKey();

  // 4. Bind DOM Events
  setupEventListeners();
  renderAuthView();

  // 5. Load data for active date
  await loadStateForDate(currentDateStr);
  if (!currentAuthUser && !localStorage.getItem(AUTH_CHOICE_STORAGE_KEY)) {
    openAuthModal();
  }

  // Hide Splash screen with zoom fade
  setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    splash.style.opacity = '0';
    splash.style.transform = 'translateY(-30px) scale(0.95)';
    setTimeout(() => {
      splash.classList.add('hidden');
    }, 600);
  }, 1800);

  // Initialize tab pills tracker
  positionTabIndicator();
  window.addEventListener('resize', positionTabIndicator);
  lucide.createIcons();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      console.info('오프라인 캐시는 다음 실행에서 다시 준비합니다.');
    });
  }
});

function readTaskMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedStorageKey(TASKS_STORAGE_KEY)) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeTaskMap(taskMap) {
  localStorage.setItem(scopedStorageKey(TASKS_STORAGE_KEY), JSON.stringify(taskMap));
}

function getActiveStorageScope() {
  return currentAuthUser?.id ? `account:${currentAuthUser.id}` : 'guest';
}

function storageKeyForScope(baseKey, scope) {
  const key = `${baseKey}::${encodeURIComponent(scope)}`;
  if (scope === 'guest' && localStorage.getItem(key) === null) {
    const legacyValue = localStorage.getItem(baseKey);
    if (legacyValue !== null) localStorage.setItem(key, legacyValue);
  }
  return key;
}

function scopedStorageKey(baseKey) {
  return storageKeyForScope(baseKey, getActiveStorageScope());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// ==========================================================================
// ROUTINE ALARM SCHEDULING ENGINE & TIME CONVERSION HELPERS
// ==========================================================================
let scheduledAlarmTimers = {};

function convert12To24(meridiem, hourStr, minuteStr) {
  let hour = parseInt(hourStr, 10);
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  const formattedHour = String(hour).padStart(2, '0');
  const formattedMinute = String(minuteStr).padStart(2, '0');
  return `${formattedHour}:${formattedMinute}`;
}

function convert24To12(time24) {
  if (!time24 || typeof time24 !== 'string') {
    return { meridiem: 'AM', hour: 8, minute: 30, time_24h: '08:30' };
  }
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  let meridiem = 'AM';
  if (h >= 12) {
    meridiem = 'PM';
    if (h > 12) h -= 12;
  }
  if (h === 0) h = 12;
  return {
    meridiem,
    hour: h,
    minute: m,
    time_24h: `${String(parseInt(hStr, 10) || 0).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  };
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert("이 브라우저는 웹 알림 기능을 지원하지 않습니다.");
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') return true;
  }
  alert("브라우저 설정에서 알림 권한을 허용해주세요 🔔");
  return false;
}

function triggerAlarmNotification(taskContent, meridiem) {
  const title = `⏰ LOCK-IN 루틴 알람`;
  let body = '';
  if (meridiem === 'AM') {
    body = `침대랑 백년가약 맺음? 💍 [${taskContent}] 딱 하나만 하고 다시 눕자!`;
  } else {
    body = `오늘 하루 아무것도 안 했다고 자책 금지 🙅‍♂️ 지금 [${taskContent}] 바로 시작!`;
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        payload: { title, options: { body, tag: `routine-alarm-${Date.now()}` } }
      });
    } else {
      new Notification(title, { body, icon: './icon-192.png' });
    }
  } else {
    alert(`⏰ [LOCK-IN 루틴 알람]\n\n${body}`);
  }
}

function scheduleRoutineAlarm(task) {
  if (!task || !task.id) return;
  clearRoutineAlarm(task.id);

  if (!task.alarm || !task.alarm.enabled || task.is_done) {
    return;
  }

  const now = new Date();
  const time24 = task.alarm.time_24h || convert12To24(task.alarm.meridiem || 'AM', task.alarm.hour || 8, task.alarm.minute || 30);
  const [targetH, targetM] = time24.split(':').map(Number);

  const taskDate = /^\d{4}-\d{2}-\d{2}$/.test(task.date || '') ? task.date : currentDateStr;
  const [year, month, day] = taskDate.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day, targetH, targetM, 0, 0);
  let delay = targetDate.getTime() - now.getTime();

  if (delay <= 0) return;

  const timerId = window.setTimeout(() => {
    triggerAlarmNotification(task.content, task.alarm.meridiem || (targetH >= 12 ? 'PM' : 'AM'));
    delete scheduledAlarmTimers[task.id];
  }, delay);

  scheduledAlarmTimers[task.id] = timerId;
  window.scheduleServerPushForTask?.(task, targetDate.toISOString()).catch(error => console.warn('Push schedule failed', error));
}

function clearRoutineAlarm(taskId) {
  if (scheduledAlarmTimers[taskId]) {
    clearTimeout(scheduledAlarmTimers[taskId]);
    delete scheduledAlarmTimers[taskId];
  }
}

function scheduleAllActiveAlarms() {
  currentRoutines.forEach(routine => {
    if (routine.alarm && routine.alarm.enabled && !routine.is_done) {
      scheduleRoutineAlarm(routine);
    }
  });
}

function populateTimeSelectOptions(hourEl, minuteEl, defaultHour = 8, defaultMinute = 30) {
  if (hourEl) {
    hourEl.innerHTML = '';
    for (let i = 1; i <= 12; i++) {
      const opt = document.createElement('option');
      const valStr = String(i).padStart(2, '0');
      opt.value = valStr;
      opt.textContent = `${valStr}시`;
      if (i === defaultHour) opt.selected = true;
      hourEl.appendChild(opt);
    }
  }

  if (minuteEl) {
    minuteEl.innerHTML = '';
    for (let i = 0; i < 60; i += 5) {
      const opt = document.createElement('option');
      const valStr = String(i).padStart(2, '0');
      opt.value = valStr;
      opt.textContent = `${valStr}분`;
      if (i === defaultMinute) opt.selected = true;
      minuteEl.appendChild(opt);
    }
  }
}

function createLocalTask(dateString, slotNumber, content, alarm = null) {
  return {
    id: `local_${dateString}_${slotNumber}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: dateString,
    slot_number: slotNumber,
    content,
    is_done: false,
    completed_at: null,
    updated_at: new Date().toISOString(),
    alarm: alarm || {
      enabled: false,
      meridiem: 'AM',
      hour: 8,
      minute: 30,
      time_24h: '08:30'
    }
  };
}

function saveCurrentRoutinesLocally() {
  const taskMap = readTaskMap();
  taskMap[currentDateStr] = currentRoutines.map((task, index) => ({
    ...task,
    date: currentDateStr,
    slot_number: index + 1,
    updated_at: task.updated_at || new Date().toISOString()
  }));
  writeTaskMap(taskMap);
}

async function rewardTaskOnce(taskId, amount = 1) {
  const rewards = JSON.parse(localStorage.getItem(scopedStorageKey(REWARDS_STORAGE_KEY)) || '{}');
  if (rewards[taskId]) return false;
  rewards[taskId] = { awarded_at: new Date().toISOString(), amount };
  localStorage.setItem(scopedStorageKey(REWARDS_STORAGE_KEY), JSON.stringify(rewards));
  await window.godsaengStore.addCoins(amount);
  return true;
}

function revokeLocalTaskReward(taskId) {
  const rewards = JSON.parse(localStorage.getItem(scopedStorageKey(REWARDS_STORAGE_KEY)) || '{}');
  if (!rewards[taskId]) return false;
  const amount = typeof rewards[taskId] === 'object' ? rewards[taskId].amount || 1 : 1;
  delete rewards[taskId];
  localStorage.setItem(scopedStorageKey(REWARDS_STORAGE_KEY), JSON.stringify(rewards));
  return amount;
}

// Time formatting
function updateTime() {
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  hours = hours < 10 ? '0' + hours : hours;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  const phoneTimeEl = document.getElementById('phoneTime');
  if (phoneTimeEl) {
    phoneTimeEl.textContent = `${hours}:${minutes}`;
  }
}

// Real-time midnight auto refresh (Slide 6 spec)
function checkMidnightUpdate() {
  const offset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + offset);
  const realTodayStr = kstNow.toISOString().split('T')[0];

  // Only jump to the new day when midnight actually passes.
  if (lastKnownTodayStr && lastKnownTodayStr !== realTodayStr) {
    lastKnownTodayStr = realTodayStr;
    const activeTab = document.querySelector('.tab-item.active').getAttribute('data-tab');
    if (activeTab === 'today') {
      console.log("⏰ Midnight detected! Refreshing slot views to today.");
      currentDateStr = realTodayStr;
      document.getElementById('datePicker').value = currentDateStr;
      loadStateForDate(currentDateStr);
      scheduleAllActiveAlarms();
      alert("⏰ 자정이 지나 새로운 갓생 하루가 시작되었습니다! 오늘의 3대 루틴을 채워보세요.");
    }
  }
}

// Bind navigation and button events
function setupEventListeners() {
  // Date navigator
  document.getElementById('prevDateBtn').addEventListener('click', () => navigateDate(-1));
  document.getElementById('nextDateBtn').addEventListener('click', () => navigateDate(1));
  document.getElementById('datePicker').addEventListener('change', (e) => {
    currentDateStr = e.target.value;
    loadStateForDate(currentDateStr);
  });

  // Main tab bar
  const tabItems = document.querySelectorAll('.tab-item');
  tabItems.forEach(item => {
    item.addEventListener('click', () => {
      tabItems.forEach(t => t.classList.remove('active'));
      item.classList.add('active');
      
      const tabName = item.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(`tab-${tabName}`).classList.add('active');
      
      positionTabIndicator();

      if (tabName === 'history') {
        setTimeout(() => {
          animateHistoryBars();
          renderArchiveList();
        }, 50);
      }
    });
  });

  // Accordion Toggle for Settings
  const toggleBtn = document.getElementById('accordionToggleBtn');
  const accordion = document.getElementById('accordionContent');
  const arrow = document.getElementById('accordionArrow');
  toggleBtn.addEventListener('click', () => {
    const isOpen = accordion.classList.contains('show');
    if (isOpen) {
      accordion.classList.remove('show');
      toggleBtn.classList.remove('open');
    } else {
      accordion.classList.add('show');
      toggleBtn.classList.add('open');
    }
  });

  // API Key operations
  document.getElementById('saveApiKeyBtn').addEventListener('click', () => {
    const keyInput = document.getElementById('apiKeyInput');
    const status = document.getElementById('apiKeyStatus');
    const success = window.visionAI.saveApiKey(keyInput.value);
    if (success) {
      status.textContent = 'API 키가 성공적으로 저장되었습니다! ⚡';
      status.className = 'api-key-status-msg success';
    } else {
      status.textContent = '올바른 키를 입력하세요.';
      status.className = 'api-key-status-msg error';
    }
  });

  document.getElementById('deleteApiKeyBtn').addEventListener('click', () => {
    const keyInput = document.getElementById('apiKeyInput');
    const status = document.getElementById('apiKeyStatus');
    window.visionAI.deleteApiKey();
    keyInput.value = '';
    status.textContent = '저장된 API 키가 삭제되었습니다.';
    status.className = 'api-key-status-msg success';
  });

  // Shop subtabs
  const shopNavItems = document.querySelectorAll('.shop-nav-item');
  shopNavItems.forEach(subtab => {
    subtab.addEventListener('click', () => {
      shopNavItems.forEach(s => s.classList.remove('active'));
      subtab.classList.add('active');

      const targetId = subtab.getAttribute('data-subtab');
      document.querySelectorAll('.shop-subcontent-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`subtab-${targetId}`).classList.add('active');

      if (targetId === 'closet') {
        renderCloset();
      } else {
        renderMarket();
      }
    });
  });

  // Alarm Picker UI Event Handlers
  setupAlarmPickerUI('quickAddAlarmToggleBtn', 'quickAddAlarmPanel', 'quickAddAlarmToggle', 'quickAddAlarmMeridiem', 'quickAddAlarmHour', 'quickAddAlarmMinute');
  setupAlarmPickerUI('customRoutineAlarmBtn', 'customRoutineAlarmPanel', 'customRoutineAlarmToggle', 'customRoutineAlarmMeridiem', 'customRoutineAlarmHour', 'customRoutineAlarmMinute');

  // Quick routine add button
  document.getElementById('quickAddBtn').addEventListener('click', () => addNewRoutine());
  document.getElementById('quickAddInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addNewRoutine();
  });
  document.getElementById('templateToggleBtn').addEventListener('click', () => {
    const panel = document.getElementById('routineTemplatePanel');
    panel.hidden = !panel.hidden;
  });
  document.querySelectorAll('[data-routine-template]').forEach(button => {
    button.addEventListener('click', () => addNewRoutine(button.dataset.routineTemplate));
  });
  document.getElementById('saveCustomRoutineBtn').addEventListener('click', saveCustomRoutine);
  document.getElementById('customRoutineInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') saveCustomRoutine();
  });
  document.getElementById('customRoutineRepeat').addEventListener('change', event => {
    document.getElementById('customWeekdayPicker').hidden = event.target.value !== 'custom';
  });
  document.getElementById('syncStatus').addEventListener('click', openAuthModal);
  document.getElementById('authCloseBtn').addEventListener('click', closeAuthModal);
  document.getElementById('authModal').addEventListener('click', event => {
    if (event.target.id === 'authModal') closeAuthModal();
  });
  document.getElementById('localLoginBtn').addEventListener('click', loginLocalAccount);
  document.getElementById('localSignupBtn').addEventListener('click', createLocalAccount);
  document.getElementById('authPasswordInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') loginLocalAccount();
  });
  document.getElementById('guestLoginBtn').addEventListener('click', continueAsGuest);
  document.getElementById('importGuestDataBtn').addEventListener('click', importGuestDataToSupabase);
  document.getElementById('logoutBtn').addEventListener('click', openLogoutConfirm);
  document.getElementById('accountBtn')?.addEventListener('click', openAuthModal);
  document.getElementById('logoutCancelBtn')?.addEventListener('click', closeLogoutConfirm);
  document.getElementById('logoutConfirmBtn')?.addEventListener('click', performLogout);
  document.getElementById('logoutConfirmModal')?.addEventListener('click', event => {
    if (event.target.id === 'logoutConfirmModal') closeLogoutConfirm();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const modal = document.getElementById('logoutConfirmModal');
    if (modal?.classList.contains('show')) closeLogoutConfirm();
  });
  renderCustomRoutineLibrary();

  // Gacha Lucky Box button & Probability Help modal
  document.getElementById('luckyBoxBtn').addEventListener('click', () => triggerLuckyBox());
  document.getElementById('gachaHelpBtn').addEventListener('click', openGachaHelpModal);
  document.getElementById('gachaHelpCloseBtn').addEventListener('click', closeGachaHelpModal);
  document.getElementById('gachaHelpModal').addEventListener('click', (event) => {
    if (event.target.id === 'gachaHelpModal') closeGachaHelpModal();
  });
  initCategoryTabs();
  initGachaModalEvents();

  // Camera closing and webcam switches
  document.getElementById('closeCamBtn').addEventListener('click', closeCamera);
  document.getElementById('switchCamBtn').addEventListener('click', toggleCameraFacing);
  document.getElementById('shutterBtn').addEventListener('click', startCapture);
  
  // Month Record Video Reel modal listeners
  document.getElementById('monthRecordBtn').addEventListener('click', openMonthRecordModal);
  document.getElementById('monthRecordCloseBtn').addEventListener('click', closeMonthRecordModal);
  document.getElementById('monthRecordModal').addEventListener('click', (event) => {
    if (event.target.id === 'monthRecordModal') closeMonthRecordModal();
  });
  document.getElementById('videoPlayPauseBtn').addEventListener('click', toggleVideoPlayPause);
  document.getElementById('videoReplayBtn').addEventListener('click', replayMonthRecord);

  // Camera result handlers
  document.getElementById('confirmSuccessBtn').addEventListener('click', confirmSuccess);
  document.getElementById('retakePhotoBtn').addEventListener('click', retakePhoto);
  document.getElementById('confirmFailureBtn').addEventListener('click', confirmFailure);
}

function setupAlarmPickerUI(btnId, panelId, toggleId, meridiemId, hourId, minuteId) {
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  const toggle = document.getElementById(toggleId);
  const meridiemContainer = document.getElementById(meridiemId);
  const hourSelect = document.getElementById(hourId);
  const minuteSelect = document.getElementById(minuteId);

  if (!panel || !hourSelect || !minuteSelect) return;

  populateTimeSelectOptions(hourSelect, minuteSelect, 8, 30);

  if (btn) {
    btn.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      btn.classList.toggle('active', !panel.hidden);
    });
  }

  if (toggle) {
    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          toggle.checked = false;
        }
      }
      const body = panel.querySelector('.alarm-picker-body');
      if (body) body.classList.toggle('disabled', !toggle.checked);
    });
  }

  if (meridiemContainer) {
    meridiemContainer.querySelectorAll('.meridiem-btn').forEach(mBtn => {
      mBtn.addEventListener('click', () => {
        meridiemContainer.querySelectorAll('.meridiem-btn').forEach(b => b.classList.remove('active'));
        mBtn.classList.add('active');
      });
    });
  }

  panel.querySelectorAll('.quick-min-btn').forEach(qBtn => {
    qBtn.addEventListener('click', () => {
      const addMin = qBtn.dataset.quickMin;
      const presetTime = qBtn.dataset.presetTime;

      if (presetTime) {
        const { meridiem, hour, minute } = convert24To12(presetTime);
        if (meridiemContainer) {
          meridiemContainer.querySelectorAll('.meridiem-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.meridiem === meridiem);
          });
        }
        hourSelect.value = String(hour).padStart(2, '0');
        minuteSelect.value = String(minute).padStart(2, '0');
      } else if (addMin) {
        let currentM = parseInt(minuteSelect.value, 10) || 0;
        currentM += parseInt(addMin, 10);
        if (currentM >= 60) {
          currentM %= 60;
          let currentH = parseInt(hourSelect.value, 10) || 1;
          currentH = (currentH % 12) + 1;
          hourSelect.value = String(currentH).padStart(2, '0');
        }
        const roundedM = Math.floor(currentM / 5) * 5;
        minuteSelect.value = String(roundedM).padStart(2, '0');
      }
    });
  });
}

// Date Navigation
function navigateDate(days) {
  const current = new Date(currentDateStr);
  current.setDate(current.getDate() + days);
  currentDateStr = current.toISOString().split('T')[0];
  document.getElementById('datePicker').value = currentDateStr;
  loadStateForDate(currentDateStr);
}

// Tab Indicator positioning
function positionTabIndicator() {
  const activeTab = document.querySelector('.tab-item.active');
  const indicator = document.getElementById('tabIndicator');
  if (activeTab && indicator) {
    const tabItems = Array.from(document.querySelectorAll('.tab-item'));
    const index = tabItems.indexOf(activeTab);
    indicator.style.transform = `translateX(${index * 100}%)`;
  }
}

// Load tasks and sync rendering for selected date
async function loadStateForDate(dateString) {
  currentRoutines = [];

  // Render local data first so the app remains instant and fully usable offline.
  const allLocalTasks = readTaskMap();
  if (Array.isArray(allLocalTasks[dateString])) {
    currentRoutines = allLocalTasks[dateString].slice(0, 3);
  }

  // Supabase is an optional recovery source, never a prerequisite.
  if (currentRoutines.length === 0 && window.godsaengStore.isSupabaseActive) {
    try {
      updateSyncStatus('syncing');
      const { data: tasks, error } = await dbSupabase
        .from('tasks')
        .select('*')
        .eq('user_id', window.godsaengStore.currentUserId)
        .eq('date', dateString)
        .order('slot_number', { ascending: true });

      if (!error && tasks?.length) {
        currentRoutines = tasks.slice(0, 3);
        allLocalTasks[dateString] = currentRoutines;
        writeTaskMap(allLocalTasks);
      }
      updateSyncStatus(error ? 'offline' : 'synced');
    } catch (e) {
      updateSyncStatus('offline');
      console.info("동기화 데이터를 불러오지 못해 로컬 기록을 사용합니다.");
    }
  }

  // Sync Coin Count Indicator
  const coins = await window.godsaengStore.getCoins();
  document.getElementById('coinCount').textContent = coins;

  // Render Page Components
  renderRoutines();
  await updateAvatarDisplay();
  await renderWeeklyStats();
  await renderGrassMap();
  renderMarket();
  scheduleAllActiveAlarms();
}

function getKstTodayString() {
  const offset = 9 * 60 * 60 * 1000;
  return new Date(Date.now() + offset).toISOString().split('T')[0];
}

function getDateMode(dateString = currentDateStr) {
  const today = getKstTodayString();
  if (dateString < today) return 'past';
  if (dateString > today) return 'future';
  return 'today';
}

function updateDateModeUI() {
  const mode = getDateMode();
  const banner = document.getElementById('dateModeBanner');
  banner.className = `date-mode-banner ${mode === 'today' ? '' : `show ${mode}`}`.trim();
  if (mode === 'past') {
    banner.textContent = '지난 기록은 읽기 전용입니다. 완료 결과만 확인할 수 있어요.';
  } else if (mode === 'future') {
    banner.textContent = '미리 계획하는 루틴입니다. 완료와 인증은 해당 날짜가 되면 활성화돼요.';
  } else {
    banner.textContent = '';
  }
}

function updateSyncStatus(state) {
  const status = document.getElementById('syncStatus');
  const text = document.getElementById('syncStatusText');
  if (!status || !text) return;
  const resolvedState = navigator.onLine ? state : 'offline';
  status.className = `sync-status ${resolvedState}`;
  const labels = {
    local: currentAuthUser
      ? `로컬 계정 · ${currentAuthUser.email}`
      : localStorage.getItem(AUTH_CHOICE_STORAGE_KEY) === 'guest'
        ? '게스트 모드 · 이 기기에 저장됨'
        : '이 기기에 저장됨 · 로그인 가능',
    cloud: '클라우드 연결됨',
    syncing: '클라우드에 저장 중…',
    synced: '클라우드 백업 완료',
    offline: '오프라인 · 이 기기에 안전하게 저장됨'
  };
  text.textContent = labels[resolvedState] || labels.local;
  updateAccountButtonLabel();
}

function openAuthModal() {
  renderAuthView();
  const modal = document.getElementById('authModal');
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => {
    const target = currentAuthUser
      ? document.getElementById('logoutBtn')
      : document.getElementById('authEmailInput');
    target?.focus();
  }, 50);
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  setAuthMessage('');
}

function renderAuthView() {
  const signedOut = document.getElementById('authSignedOutView');
  const signedIn = document.getElementById('authSignedInView');
  if (!signedOut || !signedIn) return;
  signedOut.hidden = !!currentAuthUser;
  signedIn.hidden = !currentAuthUser;
  document.getElementById('authAccountEmail').textContent = currentAuthUser?.email || '';
  const importButton = document.getElementById('importGuestDataBtn');
  if (importButton) {
    importButton.hidden = !currentAuthUser || !hasGuestData()
      || localStorage.getItem(`complete_guest_imported::${currentAuthUser?.id}`) === 'true';
  }
  updateAccountButtonLabel();
}

function setAuthMessage(message, isError = false) {
  const element = document.getElementById('authStatusMessage');
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? '#b13c3c' : '';
}

function getLocalCredentials() {
  const emailInput = document.getElementById('authEmailInput');
  const passwordInput = document.getElementById('authPasswordInput');
  const email = emailInput.value.trim().toLocaleLowerCase();
  const password = passwordInput.value;
  if (!email || !emailInput.checkValidity()) {
    setAuthMessage('형식에 맞는 이메일 주소를 입력해주세요.', true);
    emailInput.focus();
    return null;
  }
  if (password.length < 6) {
    setAuthMessage('비밀번호는 6자 이상 입력해주세요.', true);
    passwordInput.focus();
    return null;
  }
  return { email, password };
}

async function createLocalAccount() {
  const credentials = getLocalCredentials();
  if (!credentials) return;
  if (!dbSupabase) {
    setAuthMessage('클라우드 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.', true);
    return;
  }
  setAuthMessage('계정을 만드는 중이에요…');
  const { data, error } = await dbSupabase.auth.signUp(credentials);
  if (error) {
    setAuthMessage(error.message || '계정을 만들지 못했습니다.', true);
    return;
  }
  if (!data.session) {
    setAuthMessage('계정은 생성됐지만 이메일 확인 설정이 켜져 있습니다. Supabase에서 이메일 확인을 꺼주세요.', true);
    return;
  }
  await applySupabaseSession(data.user);
  finishAuthSuccess('계정이 생성되고 클라우드 동기화가 시작됐어요.');
}

async function loginLocalAccount() {
  const credentials = getLocalCredentials();
  if (!credentials) return;
  if (!dbSupabase) {
    setAuthMessage('클라우드 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.', true);
    return;
  }
  setAuthMessage('로그인하는 중이에요…');
  const { data, error } = await dbSupabase.auth.signInWithPassword(credentials);
  if (error) {
    setAuthMessage('이메일 또는 비밀번호를 확인해주세요.', true);
    return;
  }
  await applySupabaseSession(data.user);
  finishAuthSuccess('로그인되었습니다. 기록을 클라우드와 동기화했어요.');
}

async function applySupabaseSession(user) {
  if (user?.id === currentAuthUser?.id && window.godsaengStore.isSupabaseActive) return;
  currentAuthUser = user || null;
  if (!currentAuthUser) {
    window.dispatchEvent(new CustomEvent('lockin-auth-changed', { detail: { session: null } }));
    return;
  }
  localStorage.setItem(AUTH_CHOICE_STORAGE_KEY, 'account');
  window.godsaengStore.setupSupabase(dbSupabase, currentAuthUser.id);
  window.godsaengStore.setLocalScope(getActiveStorageScope());
  await window.godsaengStore.init();
  await loadCustomRoutinesFromCloud();
  renderAuthView();
  updateSyncStatus('synced');
  await loadStateForDate(currentDateStr);
  const { data } = await dbSupabase.auth.getSession();
  window.dispatchEvent(new CustomEvent('lockin-auth-changed', { detail: { session: data.session || null } }));
}

function finishAuthSuccess(message) {
  setAuthMessage(message);
  document.getElementById('authPasswordInput').value = '';
  renderAuthView();
  if (document.getElementById('importGuestDataBtn').hidden) {
    window.setTimeout(closeAuthModal, 650);
  }
}

async function continueAsGuest() {
  localStorage.setItem(AUTH_CHOICE_STORAGE_KEY, 'guest');
  if (dbSupabase) await dbSupabase.auth.signOut({ scope: 'local' });
  currentAuthUser = null;
  window.godsaengStore.setupSupabase(null, null);
  window.godsaengStore.setLocalScope('guest');
  await window.godsaengStore.init();
  updateSyncStatus('local');
  await loadStateForDate(currentDateStr);
  closeAuthModal();
}

function isClassroomConnected() {
  const container = document.getElementById('appContainer');
  return Boolean(container) && !container.classList.contains('hidden');
}

function openLogoutConfirm() {
  const modal = document.getElementById('logoutConfirmModal');
  if (!modal) return;

  const description = document.getElementById('logoutConfirmDesc');
  const notes = document.getElementById('logoutConfirmNotes');

  if (description) {
    description.textContent = currentAuthUser?.email
      ? `${currentAuthUser.email} 계정에서 로그아웃합니다.`
      : '현재 계정에서 로그아웃합니다.';
  }

  if (notes) {
    const items = [
      '이 기기는 게스트 모드로 전환됩니다.',
      '클라우드에 저장된 기록은 지워지지 않고, 다시 로그인하면 그대로 이어집니다.'
    ];
    if (isClassroomConnected()) {
      items.unshift('접속 중인 학급 서버 연결도 함께 끊깁니다.');
    }
    notes.innerHTML = '';
    items.forEach(text => {
      const item = document.createElement('li');
      item.textContent = text;
      notes.appendChild(item);
    });
  }

  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('logoutCancelBtn')?.focus();
}

function closeLogoutConfirm() {
  const modal = document.getElementById('logoutConfirmModal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
}

async function performLogout() {
  const confirmButton = document.getElementById('logoutConfirmBtn');
  const cancelButton = document.getElementById('logoutCancelBtn');
  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.textContent = '로그아웃 중…';
  }
  if (cancelButton) cancelButton.disabled = true;

  try {
    if (dbSupabase) {
      const { error } = await dbSupabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    }
    localStorage.setItem(AUTH_CHOICE_STORAGE_KEY, 'guest');
    currentAuthUser = null;
    // online.js가 이 이벤트를 받아 학급 소켓·WebRTC·픽셀 교실을 정리한다.
    window.dispatchEvent(new CustomEvent('lockin-auth-changed', { detail: { session: null } }));
    window.godsaengStore.setupSupabase(null, null);
    window.godsaengStore.setLocalScope('guest');
    await window.godsaengStore.init();
    updateSyncStatus('local');
    await loadStateForDate(currentDateStr);
    renderAuthView();
    closeLogoutConfirm();
    setAuthMessage('로그아웃되었습니다. 게스트 모드로 계속 이용할 수 있어요.');
  } catch (error) {
    closeLogoutConfirm();
    setAuthMessage(error?.message || '로그아웃하지 못했습니다.', true);
    openAuthModal();
  } finally {
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = '로그아웃';
    }
    if (cancelButton) cancelButton.disabled = false;
  }
}

// 헤더 계정 버튼 라벨을 현재 상태에 맞춘다.
function updateAccountButtonLabel() {
  const label = document.getElementById('accountBtnLabel');
  const button = document.getElementById('accountBtn');
  if (!label || !button) return;

  if (currentAuthUser?.email) {
    const shortName = currentAuthUser.email.split('@')[0];
    label.textContent = shortName.length > 10 ? `${shortName.slice(0, 10)}…` : shortName;
    button.classList.add('signed-in');
    button.setAttribute('aria-label', `${currentAuthUser.email} 계정 설정 열기`);
  } else {
    label.textContent = '게스트';
    button.classList.remove('signed-in');
    button.setAttribute('aria-label', '로그인하기');
  }
}

function readCustomRoutines() {
  try {
    const routines = JSON.parse(localStorage.getItem(scopedStorageKey(CUSTOM_ROUTINES_STORAGE_KEY)) || '[]');
    if (!Array.isArray(routines)) return [];
    return routines.map(item => typeof item === 'string'
      ? { name: item, repeat: 'none', weekdays: [] }
      : item
    ).filter(item => item && typeof item.name === 'string');
  } catch {
    return [];
  }
}

function renderCustomRoutineLibrary() {
  const container = document.getElementById('customRoutineList');
  const routines = readCustomRoutines();
  container.innerHTML = '';
  renderScheduledRoutineSuggestions(routines);

  if (!routines.length) {
    container.innerHTML = '<span class="custom-routine-empty">저장한 루틴이 아직 없어요.</span>';
    return;
  }

  routines.forEach((routine, index) => {
    const row = document.createElement('div');
    row.className = 'custom-routine-item';
    row.innerHTML = `
      <button type="button" class="custom-routine-use" title="이 날짜에 추가">
        <span class="custom-routine-label">${escapeHtml(routine.name)}<small>${getRepeatLabel(routine)}</small></span>
      </button>
      <button type="button" class="custom-routine-delete" title="저장 목록에서 삭제" aria-label="${escapeHtml(routine.name)} 삭제">×</button>
    `;
    row.querySelector('.custom-routine-use').addEventListener('click', () => addNewRoutine(routine.name));
    row.querySelector('.custom-routine-delete').addEventListener('click', () => deleteCustomRoutine(index));
    container.appendChild(row);
  });
}

function getRepeatLabel(routine) {
  const labels = { none: '필요할 때 선택', daily: '매일', weekdays: '평일', weekends: '주말' };
  if (routine.repeat !== 'custom') return labels[routine.repeat] || labels.none;
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  return (routine.weekdays || []).map(day => dayLabels[day]).join('·') || '요일 미지정';
}

function matchesRoutineDate(routine, dateString) {
  const day = new Date(`${dateString}T12:00:00`).getDay();
  if (routine.repeat === 'daily') return true;
  if (routine.repeat === 'weekdays') return day >= 1 && day <= 5;
  if (routine.repeat === 'weekends') return day === 0 || day === 6;
  if (routine.repeat === 'custom') return (routine.weekdays || []).includes(day);
  return false;
}

function renderScheduledRoutineSuggestions(routines = readCustomRoutines()) {
  const container = document.getElementById('scheduledRoutineSuggestions');
  if (!container) return;
  const existingNames = new Set(currentRoutines.map(routine => routine.content));
  const matches = routines.filter(routine =>
    matchesRoutineDate(routine, currentDateStr) && !existingNames.has(routine.name)
  );
  container.innerHTML = '';
  if (!matches.length || getDateMode() === 'past' || currentRoutines.length >= 3) return;
  container.innerHTML = '<span class="scheduled-routine-heading">이 날짜의 반복 루틴 추천</span>';
  matches.forEach(routine => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scheduled-routine-btn';
    button.textContent = `＋ ${routine.name}`;
    button.addEventListener('click', () => addNewRoutine(routine.name));
    container.appendChild(button);
  });
}

async function saveCustomRoutine() {
  const input = document.getElementById('customRoutineInput');
  const value = input.value.trim();
  if (!value) return;

  const routines = readCustomRoutines();
  if (routines.some(routine => routine.name.toLocaleLowerCase() === value.toLocaleLowerCase())) {
    alert('이미 저장한 장기 루틴이에요.');
    return;
  }

  const repeat = document.getElementById('customRoutineRepeat').value;
  const weekdays = repeat === 'custom'
    ? Array.from(document.querySelectorAll('#customWeekdayPicker input:checked')).map(input => Number(input.value))
    : [];
  if (repeat === 'custom' && weekdays.length === 0) {
    alert('반복할 요일을 하나 이상 선택해주세요.');
    return;
  }

  let alarmObj = null;
  const customAlarmToggle = document.getElementById('customRoutineAlarmToggle');
  if (customAlarmToggle && customAlarmToggle.checked) {
    const meridiemBtn = document.querySelector('#customRoutineAlarmMeridiem .meridiem-btn.active');
    const meridiem = meridiemBtn ? meridiemBtn.dataset.meridiem : 'AM';
    const hour = parseInt(document.getElementById('customRoutineAlarmHour').value, 10) || 8;
    const minute = parseInt(document.getElementById('customRoutineAlarmMinute').value, 10) || 0;
    alarmObj = {
      enabled: true,
      meridiem,
      hour,
      minute,
      time_24h: convert12To24(meridiem, hour, minute)
    };
  }

  const routine = { name: value, repeat, weekdays, alarm: alarmObj };
  routines.push(routine);
  localStorage.setItem(scopedStorageKey(CUSTOM_ROUTINES_STORAGE_KEY), JSON.stringify(routines));
  if (window.godsaengStore.isSupabaseActive) {
    const { data, error } = await dbSupabase
      .from('routine_templates')
      .upsert({
        user_id: currentAuthUser.id,
        name: value,
        repeat,
        weekdays,
        alarm: alarmObj,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,name' })
      .select()
      .single();
    if (!error && data) {
      routine.id = data.id;
      localStorage.setItem(scopedStorageKey(CUSTOM_ROUTINES_STORAGE_KEY), JSON.stringify(routines));
      updateSyncStatus('synced');
    } else if (error) {
      updateSyncStatus('offline');
    }
  }
  input.value = '';
  document.getElementById('customRoutineRepeat').value = 'none';
  document.getElementById('customWeekdayPicker').hidden = true;
  document.querySelectorAll('#customWeekdayPicker input').forEach(checkbox => { checkbox.checked = false; });
  const cAlarmPanel = document.getElementById('customRoutineAlarmPanel');
  if (cAlarmPanel) cAlarmPanel.hidden = true;
  if (customAlarmToggle) customAlarmToggle.checked = false;
  renderCustomRoutineLibrary();
}

async function deleteCustomRoutine(index) {
  const routines = readCustomRoutines();
  const [removed] = routines.splice(index, 1);
  localStorage.setItem(scopedStorageKey(CUSTOM_ROUTINES_STORAGE_KEY), JSON.stringify(routines));
  if (removed?.id && window.godsaengStore.isSupabaseActive) {
    const { error } = await dbSupabase
      .from('routine_templates')
      .delete()
      .eq('id', removed.id)
      .eq('user_id', currentAuthUser.id);
    updateSyncStatus(error ? 'offline' : 'synced');
  }
  renderCustomRoutineLibrary();
}

async function loadCustomRoutinesFromCloud() {
  if (!window.godsaengStore.isSupabaseActive) return;
  const { data, error } = await dbSupabase
    .from('routine_templates')
    .select('id,name,repeat,weekdays')
    .eq('user_id', currentAuthUser.id)
    .order('created_at', { ascending: true });
  if (!error && data) {
    localStorage.setItem(scopedStorageKey(CUSTOM_ROUTINES_STORAGE_KEY), JSON.stringify(data));
    renderCustomRoutineLibrary();
  }
}

function hasGuestData() {
  try {
    const taskMap = JSON.parse(localStorage.getItem(storageKeyForScope(TASKS_STORAGE_KEY, 'guest')) || '{}');
    const routines = JSON.parse(localStorage.getItem(storageKeyForScope(CUSTOM_ROUTINES_STORAGE_KEY, 'guest')) || '[]');
    return Object.values(taskMap).some(tasks => Array.isArray(tasks) && tasks.length > 0)
      || (Array.isArray(routines) && routines.length > 0);
  } catch {
    return false;
  }
}

async function importGuestDataToSupabase() {
  if (!currentAuthUser || !dbSupabase) return;
  const button = document.getElementById('importGuestDataBtn');
  button.disabled = true;
  setAuthMessage('게스트 기록을 안전하게 가져오는 중이에요…');
  try {
    const taskMap = JSON.parse(localStorage.getItem(storageKeyForScope(TASKS_STORAGE_KEY, 'guest')) || '{}');
    const guestTasks = Object.entries(taskMap).flatMap(([date, tasks]) =>
      (Array.isArray(tasks) ? tasks : []).slice(0, 3).map((task, index) => ({
        user_id: currentAuthUser.id,
        date,
        slot_number: task.slot_number || index + 1,
        content: task.content,
        is_done: !!task.is_done,
        image_url: task.image_url || null,
        ai_feedback: task.ai_feedback || null,
        completed_at: task.completed_at || null
      }))
    ).filter(task => task.content);

    if (guestTasks.length) {
      const { data: existing, error: readError } = await dbSupabase
        .from('tasks')
        .select('date,slot_number,content')
        .eq('user_id', currentAuthUser.id);
      if (readError) throw readError;
      const existingKeys = new Set((existing || []).map(task => `${task.date}|${task.slot_number}|${task.content}`));
      const missing = guestTasks.filter(task => !existingKeys.has(`${task.date}|${task.slot_number}|${task.content}`));
      if (missing.length) {
        const { error } = await dbSupabase.from('tasks').insert(missing);
        if (error) throw error;
      }
    }

    const guestRoutines = JSON.parse(localStorage.getItem(storageKeyForScope(CUSTOM_ROUTINES_STORAGE_KEY, 'guest')) || '[]');
    if (Array.isArray(guestRoutines) && guestRoutines.length) {
      const payload = guestRoutines.map(routine => ({
        user_id: currentAuthUser.id,
        name: typeof routine === 'string' ? routine : routine.name,
        repeat: typeof routine === 'string' ? 'none' : routine.repeat || 'none',
        weekdays: typeof routine === 'string' ? [] : routine.weekdays || [],
        updated_at: new Date().toISOString()
      })).filter(routine => routine.name);
      const { error } = await dbSupabase
        .from('routine_templates')
        .upsert(payload, { onConflict: 'user_id,name' });
      if (error) throw error;
    }

    localStorage.setItem(`complete_guest_imported::${currentAuthUser.id}`, 'true');
    await loadCustomRoutinesFromCloud();
    await loadStateForDate(currentDateStr);
    updateSyncStatus('synced');
    setAuthMessage('게스트 루틴과 기록을 계정으로 가져왔어요. 기존 게스트 기록은 그대로 보관됩니다.');
    renderAuthView();
  } catch (error) {
    setAuthMessage(error?.message || '게스트 기록을 가져오지 못했습니다.', true);
  } finally {
    button.disabled = false;
  }
}

// Lazy mode only activates after two consecutive failed days.
async function checkYesterdayLazyStatus() {
  const taskMap = readTaskMap();
  const failedDays = [];

  for (let daysAgo = 1; daysAgo <= 2; daysAgo++) {
    const date = new Date(`${currentDateStr}T00:00:00`);
    date.setDate(date.getDate() - daysAgo);
    const dateString = date.toISOString().split('T')[0];
    const tasks = taskMap[dateString] || [];
    failedDays.push(tasks.length > 0 && tasks.every(task => !task.is_done));
  }

  return failedDays.every(Boolean);
}

function toggleCardAlarmPicker(taskId, event) {
  if (event) event.stopPropagation();
  const panel = document.getElementById(`cardAlarmPanel_${taskId}`);
  if (panel) {
    panel.hidden = !panel.hidden;
  }
}

function initCardAlarmPickerEvents(taskId) {
  const task = currentRoutines.find(r => r.id === taskId);
  if (!task) return;

  const toggle = document.getElementById(`cardAlarmToggle_${taskId}`);
  const meridiemContainer = document.getElementById(`cardAlarmMeridiem_${taskId}`);
  const hourSelect = document.getElementById(`cardAlarmHour_${taskId}`);
  const minuteSelect = document.getElementById(`cardAlarmMinute_${taskId}`);
  const body = document.getElementById(`cardAlarmBody_${taskId}`);
  const panel = document.getElementById(`cardAlarmPanel_${taskId}`);

  const alarmData = task.alarm || { enabled: false, meridiem: 'AM', hour: 8, minute: 30, time_24h: '08:30' };

  populateTimeSelectOptions(hourSelect, minuteSelect, alarmData.hour || 8, alarmData.minute || 30);

  const saveTaskAlarm = async () => {
    const isEnabled = toggle ? toggle.checked : false;
    const activeMeridiemBtn = meridiemContainer ? meridiemContainer.querySelector('.meridiem-btn.active') : null;
    const meridiem = activeMeridiemBtn ? activeMeridiemBtn.dataset.meridiem : 'AM';
    const hour = parseInt(hourSelect ? hourSelect.value : '8', 10);
    const minute = parseInt(minuteSelect ? minuteSelect.value : '30', 10);

    task.alarm = {
      enabled: isEnabled,
      meridiem,
      hour,
      minute,
      time_24h: convert12To24(meridiem, hour, minute)
    };

    task.updated_at = new Date().toISOString();
    saveCurrentRoutinesLocally();

    if (isEnabled && !task.is_done) {
      scheduleRoutineAlarm(task);
    } else {
      clearRoutineAlarm(task.id);
    }

    if (window.godsaengStore.isSupabaseActive && !String(task.id).startsWith('local_')) {
      try {
        await dbSupabase.from('tasks').update({ alarm: task.alarm, updated_at: task.updated_at }).eq('id', task.id);
      } catch (e) {}
    }

    renderRoutines();
  };

  if (toggle) {
    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          toggle.checked = false;
          return;
        }
      }
      if (body) body.classList.toggle('disabled', !toggle.checked);
      await saveTaskAlarm();
    });
  }

  if (meridiemContainer) {
    meridiemContainer.querySelectorAll('.meridiem-btn').forEach(mBtn => {
      mBtn.addEventListener('click', async () => {
        meridiemContainer.querySelectorAll('.meridiem-btn').forEach(b => b.classList.remove('active'));
        mBtn.classList.add('active');
        await saveTaskAlarm();
      });
    });
  }

  if (hourSelect) hourSelect.addEventListener('change', saveTaskAlarm);
  if (minuteSelect) minuteSelect.addEventListener('change', saveTaskAlarm);

  if (panel) {
    panel.querySelectorAll('.quick-min-btn').forEach(qBtn => {
      qBtn.addEventListener('click', async () => {
        const addMin = qBtn.dataset.quickMin;
        const presetTime = qBtn.dataset.presetTime;

        if (presetTime) {
          const { meridiem, hour, minute } = convert24To12(presetTime);
          if (meridiemContainer) {
            meridiemContainer.querySelectorAll('.meridiem-btn').forEach(b => {
              b.classList.toggle('active', b.dataset.meridiem === meridiem);
            });
          }
          if (hourSelect) hourSelect.value = String(hour).padStart(2, '0');
          if (minuteSelect) minuteSelect.value = String(minute).padStart(2, '0');
        } else if (addMin) {
          let currentM = parseInt(minuteSelect.value, 10) || 0;
          currentM += parseInt(addMin, 10);
          if (currentM >= 60) {
            currentM %= 60;
            let currentH = parseInt(hourSelect.value, 10) || 1;
            currentH = (currentH % 12) + 1;
            if (hourSelect) hourSelect.value = String(currentH).padStart(2, '0');
          }
          const roundedM = Math.floor(currentM / 5) * 5;
          if (minuteSelect) minuteSelect.value = String(roundedM).padStart(2, '0');
        }
        await saveTaskAlarm();
      });
    });
  }
}

// Render routines list (Max 3 items)
function renderRoutines() {
  const container = document.getElementById('routineList');
  container.innerHTML = '';
  const dateMode = getDateMode();
  updateDateModeUI();

  let completedCount = 0;

  currentRoutines.forEach(r => {
    if (r.is_done) completedCount++;
    const canEdit = dateMode !== 'past' && !r.is_done;
    const canVerify = dateMode === 'today' && !r.is_done;
    const canToss = dateMode === 'today' && !r.is_done;
    const canDelete = dateMode !== 'past' && !r.is_done;

    const alarmEnabled = r.alarm && r.alarm.enabled;
    const alarmTimeDisplay = alarmEnabled
      ? `${r.alarm.meridiem || 'AM'} ${String(r.alarm.hour || 8).padStart(2, '0')}:${String(r.alarm.minute || 0).padStart(2, '0')}`
      : '';

    const cardWrap = document.createElement('div');
    cardWrap.className = 'routine-card-wrapper';
    cardWrap.style.width = '100%';

    const card = document.createElement('div');
    card.className = `routine-card ${r.is_done ? 'completed' : ''}`;
    card.innerHTML = `
      <div class="routine-left">
        <span class="routine-tag">SLOT ${r.slot_number}</span>
        <input type="text" class="routine-title-input" aria-label="${r.slot_number}번 루틴" value="${escapeHtml(r.content)}" onchange="updateRoutineText('${r.id}', this.value)" ${canEdit ? '' : 'disabled'}>
        ${alarmEnabled ? `<div class="routine-alarm-badge" onclick="toggleCardAlarmPicker('${r.id}', event)">🔔 ${alarmTimeDisplay}</div>` : ''}
      </div>
      <div class="routine-actions">
        <button class="clock-icon-btn ${alarmEnabled ? 'active' : ''}" onclick="toggleCardAlarmPicker('${r.id}', event)" title="알람 설정" aria-label="${r.slot_number}번 루틴 알람 설정" ${canEdit ? '' : 'disabled'}>
          <i data-lucide="clock"></i>
        </button>
        <button class="toss-btn" onclick="tossToTomorrow('${r.id}', event)" title="내일로 루틴 토스" aria-label="${r.slot_number}번 루틴 내일로 토스" ${canToss ? '' : 'disabled'}>
          <i data-lucide="corner-down-right"></i>
        </button>
        <button class="delete-routine-btn" onclick="deleteRoutine('${r.id}', event)" title="루틴 삭제" aria-label="${r.slot_number}번 루틴 삭제" ${canDelete ? '' : 'disabled'}>
          <i data-lucide="trash-2"></i>
        </button>
        <button class="checkbox-custom" onclick="requestRoutineVerification('${r.id}', event)" title="${r.is_done ? '인증 완료' : dateMode === 'future' ? '당일에 완료할 수 있어요' : '인증 후 완료'}" aria-label="${r.slot_number}번 루틴 ${r.is_done ? '인증 완료됨' : '인증 시작'}" aria-pressed="${r.is_done}" ${canVerify ? '' : 'disabled'}>
          <svg viewBox="0 0 24 24">
            <path d="M20 6L9 17l-5-5"></path>
          </svg>
        </button>
      </div>
    `;

    const alarmPanel = document.createElement('div');
    alarmPanel.className = 'alarm-picker-panel';
    alarmPanel.id = `cardAlarmPanel_${r.id}`;
    alarmPanel.hidden = true;

    const alarmData = r.alarm || { enabled: false, meridiem: 'AM', hour: 8, minute: 30, time_24h: '08:30' };

    alarmPanel.innerHTML = `
      <div class="alarm-picker-header">
        <span class="alarm-picker-title">🔔 루틴 알람 설정</span>
        <label class="alarm-switch">
          <input type="checkbox" id="cardAlarmToggle_${r.id}" ${alarmData.enabled ? 'checked' : ''}>
          <span class="alarm-slider"></span>
        </label>
      </div>
      <div class="alarm-picker-body ${alarmData.enabled ? '' : 'disabled'}" id="cardAlarmBody_${r.id}">
        <div class="alarm-time-inputs">
          <div class="meridiem-selector" id="cardAlarmMeridiem_${r.id}">
            <button type="button" class="meridiem-btn ${alarmData.meridiem === 'AM' ? 'active' : ''}" data-meridiem="AM">AM</button>
            <button type="button" class="meridiem-btn ${alarmData.meridiem === 'PM' ? 'active' : ''}" data-meridiem="PM">PM</button>
          </div>
          <div class="time-select-group">
            <select id="cardAlarmHour_${r.id}" class="time-select" aria-label="시 선택"></select>
            <span class="time-colon">:</span>
            <select id="cardAlarmMinute_${r.id}" class="time-select" aria-label="분 선택"></select>
          </div>
        </div>
        <div class="alarm-quick-mins">
          <button type="button" class="quick-min-btn" data-quick-min="5">+5분</button>
          <button type="button" class="quick-min-btn" data-quick-min="10">+10분</button>
          <button type="button" class="quick-min-btn" data-preset-time="08:30">오전 8:30</button>
          <button type="button" class="quick-min-btn" data-preset-time="14:30">오후 2:30</button>
        </div>
      </div>
    `;

    cardWrap.appendChild(card);
    cardWrap.appendChild(alarmPanel);
    container.appendChild(cardWrap);

    setTimeout(() => {
      initCardAlarmPickerEvents(r.id);
    }, 0);
  });

  if (currentRoutines.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'routine-empty-state';
    empty.textContent = dateMode === 'past'
      ? '이 날짜에는 저장된 루틴이 없습니다.'
      : dateMode === 'future'
        ? '미리 계획할 루틴을 추가해보세요.'
        : '오늘 집중할 작은 루틴을 추가해보세요.';
    container.appendChild(empty);
  }

  // Progress UI modifiers
  document.getElementById('routineProgressText').textContent = currentRoutines.length
    ? `${completedCount} / ${currentRoutines.length} 완료`
    : '0 / 3 슬롯';

  // Growth rates calculation
  const growthPct = Math.round((completedCount / 3) * 100);
  document.getElementById('growthProgressBar').style.width = `${growthPct}%`;
  document.getElementById('growthPercent').textContent = `성장률: ${growthPct}%`;

  let statusMsg = "오늘 첫 루틴을 실천하고 새싹이를 키워보세요! 🌱";
  if (completedCount === 1) statusMsg = "조금씩 자라기 시작합니다! 파이팅 🌱";
  else if (completedCount === 2) statusMsg = "무럭무럭 크는 중입니다! 한 개만 더요 🌿";
  else if (completedCount === 3) statusMsg = "대성공! 멋지게 꽃을 피웠습니다 🌸";
  document.getElementById('statusMessage').textContent = statusMsg;

  // Toggle routine adding form visibility based on 3-task limit
  const addForm = document.getElementById('routineQuickAddForm');
  const templateSection = document.getElementById('routineTemplateSection');
  if (dateMode !== 'past' && currentRoutines.length < 3) {
    addForm.style.display = 'flex';
    templateSection.style.display = 'block';
  } else {
    addForm.style.display = 'none';
    templateSection.style.display = 'none';
  }
  renderScheduledRoutineSuggestions();

  // Update Grass value for today
  updateTodayGrass(completedCount);
  if (window.lucide) lucide.createIcons();
}

// Edit routine content inline
async function updateRoutineText(id, newText) {
  const task = currentRoutines.find(r => r.id === id);
  const normalizedText = newText.trim();
  if (!task || task.is_done || getDateMode() === 'past' || !normalizedText) {
    renderRoutines();
    return;
  }

  task.content = normalizedText;
  task.updated_at = new Date().toISOString();
  saveCurrentRoutinesLocally();

  if (window.godsaengStore.isSupabaseActive) {
    try {
      updateSyncStatus('syncing');
      const { error } = await dbSupabase
        .from('tasks')
        .update({ content: normalizedText, updated_at: task.updated_at })
        .eq('id', id);
      if (error) throw error;
      updateSyncStatus('synced');
    } catch (e) {
      updateSyncStatus('offline');
      console.info("루틴 수정은 로컬에 저장되었고 동기화는 나중에 다시 시도합니다.");
    }
  }
  renderRoutines();
  await updateAvatarDisplay();
}

async function deleteRoutine(id, event) {
  event?.stopPropagation();
  const task = currentRoutines.find(r => r.id === id);
  if (!task || task.is_done || getDateMode() === 'past') return;

  clearRoutineAlarm(id);
  currentRoutines = currentRoutines.filter(r => r.id !== id);
  currentRoutines.forEach((routine, index) => {
    routine.slot_number = index + 1;
    routine.updated_at = new Date().toISOString();
  });
  saveCurrentRoutinesLocally();

  if (window.godsaengStore.isSupabaseActive && !String(id).startsWith('local_')) {
    try {
      updateSyncStatus('syncing');
      const { error } = await dbSupabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
      updateSyncStatus('synced');
    } catch {
      updateSyncStatus('offline');
      console.info("삭제 내용은 로컬에 반영되었고 동기화는 나중에 다시 시도합니다.");
    }
  }

  renderRoutines();
  await updateAvatarDisplay();
  await renderWeeklyStats();
  await renderGrassMap();
  lucide.createIcons();
}

function requestRoutineVerification(id, event) {
  event?.stopPropagation();
  const task = currentRoutines.find(routine => routine.id === id);
  if (!task || task.is_done || getDateMode() !== 'today') return;
  openCamera(id, event);
}

// Confetti Particle Explosion Generator
function triggerConfetti(element) {
  const rect = element.getBoundingClientRect();
  const card = element.closest('.routine-card');
  const colors = ['#9fe870', '#e2f6d5', '#00BA9D', '#ffd11a', '#ff007f', '#00f2fe'];
  
  for (let i = 0; i < 15; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    // Set random offset targets inside CSS variables
    const tx = (Math.random() - 0.5) * 80;
    const ty = (Math.random() - 0.5) * 80 - 30; // slightly upwards bias
    
    particle.style.setProperty('--tx', `${tx}px`);
    particle.style.setProperty('--ty', `${ty}px`);
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    
    // Positioning near checkbox center
    particle.style.left = `${rect.left + rect.width / 2 - 3}px`;
    particle.style.top = `${rect.top + rect.height / 2 - 3}px`;
    particle.style.position = 'fixed';
    
    document.body.appendChild(particle);
    
    // Cleanup after animation completes
    setTimeout(() => {
      particle.remove();
    }, 600);
  }
}

// Toss routine to tomorrow (Slide 6 spec)
async function tossToTomorrow(id, event) {
  if (event) event.stopPropagation();

  const task = currentRoutines.find(r => r.id === id);
  if (!task || task.is_done || getDateMode() !== 'today') return;

  clearRoutineAlarm(id);
  // 1. Calculate tomorrow date string
  const current = new Date(currentDateStr);
  current.setDate(current.getDate() + 1);
  const tomorrowStr = current.toISOString().split('T')[0];

  // 2. Move in the local source of truth first.
  const allLocalTasks = readTaskMap();
  const tomorrowRoutines = Array.isArray(allLocalTasks[tomorrowStr])
    ? allLocalTasks[tomorrowStr].slice(0, 3)
    : [];

  // 3. Verify tomorrow limits (under 3-Task limit)
  if (tomorrowRoutines.length >= 3) {
    alert("내일의 갓생 루틴 슬롯이 이미 3개 모두 차 있습니다! 내일 루틴을 확인하고 슬롯을 비워주세요.");
    return;
  }

  const nextSlot = tomorrowRoutines.length + 1;

  const tossedTask = createLocalTask(tomorrowStr, nextSlot, task.content);
  tomorrowRoutines.push(tossedTask);
  allLocalTasks[tomorrowStr] = tomorrowRoutines;

  const todayFiltered = currentRoutines.filter(r => r.id !== id);
  todayFiltered.forEach((routine, index) => {
    routine.slot_number = index + 1;
    routine.updated_at = new Date().toISOString();
  });
  allLocalTasks[currentDateStr] = todayFiltered;
  writeTaskMap(allLocalTasks);

  // Best-effort cloud mirror for signed-in users.
  if (window.godsaengStore.isSupabaseActive) {
    try {
      updateSyncStatus('syncing');
      const { data: insertedTask, error: insertError } = await dbSupabase.from('tasks').insert({
        user_id: window.godsaengStore.currentUserId,
        date: tomorrowStr,
        slot_number: nextSlot,
        content: task.content,
        is_done: false
      }).select().single();
      if (insertError) throw insertError;
      if (insertedTask) {
        tomorrowRoutines[tomorrowRoutines.length - 1] = insertedTask;
        allLocalTasks[tomorrowStr] = tomorrowRoutines;
        writeTaskMap(allLocalTasks);
      }
      if (!String(id).startsWith('local_')) {
        const { error: deleteError } = await dbSupabase.from('tasks').delete().eq('id', id);
        if (deleteError) throw deleteError;
      }
      updateSyncStatus('synced');
    } catch {
      updateSyncStatus('offline');
      console.info("내일로 토스는 로컬에 저장되었고 동기화는 나중에 다시 시도합니다.");
    }
  }

  alert(`"${task.content}" 루틴이 내일(${tomorrowStr}) 날짜로 안전하게 토스되었습니다! 내일은 꼭 성공해 봅시다. 🔥`);
  await loadStateForDate(currentDateStr);
}

// Add routine under 3-Task Focus Rule
async function addNewRoutine(templateValue = '') {
  const input = document.getElementById('quickAddInput');
  const val = (templateValue || input.value).trim();

  if (getDateMode() === 'past') return;

  if (!val) {
    alert("루틴 이름을 입력해 주세요!");
    return;
  }

  if (currentRoutines.length >= 3) {
    alert("오늘의 갓생 루틴은 최대 3개로 엄격하게 제한됩니다! 오늘 집중할 3개만 유지해주세요.");
    return;
  }

  // Extract alarm configuration from Quick Add form or matched custom routine
  let alarmObj = null;
  const quickAlarmToggle = document.getElementById('quickAddAlarmToggle');
  if (quickAlarmToggle && quickAlarmToggle.checked) {
    const meridiemBtn = document.querySelector('#quickAddAlarmMeridiem .meridiem-btn.active');
    const meridiem = meridiemBtn ? meridiemBtn.dataset.meridiem : 'AM';
    const hour = parseInt(document.getElementById('quickAddAlarmHour').value, 10) || 8;
    const minute = parseInt(document.getElementById('quickAddAlarmMinute').value, 10) || 0;
    alarmObj = {
      enabled: true,
      meridiem,
      hour,
      minute,
      time_24h: convert12To24(meridiem, hour, minute)
    };
  } else {
    const customRoutines = readCustomRoutines();
    const matched = customRoutines.find(r => r.name.toLocaleLowerCase() === val.toLocaleLowerCase());
    if (matched && matched.alarm) {
      alarmObj = { ...matched.alarm };
    }
  }

  const nextSlot = currentRoutines.length + 1;
  const newRow = createLocalTask(currentDateStr, nextSlot, val, alarmObj);
  currentRoutines.push(newRow);
  saveCurrentRoutinesLocally();

  if (alarmObj && alarmObj.enabled) {
    scheduleRoutineAlarm(newRow);
  }

  if (window.godsaengStore.isSupabaseActive) {
    try {
      updateSyncStatus('syncing');
      const { data: insertedTask, error } = await dbSupabase
        .from('tasks')
        .insert({
          user_id: window.godsaengStore.currentUserId,
          date: currentDateStr,
          slot_number: nextSlot,
          content: val,
          is_done: false,
          alarm: alarmObj
        })
        .select()
        .single();
      if (error) throw error;
      if (insertedTask) {
        Object.assign(newRow, insertedTask);
        saveCurrentRoutinesLocally();
      }
      updateSyncStatus('synced');
    } catch {
      updateSyncStatus('offline');
      console.info("새 루틴은 로컬에 저장되었고 동기화는 나중에 다시 시도합니다.");
    }
  }

  input.value = '';
  const qAlarmPanel = document.getElementById('quickAddAlarmPanel');
  if (qAlarmPanel) qAlarmPanel.hidden = true;
  const qAlarmToggleBtn = document.getElementById('quickAddAlarmToggleBtn');
  if (qAlarmToggleBtn) qAlarmToggleBtn.classList.remove('active');
  if (quickAlarmToggle) quickAlarmToggle.checked = false;
  document.getElementById('routineTemplatePanel').hidden = true;
  renderRoutines();
  await updateAvatarDisplay();
  await renderWeeklyStats();
}

// Draw Avatar SVG representation dynamically
async function updateAvatarDisplay() {
  const box = document.getElementById('avatarBox');
  if (!box) return;

  const completedCount = currentRoutines.filter(r => r.is_done).length;
  const equipped = await window.godsaengStore.getEquippedItems();
  const activeSkin = await window.godsaengStore.getActiveSkin();
  const activeTitle = await window.godsaengStore.getActiveTitle();

  // Set equipped title name
  const titleObj = window.godsaengStore.titlesCatalog[activeTitle];
  document.getElementById('equippedTitleText').textContent =
    activeTitle === 'none' ? '칭호 없음' : (titleObj ? titleObj.name : '초보 갓생러 🌱');

  // Any success today immediately clears lazy mode.
  const isLazy = completedCount === 0 && await checkYesterdayLazyStatus();

  // Level mapping: 0 completed = lvl 0, 1 = lvl 1, 2 = lvl 2, 3 = lvl 3
  const level = completedCount;

  const renderState = {
    level: level,
    skin: activeSkin,
    items: equipped,
    interest: 'none',
    isLazy: isLazy
  };

  const svg = window.avatarRenderer.render(renderState);
  box.innerHTML = svg;
}

// Grass Grid handler
async function renderGrassMap() {
  const grid = document.getElementById('grassGrid');
  if (!grid) return;

  grid.innerHTML = '';
  const taskMap = readTaskMap();
  const recordedDates = Object.keys(taskMap).sort().slice(-35);
  const list = recordedDates.map(dateString => {
    const tasks = taskMap[dateString] || [];
    return {
      dateString,
      level: Math.min(3, tasks.filter(task => task.is_done).length)
    };
  });

  for (let index = 0; index < 35; index++) {
    const record = list[index];
    const cell = document.createElement('div');
    const level = record?.level || 0;
    cell.className = `grass-cell grass-level-${level}`;

    let desc = record ? `${record.dateString}: ` : '아직 기록이 없는 칸';
    if (record && level === 0) desc += '쉬어갔어요 💤';
    else if (record && level === 1) desc += '1개 완료 🌱';
    else if (record && level === 2) desc += '2개 완료 🌿';
    else if (record && level === 3) desc += '3개 완료, 대성공! 🌸';

    cell.setAttribute('data-tip', desc);
    cell.setAttribute('aria-label', desc);
    cell.setAttribute('role', 'img');
    grid.appendChild(cell);
  }
}

// Local grass mapping update
async function updateTodayGrass(completedCount) {
  const level = Math.max(0, Math.min(3, completedCount));
  const date = new Date(currentDateStr);
  const today = new Date();
  const diffDays = Math.round((today.setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays >= 0 && diffDays < 35) {
    await window.godsaengStore.saveMonthlyGrass(34 - diffDays, level);
  }
}

// Weekly Chart renderers with mini avatar indicators (Slide 9 spec)
async function renderWeeklyStats() {
  const weeklyContainer = document.getElementById('weeklyChart');
  if (!weeklyContainer) return;

  weeklyContainer.innerHTML = '';
  const taskMap = readTaskMap();
  const allRecordedDates = Object.keys(taskMap).sort();
  const todayString = new Date().toISOString().split('T')[0];
  const today = new Date(`${todayString}T00:00:00`);
  const firstRecord = allRecordedDates.length
    ? new Date(`${allRecordedDates[0]}T00:00:00`)
    : new Date(today);
  const elapsedDays = Math.max(0, Math.floor((today - firstRecord) / 86400000));
  const windowStart = new Date(elapsedDays < 7 ? firstRecord : today);
  if (elapsedDays >= 7) windowStart.setDate(today.getDate() - 6);

  const displayedDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(windowStart);
    date.setDate(windowStart.getDate() + index);
    return date.toISOString().split('T')[0];
  });
  const valArr = displayedDates.map(dateString =>
    Math.min(3, (taskMap[dateString] || []).filter(task => task.is_done).length)
  );
  await window.godsaengStore.saveWeeklyAchievement(valArr);

  valArr.forEach((val, idx) => {
    const dateString = displayedDates[idx];
    const date = new Date(`${dateString}T00:00:00`);
    const label = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    const hasRecord = Array.isArray(taskMap[dateString]);
    const isToday = dateString === todayString;
    
    // Create mini sprout rendering state
    const miniState = {
      level: val,
      skin: 'default',
      items: [],
      interest: 'none',
      isLazy: false
    };
    const miniSvgStr = hasRecord ? window.avatarRenderer.render(miniState) : '';

    const bar = document.createElement('div');
    bar.className = `chart-bar-container ${isToday ? 'today' : ''}`;
    bar.innerHTML = `
      <div class="chart-mini-avatar" id="miniAvatar-${idx}" data-has-record="${hasRecord}" style="opacity: 0; bottom: 18px;">
        ${miniSvgStr}
      </div>
      <div class="chart-bar-wrap" title="${dateString} · ${hasRecord ? `${val}개 완료` : '아직 기록 없음'}">
        <div class="chart-bar-fill" style="height: 0%"></div>
      </div>
      <span class="chart-bar-label">${label}</span>
    `;
    weeklyContainer.appendChild(bar);
  });
}

function animateHistoryBars() {
  const fills = document.querySelectorAll('.chart-bar-fill');
  const miniAvatars = document.querySelectorAll('.chart-mini-avatar');
  
  window.godsaengStore.getWeeklyAchievement().then(arr => {
    arr.forEach((val, idx) => {
      if (fills[idx]) {
        const pct = Math.round((val / 3) * 100);
        fills[idx].style.height = `${pct}%`;
        
        // Align mini avatar bottom positioning to top of graph
        if (miniAvatars[idx] && miniAvatars[idx].dataset.hasRecord === 'true') {
          const barHeight = Math.round((val / 3) * 70); // 70px is bar max height
          miniAvatars[idx].style.bottom = `${barHeight + 18}px`;
          miniAvatars[idx].style.opacity = '1';
        }
      }
    });
  });
}

// Render Daily archive text scrolls (Slide 9 spec)
function renderArchiveList() {
  const container = document.getElementById('archiveScroll');
  if (!container) return;

  container.innerHTML = '';
  const allLocalTasks = readTaskMap();
  
  // Sort date keys descending
  const sortedDates = Object.keys(allLocalTasks).sort().reverse();
  
  let validRowsCount = 0;

  sortedDates.forEach(date => {
    const list = allLocalTasks[date] || [];
    const completedTasks = list.filter(t => t.is_done);

    if (completedTasks.length > 0) {
      validRowsCount++;
      const row = document.createElement('div');
      row.className = 'archive-row';
      
      const taskNames = completedTasks.map(t => t.content).join(', ');
      
      row.innerHTML = `
        <span class="archive-date">${date}</span>
        <span class="archive-tasks">${taskNames}</span>
      `;
      container.appendChild(row);
    }
  });

  if (validRowsCount === 0) {
    container.innerHTML = `<span style="font-size: 11px; color: var(--text-muted); text-align: center; display: block; margin-top: 30px;">아직 완료한 과거 루틴 기록이 없습니다.</span>`;
  }
}

// ==========================================================================
// SHOP SYSTEM & 3D CLOSET GACHA IMPLEMENTATION
// ==========================================================================

let currentShopCategory = 'all';
let pendingEquipItemId = null;

function getItemCategoryType(id, item) {
  if (['default', 'green', 'purple', 'blue', 'gold'].includes(id)) return 'skin';
  if (id.startsWith('room_')) return 'background';
  if (window.godsaengStore.titlesCatalog && window.godsaengStore.titlesCatalog[id]) return 'title';
  return 'accessory';
}

function initCategoryTabs() {
  const closetTabs = document.querySelectorAll('.closet-tab');
  const tabsContainer = document.getElementById('shopCategoryTabs');

  closetTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      closetTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      currentShopCategory = tab.getAttribute('data-category') || 'all';
      renderMarket();
      renderCloset();
    });
  });

  if (tabsContainer) {
    let isMouseDown = false;
    let startX = 0;
    let scrollLeft = 0;

    tabsContainer.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      startX = e.pageX - tabsContainer.offsetLeft;
      scrollLeft = tabsContainer.scrollLeft;
    });

    tabsContainer.addEventListener('mouseleave', () => { isMouseDown = false; });
    tabsContainer.addEventListener('mouseup', () => { isMouseDown = false; });

    tabsContainer.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      e.preventDefault();
      const x = e.pageX - tabsContainer.offsetLeft;
      const walk = (x - startX) * 2;
      tabsContainer.scrollLeft = scrollLeft - walk;
    });

    tabsContainer.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        tabsContainer.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }
}

function initGachaModalEvents() {
  const closeBtn = document.getElementById('gachaCloseBtn');
  const equipBtn = document.getElementById('gachaEquipBtn');
  const modal = document.getElementById('gachaModal');

  if (closeBtn) {
    closeBtn.addEventListener('click', closeGachaModal);
  }
  if (equipBtn) {
    equipBtn.addEventListener('click', async () => {
      if (pendingEquipItemId) {
        await equipClosetItem(pendingEquipItemId);
      }
      closeGachaModal();
    });
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'gachaModal') closeGachaModal();
    });
  }
}

async function renderMarket() {
  const grid = document.getElementById('marketGrid');
  if (!grid || !document.getElementById('subtab-market').classList.contains('active')) return;

  grid.innerHTML = '';
  const purchased = await window.godsaengStore.getPurchasedItems();
  const catalogs = window.godsaengStore.itemsCatalog;

  let count = 0;
  for (const [id, item] of Object.entries(catalogs)) {
    const category = getItemCategoryType(id, item);
    if (currentShopCategory !== 'all' && category !== currentShopCategory) continue;

    const isOwned = purchased.includes(id);
    if (isOwned) continue; // 이미 보유중인 아이템은 상점에서 노출 안 함

    count++;
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `
      <div class="shop-card-info">
        <span class="shop-card-tag">${item.grade}</span>
        <span class="shop-card-name">${item.name}</span>
        <span class="shop-card-desc">${item.desc}</span>
      </div>
      <div class="shop-card-footer">
        <span class="shop-card-price">${item.cost} 🪙</span>
        <button class="shop-buy-btn" onclick="buyShopItem('${id}')">
          구매
        </button>
      </div>
    `;
    grid.appendChild(card);
  }

  if (count === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">구매 가능한 상점 아이템이 없거나 모두 보유 중입니다.</div>`;
  }
}

async function renderCloset() {
  const grid = document.getElementById('closetGrid');
  if (!grid) return;

  grid.innerHTML = '';
  const purchased = await window.godsaengStore.getPurchasedItems();
  const equipped = await window.godsaengStore.getEquippedItems();

  const allItems = {
    ...window.godsaengStore.itemsCatalog,
    ...window.godsaengStore.gachaCatalog,
    ...window.godsaengStore.titlesCatalog
  };

  let count = 0;
  for (const [id, item] of Object.entries(allItems)) {
    let isOwned = purchased.includes(id) || id === 'beginner' || id === 'default';
    if (!isOwned) continue;

    const category = getItemCategoryType(id, item);
    if (currentShopCategory !== 'all' && category !== currentShopCategory) continue;

    count++;
    const isEquipped = equipped.includes(id) || (id === 'default' && !equipped.includes('green') && !equipped.includes('purple') && !equipped.includes('blue') && !equipped.includes('gold'));
    const isEquippedTitle = equipped.includes(id);
    const isRoom = id.startsWith('room_');
    const isTitle = Object.keys(window.godsaengStore.titlesCatalog).includes(id);
    const isSkin = ['default', 'green', 'purple', 'blue', 'gold'].includes(id);
    const active = isEquipped || isEquippedTitle;
    let actionLabel = active ? '장착해제' : '장착하기';
    if (isRoom) actionLabel = active ? '적용 중' : '배경 교체';
    else if (isTitle) actionLabel = active ? '칭호 해제' : '칭호 장착';
    else if (isSkin) actionLabel = id === 'default' && active ? '기본 스킨' : (active ? '스킨 해제' : '스킨 적용');

    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `
      <div class="shop-card-info">
        <span class="shop-card-tag">${item.grade || 'Title'}</span>
        <span class="shop-card-name">${item.name}</span>
        <span class="shop-card-desc">${item.desc}</span>
      </div>
      <div class="shop-card-footer">
        <button class="closet-equip-btn ${active ? 'active' : ''}" onclick="equipClosetItem('${id}')" ${(isRoom && active) || (id === 'default' && active) ? 'disabled' : ''}>
          ${actionLabel}
        </button>
      </div>
    `;
    grid.appendChild(card);
  }

  if (count === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">해당 카테고리에 보유 중인 아이템이 없습니다.</div>`;
  }
}

async function buyShopItem(itemId) {
  const result = await window.godsaengStore.buyItem(itemId);
  alert(result.message);
  
  if (result.success) {
    const coins = await window.godsaengStore.getCoins();
    document.getElementById('coinCount').textContent = coins;
    renderMarket();
  }
}

async function equipClosetItem(itemId) {
  const success = await window.godsaengStore.equipItem(itemId);
  if (success) {
    renderCloset();
    await updateAvatarDisplay();
  }
}

async function triggerLuckyBox() {
  const result = await window.godsaengStore.playLuckyBox();
  if (!result.success) {
    alert(result.message);
    return;
  }

  const coins = await window.godsaengStore.getCoins();
  document.getElementById('coinCount').textContent = coins;

  start3DGachaAnimation(result);
}

function start3DGachaAnimation(result) {
  const gachaModal = document.getElementById('gachaModal');
  const closetWardrobe = document.getElementById('closetWardrobe');
  const closetAura = document.getElementById('closetAura');
  const gachaLight = document.getElementById('gachaLight');
  const gachaResult = document.getElementById('gachaResult');
  const iconEl = document.getElementById('gachaItemIcon');
  const nameEl = document.getElementById('gachaItemName');
  const descEl = document.getElementById('gachaItemDesc');
  const equipBtn = document.getElementById('gachaEquipBtn');

  if (!gachaModal) return;

  let targetStep = 1;
  let finalColor = '#94a3b8';
  const gradeStr = (result.grade || '').toLowerCase();

  if (gradeStr.includes('전설') || gradeStr.includes('legendary')) {
    targetStep = 4;
    finalColor = '#f59e0b';
  } else if (gradeStr.includes('영웅') || gradeStr.includes('epic')) {
    targetStep = 3;
    finalColor = '#a855f7';
  } else if (gradeStr.includes('희귀') || gradeStr.includes('rare')) {
    targetStep = 2;
    finalColor = '#3b82f6';
  }

  if (closetWardrobe) closetWardrobe.className = 'closet-wardrobe';
  if (closetAura) closetAura.className = 'closet-aura';
  if (gachaLight) gachaLight.classList.remove('glowing-burst');
  if (gachaResult) gachaResult.classList.remove('float-up');

  gachaModal.style.display = 'flex';
  void gachaModal.offsetWidth; // Force Reflow
  gachaModal.classList.add('show');
  if (gachaLight) gachaLight.style.color = finalColor;

  if (iconEl) iconEl.textContent = '';
  if (nameEl) nameEl.textContent = '';
  if (descEl) descEl.textContent = '';
  if (equipBtn) equipBtn.style.display = 'none';
  pendingEquipItemId = null;

  const triggerImpactShake = () => {
    if (!closetWardrobe) return;
    closetWardrobe.classList.remove('grade-bump');
    void closetWardrobe.offsetWidth; // Force Reflow
    closetWardrobe.classList.add('grade-bump');
  };

  const STEP_INTERVAL = 600;

  // Step 1: 일반 등급 회색 오라 + 덜컹
  if (closetAura) closetAura.className = 'closet-aura step-common';
  triggerImpactShake();

  // Step 2: 희귀 등급 이상 푸른 오라
  if (targetStep >= 2) {
    setTimeout(() => {
      if (closetAura) closetAura.className = 'closet-aura step-rare';
      triggerImpactShake();
    }, STEP_INTERVAL);
  }

  // Step 3: 영웅 등급 이상 보라 오라
  if (targetStep >= 3) {
    setTimeout(() => {
      if (closetAura) closetAura.className = 'closet-aura step-epic';
      triggerImpactShake();
    }, STEP_INTERVAL * 2);
  }

  // Step 4: 전설 등급 황금 오라
  if (targetStep >= 4) {
    setTimeout(() => {
      if (closetAura) closetAura.className = 'closet-aura step-legendary';
      triggerImpactShake();
    }, STEP_INTERVAL * 3);
  }

  // Step 5: 최종 문 개방 & 광채 폭발 & 결과 카드 팝업
  const totalOpenDelay = targetStep * STEP_INTERVAL;
  setTimeout(() => {
    if (closetWardrobe) {
      closetWardrobe.classList.remove('grade-bump');
      closetWardrobe.classList.add('open');
    }
    if (gachaLight) gachaLight.classList.add('glowing-burst');

    setTimeout(async () => {
      if (iconEl) iconEl.textContent = result.icon || '🎁';
      if (nameEl) nameEl.textContent = result.name || '럭키박스 보상';
      if (descEl) descEl.textContent = result.desc || result.message || '';

      if (result.itemId && equipBtn) {
        pendingEquipItemId = result.itemId;
        equipBtn.style.display = 'inline-block';
      }

      if (gachaResult) gachaResult.classList.add('float-up');

      renderMarket();
      renderCloset();
      await updateAvatarDisplay();
    }, 400);
  }, totalOpenDelay);
}

function closeGachaModal() {
  const modal = document.getElementById('gachaModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.style.display = 'none';
      const closetWardrobe = document.getElementById('closetWardrobe');
      if (closetWardrobe) closetWardrobe.className = 'closet-wardrobe';
    }, 300);
  }
}

function openGachaHelpModal() {
  const modal = document.getElementById('gachaHelpModal');
  if (modal) {
    modal.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
  }
}

function closeGachaHelpModal() {
  const modal = document.getElementById('gachaHelpModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// ==========================================================================
// CAMERA AUTHENTICATION LOGIC (Digital timestamp & Gemini Vision AI)
// ==========================================================================
let activeCameraTaskId = null;
let webcamStream = null;
let cameraFacingMode = 'user';
let capturedFrames = [];
let recordingTimer = null;
let boomerangPlayTimer = null;
let isRecording = false;

function openCamera(taskId, event) {
  if (event) event.stopPropagation();

  const task = currentRoutines.find(r => r.id === taskId);
  if (!task || task.is_done || getDateMode() !== 'today') return;

  activeCameraTaskId = taskId;
  document.getElementById('camTaskTitle').textContent = `인증 : ${task.content}`;
  
  // Show Camera Modal
  document.getElementById('cameraModal').style.display = 'flex';
  document.getElementById('captureFooter').style.display = 'flex';
  document.getElementById('resultSuccessPanel').style.display = 'none';
  document.getElementById('resultFailPanel').style.display = 'none';
  document.getElementById('passBadge').style.display = 'none';
  document.getElementById('retakeBadge').style.display = 'none';
  document.getElementById('playIcon').style.display = 'none';
  document.getElementById('boomerangCanvas').style.display = 'none';
  document.getElementById('simulatedCam').style.display = 'flex';
  document.getElementById('analysisLoading').style.display = 'none';
  document.getElementById('focusGuide').textContent = '부메랑 렌즈 안에 행동을 담아주세요';
  setFailPanelMode('judged');

  startWebcam();
}

function closeCamera() {
  stopWebcam();
  document.getElementById('cameraModal').style.display = 'none';
}

function startWebcam() {
  const video = document.getElementById('webcamVideo');
  const canvas = document.getElementById('boomerangCanvas');

  if (cameraFacingMode === 'user') {
    video.style.transform = 'scaleX(-1)';
    canvas.style.transform = 'scaleX(-1)';
  } else {
    video.style.transform = 'scaleX(1)';
    canvas.style.transform = 'scaleX(1)';
  }

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: cameraFacingMode },
      audio: false
    })
      .then(stream => {
        webcamStream = stream;
        video.srcObject = stream;
        video.style.display = 'block';
        document.getElementById('simulatedCam').style.display = 'none';
      })
      .catch(err => {
        console.warn("Webcam blocked or unavailable, starting simulator.", err);
        video.style.display = 'none';
        document.getElementById('simulatedCam').style.display = 'flex';
      });
  } else {
    video.style.display = 'none';
    document.getElementById('simulatedCam').style.display = 'flex';
  }
}

function toggleCameraFacing() {
  if (isRecording) return;
  cameraFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
  stopWebcam();
  startWebcam();
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
  clearInterval(recordingTimer);
  clearInterval(boomerangPlayTimer);
  capturedFrames = [];
  isRecording = false;
}

// Shutter Capture (Synthesizes real-time digital timestamp - Slide 7 spec)
function startCapture() {
  if (isRecording) return;
  isRecording = true;

  const shutter = document.getElementById('shutterBtn');
  const progress = document.getElementById('progressCircle');
  const viewfinder = document.getElementById('viewfinder');

  shutter.classList.add('recording');
  viewfinder.classList.add('shaking');

  const flash = document.getElementById('cameraFlash');
  flash.style.animation = 'flashEffect 0.35s ease-out';

  setTimeout(() => {
    viewfinder.classList.remove('shaking');
    flash.style.animation = '';
  }, 350);

  document.getElementById('focusGuide').textContent = '부메랑으로 행동을 분석하는 중... 🎥';

  let duration = 1500;
  let start = null;

  const video = document.getElementById('webcamVideo');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  capturedFrames = [];
  const frameRate = 120; // 1.5s loop duration

  recordingTimer = setInterval(() => {
    const isMockView = document.getElementById('simulatedCam').style.display === 'flex';
    
    canvas.width = isMockView ? 320 : (video.videoWidth || 320);
    canvas.height = isMockView ? 480 : (video.videoHeight || 240);

    if (!isMockView) {
      if (cameraFacingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      // Simulated viewfinder drawing
      ctx.fillStyle = '#1C1C1E';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const tick = Date.now();
      ctx.fillStyle = `hsl(${(tick / 15) % 360}, 70%, 55%)`;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2 + Math.sin(tick / 150) * 20, 45, 0, Math.PI * 2);
      ctx.fill();
    }

    // DRAW DIGITAL TIMESTAMP IN ORANGE COLOR (Slide 7 spec)
    const now = new Date();
    const yr = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const dy = String(now.getDate()).padStart(2, '0');
    const hr = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const sc = String(now.getSeconds()).padStart(2, '0');
    const timestampStr = `${yr}-${mo}-${dy} ${hr}:${mi}:${sc}`;

    ctx.fillStyle = '#ff6b00'; // Retro Digital Orange
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(timestampStr, canvas.width - 12, canvas.height - 12);

    capturedFrames.push(canvas.toDataURL('image/jpeg'));
  }, frameRate);

  function step(timestamp) {
    if (!start) start = timestamp;
    let progressMs = timestamp - start;
    let offset = 239 - (239 * (progressMs / duration));

    if (offset < 0) offset = 0;
    progress.style.strokeDashoffset = offset;

    if (progressMs < duration) {
      requestAnimationFrame(step);
    } else {
      clearInterval(recordingTimer);
      finishCapture();
    }
  }

  requestAnimationFrame(step);
}

// Process Gemini/Mock AI analysis (Slide 7 spec)
async function finishCapture() {
  isRecording = false;
  const shutter = document.getElementById('shutterBtn');
  shutter.classList.remove('recording');
  document.getElementById('progressCircle').style.strokeDashoffset = 239;

  document.getElementById('captureFooter').style.display = 'none';

  // Play Loop GIF representation
  startBoomerangPlayback();

  // Show Loading analyzer screen
  const loading = document.getElementById('analysisLoading');
  loading.style.display = 'flex';

  const task = currentRoutines.find(r => r.id === activeCameraTaskId);
  const missionText = task ? task.content : '오늘 갓생 살기';
  const representFrame = capturedFrames[Math.floor(capturedFrames.length / 2)] || '';

  // Call Vision AI engine
  const result = await window.visionAI.analyze(missionText, representFrame);

  // Hide Loading
  loading.style.display = 'none';

  if (result.errored) {
    // 판독 실패는 실패 '판정'이 아니다. 점수와 실패 확정 경로를 감추고 재촬영만 남긴다.
    showAnalysisErrorPanel(result.feedback);
    return;
  }

  // API 키가 없어 데모(mock) 판정으로 돌아간 경우 결과에 그 사실을 밝힌다.
  const feedbackText = result.mode === 'mock'
    ? `[데모 판정] ${result.feedback}`
    : result.feedback;

  if (result.pass) {
    document.getElementById('passBadge').style.display = 'flex';
    document.getElementById('resultSuccessPanel').style.display = 'flex';
    document.getElementById('successScore').textContent = result.score;
    document.getElementById('successFeedback').textContent = `"${feedbackText}"`;
  } else {
    setFailPanelMode('judged');
    document.getElementById('retakeBadge').style.display = 'flex';
    document.getElementById('resultFailPanel').style.display = 'flex';
    document.getElementById('failScore').textContent = result.score;
    document.getElementById('failFeedback').textContent = `"${feedbackText}"`;
  }
}

// 실패 패널을 '판정 실패'와 '판독 오류' 두 모드로 재사용한다.
function setFailPanelMode(mode) {
  const panel = document.getElementById('resultFailPanel');
  if (!panel) return;
  const scoreBadge = panel.querySelector('.score-badge');
  const hintText = panel.querySelector('.result-comment-box > span');
  const confirmFailureBtn = document.getElementById('confirmFailureBtn');
  const isError = mode === 'error';

  if (scoreBadge) scoreBadge.style.display = isError ? 'none' : '';
  if (confirmFailureBtn) confirmFailureBtn.style.display = isError ? 'none' : '';
  if (hintText) {
    hintText.textContent = isError
      ? '⚠️ 판정이 이뤄지지 않아 이번 촬영은 성공·실패 어느 쪽으로도 기록되지 않습니다.'
      : '😢 다시 한번 시도해 볼까요? (통과 기준: 70점)';
  }
}

function showAnalysisErrorPanel(message) {
  setFailPanelMode('error');
  document.getElementById('retakeBadge').style.display = 'flex';
  document.getElementById('resultFailPanel').style.display = 'flex';
  document.getElementById('failFeedback').textContent = message || 'AI 판독을 완료하지 못했습니다.';
}

function startBoomerangPlayback() {
  const canvasEl = document.getElementById('boomerangCanvas');
  const videoEl = document.getElementById('webcamVideo');
  const simulatedEl = document.getElementById('simulatedCam');

  videoEl.style.display = 'none';
  simulatedEl.style.display = 'none';
  canvasEl.style.display = 'block';
  document.getElementById('playIcon').style.display = 'flex';

  const ctx = canvasEl.getContext('2d');
  let currentFrameIdx = 0;
  let direction = 1;

  if (capturedFrames.length > 0) {
    const images = [];
    let loadedCount = 0;

    capturedFrames.forEach((src) => {
      const img = new Image();
      img.onload = () => {
        loadedCount++;
        if (loadedCount === capturedFrames.length) {
          boomerangPlayTimer = setInterval(() => {
            canvasEl.width = img.naturalWidth;
            canvasEl.height = img.naturalHeight;
            canvasEl.classList.add('blur-motion');

            ctx.drawImage(images[currentFrameIdx], 0, 0);

            setTimeout(() => {
              canvasEl.classList.remove('blur-motion');
            }, 40);

            currentFrameIdx += direction;
            if (currentFrameIdx === images.length - 1 || currentFrameIdx === 0) {
              direction *= -1; // Reverse ping-pong loop
            }
          }, 110);
        }
      };
      img.src = src;
      images.push(img);
    });
  }
}

async function confirmSuccess() {
  const task = currentRoutines.find(r => r.id === activeCameraTaskId);
  if (task) {
    const taskIndex = currentRoutines.findIndex(routine => routine.id === task.id);
    const verifyButtons = document.querySelectorAll('.checkbox-custom');
    if (verifyButtons[taskIndex]) triggerConfetti(verifyButtons[taskIndex]);
    if (navigator.vibrate) navigator.vibrate([80, 40, 120]);

    task.is_done = true;
    task.completed_at = new Date().toISOString();
    task.updated_at = new Date().toISOString();
    task.verification_type = 'camera_ai';
    clearRoutineAlarm(task.id);
    saveCurrentRoutinesLocally();
    await rewardTaskOnce(task.id, 2);

    // Save Boomerang 1.5s clip to Month Record collection
    if (capturedFrames && capturedFrames.length > 0) {
      const clipData = {
        id: 'clip_' + Date.now(),
        taskId: activeCameraTaskId,
        title: task.content,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        frames: capturedFrames.slice(0, 12)
      };
      await window.godsaengStore.saveMonthlyClip(clipData);
    }

    if (window.godsaengStore.isSupabaseActive && !String(task.id).startsWith('local_')) {
      try {
        updateSyncStatus('syncing');
        const { error } = await dbSupabase
          .from('tasks')
          .update({
            is_done: true,
            completed_at: task.completed_at,
            updated_at: task.updated_at
          })
          .eq('id', activeCameraTaskId);
        if (error) throw error;
        updateSyncStatus('synced');
      } catch {
        updateSyncStatus('offline');
        console.info("카메라 인증은 로컬에 저장되었고 동기화는 나중에 다시 시도합니다.");
      }
    }
  }
  document.getElementById('coinCount').textContent = await window.godsaengStore.getCoins();

  // Refresh views
  renderRoutines();
  await updateAvatarDisplay();
  await renderWeeklyStats();
  await renderGrassMap();
}

// ==========================================================================
// MONTH RECORD VIDEO REEL ENGINE (한 달의 기록)
// ==========================================================================
let monthRecordClips = [];
let currentClipIndex = 0;
let currentClipFrameIndex = 0;
let isMonthRecordPlaying = false;
let monthRecordPlaybackTimer = null;

function openMonthRecordModal() {
  const modal = document.getElementById('monthRecordModal');
  if (!modal) return;
  modal.style.display = 'flex';
  if (window.lucide) window.lucide.createIcons();
  initMonthRecordPlayback();
}

function closeMonthRecordModal() {
  const modal = document.getElementById('monthRecordModal');
  if (modal) modal.style.display = 'none';
  stopMonthRecordPlayback();
}

async function initMonthRecordPlayback() {
  stopMonthRecordPlayback();
  const savedClips = await window.godsaengStore.getMonthlyClips();

  if (savedClips && savedClips.length > 0) {
    monthRecordClips = savedClips;
  } else {
    const nowStr = new Date().toISOString().split('T')[0];
    monthRecordClips = [
      { id: 'demo_1', date: nowStr, time: '07:30', title: '🌅 아침 이불 개기 미션 인증', frames: createMockFrames('bed', '#4f46e5') },
      { id: 'demo_2', date: nowStr, time: '08:15', title: '💧 생존 아침 물 한잔 마시기', frames: createMockFrames('water', '#06b6d4') },
      { id: 'demo_3', date: nowStr, time: '14:00', title: '📚 갓생 책 30분 읽기 독서 완료', frames: createMockFrames('book', '#8b5cf6') },
      { id: 'demo_4', date: nowStr, time: '17:30', title: '🏋️ 득근 덤벨 운동 루틴 완료', frames: createMockFrames('workout', '#10b981') },
      { id: 'demo_5', date: nowStr, time: '23:00', title: '🌙 하루 마무리 취면 전 스트레칭', frames: createMockFrames('night', '#f59e0b') }
    ];
  }

  currentClipIndex = 0;
  currentClipFrameIndex = 0;
  isMonthRecordPlaying = true;
  updateMonthRecordUI();
  playCurrentClip();
}

function updateMonthRecordUI() {
  if (monthRecordClips.length === 0) return;
  const clip = monthRecordClips[currentClipIndex];
  document.getElementById('clipDate').textContent = `${clip.date} ${clip.time || ''}`;
  document.getElementById('clipTitle').textContent = clip.title;
  document.getElementById('videoCounterText').textContent = `${currentClipIndex + 1} / ${monthRecordClips.length} 클립`;
  document.getElementById('totalClipsNum').textContent = monthRecordClips.length;
  document.getElementById('totalDurationSec').textContent = `${(monthRecordClips.length * 1.5).toFixed(1)}초`;
  
  const playBtnText = document.getElementById('videoPlayText');
  const playIcon = document.getElementById('videoPlayIcon');
  if (playBtnText && playIcon) {
    if (isMonthRecordPlaying) {
      playBtnText.textContent = '일시정지';
      playIcon.setAttribute('data-lucide', 'pause');
    } else {
      playBtnText.textContent = '재생하기';
      playIcon.setAttribute('data-lucide', 'play');
    }
    if (window.lucide) window.lucide.createIcons();
  }
}

function playCurrentClip() {
  clearInterval(monthRecordPlaybackTimer);
  if (!isMonthRecordPlaying || monthRecordClips.length === 0) return;

  const clip = monthRecordClips[currentClipIndex];
  const frames = clip.frames || [];
  const canvas = document.getElementById('monthRecordCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 360;
  canvas.height = 260;

  let direction = 1;
  currentClipFrameIndex = 0;
  let frameCount = 0;
  const maxFramesPerClip = 16;

  const loadedImages = [];
  let isImageSource = false;

  if (frames.length > 0 && typeof frames[0] === 'string' && frames[0].startsWith('data:image')) {
    isImageSource = true;
    frames.forEach(src => {
      const img = new Image();
      img.src = src;
      loadedImages.push(img);
    });
  }

  monthRecordPlaybackTimer = setInterval(() => {
    if (!isMonthRecordPlaying) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isImageSource && loadedImages.length > 0) {
      const img = loadedImages[currentClipFrameIndex % loadedImages.length];
      if (img && img.complete) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } else {
        renderCanvasFallbackFrame(ctx, canvas, clip, currentClipFrameIndex);
      }
    } else {
      renderCanvasFallbackFrame(ctx, canvas, clip, currentClipFrameIndex);
    }

    const progressFill = document.getElementById('videoProgressFill');
    if (progressFill) {
      const overallProgress = ((currentClipIndex + (frameCount / maxFramesPerClip)) / monthRecordClips.length) * 100;
      progressFill.style.width = `${Math.min(100, overallProgress)}%`;
    }

    currentClipFrameIndex += direction;
    if (currentClipFrameIndex >= (frames.length > 0 ? frames.length - 1 : 8) || currentClipFrameIndex <= 0) {
      direction *= -1;
    }

    frameCount++;
    if (frameCount >= maxFramesPerClip) {
      currentClipIndex = (currentClipIndex + 1) % monthRecordClips.length;
      updateMonthRecordUI();
      playCurrentClip();
    }
  }, 110);
}

function renderCanvasFallbackFrame(ctx, canvas, clip, frameIdx) {
  const colors = ['#1e1b4b', '#0f766e', '#701a75', '#854d0e', '#166534'];
  const bg = colors[currentClipIndex % colors.length];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tick = Date.now() / 150;
  const pulseR = 40 + Math.sin(tick + frameIdx) * 8;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, pulseR + 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2 + Math.sin(tick) * 5, pulseR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(canvas.width / 2 - 12, canvas.height / 2 - 15, 14, 0, Math.PI * 2);
  ctx.arc(canvas.width / 2 + 12, canvas.height / 2 - 15, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ff6b00';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`REC 🔴 1.5s BOOMERANG`, canvas.width - 15, 25);
  ctx.fillText(`${clip.date} ${clip.time || '12:00'}`, canvas.width - 15, canvas.height - 15);
}

function createMockFrames(type, color) {
  return Array(8).fill(type);
}

function toggleVideoPlayPause() {
  isMonthRecordPlaying = !isMonthRecordPlaying;
  updateMonthRecordUI();
  if (isMonthRecordPlaying) {
    playCurrentClip();
  } else {
    clearInterval(monthRecordPlaybackTimer);
  }
}

function replayMonthRecord() {
  currentClipIndex = 0;
  currentClipFrameIndex = 0;
  isMonthRecordPlaying = true;
  updateMonthRecordUI();
  playCurrentClip();
}

function stopMonthRecordPlayback() {
  isMonthRecordPlaying = false;
  clearInterval(monthRecordPlaybackTimer);
}

function retakePhoto() {
  clearInterval(boomerangPlayTimer);
  document.getElementById('resultFailPanel').style.display = 'none';
  document.getElementById('retakeBadge').style.display = 'none';
  document.getElementById('playIcon').style.display = 'none';
  document.getElementById('boomerangCanvas').style.display = 'none';
  document.getElementById('webcamVideo').style.display = 'block';
  document.getElementById('captureFooter').style.display = 'flex';
  document.getElementById('focusGuide').textContent = '부메랑 렌즈 안에 행동을 담아주세요';

  startWebcam();
}

function confirmFailure() {
  closeCamera();
}
