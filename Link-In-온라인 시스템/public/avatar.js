// Avatar SVG Renderer based on Lock-in Sprout (Gatsaeng) png assets
class AvatarRenderer {
  constructor() {
    this.skins = {
      default: 'none',
      green: '#48bb78',
      purple: '#9f7aea',
      blue: '#00f2fe',
      gold: 'url(#gold-grad)'
    };
  }

  // Draw the SVG based on current state
  // state: { level: 0~3, skin: 'default'|'green'|..., items: [], interest: 'study'|'workout'|'none', isLazy: false }
  render(state) {
    const items = state.items || [];
    const interest = state.interest || 'none';
    const isLazy = state.isLazy || false;
    const level = state.level !== undefined ? state.level : 0;
    const activeSkin = state.skin || 'default';

    const skinColors = {
      green: [0.28, 0.73, 0.47],
      purple: [0.62, 0.48, 0.92],
      blue: [0.08, 0.78, 0.96],
      gold: [0.95, 0.65, 0.12]
    };
    const skinRgb = skinColors[activeSkin] || null;
    const luminance = [0.2126, 0.7152, 0.0722];
    const skinMatrix = skinRgb
      ? `${skinRgb.map(channel => luminance.map(weight => (channel * weight).toFixed(4)).join(' ') + ' 0 0').join(' ')} 0 0 0 1 0`
      : '';

    const skinRegions = [
      `
        <ellipse cx="100" cy="92" rx="31" ry="28" />
        <circle cx="84" cy="116" r="10" />
        <circle cx="116" cy="116" r="10" />
      `,
      `
        <ellipse cx="100" cy="88" rx="39" ry="35" />
        <ellipse cx="100" cy="125" rx="31" ry="35" />
        <circle cx="85" cy="112" r="10" />
        <circle cx="119" cy="112" r="10" />
        <ellipse cx="78" cy="151" rx="13" ry="10" />
        <ellipse cx="122" cy="151" rx="13" ry="10" />
      `,
      `
        <ellipse cx="100" cy="82" rx="43" ry="36" />
        <circle cx="57" cy="83" r="12" />
        <circle cx="143" cy="83" r="12" />
        <ellipse cx="91" cy="119" rx="15" ry="12" />
        <ellipse cx="114" cy="145" rx="18" ry="24" />
        <ellipse cx="78" cy="151" rx="14" ry="12" />
        <ellipse cx="132" cy="151" rx="14" ry="12" />
      `,
      `
        <ellipse cx="100" cy="116" rx="43" ry="59" />
        <path d="M 68 92 Q 48 84 34 68" stroke="white" stroke-width="24" fill="none" stroke-linecap="round" />
        <path d="M 132 92 Q 152 84 166 68" stroke="white" stroke-width="24" fill="none" stroke-linecap="round" />
        <circle cx="31" cy="65" r="13" />
        <circle cx="169" cy="65" r="13" />
        <ellipse cx="80" cy="162" rx="16" ry="13" />
        <ellipse cx="120" cy="162" rx="16" ry="13" />
      `
    ][Math.max(0, Math.min(3, level))];

    // Room backgrounds styling (Lock-in / Wise Theme Cabin)
    const activeRoom = items.find(id => id.startsWith('room_')) || 'room_classic';
    let woodStop1 = '#4e3327';
    let woodStop2 = '#342017';
    let floorFill = '#2d1a12';
    let floorStroke = '#1c0f0a';
    let windowFrame = '#8c7b70';
    let shelfFill = '#180e0a';

    if (activeRoom === 'room_forest') {
      woodStop1 = '#2b3e2b'; // deep forest wall
      woodStop2 = '#192619';
      floorFill = '#172217';
      floorStroke = '#0f170f';
      windowFrame = '#5b6b50';
      shelfFill = '#0d130d';
    } else if (activeRoom === 'room_vintage') {
      woodStop1 = '#484340'; // ash gray wood wall
      woodStop2 = '#2f2b29';
      floorFill = '#23201f';
      floorStroke = '#171514';
      windowFrame = '#8c837d';
      shelfFill = '#121110';
    }

    let svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
        <!-- Gradients Definitions -->
        <defs>
          <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffe259" />
            <stop offset="100%" stop-color="#ffa751" />
          </linearGradient>
          <linearGradient id="rainbow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ff007f" />
            <stop offset="50%" stop-color="#7b2cbf" />
            <stop offset="100%" stop-color="#00f2fe" />
          </linearGradient>
          <linearGradient id="halo-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(159, 232, 112, 0.85)" />
            <stop offset="100%" stop-color="rgba(22, 51, 0, 0)" />
          </linearGradient>
          <linearGradient id="coffee-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#8a5a44" />
            <stop offset="100%" stop-color="#46120a" />
          </linearGradient>
          <linearGradient id="goggle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#00f2fe" />
            <stop offset="100%" stop-color="#ff007f" />
          </linearGradient>
          <radialGradient id="fire-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(159, 232, 112, 0.5)" />
            <stop offset="100%" stop-color="rgba(159, 232, 112, 0)" />
          </radialGradient>
          <linearGradient id="wood-plank" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${woodStop1}" />
            <stop offset="100%" stop-color="${woodStop2}" />
          </linearGradient>
          <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="character-pop" x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#0e0f0c" flood-opacity="0.32" />
            <feComponentTransfer>
              <feFuncR type="linear" slope="1.08" intercept="0.01" />
              <feFuncG type="linear" slope="1.08" intercept="0.01" />
              <feFuncB type="linear" slope="1.08" intercept="0.01" />
            </feComponentTransfer>
          </filter>
          ${skinRgb ? `
          <filter id="skin-tint" x="-15%" y="-15%" width="130%" height="130%">
            <feColorMatrix type="matrix" values="${skinMatrix}" />
            <feComponentTransfer>
              <feFuncR type="gamma" amplitude="1.18" exponent="0.82" offset="0.03" />
              <feFuncG type="gamma" amplitude="1.12" exponent="0.88" offset="0.02" />
              <feFuncB type="gamma" amplitude="1.18" exponent="0.82" offset="0.03" />
            </feComponentTransfer>
          </filter>
          <clipPath id="skin-regions">
            ${skinRegions}
          </clipPath>
          ` : ''}
        </defs>

        <!-- 0. Wood Cabin Room Background (Lock-in/Wise Theme Cabin) -->
        <rect x="0" y="0" width="200" height="200" fill="url(#wood-plank)" />
        
        <!-- Plank joints -->
        <line x1="0" y1="30" x2="200" y2="30" stroke="${floorStroke}" stroke-width="1.5" opacity="0.8" />
        <line x1="0" y1="60" x2="200" y2="60" stroke="${floorStroke}" stroke-width="1.5" opacity="0.8" />
        <line x1="0" y1="90" x2="200" y2="90" stroke="${floorStroke}" stroke-width="1.5" opacity="0.8" />
        <line x1="0" y1="120" x2="200" y2="120" stroke="${floorStroke}" stroke-width="1.5" opacity="0.8" />
        <line x1="0" y1="150" x2="200" y2="150" stroke="${floorStroke}" stroke-width="1.5" opacity="0.8" />
        
        <!-- Cabin Window (circular) showing night sky -->
        <circle cx="150" cy="55" r="24" fill="#0f172a" stroke="${windowFrame}" stroke-width="3" />
        <circle cx="146" cy="46" r="3" fill="#fef08a" opacity="0.9" />
        <circle cx="162" cy="62" r="1.5" fill="#ffffff" opacity="0.7" />
        <circle cx="138" cy="60" r="1.5" fill="#ffffff" opacity="0.6" />
        
        <!-- Window panes cross -->
        <line x1="126" y1="55" x2="174" y2="55" stroke="${windowFrame}" stroke-width="1" opacity="0.7" />
        <line x1="150" y1="31" x2="150" y2="79" stroke="${windowFrame}" stroke-width="1" opacity="0.7" />

        <!-- Wooden Floor -->
        <rect x="0" y="150" width="200" height="50" fill="${floorFill}" />
        <line x1="0" y1="150" x2="200" y2="150" stroke="${floorStroke}" stroke-width="3.5" />
        <line x1="45" y1="150" x2="45" y2="200" stroke="${floorStroke}" stroke-width="1" opacity="0.7" />
        <line x1="95" y1="150" x2="95" y2="200" stroke="${floorStroke}" stroke-width="1" opacity="0.7" />
        <line x1="145" y1="150" x2="145" y2="200" stroke="${floorStroke}" stroke-width="1" opacity="0.7" />

        <!-- Warm Candle/Lantern Glow on table -->
        <circle cx="35" cy="115" r="35" fill="url(#fire-glow)" />
        <rect x="18" y="112" width="22" height="38" fill="${shelfFill}" rx="1" />
        <ellipse cx="29" cy="112" rx="11" ry="3" fill="${floorFill}" />
        <path d="M 23 112 L 23 98 Q 29 96 35 98 L 35 112 Z" fill="rgba(159, 232, 112, 0.25)" stroke="#163300" stroke-width="1" />
        <rect x="25" y="93" width="8" height="5" fill="${shelfFill}" rx="1" />
        <circle cx="29" cy="104" r="3.5" fill="#9fe870" filter="url(#neon-glow)" />
    `;

    // 1. Lazy Mode: Spider web in background
    if (isLazy) {
      svgContent += `
        <!-- Background Spider Web -->
        <g stroke="rgba(255,255,255,0.15)" stroke-width="1" fill="none">
          <path d="M 0 0 L 60 60 M 0 0 L 100 20 M 0 0 L 20 100" />
          <path d="M 20 5 A 30 30 0 0 1 5 20" />
          <path d="M 40 10 A 50 50 0 0 1 10 40" />
          <path d="M 60 15 A 70 70 0 0 1 15 60" />
        </g>
      `;
    }

    // 2. Level 3 (All Clear) special background: Green Halo
    if (level === 3 && !isLazy) {
      svgContent += `
        <!-- Cozy Level 3 Aura -->
        <circle cx="100" cy="100" r="75" fill="none" stroke="url(#halo-grad)" stroke-width="12" filter="url(#neon-glow)" opacity="0.6" />
        <circle cx="100" cy="50" r="25" fill="none" stroke="#9fe870" stroke-width="3" filter="url(#neon-glow)" stroke-dasharray="8 4" />
      `;
    }

    // 3. Sprout PNG Image Body Integration (mix-blend-mode: multiply transparent background)
    let sproutImg = 'sprout_stage1_cutout.webp'; // Sleeping
    // Each generated cutout has a different amount of transparent padding.
    // Normalize the visible character instead of giving every PNG one box.
    const stageFrames = [
      { x: 8, y: 5, size: 183 },   // visible body height ≈ 120
      { x: -14, y: -22, size: 229 }, // visible body height ≈ 125
      { x: 2, y: 0, size: 190 },   // visible body + book height ≈ 135
      { x: -14, y: -28, size: 226 }  // full-grown body height ≈ 145
    ];
    const stageAnchors = [
      { headY: 62, eyeY: 98, earY: 90, eyeLeftX: 84, eyeRightX: 116, headHalfWidth: 38, leftHandX: 88, leftHandY: 116, rightHandX: 112, rightHandY: 116 },
      { headY: 55, eyeY: 91, earY: 86, eyeLeftX: 83, eyeRightX: 117, headHalfWidth: 40, leftHandX: 85, leftHandY: 113, rightHandX: 119, rightHandY: 113 },
      { headY: 49, eyeY: 90, earY: 86, eyeLeftX: 84, eyeRightX: 116, headHalfWidth: 41, leftHandX: 84, leftHandY: 116, rightHandX: 121, rightHandY: 116 },
      { headY: 55, eyeY: 91, earY: 86, eyeLeftX: 84, eyeRightX: 116, headHalfWidth: 42, leftHandX: 52, leftHandY: 82, rightHandX: 148, rightHandY: 82 }
    ];
    const anchor = stageAnchors[Math.max(0, Math.min(3, level))];
    const frame = stageFrames[Math.max(0, Math.min(3, level))];

    if (level === 1) {
      sproutImg = 'sprout_stage2_cutout.webp';
    } else if (level === 2) {
      sproutImg = 'sprout_stage3_cutout.webp';
    } else if (level === 3) {
      sproutImg = 'sprout_stage4_cutout.webp';
    }

    svgContent += `
      <g id="character-body">
        <image href="${sproutImg}" x="${frame.x}" y="${frame.y}" width="${frame.size}" height="${frame.size}"
          preserveAspectRatio="xMidYMid meet" filter="url(#character-pop)" />
        ${skinRgb ? `
        <image href="${sproutImg}" x="${frame.x}" y="${frame.y}" width="${frame.size}" height="${frame.size}"
          preserveAspectRatio="xMidYMid meet" filter="url(#skin-tint)" clip-path="url(#skin-regions)" opacity="0.82" />
        ` : ''}
      </g>
    `;

    // 4. Default Persona Accessories (Glasses / Sweatband) - if level > 0
    if (level > 0) {
      if (interest === 'study') {
        svgContent += `
          <!-- Persona: Glasses -->
          <g id="persona-glasses" stroke="#4e443c" stroke-width="3" fill="none">
            <circle cx="82" cy="${anchor.eyeY}" r="13" />
            <circle cx="118" cy="${anchor.eyeY}" r="13" />
            <line x1="95" y1="${anchor.eyeY}" x2="105" y2="${anchor.eyeY}" />
            <path d="M 69 ${anchor.eyeY} Q 61 ${anchor.eyeY-5} 56 ${anchor.eyeY}" />
            <path d="M 131 ${anchor.eyeY} Q 139 ${anchor.eyeY-5} 144 ${anchor.eyeY}" />
          </g>
        `;
      } else if (interest === 'workout') {
        svgContent += `
          <!-- Persona: Sweatband -->
          <g id="persona-sweatband">
            <rect x="68" y="72" width="64" height="11" rx="3" fill="#ff5252" stroke="#1a202c" stroke-width="2" />
            <line x1="80" y1="72" x2="80" y2="83" stroke="#ffffff" stroke-width="2" />
            <line x1="92" y1="72" x2="92" y2="83" stroke="#ffffff" stroke-width="2" />
            <line x1="104" y1="72" x2="104" y2="83" stroke="#ffffff" stroke-width="2" />
            <line x1="116" y1="72" x2="116" y2="83" stroke="#ffffff" stroke-width="2" />
          </g>
        `;
      }
    }

    // 5. Lazy Mode: Lazy dark circles under eyes
    if (isLazy) {
      svgContent += `
        <!-- Lazy Mode: Dark Circles -->
        <path d="M ${anchor.eyeLeftX-6} ${anchor.eyeY+7} Q ${anchor.eyeLeftX} ${anchor.eyeY+11} ${anchor.eyeLeftX+6} ${anchor.eyeY+7}"
          stroke="#4b463f" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.42" />
        <path d="M ${anchor.eyeRightX-6} ${anchor.eyeY+7} Q ${anchor.eyeRightX} ${anchor.eyeY+11} ${anchor.eyeRightX+6} ${anchor.eyeY+7}"
          stroke="#4b463f" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.42" />
      `;
    }

    // 6. Shop OOTD Items Integration

    // 에어팟 맥스 (AirPods Max) - 머리 양옆 귀 위치
    const activeAirpods = items.find(id => id.startsWith('airpods'));
    if (activeAirpods && level > 0) {
      const bandLeft = 100 - anchor.headHalfWidth + 8;
      const bandRight = 100 + anchor.headHalfWidth - 8;
      const cupLeft = 100 - anchor.headHalfWidth - 4;
      const cupRight = 100 + anchor.headHalfWidth - 10;
      let headbandBack = 'none';
      let headbandStroke = '#ffffff';
      let cupFill = '#1a202c';
      let cupStroke = '#9fe870';
      let innerFill = 'url(#rainbow-grad)';
      
      if (activeAirpods === 'airpods_silver') {
        headbandStroke = '#cbd5e0';
        cupFill = '#a0aec0';
        cupStroke = '#4a5568';
        innerFill = '#cbd5e0';
      } else if (activeAirpods === 'airpods_green') {
        headbandStroke = '#9fe870';
        cupFill = '#163300';
        cupStroke = '#9fe870';
        innerFill = '#9fe870';
      } else if (activeAirpods === 'airpods_rainbow') {
        headbandBack = 'url(#rainbow-grad)';
        headbandStroke = '#ffffff';
        cupFill = '#1a202c';
        cupStroke = '#00f2fe';
        innerFill = 'url(#rainbow-grad)';
      }

      svgContent += `
        <!-- OOTD: AirPods Max -->
        <g id="item-airpods">
          <!-- Headband -->
          ${headbandBack !== 'none' ? `<path d="M ${bandLeft} ${anchor.earY-8} A ${anchor.headHalfWidth-8} ${anchor.headHalfWidth-8} 0 0 1 ${bandRight} ${anchor.earY-8}" fill="none" stroke="${headbandBack}" stroke-width="4" stroke-linecap="round" filter="url(#neon-glow)" />` : ''}
          <path d="M ${bandLeft} ${anchor.earY-8} A ${anchor.headHalfWidth-8} ${anchor.headHalfWidth-8} 0 0 1 ${bandRight} ${anchor.earY-8}" fill="none" stroke="${headbandStroke}" stroke-width="${headbandBack !== 'none' ? '1.8' : '3.5'}" stroke-linecap="round" />
          <!-- Ear cups -->
          <rect x="${cupLeft}" y="${anchor.earY-11}" width="14" height="22" rx="6" fill="${cupFill}" stroke="${cupStroke}" stroke-width="2" />
          <rect x="${cupRight}" y="${anchor.earY-11}" width="14" height="22" rx="6" fill="${cupFill}" stroke="${cupStroke}" stroke-width="2" />
          <rect x="${cupLeft+4}" y="${anchor.earY-6}" width="6" height="12" rx="3" fill="${innerFill}" />
          <rect x="${cupRight+4}" y="${anchor.earY-6}" width="6" height="12" rx="3" fill="${innerFill}" />
        </g>
      `;
    }

    // 갓생 아아 (Iced Coffee)
    const activeCoffee = items.find(id => id.startsWith('iced_coffee'));
    if (activeCoffee && level > 0) {
      const cx = level === 3 ? anchor.rightHandX : 160;
      const cy = level === 3 ? anchor.rightHandY - 2 : 124;
      
      let coffeeFill = 'url(#coffee-grad)';
      let strawStroke = '#9fe870';
      
      if (activeCoffee === 'iced_coffee_black') {
        coffeeFill = '#3e2723';
        strawStroke = '#ff6b00';
      } else if (activeCoffee === 'iced_coffee_pink') {
        coffeeFill = '#ff8da1';
        strawStroke = '#ff007f';
      } else if (activeCoffee === 'iced_coffee_galaxy') {
        coffeeFill = 'url(#rainbow-grad)';
        strawStroke = '#00f2fe';
      }

      svgContent += `
        <!-- OOTD: Iced Coffee -->
        <g id="item-iced-coffee">
          <path d="M ${cx-11} ${cy} L ${cx-7} ${cy+22} Q ${cx} ${cy+26} ${cx+7} ${cy+22} L ${cx+11} ${cy} Z" fill="rgba(255, 255, 255, 0.45)" stroke="#ffffff" stroke-width="1.5" />
          <path d="M ${cx-10} ${cy+4} L ${cx-6.5} ${cy+21} Q ${cx} ${cy+24} ${cx+6.5} ${cy+21} L ${cx+10} ${cy+4} Z" fill="${coffeeFill}" />
          <ellipse cx="${cx}" cy="${cy}" rx="12" ry="4" fill="rgba(255, 255, 255, 0.75)" stroke="#ffffff" stroke-width="1" />
          <line x1="${cx+2}" y1="${cy-9}" x2="${cx-2}" y2="${cy+9}" stroke="${strawStroke}" stroke-width="2.5" stroke-linecap="round" />
          <line x1="${cx+2}" y1="${cy-9}" x2="${cx+7}" y2="${cy-13}" stroke="${strawStroke}" stroke-width="2.5" stroke-linecap="round" />
        </g>
      `;
    }

    // 득근 아령 (Dumbbell)
    const activeDumbbell = items.find(id => id.startsWith('dumbbell'));
    if (activeDumbbell && level > 0) {
      const dx = level === 3 ? anchor.leftHandX : 35;
      const dy = level === 3 ? anchor.leftHandY : 137;
      
      let plate1Fill = '#2d3748';
      let plate2Fill = '#1a202c';
      let barFill = '#cbd5e0';
      
      if (activeDumbbell === 'dumbbell_iron') {
        plate1Fill = '#4a5568';
        plate2Fill = '#2d3748';
        barFill = '#cbd5e0';
      } else if (activeDumbbell === 'dumbbell_purple') {
        plate1Fill = '#7b2cbf';
        plate2Fill = '#3c096c';
        barFill = '#9d4edd';
      } else if (activeDumbbell === 'dumbbell_gold') {
        plate1Fill = 'url(#gold-grad)';
        plate2Fill = '#ffa751';
        barFill = '#ffe259';
      }

      svgContent += `
        <!-- OOTD: Dumbbell -->
        <g id="item-dumbbell">
          <rect x="${dx-16}" y="${dy-3}" width="32" height="6" rx="2" fill="${barFill}" stroke="#1a202c" stroke-width="1.2" />
          <rect x="${dx-22}" y="${dy-14}" width="8" height="28" rx="4" fill="${plate1Fill}" stroke="#1a202c" stroke-width="2" />
          <rect x="${dx-12}" y="${dy-10}" width="6" height="20" rx="3" fill="${plate2Fill}" />
          <rect x="${dx+14}" y="${dy-14}" width="8" height="28" rx="4" fill="${plate1Fill}" stroke="#1a202c" stroke-width="2" />
          <rect x="${dx+6}" y="${dy-10}" width="6" height="20" rx="3" fill="${plate2Fill}" />
        </g>
      `;
    }

    // 땀밴드/안경 아이템 (OOTD)
    if (items.includes('sweatband') && level > 0) {
      svgContent += `
        <!-- OOTD: Sweatband -->
        <g id="ootd-sweatband">
          <rect x="68" y="${anchor.headY+6}" width="64" height="11" rx="3" fill="#9fe870" stroke="#163300" stroke-width="2" />
          <line x1="80" y1="${anchor.headY+6}" x2="80" y2="${anchor.headY+17}" stroke="#163300" stroke-width="2" />
          <line x1="92" y1="${anchor.headY+6}" x2="92" y2="${anchor.headY+17}" stroke="#163300" stroke-width="2" />
          <line x1="104" y1="${anchor.headY+6}" x2="104" y2="${anchor.headY+17}" stroke="#163300" stroke-width="2" />
          <line x1="116" y1="${anchor.headY+6}" x2="116" y2="${anchor.headY+17}" stroke="#163300" stroke-width="2" />
        </g>
      `;
    }

    if (items.includes('glasses') && level > 0) {
      svgContent += `
        <!-- OOTD: Glasses -->
        <g id="ootd-glasses" stroke="#163300" stroke-width="3" fill="none">
          <circle cx="82" cy="${anchor.eyeY}" r="13" />
          <circle cx="118" cy="${anchor.eyeY}" r="13" />
          <line x1="95" y1="${anchor.eyeY}" x2="105" y2="${anchor.eyeY}" />
          <path d="M 69 ${anchor.eyeY} Q 61 ${anchor.eyeY-5} 56 ${anchor.eyeY}" />
          <path d="M 131 ${anchor.eyeY} Q 139 ${anchor.eyeY-5} 144 ${anchor.eyeY}" />
        </g>
      `;
    }

    // 금빛 왕관 (Aurora Crown) - 머리 위
    if (items.includes('crown') && level > 0) {
      const cy_y = anchor.headY;
      svgContent += `
        <!-- OOTD: Aurora Crown -->
        <g id="item-crown" filter="url(#neon-glow)">
          <path d="M 75 ${cy_y} L 82 ${cy_y-18} L 92 ${cy_y-8} L 100 ${cy_y-24} L 108 ${cy_y-8} L 118 ${cy_y-18} L 125 ${cy_y} Z" fill="url(#gold-grad)" stroke="#d35400" stroke-width="1.5" />
          <rect x="73" y="${cy_y}" width="54" height="4" rx="1" fill="#ffa751" stroke="#d35400" stroke-width="1" />
          <circle cx="82" cy="${cy_y-18}" r="2" fill="#ff007f" />
          <circle cx="100" cy="${cy_y-24}" r="2.5" fill="#00f2fe" />
          <circle cx="118" cy="${cy_y-18}" r="2" fill="#ff007f" />
        </g>
      `;
    }

    // 사이버 고글 (Retro Sunglasses) - 눈 위
    if (items.includes('goggles') && level > 0) {
      const gy = anchor.eyeY;
      svgContent += `
        <!-- OOTD: Retro Goggles -->
        <g id="item-goggles" filter="url(#neon-glow)">
          <rect x="60" y="${gy-8}" width="80" height="20" rx="6" fill="url(#goggle-grad)" stroke="#ffffff" stroke-width="1.5" opacity="0.9" />
          <path d="M 60 ${gy} L 140 ${gy}" stroke="#ffffff" stroke-width="1" stroke-dasharray="4 2" />
          <line x1="68" y1="${gy-8}" x2="132" y2="${gy-8}" stroke="#00f2fe" stroke-width="2" />
          <circle cx="72" cy="${gy+2}" r="3.5" fill="#ffffff" />
          <circle cx="128" cy="${gy+2}" r="3.5" fill="#ffffff" />
        </g>
      `;
    }

    svgContent += `</svg>`;
    return svgContent;
  }
}

// Instantiate globally
window.avatarRenderer = new AvatarRenderer();
