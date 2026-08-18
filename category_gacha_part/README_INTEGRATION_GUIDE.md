# 🧩 카테고리 탭 & 3D 옷장 뽑기 애니메이션 병합(Merge) 가이드

이 폴더(`category_gacha_part`)는 기존 프로젝트 합치기 시 발생하던 타 기능(Supabase, IndexedDB, Gemini AI, 카메라 등)과의 의존성 오류를 해결하기 위해 **카테고리 탭**과 **3D 옷장 문 뽑기 애니메이션** 코드만 독립 추출하여 작성한 모듈입니다.

---

## 📁 폴더 구성
- `index.html` : 독립 동작 데모 화면 (카테고리 탭 + 뽑기 버튼 + 3D 옷장 모달 + 확률 모달)
- `style.css` : 카테고리 탭 스타일 및 3D 옷장 3D 회전, 등급별 빛 오라, 광채 폭발 CSS 키프레임
- `script.js` : 카테고리 필터링/가로 드래그 스크롤 및 3D 옷장 뽑기 애니메이션 단계별 제어 함수

---

## 🛠️ 내 프로젝트에 코드 병합하기 (3단계)

### 1단계: HTML 병합 (`index.html`)

#### (1) 카테고리 탭 영역 붙여넣기
상점이나 옷장 상단 원하는 위치에 아래 HTML 구조를 배치합니다.
```html
<div class="closet-category-tabs" id="shopCategoryTabs">
  <button class="closet-tab active" data-category="all">전체</button>
  <button class="closet-tab" data-category="top">스킨(상의)</button>
  <button class="closet-tab" data-category="bottom">하의</button>
  <button class="closet-tab" data-category="accessory">장신구</button>
  <button class="closet-tab" data-category="background">배경</button>
  <button class="closet-tab" data-category="title">칭호</button>
</div>
```

#### (2) 3D 뽑기 애니메이션 모달 붙여넣기
`</body>` 태그 바로 직전에 아래 모달 구조를 추가합니다.
```html
<!-- 3D 옷장 문 뽑기 애니메이션 모달 -->
<div class="gacha-modal" id="gachaModal" aria-hidden="true">
  <div class="gacha-container">
    <div class="closet-gacha-wrap" id="closetGachaWrap">
      <div class="closet-aura" id="closetAura"></div>
      <div class="closet-wardrobe" id="closetWardrobe">
        <div class="wardrobe-door door-left" id="doorLeft">
          <div class="door-handle"></div>
        </div>
        <div class="wardrobe-door door-right" id="doorRight">
          <div class="door-handle"></div>
        </div>
        <div class="wardrobe-interior" id="wardrobeInterior"></div>
      </div>
    </div>

    <div class="gacha-light" id="gachaLight"></div>

    <div class="gacha-result" id="gachaResult">
      <div class="gacha-item-icon" id="gachaItemIcon"></div>
      <div class="gacha-item-name" id="gachaItemName"></div>
      <div class="gacha-item-desc" id="gachaItemDesc"></div>
      <div class="gacha-btn-group">
        <button class="gacha-equip-btn" id="gachaEquipBtn" style="display: none;">✨ 바로 장착하기</button>
        <button class="gacha-close-btn" id="gachaCloseBtn">확인</button>
      </div>
    </div>
  </div>
</div>
```

---

### 2단계: CSS 병합 (`style.css`)

기존 프로젝트 CSS 끝부분에 `category_gacha_part/style.css`에 정의된 
- `.closet-category-tabs`
- `.closet-tab`
- `.gacha-modal`
- `.closet-wardrobe`
- `.wardrobe-door`
- `@keyframes gradeBump`
- `@keyframes lightBurst`

관련 스타일을 복사하여 붙여넣으세요.

---

### 3단계: JS 병합 (`script.js`)

#### (1) 카테고리 탭 클릭 & 가로 스크롤 이벤트
```javascript
// 카테고리 탭 클릭 시 필터링 처리
const closetTabs = document.querySelectorAll('.closet-tab');
closetTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    closetTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const category = tab.getAttribute('data-category');
    
    // 내 프로젝트의 그리드 리렌더링 함수 호출
    filterMyItemsByCategory(category);
  });
});
```

#### (2) 3D 뽑기 애니메이션 실행 함수 (`start3DGachaAnimation`)
내 뽑기 로직(API 또는 로컬 무작위 추첨)에서 뽑은 아이템 결과(`result`) 객체를 받아 아래 함수를 호출하세요.

```javascript
// result 예시: { name: '시그니처 수트', grade: 'Epic', icon: '👔', desc: '영웅 등급 아이템' }
start3DGachaAnimation(result);
```

##### 3D 뽑기 핵심 동작 원리:
1. `result.grade`에 따라 단계(`targetStep`) 계산 (Legendary=4, Epic=3, Rare=2, Common=1)
2. `STEP_INTERVAL`(600ms) 간격으로 옷장 덜컹 진동(`grade-bump`)과 함께 배경 오라 색상 업그레이드
3. 단계 완료 후 문 열림 (`closetWardrobe.classList.add('open')`)
4. 섬광 빛 폭발 (`gachaLight.classList.add('glowing-burst')`)
5. 결과 카드 팝업 (`gachaResult.classList.add('float-up')`)

---

## ⚡ 자주 발생하는 합치기 오류 FAQ

1. **오류: `Cannot read properties of null (reading 'addEventListener')`**
   - 원인: HTML에서 `id="luckyBoxBtn"`, `id="gachaModal"` 등 스크립트가 참조하는 ID 명칭이 불일치하거나 스크립트가 DOM 생성 전에 실행된 경우입니다.
   - 해결: `DOMContentLoaded` 내부에서 이벤트 리스너를 바인딩하거나 HTML 요소의 ID를 확인하세요.

2. **문 열리는 애니메이션이 어색하게 왜곡되어 보여요**
   - 원인: 부모 요소 `.closet-gacha-wrap`에 `perspective: 900px;` 속성이 누락되었거나 `transform-style: preserve-3d;`가 설정되지 않았기 때문입니다.

3. **연속으로 뽑을 때 문이 안 열리거나 오라가 안 바뀝니다**
   - 원인: 이전 클래스(`open`, `glowing-burst`, `float-up`)가 초기화되지 않았기 때문입니다.
   - 해결: `start3DGachaAnimation()` 시작 시점에 `className`을 기본값으로 초기화하고 `void gachaModal.offsetWidth;` (Force Reflow)를 호출해 주세요.
