/* ============================================================
   LINK-IN 학급 캐릭터 카탈로그
   입장 선택 화면 / 구성원 목록 / 픽셀 교실이 모두 이 정의를 공유한다.
   서버(server.js)에도 동일한 ID 목록이 화이트리스트로 존재한다.
   두 곳을 함께 수정해야 한다.
   ============================================================ */
(function () {
  const CHARACTERS = [
    { id: 'red',    name: '빨강이', trait: '승부욕 만렙', color: '#D2544F', image: 'char_red.webp' },
    { id: 'orange', name: '주황이', trait: '엄지척 응원러', color: '#E4823C', image: 'char_orange.webp' },
    { id: 'yellow', name: '노랑이', trait: '해맑은 햇살', color: '#EFC33F', image: 'char_yellow.webp' },
    { id: 'green',  name: '초록이', trait: '차분한 모범생', color: '#4E7346', image: 'char_green.webp' },
    { id: 'blue',   name: '파랑이', trait: '안경 쓴 지식인', color: '#2F80B4', image: 'char_blue.webp' },
    { id: 'purple', name: '보라',   trait: '망토 두른 시크', color: '#9187AE', image: 'char_purple.webp' }
  ];

  const BY_ID = Object.create(null);
  CHARACTERS.forEach(character => { BY_ID[character.id] = character; });

  const DEFAULT_ID = CHARACTERS[0].id;

  // 이미지 캐시. 같은 스프라이트를 여러 번 내려받지 않는다.
  const spriteCache = Object.create(null);

  function getCharacter(id) {
    return BY_ID[id] || BY_ID[DEFAULT_ID];
  }

  /**
   * 스프라이트를 미리 불러와 캐시한다.
   * 캔버스는 매 프레임 그려야 하므로 동기적으로 즉시 쓸 수 있는
   * HTMLImageElement 를 돌려주고, 로딩 완료 여부는 .complete 로 판단한다.
   */
  function getSprite(id) {
    const character = getCharacter(id);
    if (spriteCache[character.id]) return spriteCache[character.id];

    const image = new Image();
    image.decoding = 'async';
    image.src = character.image;
    image.addEventListener('error', () => {
      // 파일이 없거나 로드 실패 시 도형 폴백으로 그리도록 표시해 둔다.
      image.dataset.failed = 'true';
      console.warn(`[characters] 스프라이트를 불러오지 못했습니다: ${character.image}`);
    });
    spriteCache[character.id] = image;
    return image;
  }

  function isSpriteReady(image) {
    return Boolean(image && image.complete && image.naturalWidth > 0 && image.dataset.failed !== 'true');
  }

  function preloadAll() {
    CHARACTERS.forEach(character => getSprite(character.id));
  }

  window.LINKIN_CHARACTERS = CHARACTERS;
  window.LINKIN_DEFAULT_CHARACTER = DEFAULT_ID;
  window.getLinkinCharacter = getCharacter;
  window.getLinkinSprite = getSprite;
  window.isLinkinSpriteReady = isSpriteReady;
  window.preloadLinkinCharacters = preloadAll;
})();
