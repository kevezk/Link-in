/* ============================================================
   Link-In Online System - Main Application Script
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const socketServerUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? undefined
    : 'https://port-0-link-in-msyht1rod1f2a852.sel3.cloudtype.app';
  const socket = io(socketServerUrl, {
    autoConnect: false,
    transports: ['websocket', 'polling']
  });
  let pendingJoin = null;



  // App State
  let currentUser = null;
  let currentRoomId = '';
  let currentNotice = null;
  let pixelClassroom = null;
  let localMediaStream = null;
  const peerConnections = new Map();
  const peerNames = new Map();

  // DOM Elements
  const loginModal = document.getElementById('loginModal');
  const loginForm = document.getElementById('loginForm');
  const appContainer = document.getElementById('appContainer');

  const characterChoiceGrid = document.getElementById('characterChoiceGrid');
  const characterChoiceCaption = document.getElementById('characterChoiceCaption');
  let selectedCharacterId = window.LINKIN_DEFAULT_CHARACTER || 'red';

  const roleChoiceGroup = document.getElementById('roleChoiceGroup');
  const roleChoiceNote = document.getElementById('roleChoiceNote');
  const teacherCodeRow = document.getElementById('teacherCodeRow');
  const teacherCodeInput = document.getElementById('teacherCodeInput');
  let selectedRole = 'student';
  let lockedRole = null;   // 이미 가입한 사용자의 확정 역할

  // Header & Server Elements
  const classRoomTitle = document.getElementById('classRoomTitle');
  const yptServerTitle = document.getElementById('yptServerTitle');
  const btnOpenNotice = document.getElementById('btnOpenNotice');
  const noticeBadgeDot = document.getElementById('noticeBadgeDot');
  const userRoleBadge = document.getElementById('userRoleBadge');
  const currentUserName = document.getElementById('currentUserName');
  const btnOpenSettings = document.getElementById('btnOpenSettings');

  // Character Grid
  const characterGrid = document.getElementById('characterGrid');
  const userCountText = document.getElementById('userCountText');

  // Notice Modal
  const noticeModal = document.getElementById('noticeModal');
  const btnCloseNotice = document.getElementById('btnCloseNotice');
  const noticeViewBox = document.getElementById('noticeViewBox');
  const noticeAuthorRole = document.getElementById('noticeAuthorRole');
  const noticeAuthorName = document.getElementById('noticeAuthorName');
  const noticeTime = document.getElementById('noticeTime');
  const noticeDisplayTitle = document.getElementById('noticeDisplayTitle');
  const noticeDisplayContent = document.getElementById('noticeDisplayContent');
  const noticeEditorBox = document.getElementById('noticeEditorBox');
  const noticeForm = document.getElementById('noticeForm');
  const noticeTitleInput = document.getElementById('noticeTitleInput');
  const noticeContentInput = document.getElementById('noticeContentInput');
  const btnToggleEditNotice = document.getElementById('btnToggleEditNotice');
  const btnCancelEditNotice = document.getElementById('btnCancelEditNotice');

  // Settings Modal
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const settingsRoomDetails = document.getElementById('settingsRoomDetails');
  const btnRejoinClass = document.getElementById('btnRejoinClass');

  const currentRoomCodeText = document.getElementById('currentRoomCodeText');

  function resetClassSessionAfterSignOut() {
    if (!currentUser && !socket.connected) return;

    pendingJoin = null;
    socket.disconnect();
    pixelClassroom?.stop();
    stopMedia();
    currentUser = null;
    currentRoomId = '';
    currentNotice = null;
    noticeModal.classList.add('hidden');
    settingsModal.classList.add('hidden');
    appContainer.classList.add('hidden');
    loginModal.classList.remove('hidden');
  }

  window.addEventListener('lockin-auth-changed', event => {
    if (!event.detail?.session) resetClassSessionAfterSignOut();
  });

  appContainer.classList.add('hidden');
  document.querySelector('[data-tab="classroom"]')?.addEventListener('click', () => {
    if (!currentUser) loginModal.classList.remove('hidden');
  });

  /* ============================================================
     1. CHARACTER PICKER (6종 중 선택)
     ============================================================ */
  function renderCharacterChoices() {
    if (!characterChoiceGrid) return;
    const catalog = window.LINKIN_CHARACTERS || [];
    characterChoiceGrid.innerHTML = '';

    catalog.forEach(character => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'character-choice';
      button.dataset.characterId = character.id;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-label', `${character.name} — ${character.trait}`);
      button.style.setProperty('--character-color', character.color);

      const image = document.createElement('img');
      image.src = character.image;
      image.alt = character.name;
      image.loading = 'eager';
      image.draggable = false;

      const label = document.createElement('span');
      label.className = 'character-choice-name';
      label.textContent = character.name;

      button.append(image, label);
      button.addEventListener('click', () => selectCharacter(character.id));
      characterChoiceGrid.appendChild(button);
    });

    selectCharacter(selectedCharacterId);
  }

  function selectCharacter(id) {
    const character = window.getLinkinCharacter ? window.getLinkinCharacter(id) : null;
    if (!character) return;
    selectedCharacterId = character.id;

    characterChoiceGrid?.querySelectorAll('.character-choice').forEach(button => {
      const isSelected = button.dataset.characterId === character.id;
      button.classList.toggle('selected', isSelected);
      button.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      button.tabIndex = isSelected ? 0 : -1;
    });

    if (characterChoiceCaption) {
      characterChoiceCaption.textContent = `${character.name} · ${character.trait}`;
    }
  }

  // 좌우 방향키로도 고를 수 있게 한다 (라디오 그룹 관례)
  characterChoiceGrid?.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const catalog = window.LINKIN_CHARACTERS || [];
    const current = catalog.findIndex(character => character.id === selectedCharacterId);
    if (current < 0) return;
    const step = (event.key === 'ArrowLeft' || event.key === 'ArrowUp') ? -1 : 1;
    const next = catalog[(current + step + catalog.length) % catalog.length];
    selectCharacter(next.id);
    characterChoiceGrid.querySelector('.character-choice.selected')?.focus();
    event.preventDefault();
  });

  window.preloadLinkinCharacters?.();
  renderCharacterChoices();

  /* ============================================================
     1-1. 역할 선택 (학생 / 선생님)
     역할은 최초 가입 시 한 번만 정해지고 이후에는 잠긴다.
     교사 코드 검증은 DB 함수 안에서 이뤄진다. 여기 검사는 편의용일 뿐이다.
     ============================================================ */
  const ROLE_LABELS = { student: '🎒 학생', teacher: '👩‍🏫 선생님', president: '👑 반장' };

  function selectRole(role) {
    if (lockedRole) return;
    selectedRole = role === 'teacher' ? 'teacher' : 'student';

    roleChoiceGroup?.querySelectorAll('.role-choice').forEach(button => {
      const isSelected = button.dataset.role === selectedRole;
      button.classList.toggle('selected', isSelected);
      button.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });

    if (teacherCodeRow) teacherCodeRow.hidden = selectedRole !== 'teacher';
    if (selectedRole !== 'teacher' && teacherCodeInput) teacherCodeInput.value = '';
  }

  // 이미 학급에 가입한 사용자는 역할이 확정되어 있다. 선택지를 잠그고 현재 역할을 보여준다.
  function applyLockedRole(role) {
    lockedRole = role;
    selectedRole = role;

    if (teacherCodeRow) teacherCodeRow.hidden = true;
    if (!roleChoiceGroup) return;

    roleChoiceGroup.innerHTML = '';
    const badge = document.createElement('div');
    badge.className = 'role-locked-badge';
    badge.textContent = ROLE_LABELS[role] || role;
    roleChoiceGroup.appendChild(badge);

    if (roleChoiceNote) {
      roleChoiceNote.textContent = role === 'president'
        ? '선생님이 임명한 반장입니다. 역할은 변경할 수 없습니다.'
        : '이미 확정된 역할입니다. 변경할 수 없습니다.';
    }
  }

  function unlockRoleChoice() {
    if (!lockedRole) return;
    lockedRole = null;
    if (!roleChoiceGroup) return;
    roleChoiceGroup.innerHTML = '';
    ['student', 'teacher'].forEach(role => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'role-choice';
      button.dataset.role = role;
      button.setAttribute('role', 'radio');
      button.textContent = ROLE_LABELS[role];
      roleChoiceGroup.appendChild(button);
    });
    if (roleChoiceNote) {
      roleChoiceNote.textContent = '처음 가입할 때 한 번만 정해지며 이후에는 바꿀 수 없습니다.';
    }
    selectRole('student');
  }

  roleChoiceGroup?.addEventListener('click', event => {
    const button = event.target.closest('.role-choice');
    if (button) selectRole(button.dataset.role);
  });

  // 로그인 상태라면 기존 멤버십을 조회해 역할 잠금 여부를 판단한다.
  async function refreshLockedRole() {
    try {
      const { data: sessionData } = await window.lockinSupabase.auth.getSession();
      if (!sessionData.session) {
        unlockRoleChoice();
        return;
      }
      const { data, error } = await window.lockinSupabase
        .from('class_memberships')
        .select('role')
        .eq('user_id', sessionData.session.user.id)
        .maybeSingle();
      if (error) return;
      if (data?.role) applyLockedRole(data.role);
      else unlockRoleChoice();
    } catch {
      // 조회 실패는 무시한다. 최종 판정은 어차피 DB 함수가 한다.
    }
  }

  window.addEventListener('lockin-auth-changed', () => { refreshLockedRole(); });
  document.querySelector('[data-tab="classroom"]')?.addEventListener('click', () => { refreshLockedRole(); });
  refreshLockedRole();

  /* ============================================================
     2. LOGIN & SCHOOL SERVER JOIN
     ============================================================ */
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const school = document.getElementById('schoolInput').value;
    const grade = document.getElementById('gradeInput').value;
    const classNum = document.getElementById('classInput').value;
    const username = document.getElementById('usernameInput').value;
    const character = selectedCharacterId;

    if (!window.lockinSupabase) {
      alert('Supabase 연결을 준비하는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const { data: sessionData } = await window.lockinSupabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      alert('먼저 LOCK-IN 계정으로 로그인해주세요.');
      if (typeof window.openAuthModal === 'function') {
        window.openAuthModal();
      } else {
        const authModal = document.getElementById('authModal');
        authModal?.classList.add('show');
        authModal?.setAttribute('aria-hidden', 'false');
      }
      return;
    }

    const teacherCode = teacherCodeInput?.value.trim() || '';
    if (!lockedRole && selectedRole === 'teacher' && !teacherCode) {
      alert('교사 코드를 입력해주세요.');
      teacherCodeInput?.focus();
      return;
    }

    const { error: joinError } = await window.lockinSupabase.rpc('join_class_with_role', {
      input_school_name: school,
      input_grade: Number(grade),
      input_class_number: Number(classNum),
      input_display_name: username,
      input_role: lockedRole || selectedRole,
      input_teacher_code: teacherCode || null
    });
    if (joinError) {
      alert(translateJoinError(joinError.message));
      return;
    }
    if (teacherCodeInput) teacherCodeInput.value = '';
    await refreshLockedRole();

    pendingJoin = { character };
    socket.auth = { accessToken };
    if (socket.connected) {
      socket.emit('join-class', pendingJoin);
    } else {
      socket.connect();
    }
  });

  // DB 함수가 던지는 영문 예외를 사용자 문구로 바꾼다.
  function translateJoinError(message) {
    const raw = String(message || '');
    if (raw.includes('Invalid teacher code')) {
      return '교사 코드가 올바르지 않습니다. 학교에서 받은 코드를 다시 확인해주세요.';
    }
    if (raw.includes('Teacher signup is not configured')) {
      return '교사 가입이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.';
    }
    if (raw.includes('Role must be student or teacher')) {
      return '역할은 학생 또는 선생님만 선택할 수 있습니다. 반장은 선생님이 임명합니다.';
    }
    if (raw.includes('Class can only be changed once every 30 days')) {
      return '학급은 30일에 한 번만 변경할 수 있습니다.';
    }
    if (raw.includes('function public.join_class_with_role') || raw.includes('does not exist')) {
      return '서버 데이터베이스에 역할 기능이 아직 적용되지 않았습니다. 관리자에게 문의해주세요.';
    }
    return raw || '학급 가입 정보를 저장하지 못했습니다.';
  }

  socket.on('connect', () => {
    if (pendingJoin) socket.emit('join-class', pendingJoin);
  });

  socket.on('connect_error', (error) => {
    alert(error.message || '학급 서버 인증에 실패했습니다.');
  });

  socket.on('join-error', (error) => {
    alert(error.message || '학급 입장에 실패했습니다.');
  });

  socket.on('joined-success', (data) => {
    currentUser = data.user;
    currentRoomId = data.roomId;
    currentNotice = data.notice;

    // Hide login modal, show main app
    loginModal.classList.add('hidden');
    appContainer.classList.remove('hidden');

    // Header info & Yeolpumta Server Title
    const serverTitleText = `${currentUser.school} ${currentUser.grade}학년 ${currentUser.classNum}반`;
    classRoomTitle.textContent = `🏫 ${currentUser.school} ${currentUser.grade}학년 ${currentUser.classNum}반`;
    if (yptServerTitle) {
      yptServerTitle.textContent = `🏫 ${serverTitleText} 서버`;
    }

    currentUserName.textContent = currentUser.username;
    
    // Role styling
    userRoleBadge.className = 'user-role-badge ' + currentUser.role;
    userRoleBadge.textContent = currentUser.role === 'teacher' ? '👩‍🏫 선생님' : currentUser.role === 'president' ? '👑 반장' : '🎒 학생';

    currentRoomCodeText.textContent = `서버 코드: ${currentRoomId}`;

    // Update Settings Modal Info
    updateSettingsInfo();

    // Initialize Yeolpumta Style Character Grid
    renderCharacterGrid(data.allUsers);
    peerNames.clear();
    data.allUsers.forEach(user => peerNames.set(user.id, user.username));
    if (!pixelClassroom) {
      pixelClassroom = new window.PixelClassroom('pixelClassroomCanvas', socket);
      pixelClassroom.bindVirtualDpad('pixelUp', 'pixelDown', 'pixelLeft', 'pixelRight');
    } else {
      pixelClassroom.stop();
    }
    pixelClassroom.init(data.user, data.allUsers);

    // Initialize Notice UI
    updateNoticeUI(currentNotice);
    restoreExistingPushSubscription().catch(error => {
      console.warn('Push 예약 복원 실패', error.message);
    });
  });

  /* ============================================================
     3. REAL-TIME USER EVENT LISTENERS
     ============================================================ */
  socket.on('user-joined', (data) => {
    renderCharacterGrid(data.allUsers);
    peerNames.set(data.user.id, data.user.username);
    pixelClassroom?.addRemoteUser(data.user);
    if (localMediaStream) createOfferFor(data.user.id);
  });

  socket.on('user-left', (data) => {
    renderCharacterGrid(data.allUsers);
    pixelClassroom?.removeRemoteUser(data.id);
    closePeer(data.id);
  });

  socket.on('pixel-user-moved', data => pixelClassroom?.updateRemoteUser(data));

  /* ============================================================
     4. RENDER YEOLPUMTA SCHOOL SERVER MEMBER CHARACTER CARDS
     ============================================================ */
  function renderCharacterGrid(users) {
    userCountText.textContent = users.length;
    characterGrid.innerHTML = '';

    users.forEach(u => {
      const isMe = u.id === currentUser.id;

      const card = document.createElement('div');
      card.className = `ypt-user-card ${isMe ? 'is-me' : ''}`;
      card.id = `character-card-${u.id}`;

      const roleIcon = u.role === 'teacher' ? '👩‍🏫' : u.role === 'president' ? '👑' : '🎒';

      const character = window.getLinkinCharacter
        ? window.getLinkinCharacter(u.character)
        : null;

      card.innerHTML = `
        <div class="ypt-character-space">
          <img class="ypt-character-sprite" src="${character ? character.image : ''}" alt="${character ? escapeHtml(character.name) : ''}" draggable="false">
          ${isMe ? '<span class="me-indicator-tag">나</span>' : ''}
        </div>
        <div class="ypt-username-box">
          <span class="role-icon-inline">${roleIcon}</span>
          <span class="username-text">${escapeHtml(u.username)}</span>
        </div>
      `;

      if (character) {
        card.style.setProperty('--character-color', character.color);
      }

      characterGrid.appendChild(card);
    });
  }

  /* ============================================================
     5. NOTICE BOARD (알림장) LOGIC
     ============================================================ */
  function updateNoticeUI(notice) {
    if (!notice) return;
    currentNotice = notice;

    noticeAuthorRole.textContent = notice.authorRole || '공지';
    noticeAuthorName.textContent = notice.authorName || '선생님';
    noticeTime.textContent = notice.updatedAt || '';
    noticeDisplayTitle.textContent = notice.title || '알림장';
    noticeDisplayContent.textContent = notice.content || '공지사항이 없습니다.';

    // Show Edit Button only for Teacher or Class President
    if (currentUser && (currentUser.role === 'teacher' || currentUser.role === 'president')) {
      btnToggleEditNotice.classList.remove('hidden');
    } else {
      btnToggleEditNotice.classList.add('hidden');
    }
  }

  btnOpenNotice.addEventListener('click', () => {
    noticeModal.classList.remove('hidden');
    noticeBadgeDot.classList.add('hidden');
  });

  btnCloseNotice.addEventListener('click', () => noticeModal.classList.add('hidden'));

  // Toggle Edit View
  btnToggleEditNotice.addEventListener('click', () => {
    noticeViewBox.classList.add('hidden');
    noticeEditorBox.classList.remove('hidden');

    if (currentNotice) {
      noticeTitleInput.value = currentNotice.title;
      noticeContentInput.value = currentNotice.content;
    }
  });

  btnCancelEditNotice.addEventListener('click', () => {
    noticeEditorBox.classList.add('hidden');
    noticeViewBox.classList.remove('hidden');
  });

  // Submit Notice Update
  noticeForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = noticeTitleInput.value;
    const content = noticeContentInput.value;

    socket.emit('update-notice', { title, content });

    noticeEditorBox.classList.add('hidden');
    noticeViewBox.classList.remove('hidden');
  });

  socket.on('notice-updated', (updatedNotice) => {
    updateNoticeUI(updatedNotice);
    noticeBadgeDot.classList.remove('hidden');
  });

  socket.on('notice-error', (err) => {
    alert(err.message || '알림장 작성 중 오류가 발생했습니다.');
  });

  const mediaButton = document.getElementById('btnToggleMedia');
  const mediaStatus = document.getElementById('mediaStatus');
  const videoGrid = document.getElementById('videoGrid');

  async function savePushSubscription(session, subscription) {
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ subscription })
    });
    if (!response.ok) throw new Error((await response.json()).error || '구독 저장 실패');
    return response.json();
  }

  async function restoreExistingPushSubscription() {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
    const { data } = await window.lockinSupabase.auth.getSession();
    if (!data.session) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const result = await savePushSubscription(data.session, subscription);
    if (result.restoredJobs) mediaStatus.textContent = `백그라운드 알림 ${result.restoredJobs}건을 복원했습니다.`;
  }

  document.getElementById('btnEnablePush').addEventListener('click', async () => {
    try {
      const { data } = await window.lockinSupabase.auth.getSession();
      if (!data.session) throw new Error('먼저 LOCK-IN 계정으로 로그인해주세요.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('알림 권한이 허용되지 않았습니다.');
      const registration = await navigator.serviceWorker.ready;
      const key = window.LOCKIN_CONFIG?.VAPID_PUBLIC_KEY;
      if (!key) throw new Error('서버 Push 공개키가 설정되지 않았습니다.');
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      await savePushSubscription(data.session, subscription);
      mediaStatus.textContent = '백그라운드 루틴 알림이 활성화되었습니다.';
    } catch (error) { mediaStatus.textContent = error.message; }
  });

  window.scheduleServerPushForTask = async (task, scheduledAt) => {
    const { data } = await window.lockinSupabase?.auth.getSession();
    if (!data?.session) return;
    await fetch('/api/push/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ taskId: task.id, title: '⏰ LOCK-IN 루틴 알람', body: `[${task.content}] 시작할 시간이에요!`, scheduledAt }) });
  };

  function urlBase64ToUint8Array(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  }
  mediaButton.addEventListener('click', async () => {
    if (localMediaStream) return stopMedia();
    try {
      let audioOnly = false;
      try {
        localMediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (error) {
        if (!['NotFoundError', 'OverconstrainedError'].includes(error.name)) throw error;
        localMediaStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        audioOnly = true;
      }
      addVideoTile('local', localMediaStream, '나', true);
      mediaButton.textContent = audioOnly ? '마이크 끄기' : '카메라·마이크 끄기';
      mediaStatus.textContent = audioOnly ? '카메라 없이 음성 교실에 연결되었습니다.' : '화상 교실에 연결되었습니다.';
      for (const userId of peerNames.keys()) if (userId !== socket.id) await createOfferFor(userId);
    } catch (error) {
      mediaStatus.textContent = `미디어를 시작하지 못했습니다: ${error.message}`;
    }
  });

  function ensurePeer(peerId) {
    if (peerConnections.has(peerId)) return peerConnections.get(peerId);
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    if (localMediaStream) localMediaStream.getTracks().forEach(track => peer.addTrack(track, localMediaStream));
    peer.onicecandidate = event => {
      if (event.candidate) socket.emit('webrtc-ice', { targetId: peerId, payload: event.candidate });
    };
    peer.ontrack = event => addVideoTile(peerId, event.streams[0], peerNames.get(peerId) || '학급 친구');
    peer.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) closePeer(peerId);
    };
    peerConnections.set(peerId, peer);
    return peer;
  }

  async function createOfferFor(peerId) {
    const peer = ensurePeer(peerId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('webrtc-offer', { targetId: peerId, payload: offer });
  }

  socket.on('webrtc-offer', async ({ fromId, payload }) => {
    const peer = ensurePeer(fromId);
    await peer.setRemoteDescription(payload);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit('webrtc-answer', { targetId: fromId, payload: answer });
  });
  socket.on('webrtc-answer', async ({ fromId, payload }) => ensurePeer(fromId).setRemoteDescription(payload));
  socket.on('webrtc-ice', async ({ fromId, payload }) => {
    try { await ensurePeer(fromId).addIceCandidate(payload); } catch (error) { console.warn('ICE candidate error', error); }
  });

  function addVideoTile(id, stream, label, muted = false) {
    let tile = document.getElementById(`video-${id}`);
    if (!tile) {
      tile = document.createElement('div'); tile.id = `video-${id}`; tile.className = 'video-tile';
      const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.muted = muted;
      const caption = document.createElement('span'); caption.className = 'video-label'; caption.textContent = label;
      tile.append(video, caption); videoGrid.appendChild(tile);
    }
    tile.querySelector('video').srcObject = stream;
  }

  function closePeer(peerId) {
    peerConnections.get(peerId)?.close(); peerConnections.delete(peerId);
    document.getElementById(`video-${peerId}`)?.remove(); peerNames.delete(peerId);
  }

  function stopMedia() {
    localMediaStream?.getTracks().forEach(track => track.stop()); localMediaStream = null;
    document.getElementById('video-local')?.remove();
    [...peerConnections.keys()].forEach(closePeer);
    mediaButton.textContent = '카메라·마이크 켜기'; mediaStatus.textContent = '카메라와 마이크가 꺼졌습니다.';
  }

  /* ============================================================
     6. SETTINGS MODAL & 30-DAY CLASS CHANGE RESTRICTION LOGIC
     ============================================================ */
  function updateSettingsInfo() {
    if (!currentUser) return;
    settingsRoomDetails.textContent = `${currentUser.school} ${currentUser.grade}학년 ${currentUser.classNum}반 (소속: ${userRoleBadge.textContent}) · 학급 변경 제한은 계정 기준으로 서버에서 확인됩니다.`;
  }

  btnOpenSettings.addEventListener('click', () => {
    updateSettingsInfo();
    settingsModal.classList.remove('hidden');
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  // Rejoin Class Button (Enforcing 30-Day Restriction with smooth UI feedback)
  btnRejoinClass.addEventListener('click', () => {
    // Switch back to login modal for class re-entry
    settingsModal.classList.add('hidden');
    appContainer.classList.add('hidden');
    loginModal.classList.remove('hidden');
  });

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }
});
