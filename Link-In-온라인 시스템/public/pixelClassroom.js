/* ============================================================
   Pixel Classroom Engine (Zombie High Style 2D Top-Down View)
   ============================================================ */

class PixelClassroom {
  constructor(canvasId, socket) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.socket = socket;

    this.width = this.canvas.width;
    this.height = this.canvas.height;

    this.myUser = null;
    this.remoteUsers = new Map(); // socketId -> userObj

    // Movement state
    this.keys = { up: false, down: false, left: false, right: false };
    this.speed = 3.5;
    this.animFrame = 0;
    this.lastMoveTime = 0;

    this.isRunning = false;

    this.initInputListeners();
  }

  bindVirtualDpad(upId, downId, leftId, rightId) {
    const bindBtn = (id, keyName) => {
      const btn = document.getElementById(id);
      if (!btn) return;

      const startAction = (e) => {
        e.preventDefault();
        this.keys[keyName] = true;
      };
      const stopAction = (e) => {
        e.preventDefault();
        this.keys[keyName] = false;
      };

      btn.addEventListener('mousedown', startAction);
      btn.addEventListener('mouseup', stopAction);
      btn.addEventListener('mouseleave', stopAction);

      btn.addEventListener('touchstart', startAction, { passive: false });
      btn.addEventListener('touchend', stopAction, { passive: false });
      btn.addEventListener('touchcancel', stopAction, { passive: false });
    };

    bindBtn(upId, 'up');
    bindBtn(downId, 'down');
    bindBtn(leftId, 'left');
    bindBtn(rightId, 'right');
  }

  init(myUserData, allUsers) {
    this.myUser = { ...myUserData };
    this.remoteUsers.clear();

    allUsers.forEach(u => {
      if (u.id !== this.myUser.id) {
        this.remoteUsers.set(u.id, u);
      }
    });

    this.isRunning = true;
    this.startLoop();
  }

  initInputListeners() {
    window.addEventListener('keydown', (e) => {
      if (!this.isRunning || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      let moved = false;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { this.keys.up = true; moved = true; }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { this.keys.down = true; moved = true; }
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { this.keys.left = true; moved = true; }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { this.keys.right = true; moved = true; }

      if (moved) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.keys.up = false;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.keys.down = false;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = false;
    });
  }

  updateMyPosition() {
    if (!this.myUser) return;

    let dx = 0;
    let dy = 0;

    if (this.keys.up) { dy -= this.speed; this.myUser.direction = 'up'; }
    if (this.keys.down) { dy += this.speed; this.myUser.direction = 'down'; }
    if (this.keys.left) { dx -= this.speed; this.myUser.direction = 'left'; }
    if (this.keys.right) { dx += this.speed; this.myUser.direction = 'right'; }

    const isMoving = (dx !== 0 || dy !== 0);
    this.myUser.isMoving = isMoving;

    if (isMoving) {
      // Classroom boundary collisions (bounds inside classroom floor)
      const nextX = Math.max(60, Math.min(this.width - 60, this.myUser.x + dx));
      const nextY = Math.max(160, Math.min(this.height - 60, this.myUser.y + dy));

      this.myUser.x = nextX;
      this.myUser.y = nextY;

      // Throttle network sync to ~30fps
      const now = Date.now();
      if (now - this.lastMoveTime > 30) {
        this.socket.emit('pixel-move', {
          x: this.myUser.x,
          y: this.myUser.y,
          direction: this.myUser.direction,
          isMoving: true
        });
        this.lastMoveTime = now;
      }
    }
  }

  updateRemoteUser(data) {
    if (this.remoteUsers.has(data.id)) {
      const u = this.remoteUsers.get(data.id);
      u.x = data.x;
      u.y = data.y;
      u.direction = data.direction;
      u.isMoving = data.isMoving;
    }
  }

  addRemoteUser(user) {
    this.remoteUsers.set(user.id, user);
  }

  removeRemoteUser(socketId) {
    this.remoteUsers.delete(socketId);
  }

  startLoop() {
    const loop = () => {
      if (!this.isRunning) return;

      this.animFrame++;
      this.updateMyPosition();
      this.render();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ============================================================
     RENDER METHOD: DRAW CLASSROOM & PIXEL CHARACTERS
     ============================================================ */
  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // 1. Draw Classroom Wooden Floor Tiles
    this.drawFloorTiles();

    // 2. Draw Classroom Front Wall & Blackboard
    this.drawFrontWall();

    // 3. Draw Desks & Classroom Props
    this.drawClassroomFurniture();

    // 4. Render All Player Characters (Sorted by Y for depth/isometric sorting)
    const allPlayers = [];
    if (this.myUser) allPlayers.push({ ...this.myUser, isMe: true });
    this.remoteUsers.forEach(u => allPlayers.push({ ...u, isMe: false }));

    allPlayers.sort((a, b) => a.y - b.y);

    allPlayers.forEach(p => this.drawPixelCharacter(p));
  }

  drawFloorTiles() {
    const tileSize = 40;
    for (let x = 0; x < this.width; x += tileSize) {
      for (let y = 140; y < this.height; y += tileSize) {
        const isAlt = ((x / tileSize) + (y / tileSize)) % 2 === 0;
        this.ctx.fillStyle = isAlt ? '#D4A373' : '#CCD5AE'; // Warm wooden floor look
        this.ctx.fillRect(x, y, tileSize, tileSize);

        // Subtle plank lines
        this.ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        this.ctx.strokeRect(x, y, tileSize, tileSize);
      }
    }
  }

  drawFrontWall() {
    // Wall Header
    this.ctx.fillStyle = '#4A5568';
    this.ctx.fillRect(0, 0, this.width, 140);

    // Blackboard (칠판)
    this.ctx.fillStyle = '#1A365D';
    this.ctx.fillRect(160, 15, 704, 100);
    this.ctx.lineWidth = 6;
    this.ctx.strokeStyle = '#8C6D46'; // Wooden frame
    this.ctx.strokeRect(160, 15, 704, 100);

    // Blackboard Chalk Text
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.font = '16px "Press Start 2P", cursive, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('🏫 WELCOME TO LINK-IN CLASSROOM', this.width / 2, 55);

    this.ctx.fillStyle = '#FEB2B2';
    this.ctx.font = '13px "Noto Sans KR", sans-serif';
    this.ctx.fillText('오늘의 목표: 친구들과 즐겁게 소통하고 알림장 확인하기!', this.width / 2, 88);

    // 태극기
    this.drawKoreanFlag(62, 38, 60, 40);

    // Teacher's Podium (교탁)
    this.ctx.fillStyle = '#A0522D';
    this.ctx.fillRect(this.width / 2 - 45, 125, 90, 35);
    this.ctx.fillStyle = '#8B4513';
    this.ctx.fillRect(this.width / 2 - 40, 120, 80, 10);
  }

  /**
   * 태극기를 그린다.
   * 규격: 가로세로 3:2, 태극 지름은 높이의 1/2,
   * 4괘는 건(왼쪽 위) · 감(오른쪽 위) · 리(왼쪽 아래) · 곤(오른쪽 아래).
   */
  drawKoreanFlag(x, y, width, height) {
    const ctx = this.ctx;
    const cx = x + width / 2;
    const cy = y + height / 2;

    // 흰 바탕
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    // 태극 문양 (지름 = 깃발 높이의 1/2)
    const radius = height / 4;
    // 깃발 대각선(3:2)만큼 반시계로 기울여 빨강이 왼쪽 위로 오게 한다
    const tilt = -Math.atan2(2, 3);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);

    ctx.fillStyle = '#CD2E3A';           // 양(陽) 빨강 — 위쪽
    ctx.beginPath();
    ctx.arc(0, 0, radius, Math.PI, 0);
    ctx.fill();

    ctx.fillStyle = '#0047A0';           // 음(陰) 파랑 — 아래쪽
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI);
    ctx.fill();

    // 두 개의 반지름 절반 원이 S자 경계를 만든다
    ctx.fillStyle = '#CD2E3A';
    ctx.beginPath();
    ctx.arc(-radius / 2, 0, radius / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0047A0';
    ctx.beginPath();
    ctx.arc(radius / 2, 0, radius / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 4괘. 네 괘 모두 위아래 대칭이라 막대 순서는 뒤집혀도 같다.
    const trigrams = [
      { dx: -1, dy: -1, bars: [true, true, true] },      // 건 ☰ 왼쪽 위
      { dx:  1, dy: -1, bars: [false, true, false] },    // 감 ☵ 오른쪽 위
      { dx: -1, dy:  1, bars: [true, false, true] },     // 리 ☲ 왼쪽 아래
      { dx:  1, dy:  1, bars: [false, false, false] }    // 곤 ☷ 오른쪽 아래
    ];

    const barLength = height * 0.30;
    const barThickness = Math.max(1, height * 0.058);
    const barGap = barThickness * 0.85;
    const offsetX = width * 0.315;
    const offsetY = height * 0.315;

    ctx.fillStyle = '#000000';
    trigrams.forEach(({ dx, dy, bars }) => {
      const tx = cx + dx * offsetX;
      const ty = cy + dy * offsetY;
      // 막대가 태극을 향하도록 반지름 방향에 수직으로 회전시킨다
      const angle = Math.atan2(dy * offsetY, dx * offsetX) + Math.PI / 2;

      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(angle);
      bars.forEach((isSolid, index) => {
        const barY = (index - 1) * (barThickness + barGap) - barThickness / 2;
        if (isSolid) {
          ctx.fillRect(-barLength / 2, barY, barLength, barThickness);
        } else {
          const segment = barLength * 0.4;
          ctx.fillRect(-barLength / 2, barY, segment, barThickness);
          ctx.fillRect(barLength / 2 - segment, barY, segment, barThickness);
        }
      });
      ctx.restore();
    });
  }

  drawClassroomFurniture() {
    // 2 Rows x 4 Columns Student Desks
    const deskCols = 4;
    const deskRows = 3;
    const startX = 140;
    const startY = 220;
    const gapX = 200;
    const gapY = 110;

    for (let r = 0; r < deskRows; r++) {
      for (let c = 0; c < deskCols; c++) {
        const x = startX + c * gapX;
        const y = startY + r * gapY;

        // Desk
        this.ctx.fillStyle = '#DEB887';
        this.ctx.fillRect(x, y, 70, 40);
        this.ctx.strokeStyle = '#8B4513';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, 70, 40);

        // Chair
        this.ctx.fillStyle = '#CD853F';
        this.ctx.fillRect(x + 15, y - 12, 40, 14);
      }
    }
  }

  /* Draw Zombie High Style 2D Pixel Character Sprite */
  drawPixelCharacter(player) {
    const { x, y, username, role, character: characterId, avatarColor, direction, isMoving, isMe } = player;
    const character = window.getLinkinCharacter ? window.getLinkinCharacter(characterId) : null;
    const themeColor = (character && character.color) || avatarColor || '#4A90E2';

    this.ctx.save();
    this.ctx.translate(x, y);

    // Indicator ring for 'Me'
    if (isMe) {
      this.ctx.beginPath();
      this.ctx.ellipse(0, 5, 20, 10, 0, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
      this.ctx.fill();
      this.ctx.strokeStyle = '#6366F1';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // Yellow indicator arrow
      const bounceY = Math.sin(this.animFrame * 0.15) * 4;
      this.ctx.fillStyle = '#F59E0B';
      this.ctx.beginPath();
      this.ctx.moveTo(0, -65 + bounceY);
      this.ctx.lineTo(-6, -73 + bounceY);
      this.ctx.lineTo(6, -73 + bounceY);
      this.ctx.closePath();
      this.ctx.fill();
    }

    // Shadow
    this.ctx.beginPath();
    this.ctx.ellipse(0, 8, 14, 6, 0, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fill();

    // Walking animation cycle
    const walkStep = isMoving ? Math.sin(this.animFrame * 0.25) * 4 : 0;
    // 걷는 동안 살짝 위아래로 통통 튀게 한다
    const hopY = isMoving ? Math.abs(Math.sin(this.animFrame * 0.25)) * -3 : 0;

    const sprite = window.getLinkinSprite ? window.getLinkinSprite(characterId) : null;
    const spriteReady = window.isLinkinSpriteReady ? window.isLinkinSpriteReady(sprite) : false;

    if (spriteReady) {
      const drawHeight = 52;
      const drawWidth = Math.max(1, Math.round(sprite.naturalWidth * (drawHeight / sprite.naturalHeight)));

      this.ctx.save();
      // 좌우 이동 시 바라보는 방향으로 뒤집는다
      if (direction === 'left') {
        this.ctx.scale(-1, 1);
      }
      this.ctx.drawImage(
        sprite,
        -drawWidth / 2,
        -drawHeight + 4 + hopY,
        drawWidth,
        drawHeight
      );
      this.ctx.restore();
    } else {
      // 스프라이트 로딩 전이거나 실패했을 때의 도형 폴백
      this.ctx.fillStyle = '#1E293B';
      this.ctx.fillRect(-8 + walkStep, -10, 6, 12);
      this.ctx.fillRect(2 - walkStep, -10, 6, 12);

      this.ctx.fillStyle = themeColor;
      this.ctx.fillRect(-12, -30, 24, 22);

      this.ctx.fillStyle = '#FFDFC4';
      this.ctx.fillRect(-14, -52, 28, 24);

      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(-7, -42, 4, 5);
      this.ctx.fillRect(3, -42, 4, 5);
    }

    // 역할 표시는 아래 이름표의 아이콘(👩‍🏫 / 👑 / 🎒)으로 대신한다.
    // 3D 스프라이트 위에 벡터 왕관을 덧그리면 이름표와 겹치고 재질도 겉돌아 제거했다.

    // Name tag & Role badge floating above character
    const roleIcon = role === 'teacher' ? '👩‍🏫' : role === 'president' ? '👑' : '🎒';
    const tagText = `${roleIcon} ${username}`;

    this.ctx.font = '700 12px "Noto Sans KR", sans-serif';
    const textWidth = this.ctx.measureText(tagText).width;

    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    this.ctx.fillRect(-textWidth / 2 - 6, -78, textWidth + 12, 20);
    this.ctx.strokeStyle = isMe ? '#6366F1' : themeColor;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(-textWidth / 2 - 6, -78, textWidth + 12, 20);

    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(tagText, 0, -64);

    this.ctx.restore();
  }

  stop() {
    this.isRunning = false;
  }
}

window.PixelClassroom = PixelClassroom;
