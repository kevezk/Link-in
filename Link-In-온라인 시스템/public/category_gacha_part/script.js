// ==========================================================================
// Category Tabs & 3D Closet Gacha Animation Script
// ==========================================================================

// 1. Mock Item Catalog for Category Filtering & Gacha Pool
const MOCK_ITEMS = [
  { id: 'top_hoodie', name: '갓생 후드티', category: 'top', grade: 'Common', icon: '🧥', desc: '편안한 기본 후드티 스킨' },
  { id: 'top_suit', name: '시그니처 수트', category: 'top', grade: 'Epic', icon: '👔', desc: '격식 있는 깔끔한 수트 스킨' },
  { id: 'bottom_jeans', name: '청바지', category: 'bottom', grade: 'Common', icon: '👖', desc: '데일리의 정석 청바지' },
  { id: 'bottom_skirt', name: '테니스 스커트', category: 'bottom', grade: 'Rare', icon: '👗', desc: '활동성 높은 스커트' },
  { id: 'acc_airpods', name: '에어팟 프로', category: 'accessory', grade: 'Rare', icon: '🎧', desc: '집중력을 높여주는 헤드셋' },
  { id: 'acc_crown', name: '황금 왕관', category: 'accessory', grade: 'Legendary', icon: '👑', desc: '열정적인 갓생의 상징 왕관' },
  { id: 'bg_sunset', name: '노을 캠퍼스', category: 'background', grade: 'Epic', icon: '🌅', desc: '따스한 노을빛 배경' },
  { id: 'bg_space', name: '우주 은하수', category: 'background', grade: 'Legendary', icon: '🌌', desc: '신비로운 은하수 배경' },
  { id: 'title_master', name: '갓생 마스터', category: 'title', grade: 'Epic', icon: '🏅', desc: '목표 달성율 100% 칭호' }
];

let userCoins = 10;
let currentCategory = 'all';

// DOM Elements Initialization
document.addEventListener('DOMContentLoaded', () => {
  initCategoryTabs();
  renderItemsGrid();
  initGachaModal();
  initProbModal();
});

// ==========================================================================
// 2. 카테고리 탭 구현 (클릭 / 가로 스크롤 / 마우스 드래그)
// ==========================================================================
function initCategoryTabs() {
  const closetTabs = document.querySelectorAll('.closet-tab');
  const tabsContainer = document.getElementById('shopCategoryTabs');

  // 2-1. 카테고리 버튼 클릭 이벤트
  closetTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      closetTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      currentCategory = tab.getAttribute('data-category');
      renderItemsGrid();
    });
  });

  // 2-2. PC 마우스 드래그 & 휠 가로 스크롤
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

// 3. 아이템 그리드 렌더링 (카테고리 필터링 적용)
function renderItemsGrid() {
  const grid = document.getElementById('itemsGrid');
  if (!grid) return;

  const filtered = MOCK_ITEMS.filter(item => {
    if (currentCategory === 'all') return true;
    return item.category === currentCategory;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">해당 카테고리에 아이템이 없습니다.</div>';
    return;
  }

  grid.innerHTML = filtered.map(item => `
    <div class="item-card">
      <div class="item-icon">${item.icon}</div>
      <div class="item-name">${item.name}</div>
      <span class="item-badge tag-${item.grade.toLowerCase()}">${getGradeKr(item.grade)}</span>
    </div>
  `).join('');
}

function getGradeKr(grade) {
  switch (grade) {
    case 'Legendary': return '전설';
    case 'Epic': return '영웅';
    case 'Rare': return '희귀';
    default: return '일반';
  }
}

// ==========================================================================
// 4. 3D 옷장 문 뽑기 애니메이션 (Gacha Animation Core)
// ==========================================================================
function initGachaModal() {
  const drawBtn = document.getElementById('luckyBoxBtn');
  const closeBtn = document.getElementById('gachaCloseBtn');

  if (drawBtn) {
    drawBtn.addEventListener('click', () => triggerLuckyBox());
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeGachaModal());
  }
}

// 4-1. 뽑기 실행 함수
function triggerLuckyBox() {
  if (userCoins < 2) {
    alert('코인이 부족합니다! (필요: 2코인)');
    return;
  }

  userCoins -= 2;
  document.getElementById('coinCount').textContent = userCoins;

  // 가상의 등급 결정 (뽑기 로직)
  const result = drawRandomItem();

  // 3D 연출 실행
  start3DGachaAnimation(result);
}

// 무작위 확률 뽑기 예시 함수
function drawRandomItem() {
  const rand = Math.random() * 100;
  let targetGrade = 'Common';
  if (rand < 5) targetGrade = 'Legendary';       // 5%
  else if (rand < 20) targetGrade = 'Epic';       // 15%
  else if (rand < 50) targetGrade = 'Rare';       // 30%
  else targetGrade = 'Common';                   // 50%

  const candidates = MOCK_ITEMS.filter(i => i.grade === targetGrade);
  const picked = candidates[Math.floor(Math.random() * candidates.length)] || MOCK_ITEMS[0];

  return picked;
}

// 4-2. 3D 옷장 문 뽑기 애니메이션 핵심 엔진
function start3DGachaAnimation(result) {
  const gachaModal = document.getElementById('gachaModal');
  const closetWardrobe = document.getElementById('closetWardrobe');
  const closetAura = document.getElementById('closetAura');
  const gachaLight = document.getElementById('gachaLight');
  const gachaResult = document.getElementById('gachaResult');
  const icon = document.getElementById('gachaItemIcon');
  const name = document.getElementById('gachaItemName');
  const desc = document.getElementById('gachaItemDesc');

  // 등급별 애니메이션 단계 설정
  let targetStep = 1;
  let finalColor = '#94a3b8';

  if (result.grade === 'Legendary') {
    targetStep = 4; finalColor = '#f59e0b';
  } else if (result.grade === 'Epic') {
    targetStep = 3; finalColor = '#a855f7';
  } else if (result.grade === 'Rare') {
    targetStep = 2; finalColor = '#3b82f6';
  }

  // 초기화
  if (closetWardrobe) closetWardrobe.className = 'closet-wardrobe';
  if (closetAura) closetAura.className = 'closet-aura';
  gachaLight.classList.remove('glowing-burst');
  gachaResult.classList.remove('float-up');
  gachaModal.style.display = 'flex';
  void gachaModal.offsetWidth; // Force Reflow
  gachaModal.classList.add('show');
  gachaLight.style.color = finalColor;

  icon.textContent = '';
  name.textContent = '';
  desc.textContent = '';

  // 옷장 흔들림(진동) 함수
  const triggerImpactShake = () => {
    if (!closetWardrobe) return;
    closetWardrobe.classList.remove('grade-bump');
    void closetWardrobe.offsetWidth; // Force Reflow
    closetWardrobe.classList.add('grade-bump');
  };

  const STEP_INTERVAL = 600; // 단계별 오라 승급 간격 (밀리초)

  // Step 1: 일반 등급 회색 오라 + 덜컹
  closetAura.className = 'closet-aura step-common';
  triggerImpactShake();

  // Step 2: 희귀 등급 이상일 경우 푸른 오라로 승급
  if (targetStep >= 2) {
    setTimeout(() => {
      closetAura.className = 'closet-aura step-rare';
      triggerImpactShake();
    }, STEP_INTERVAL);
  }

  // Step 3: 영웅 등급 이상일 경우 보라 오라로 승급
  if (targetStep >= 3) {
    setTimeout(() => {
      closetAura.className = 'closet-aura step-epic';
      triggerImpactShake();
    }, STEP_INTERVAL * 2);
  }

  // Step 4: 전설 등급일 경우 황금 오라로 승급
  if (targetStep >= 4) {
    setTimeout(() => {
      closetAura.className = 'closet-aura step-legendary';
      triggerImpactShake();
    }, STEP_INTERVAL * 3);
  }

  // Step 5: 최종 문 개방 & 광채 폭발 & 카드 팝업
  const totalOpenDelay = targetStep * STEP_INTERVAL;
  setTimeout(() => {
    closetWardrobe.classList.remove('grade-bump');
    closetWardrobe.classList.add('open');
    gachaLight.classList.add('glowing-burst');

    setTimeout(() => {
      icon.textContent = result.icon;
      name.textContent = result.name;
      desc.textContent = `${getGradeKr(result.grade)} 등급 - ${result.desc}`;

      gachaResult.classList.add('float-up');
    }, 400);
  }, totalOpenDelay);
}

// 4-3. 모달 닫기
function closeGachaModal() {
  const modal = document.getElementById('gachaModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  }
}

// ==========================================================================
// 5. 확률 정보 모달
// ==========================================================================
function initProbModal() {
  const probBtn = document.getElementById('probInfoBtn');
  const closeBtn = document.getElementById('probCloseBtn');
  const probModal = document.getElementById('probModal');
  const tableBody = document.getElementById('probTableBody');

  if (probBtn) {
    probBtn.addEventListener('click', () => {
      if (tableBody) {
        tableBody.innerHTML = `
          <tr><td>전설 (Legendary)</td><td style="text-align: right; color: #f59e0b; font-weight:700;">5.0%</td></tr>
          <tr><td>영웅 (Epic)</td><td style="text-align: right; color: #a855f7; font-weight:700;">15.0%</td></tr>
          <tr><td>희귀 (Rare)</td><td style="text-align: right; color: #3b82f6; font-weight:700;">30.0%</td></tr>
          <tr><td>일반 (Common)</td><td style="text-align: right; color: #94a3b8; font-weight:700;">50.0%</td></tr>
        `;
      }
      probModal.classList.add('show');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      probModal.classList.remove('show');
    });
  }
}
