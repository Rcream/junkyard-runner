// ============================================================
// JUNKYARD RUNNER — Full Game
// ============================================================

const CFG = {
  W: 960, H: 540,
  GRAVITY: 0.55,
  JUMP_VEL: -10.5,
  MAX_SPEED: 4.5,
  ACCEL: 0.4,
  GROUND_FRIC: 0.82,
  AIR_FRIC: 0.94,
  MAX_FALL: 12,
  PW: 20, PH: 30,
  PLAT_H: 16,
  SW: 10, SH: 10,
  CRUMBLE_DELAY: 90,
  CRUMBLE_SHAKE: 30,
  CRUMBLE_RESPAWN: 180,
  INVINCIBLE: 90,
  SCROLL_BASE: 1.5,
  DIFF_INTERVAL: 1200,
  DIFF_STEP: 0.3,
  MAX_DIFF: 5,
  LEFT_DEATH: 60,
  CHUNK_W: 400,
};

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function rand(mn, mx) { return mn + Math.random() * (mx - mn); }
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

// ============================================================
// INPUT
// ============================================================
class Input {
  constructor() {
    this.keys = {};
    this.justPressed = {};
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space'].includes(e.key) || e.key.startsWith('Arrow')) {
        e.preventDefault();
      }
      if (!this.keys[e.key]) this.justPressed[e.key] = true;
      this.keys[e.key] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
    });
  }
  down(k) { return !!this.keys[k]; }
  pressed(k) { return !!this.justPressed[k]; }
  clearFrame() { this.justPressed = {}; }
}

// ============================================================
// CAMERA
// ============================================================
class Camera {
  constructor() {
    this.x = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.shakeTimer = 0;
    this.scrollSpeed = CFG.SCROLL_BASE;
    this.targetX = 0;
  }

  shake() { this.shakeTimer = 15; }

  update(player, dt) {
    const desiredX = player.x - CFG.W * 0.33;
    const target = Math.max(this.targetX, desiredX);
    this.x += (target - this.x) * 0.08 * clamp(dt, 0.5, 2);
    if (Math.abs(this.x - target) < 0.5) this.x = target;

    if (this.shakeTimer > 0) {
      this.shakeX = (Math.random() - 0.5) * 8;
      this.shakeY = (Math.random() - 0.5) * 8;
      this.shakeTimer -= dt;
      if (this.shakeTimer < 0) { this.shakeX = 0; this.shakeY = 0; }
    }
  }
}

// ============================================================
// PLAYER
// ============================================================
class Player {
  constructor() {
    this.x = 0; this.y = 0;
    this.w = CFG.PW; this.h = CFG.PH;
    this.vx = 0; this.vy = 0;
    this.grounded = false;
    this.groundPlat = null;
    this.facingRight = true;
    this.invTimer = 0;
    this.walkFrame = 0;
    this.alive = true;
  }

  reset(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.grounded = false; this.groundPlat = null;
    this.invTimer = 0; this.alive = true; this.walkFrame = 0;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  takeDamage() {
    if (this.invTimer > 0) return false;
    this.invTimer = CFG.INVINCIBLE;
    return true;
  }

  isInv() { return this.invTimer > 0; }

  update(input, platforms, dt) {
    if (!this.alive) return;
    if (this.invTimer > 0) this.invTimer -= dt;

    const doJump = this.grounded && (
      input.pressed(' ') || input.pressed('Space') ||
      input.pressed('ArrowUp') || input.pressed('w') || input.pressed('W') ||
      input.pressed('ArrowUp')
    );

    const n = Math.max(1, Math.ceil(dt * 1.5));
    const sdt = dt / n;

    let jumped = false;

    for (let s = 0; s < n; s++) {
      if (!jumped && s === 0 && doJump) {
        this.vy = CFG.JUMP_VEL;
        this.grounded = false; this.groundPlat = null;
        jumped = true;
      }

      if (input.down('ArrowLeft') || input.down('a') || input.down('A')) {
        this.vx -= CFG.ACCEL * sdt;
        this.facingRight = false;
      }
      if (input.down('ArrowRight') || input.down('d') || input.down('D')) {
        this.vx += CFG.ACCEL * sdt;
        this.facingRight = true;
      }

      const f = this.grounded ? CFG.GROUND_FRIC : CFG.AIR_FRIC;
      this.vx *= Math.pow(f, sdt);
      if (Math.abs(this.vx) > CFG.MAX_SPEED) this.vx = Math.sign(this.vx) * CFG.MAX_SPEED;

      this.vy += CFG.GRAVITY * sdt;
      if (this.vy > CFG.MAX_FALL) this.vy = CFG.MAX_FALL;

      const prevY = this.y;
      this.y += this.vy * sdt;
      this.grounded = false;
      this.groundPlat = null;

      for (const p of platforms) {
        if (p.broken || !p.active) continue;
        const hOverlap = this.x < p.x + p.w && this.x + this.w > p.x;
        if (!hOverlap) continue;

        const prevBot = prevY + this.h;
        const nowBot = this.y + this.h;
        const nowTop = this.y;

        if (this.vy >= 0 && prevBot <= p.y + 0.5 && nowBot >= p.y - 0.5 && nowBot <= p.y + 60) {
          this.y = p.y - this.h;
          this.vy = 0;
          this.grounded = true;
          this.groundPlat = p;
        } else if (this.vy <= 0 && prevY >= p.y + p.h - 0.5 && nowTop <= p.y + p.h + 0.5) {
          this.y = p.y + p.h;
          this.vy = 0;
        }
      }

      const prevX = this.x;
      this.x += this.vx * sdt;

      for (const p of platforms) {
        if (p.broken || !p.active) continue;
        if (aabb(this, p)) {
          if (this.vx >= 0 && prevX + this.w <= p.x + 0.5) {
            this.x = p.x - this.w;
          } else if (this.vx <= 0 && prevX >= p.x + p.w - 0.5) {
            this.x = p.x + p.w;
          }
          this.vx = 0;
        }
      }
    }

    if (Math.abs(this.vx) > 0.2) this.walkFrame += dt;
    else this.walkFrame = 0;
  }

  draw(ctx) {
    if (!this.alive) return;
    if (this.isInv() && Math.floor(Date.now() / 80) % 2 === 0) return;

    const x = this.x, y = this.y, w = this.w, h = this.h;

    ctx.save();
    if (!this.facingRight) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.translate(-x, -y);
    }

    // Treads
    ctx.fillStyle = '#2A2A2A';
    ctx.fillRect(x + 1, y + 22, 7, 8);
    ctx.fillRect(x + w - 8, y + 22, 7, 8);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, y + 22, 7, 8);
    ctx.strokeRect(x + w - 8, y + 22, 7, 8);

    // Tread bars (animated)
    const treadOff = Math.floor(this.walkFrame * 0.25) % 5;
    ctx.fillStyle = '#555';
    for (let b = 0; b < 2; b++) {
      const bx1 = x + 3 + ((b * 3 + treadOff) % 5);
      ctx.fillRect(bx1, y + 24, 2, 4);
    }
    for (let b = 0; b < 2; b++) {
      const bx2 = x + w - 6 + ((b * 3 + treadOff) % 5);
      ctx.fillRect(bx2, y + 24, 2, 4);
    }

    // Arms
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 14);
    ctx.lineTo(x - 1, y + 14);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 1, y + 14);
    ctx.lineTo(x - 3, y + 12);
    ctx.moveTo(x - 1, y + 14);
    ctx.lineTo(x - 3, y + 16);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w - 3, y + 14);
    ctx.lineTo(x + w + 1, y + 14);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w + 1, y + 14);
    ctx.lineTo(x + w + 3, y + 12);
    ctx.moveTo(x + w + 1, y + 14);
    ctx.lineTo(x + w + 3, y + 16);
    ctx.stroke();

    // Body
    ctx.fillStyle = '#4A4A4A';
    ctx.fillRect(x + 3, y + 8, w - 6, 14);

    // Rivets
    ctx.fillStyle = '#777';
    ctx.beginPath(); ctx.arc(x + 5, y + 10, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 5, y + 10, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 5, y + 19, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 5, y + 19, 1.5, 0, Math.PI * 2); ctx.fill();

    // Rust spots
    ctx.fillStyle = '#B7410E';
    ctx.fillRect(x + 7, y + 12, 3, 2);
    ctx.fillRect(x + 14, y + 16, 2, 3);

    // Neck
    ctx.fillStyle = '#4A4A4A';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 8, 3, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = '#555';
    ctx.fillRect(x + 5, y + 1, w - 10, 9);

    // Eye glow
    ctx.fillStyle = 'rgba(232, 184, 48, 0.25)';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 5, 7, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#E8B830';
    ctx.fillRect(x + w / 2 - 3, y + 3, 6, 4);

    // Antenna
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1.5;
    const antWobble = Math.sin(this.walkFrame * 0.15) * 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 1);
    ctx.lineTo(x + w / 2 + antWobble, y - 5);
    ctx.stroke();

    // Antenna tip (blinking)
    const tipOn = Math.floor(Date.now() / 300) % 2 === 0;
    ctx.fillStyle = tipOn ? '#E03030' : '#880000';
    ctx.beginPath();
    ctx.arc(x + w / 2 + antWobble, y - 5, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ============================================================
// BACKGROUND — Junkyard landscape with green sky
// ============================================================

function drawSkyAndClouds(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, 280);
  g.addColorStop(0, '#4A6B3A');
  g.addColorStop(1, '#3A5A2A');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 280);

  ctx.fillStyle = '#1A150E';
  ctx.fillRect(0, 280, W, H - 280);

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(120, 60, 80, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(160, 50, 60, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(540, 80, 90, 24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(570, 70, 55, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.beginPath(); ctx.ellipse(820, 45, 70, 20, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.beginPath(); ctx.ellipse(350, 110, 50, 14, 0, 0, Math.PI * 2); ctx.fill();
}

// ── Far layer helpers ──────────────────────────────────────
function farCar(ctx, x, y) {
  ctx.fillRect(x, y, 50, 13);
  ctx.fillRect(x + 12, y - 8, 20, 8);
}
function farFridge(ctx, x, y) {
  ctx.fillRect(x, y, 13, 26);
}

function drawFarJunkyard(ctx, worldX, W, H) {
  const SEG = 600, NUM = 8;
  const firstI = Math.floor((worldX - SEG) / SEG);
  const lastI = Math.ceil((worldX + W) / SEG);
  ctx.fillStyle = '#1A150E';

  for (let i = firstI; i <= lastI; i++) {
    const s = ((i % NUM) + NUM) % NUM;
    const bx = i * SEG - worldX;
    const by = H; // shorthand

    ctx.beginPath();
    ctx.moveTo(bx, by + 10);
    if (s < 2) {
      ctx.lineTo(bx + 80, by - 210); ctx.lineTo(bx + 180, by - 260);
      ctx.lineTo(bx + 280, by - 225); ctx.lineTo(bx + 380, by - 270);
      ctx.lineTo(bx + 460, by - 200); ctx.lineTo(bx + 540, by - 240);
    } else if (s < 4) {
      ctx.lineTo(bx + 60, by - 180); ctx.lineTo(bx + 160, by - 250);
      ctx.lineTo(bx + 260, by - 215); ctx.lineTo(bx + 360, by - 280);
      ctx.lineTo(bx + 440, by - 220); ctx.lineTo(bx + 560, by - 190);
    } else if (s < 6) {
      ctx.lineTo(bx + 100, by - 220); ctx.lineTo(bx + 200, by - 275);
      ctx.lineTo(bx + 300, by - 240); ctx.lineTo(bx + 400, by - 260);
      ctx.lineTo(bx + 480, by - 195); ctx.lineTo(bx + 560, by - 230);
    } else {
      ctx.lineTo(bx + 70, by - 190); ctx.lineTo(bx + 170, by - 265);
      ctx.lineTo(bx + 270, by - 230); ctx.lineTo(bx + 370, by - 285);
      ctx.lineTo(bx + 450, by - 210); ctx.lineTo(bx + 530, by - 255);
    }
    ctx.lineTo(bx + SEG, by + 10);
    ctx.closePath();
    ctx.fill();

    if (s % 2 === 0) {
      farCar(ctx, bx + 60,  by - 268);
      farCar(ctx, bx + 240, by - 240);
      farFridge(ctx, bx + 420, by - 265);
    } else if (s === 1 || s === 5) {
      farFridge(ctx, bx + 50, by - 255);
      farCar(ctx, bx + 180, by - 275);
      farCar(ctx, bx + 400, by - 230);
    } else {
      farCar(ctx, bx + 100, by - 260);
      farFridge(ctx, bx + 260, by - 245);
      farFridge(ctx, bx + 420, by - 215);
    }
  }
}

// ── Mid layer helpers ──────────────────────────────────────
function midCar(ctx, x, y, c) {
  ctx.fillStyle = c[0];
  ctx.fillRect(x, y, 50, 13);
  ctx.fillRect(x + 12, y - 9, 22, 9);
  ctx.fillStyle = c[1];
  ctx.fillRect(x + 15, y - 7, 7, 5);
  ctx.fillStyle = '#2A2A2A';
  ctx.fillRect(x + 7, y + 11, 5, 4);
  ctx.fillRect(x + 38, y + 11, 5, 4);
}
function midFridge(ctx, x, y) {
  ctx.fillStyle = '#8A8A8A';
  ctx.fillRect(x, y, 16, 36);
  ctx.fillStyle = '#7A7A7A';
  ctx.fillRect(x + 8, y + 2, 1, 32);
  ctx.fillRect(x + 11, y + 8, 2, 5);
}
function midMicro(ctx, x, y) {
  ctx.fillStyle = '#3A3A3A';
  ctx.fillRect(x, y, 24, 12);
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(x + 4, y + 2, 13, 8);
  ctx.fillStyle = '#555';
  ctx.beginPath(); ctx.arc(x + 19, y + 4, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 19, y + 8, 1.5, 0, Math.PI * 2); ctx.fill();
}
function midBeam(ctx, x, y) {
  ctx.fillStyle = '#4A3A2A';
  ctx.fillRect(x, y, 34, 4);
  ctx.fillRect(x + 4, y - 5, 4, 14);
  ctx.fillRect(x + 26, y - 5, 4, 14);
}
function midDrum(ctx, x, y) {
  ctx.fillStyle = '#3A3A3A';
  ctx.fillRect(x, y, 10, 15);
  ctx.fillStyle = '#2A2A2A';
  ctx.fillRect(x, y + 4, 10, 2);
  ctx.fillRect(x, y + 10, 10, 2);
}

function drawMidJunkyard(ctx, worldX, W, H) {
  const SEG = 500, NUM = 8;
  const firstI = Math.floor((worldX - SEG) / SEG);
  const lastI = Math.ceil((worldX + W) / SEG);
  const by = H;

  // Mound bases
  for (let i = firstI; i <= lastI; i++) {
    const s = ((i % NUM) + NUM) % NUM;
    const bx = i * SEG - worldX;

    ctx.fillStyle = '#2A2018';
    ctx.beginPath();
    ctx.moveTo(bx, by + 10);
    if (s % 3 === 0) {
      ctx.lineTo(bx + 80, by - 170); ctx.lineTo(bx + 200, by - 210);
      ctx.lineTo(bx + 320, by - 180); ctx.lineTo(bx + 450, by - 130);
    } else if (s % 3 === 1) {
      ctx.lineTo(bx + 100, by - 190); ctx.lineTo(bx + 240, by - 220);
      ctx.lineTo(bx + 360, by - 195); ctx.lineTo(bx + 470, by - 140);
    } else {
      ctx.lineTo(bx + 60, by - 150); ctx.lineTo(bx + 180, by - 200);
      ctx.lineTo(bx + 300, by - 215); ctx.lineTo(bx + 420, by - 170);
      ctx.lineTo(bx + 490, by - 120);
    }
    ctx.lineTo(bx + SEG, by + 10);
    ctx.closePath();
    ctx.fill();
  }

  const blue  = ['#3A4A5A', '#2A3A4A'];
  const red   = ['#6A3A3A', '#5A2A2A'];
  const grey  = ['#4A4A4A', '#3A3A3A'];

  for (let i = firstI; i <= lastI; i++) {
    const s = ((i % NUM) + NUM) % NUM;
    const bx = i * SEG - worldX;

    switch (s) {
      case 0:
        midCar(ctx, bx + 50, by - 195, blue);
        midFridge(ctx, bx + 200, by - 185);
        midDrum(ctx, bx + 300, by - 35);
        midDrum(ctx, bx + 315, by - 35);
        midBeam(ctx, bx + 370, by - 65);
        midCar(ctx, bx + 420, by - 125, grey);
        break;
      case 1:
        midCar(ctx, bx + 30, by - 170, red);
        midCar(ctx, bx + 180, by - 140, grey);
        midMicro(ctx, bx + 340, by - 200);
        midDrum(ctx, bx + 410, by - 30);
        midBeam(ctx, bx + 440, by - 95);
        break;
      case 2:
        midFridge(ctx, bx + 40, by - 190);
        midBeam(ctx, bx + 130, by - 55);
        midCar(ctx, bx + 200, by - 170, blue);
        midDrum(ctx, bx + 350, by - 35);
        midMicro(ctx, bx + 400, by - 110);
        break;
      case 3:
        midCar(ctx, bx + 70, by - 185, grey);
        midFridge(ctx, bx + 220, by - 205);
        midCar(ctx, bx + 360, by - 140, red);
        midDrum(ctx, bx + 460, by - 45);
        midDrum(ctx, bx + 475, by - 45);
        break;
      case 4:
        midCar(ctx, bx + 20, by - 155, blue);
        midCar(ctx, bx + 160, by - 180, red);
        midDrum(ctx, bx + 300, by - 30);
        midBeam(ctx, bx + 350, by - 85);
        midFridge(ctx, bx + 420, by - 125);
        break;
      case 5:
        midFridge(ctx, bx + 30, by - 210);
        midMicro(ctx, bx + 120, by - 190);
        midCar(ctx, bx + 200, by - 145, grey);
        midDrum(ctx, bx + 350, by - 25);
        midCar(ctx, bx + 400, by - 110, blue);
        break;
      case 6:
        midCar(ctx, bx + 60, by - 195, red);
        midBeam(ctx, bx + 200, by - 65);
        midFridge(ctx, bx + 250, by - 155);
        midDrum(ctx, bx + 380, by - 40);
        midDrum(ctx, bx + 395, by - 40);
        midMicro(ctx, bx + 440, by - 105);
        break;
      case 7:
        midBeam(ctx, bx + 30, by - 60);
        midCar(ctx, bx + 80, by - 165, blue);
        midCar(ctx, bx + 220, by - 140, red);
        midFridge(ctx, bx + 360, by - 180);
        midDrum(ctx, bx + 450, by - 50);
        break;
    }
  }

  const band = ctx.createLinearGradient(0, 300, 0, 450);
  band.addColorStop(0, 'rgba(0,0,0,0)');
  band.addColorStop(0.35, 'rgba(0,0,0,0.2)');
  band.addColorStop(0.65, 'rgba(0,0,0,0.2)');
  band.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 300, W, 150);
}

function drawForeJunkyard(ctx, worldX, W, H) {
  const SEG = 400, NUM = 6;
  const firstI = Math.floor((worldX - SEG) / SEG);
  const lastI = Math.ceil((worldX + W) / SEG);
  const by = H;

  for (let i = firstI; i <= lastI; i++) {
    const s = ((i % NUM) + NUM) % NUM;
    const bx = i * SEG - worldX;

    switch (s) {
      case 0:
        ctx.fillStyle = '#6A6A6A';
        ctx.fillRect(bx + 10, by - 72, 22, 72);
        ctx.fillStyle = '#5A5A5A';
        ctx.fillRect(bx + 10, by - 70, 22, 3);
        ctx.fillRect(bx + 21, by - 64, 2, 6);
        midDrum(ctx, bx + 60, by - 52);
        midDrum(ctx, bx + 75, by - 52);
        ctx.strokeStyle = '#2A2A2A';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(bx + 130, by); ctx.lineTo(bx + 140, by - 85); ctx.stroke();
        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx + 140, by - 85);
        ctx.quadraticCurveTo(bx + 175, by - 45, bx + 120, by - 15);
        ctx.stroke();
        break;
      case 1:
        ctx.fillStyle = '#4A3A2A';
        ctx.fillRect(bx + 20, by - 48, 60, 5);
        ctx.fillRect(bx + 28, by - 56, 5, 22);
        ctx.fillRect(bx + 67, by - 56, 5, 22);
        midDrum(ctx, bx + 120, by - 38);
        midDrum(ctx, bx + 135, by - 38);
        midDrum(ctx, bx + 150, by - 38);
        ctx.fillStyle = '#3A3A3A';
        ctx.fillRect(bx + 220, by - 32, 80, 16);
        ctx.fillStyle = '#2A2A2A';
        ctx.fillRect(bx + 220, by - 32, 80, 3);
        ctx.fillRect(bx + 220, by - 17, 80, 3);
        break;
      case 2:
        ctx.fillStyle = '#6A6A6A';
        ctx.fillRect(bx + 5, by - 62, 20, 62);
        ctx.fillStyle = '#5A5A5A';
        ctx.fillRect(bx + 5, by - 60, 20, 2);
        ctx.fillRect(bx + 16, by - 55, 2, 5);
        ctx.strokeStyle = '#4A3A2A';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(bx + 60, by); ctx.lineTo(bx + 100, by - 75); ctx.stroke();
        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx + 100, by - 75);
        ctx.quadraticCurveTo(bx + 130, by - 35, bx + 80, by - 8);
        ctx.stroke();
        break;
      case 3:
        midDrum(ctx, bx + 30, by - 38);
        midDrum(ctx, bx + 45, by - 38);
        midDrum(ctx, bx + 35, by - 55);
        ctx.fillStyle = '#3A4A5A';
        ctx.fillRect(bx + 80, by - 34, 55, 11);
        ctx.fillRect(bx + 95, by - 43, 22, 9);
        ctx.fillStyle = '#2A2A2A';
        ctx.fillRect(bx + 86, by - 24, 5, 4);
        ctx.fillRect(bx + 124, by - 24, 5, 4);
        break;
      case 4:
        ctx.fillStyle = '#4A3A2A';
        ctx.fillRect(bx + 10, by - 43, 75, 7);
        ctx.fillStyle = '#3A2A1A';
        ctx.fillRect(bx + 18, by - 52, 5, 24);
        ctx.fillRect(bx + 72, by - 52, 5, 24);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(bx + 35, by - 43);
        ctx.lineTo(bx + 32, by - 28); ctx.lineTo(bx + 39, by - 18); ctx.lineTo(bx + 35, by - 6);
        ctx.stroke();
        break;
      case 5:
        ctx.fillStyle = '#6A6A6A';
        ctx.fillRect(bx + 50, by - 66, 18, 66);
        ctx.fillStyle = '#5A5A5A';
        ctx.fillRect(bx + 50, by - 64, 18, 2);
        ctx.fillRect(bx + 60, by - 59, 2, 5);
        midDrum(ctx, bx + 10, by - 33);
        midDrum(ctx, bx + 25, by - 33);
        ctx.fillStyle = '#6A3A3A';
        ctx.fillRect(bx + 100, by - 28, 45, 11);
        ctx.fillRect(bx + 112, by - 36, 18, 8);
        ctx.fillStyle = '#2A2A2A';
        ctx.fillRect(bx + 105, by - 19, 5, 4);
        ctx.fillRect(bx + 135, by - 19, 5, 4);
        break;
    }
  }
}

function drawBg(ctx, cx, W, H) {
  drawSkyAndClouds(ctx, W, H);
  drawFarJunkyard(ctx, cx * 0.15, W, H);
  drawMidJunkyard(ctx, cx * 0.40, W, H);
  drawForeJunkyard(ctx, cx * 0.70, W, H);
}

// ============================================================
// LEVEL GENERATOR
// ============================================================
class LevelGen {
  constructor(game) {
    this.g = game;
    this.chunks = 0;
    this.lastX = -CFG.CHUNK_W;
    this.lastPlat = null;
  }

  update(camX) {
    if (camX + CFG.W > this.lastX + CFG.CHUNK_W * 0.5) {
      this.gen(this.lastX + CFG.CHUNK_W);
    }
  }

  gen(startX) {
    this.lastX = startX;
    this.chunks++;
    const g = this.g;
    const first = this.chunks === 1;
    const d = g.difficulty;

    if (first) {
      const p1 = { x: startX + 30, y: 470, w: 280, h: CFG.PLAT_H, type: 'static', broken: false, active: true, state: 'solid', timer: 0, shakeOff: 0, respawnT: 0 };
      g.platforms.push(p1);
      const p2 = { x: startX + 370, y: 400, w: 130, h: CFG.PLAT_H, type: 'static', broken: false, active: true, state: 'solid', timer: 0, shakeOff: 0, respawnT: 0 };
      g.platforms.push(p2);
      const p3 = { x: startX + 550, y: 450, w: 120, h: CFG.PLAT_H, type: 'static', broken: false, active: true, state: 'solid', timer: 0, shakeOff: 0, respawnT: 0 };
      g.platforms.push(p3);
      for (let i = 0; i < 5; i++) {
        g.scraps.push({ x: startX + 50 + i * 35, y: 458, w: CFG.SW, h: CFG.SH, col: false, bob: i * 0.5 });
      }
      g.scraps.push({ x: startX + 390, y: 388, w: CFG.SW, h: CFG.SH, col: false, bob: 0 });
      g.scraps.push({ x: startX + 570, y: 438, w: CFG.SW, h: CFG.SH, col: false, bob: 1 });
      this.lastPlat = p3;
      return;
    }

    const maxCount = 2 + (d < 2.5 ? (Math.random() < 0.5 ? 1 : 0) : 0);
    const held = [];
    const X_GAP_MIN = 40;
    const X_GAP_MAX = 150;
    const Y_DELTA_MAX = 80;
    const Y_DELTA_MIN = 15;
    const Y_MIN = 250;
    const Y_MAX = 470;

    for (let i = 0; i < maxCount; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        let px, py, pw;
        const prevRef = i === 0 ? (this.lastPlat || { x: startX, y: 440, w: 0 }) : held[held.length - 1];

        if (i === 0) {
          px = rand(startX + 30, startX + CFG.CHUNK_W - 100);
        } else {
          const xMin = prevRef.x + prevRef.w + X_GAP_MIN;
          const xMax = Math.min(prevRef.x + prevRef.w + X_GAP_MAX, startX + CFG.CHUNK_W - 50);
          if (xMin >= xMax) continue;
          px = rand(xMin, xMax);
        }
        pw = 60 + rand(0, 85);

        py = clamp(prevRef.y + rand(-Y_DELTA_MAX, Y_DELTA_MAX), Y_MIN, Y_MAX);
        if (Math.abs(py - prevRef.y) < Y_DELTA_MIN) {
          const dir = py >= prevRef.y ? 1 : -1;
          py = clamp(prevRef.y + dir * Y_DELTA_MIN, Y_MIN, Y_MAX);
        }
        if (px + pw > startX + CFG.CHUNK_W) continue;
        if (pw < 40) continue;

        const cand = { x: px, y: py, w: pw, h: CFG.PLAT_H };
        let overlap = false;
        for (const hp of held) {
          if (aabb(cand, hp)) { overlap = true; break; }
        }
        if (!overlap) {
          for (const ep of g.platforms) {
            if (ep.x + ep.w > startX - 40 && ep.x < startX + CFG.CHUNK_W + 40) {
              if (aabb(cand, ep)) { overlap = true; break; }
            }
          }
        }
        if (!overlap) {
          held.push(cand);
          placed = true;
          break;
        }
      }
    }

    if (held.length === 0) {
      held.push({ x: startX + 50, y: 440, w: 80, h: CFG.PLAT_H });
    }

    for (const p of held) {
      const crum = rand(0, 1) < 0.15 + d * 0.04;
      const mag = !crum && this.chunks > 2 && rand(0, 1) < 0.08 + d * 0.03;
      const fp = {
        x: p.x, y: p.y, w: p.w, h: CFG.PLAT_H,
        type: crum ? 'crumbling' : (mag ? 'magnet' : 'static'),
        broken: false, active: true,
        state: 'solid', timer: 0, shakeOff: 0, respawnT: 0,
        standFrames: 0
      };
      g.platforms.push(fp);

      for (let s = 0; s < 1 + Math.floor(rand(0, 2)); s++) {
        g.scraps.push({
          x: p.x + rand(10, p.w - 10), y: p.y - CFG.SH - 2,
          w: CFG.SW, h: CFG.SH, col: false, bob: rand(0, Math.PI * 2)
        });
      }
    }

    if (g.platforms.length > 0) this.lastPlat = g.platforms[g.platforms.length - 1];

    const py = held.length > 0 ? held[held.length - 1].y : 440;

    if (this.chunks > 3 && rand(0, 1) < 0.1 + d * 0.04) {
      const dir = rand(0, 1) < 0.5 ? 1 : -1;
      g.conveyors.push({
        x: startX + rand(30, CFG.CHUNK_W - 100), y: clamp(py + rand(-50, 20), 250, 460),
        w: 90 + rand(0, 40), h: CFG.PLAT_H, dir: dir, speed: 2 + rand(0, 1), active: true
      });
    }

    if (this.chunks > 4 && rand(0, 1) < 0.1 + d * 0.05) {
      g.hazards.push({
        x: startX + rand(50, CFG.CHUNK_W - 80), y: 350, w: 50, h: 30,
        minY: 260, maxY: 440, speed: 1.5 + rand(0, 2), phase: rand(0, Math.PI * 2)
      });
    }


  }

  reset() {
    this.chunks = 0;
    this.lastX = -CFG.CHUNK_W;
    this.lastPlat = null;
  }
}

// ============================================================
// UI
// ============================================================
function drawHeart(ctx, x, y, s, full) {
  ctx.fillStyle = full ? '#E03030' : '#444';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.5, y + s * 0.85);
  ctx.bezierCurveTo(x, y + s * 0.4, x - s * 0.25, y, x + s * 0.5, y + s * 0.15);
  ctx.bezierCurveTo(x + s * 1.25, y, x + s, y + s * 0.4, x + s * 0.5, y + s * 0.85);
  ctx.fill();
}

function drawHUD(ctx, g) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, CFG.W, 36);
  ctx.fillStyle = '#B7410E';
  ctx.fillRect(0, 34, CFG.W, 2);

  ctx.fillStyle = '#E8B830';
  ctx.font = 'bold 15px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('SCRAP: ' + g.score, 14, 18);

  ctx.textAlign = 'center';
  ctx.fillText('DIST: ' + Math.floor(g.dist) + 'm', CFG.W / 2, 18);
  ctx.textAlign = 'left';

  for (let i = 0; i < 3; i++) {
    drawHeart(ctx, CFG.W - 75 - i * 24, 8, 16, i < g.lives);
  }
}

function drawMenu(ctx, g) {
  drawBg(ctx, 0, CFG.W, CFG.H);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, CFG.W, CFG.H);

  ctx.save();
  ctx.textAlign = 'center';

  ctx.shadowColor = '#B7410E';
  ctx.shadowBlur = 25;
  ctx.fillStyle = '#C85A1A';
  ctx.font = 'bold 56px monospace';
  ctx.fillText('JUNKYARD RUNNER', CFG.W / 2, 150);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#9E9E9E';
  ctx.font = '13px monospace';
  ctx.fillText('SURVIVE THE COLLAPSE — COLLECT SCRAP — ESCAPE', CFG.W / 2, 190);

  if (g.highScore > 0) {
    ctx.fillStyle = '#E8B830';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('HIGH SCORE: ' + g.highScore, CFG.W / 2, 235);
  }

  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#E8B830';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('PRESS ENTER TO START', CFG.W / 2, 310);
  }

  ctx.fillStyle = '#888';
  ctx.font = '13px monospace';
  ctx.fillText('ARROWS / WASD — Move     SPACE / UP — Jump', CFG.W / 2, 375);
  ctx.fillText('Collect scrap. Avoid crushers. Dont fall behind.', CFG.W / 2, 395);
  ctx.fillText('Reach the end of the junkyard to escape!', CFG.W / 2, 415);

  ctx.restore();
}

function drawDeath(ctx, g) {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, CFG.W, CFG.H);

  ctx.save();
  ctx.textAlign = 'center';

  ctx.fillStyle = '#C85A1A';
  ctx.font = 'bold 44px monospace';
  ctx.shadowColor = '#B7410E';
  ctx.shadowBlur = 15;
  ctx.fillText('JUNKYARD CLAIMED ANOTHER', CFG.W / 2, 180);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#E8B830';
  ctx.font = 'bold 28px monospace';
  ctx.fillText('SCORE: ' + g.score, CFG.W / 2, 250);

  if (g.score >= g.highScore && g.score > 0) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('★ NEW HIGH SCORE! ★', CFG.W / 2, 285);
  } else if (g.highScore > 0) {
    ctx.fillStyle = '#999';
    ctx.font = '16px monospace';
    ctx.fillText('HIGH SCORE: ' + g.highScore, CFG.W / 2, 285);
  }

  ctx.fillStyle = '#AAA';
  ctx.font = '14px monospace';
  ctx.fillText('SCRAP: ' + g.totalScrap, CFG.W / 2, 325);
  ctx.fillText('DISTANCE: ' + Math.floor(g.dist) + 'm', CFG.W / 2, 345);

  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#E8B830';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('R — RESTART     ENTER — MENU', CFG.W / 2, 420);
  }

  ctx.restore();
}

// ============================================================
// GAME
// ============================================================
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = CFG.W;
    this.canvas.height = CFG.H;

    this.state = 'MENU';
    this.input = new Input();
    this.camera = new Camera();
    this.player = new Player();
    this.level = new LevelGen(this);

    this.platforms = [];
    this.hazards = [];
    this.scraps = [];
    this.conveyors = [];
    this.floatTexts = [];

    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('jr_highscore') || '0', 10);
    this.totalScrap = 0;
    this.dist = 0;
    this.lives = 3;
    this.difficulty = 1;
    this.gameTime = 0;
    this.diffTimer = 0;

    this.safeX = 0; this.safeY = 0; this.safePlat = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('click', () => this.canvas.focus());

    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    const s = Math.min(window.innerWidth / CFG.W, window.innerHeight / CFG.H);
    this.canvas.style.width = Math.floor(CFG.W * s) + 'px';
    this.canvas.style.height = Math.floor(CFG.H * s) + 'px';
  }

  start() {
    this.platforms = []; this.hazards = []; this.scraps = [];
    this.conveyors = []; this.floatTexts = [];
    this.score = 0; this.totalScrap = 0; this.dist = 0;
    this.lives = 3; this.difficulty = 1; this.gameTime = 0; this.diffTimer = 0;

    this.level.reset();
    this.camera = new Camera();
    this.camera.scrollSpeed = CFG.SCROLL_BASE;
    this.level.gen(0);

    const fp = this.platforms[0];
    if (fp) {
      this.player.reset(fp.x + fp.w / 2 - CFG.PW / 2, fp.y - CFG.PH);
      this.safeX = this.player.x; this.safeY = this.player.y;
      this.safePlat = fp;
    }

    this.state = 'PLAYING';
  }

  activePlats() {
    const r = [];
    for (const p of this.platforms) {
      if (!p.broken && p.active) r.push(p);
    }
    for (const c of this.conveyors) {
      if (c.active) { c.type = 'conveyor'; r.push(c); }
    }
    return r;
  }

  update(dt) {
    if (this.state === 'PLAYING') this.updateGame(dt);
  }

  updateGame(dt) {
    this.gameTime += dt;
    this.diffTimer += dt / 60;

    if (this.diffTimer >= 20) {
      this.diffTimer -= 20;
      this.difficulty = Math.min(CFG.MAX_DIFF, this.difficulty + CFG.DIFF_STEP);
      this.camera.scrollSpeed = CFG.SCROLL_BASE + (this.difficulty - 1) * 0.5;
    }

    const ap = this.activePlats();
    this.player.update(this.input, ap, dt);

    this.camera.targetX += this.camera.scrollSpeed * dt;
    this.camera.update(this.player, dt);

    this.dist += this.camera.scrollSpeed * dt * 0.1;

    this.level.update(this.camera.x);

    if (this.player.grounded && this.player.groundPlat) {
      const gp = this.player.groundPlat;
      if (gp.type !== 'conveyor' && (gp.type !== 'crumbling' || gp.state === 'solid')) {
        this.safeX = this.player.x;
        this.safeY = this.player.y;
        this.safePlat = gp;
      }
    }

    for (const p of this.platforms) {
      if (p.type === 'crumbling') this.tickCrumble(p);
    }

    for (const c of this.conveyors) {
      if (c.active && (this.player.groundPlat === c || aabb(this.player, c))) {
        this.player.vx += c.dir * c.speed * 0.05 * dt;
      }
    }

    for (const h of this.hazards) {
      const t = this.gameTime * 0.02 + h.phase;
      h.y = clamp(h.minY + (Math.sin(t) + 1) * 0.5 * (h.maxY - h.minY), h.minY, h.maxY);
    }

    const nearMagnets = [];
    for (const p of this.platforms) {
      if (p.type !== 'magnet' || p.broken || !p.active) continue;
      const pmx = p.x + p.w / 2;
      const pmy = p.y + p.h / 2;
      const pdx = this.player.x + this.player.w / 2 - pmx;
      const pdy = this.player.y + this.player.h / 2 - pmy;
      if (pdx * pdx + pdy * pdy < 62500) nearMagnets.push(p);
    }

    for (const s of this.scraps) {
      if (s.col) continue;
      s.drawY = s.y + Math.sin(this.gameTime * 0.05 + s.bob) * 2;

      if (aabb(this.player, { x: s.x, y: s.drawY, w: CFG.SW, h: CFG.SH })) {
        s.col = true;
        this.score += 10;
        this.totalScrap++;
        this.floatTexts.push({ x: s.x, y: s.drawY - 5, text: '+10', alpha: 1, vy: -1.5 });
      }

      for (const m of nearMagnets) {
        const px = this.player.x + this.player.w / 2;
        const py = this.player.y + this.player.h / 2;
        const dx = px - (s.x + s.w / 2);
        const dy = py - (s.drawY || s.y) - s.h / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200 && dist > 2) {
          s.x += (dx / dist) * 2.5;
          s.y += (dy / dist) * 2.5;
        }
      }
    }

    const deadBy = (msg) => {
      if (this.player.takeDamage()) {
        this.lives--;
        this.camera.shake();
        this.respawn();
        if (this.lives <= 0) {
          this.state = 'DEAD';
          this.player.alive = false;
          if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('jr_highscore', String(this.highScore));
          }
        }
      }
    };

    for (const h of this.hazards) {
      if (aabb(this.player, h)) { deadBy('crusher'); break; }
    }

    if (this.player.y > CFG.H + 100) {
      if (this.player.invTimer > 0) {
        this.respawn();
      } else {
        deadBy('fall');
      }
    }

    if (this.player.x < this.camera.x - CFG.LEFT_DEATH - 10) {
      deadBy('behind');
    }

    this.floatTexts = this.floatTexts.filter(t => {
      t.y += t.vy * dt;
      t.alpha -= 0.018 * dt;
      return t.alpha > 0;
    });

    const pruneX = this.camera.x - CFG.CHUNK_W * 1.5;
    this.platforms = this.platforms.filter(p => p.x + p.w > pruneX);
    this.hazards = this.hazards.filter(h => h.x + h.w > pruneX);
    this.scraps = this.scraps.filter(s => s.x > pruneX && !s.col);
    this.conveyors = this.conveyors.filter(c => c.x + c.w > pruneX);
  }

  tickCrumble(p) {
    if (p.broken) {
      p.respawnT--;
      if (p.respawnT <= 0) {
        p.broken = false; p.active = true;
        p.state = 'solid'; p.timer = 0; p.shakeOff = 0; p.standFrames = 0;
      }
      return;
    }

    const onIt = this.player.groundPlat === p && this.player.grounded;

    if (onIt) p.standFrames++;

    if (p.state === 'solid' && onIt) {
      p.state = 'activated';
      p.timer = CFG.CRUMBLE_DELAY;
    }

    if (p.state === 'activated') {
      p.timer -= onIt ? 1 : 0.5;
      if (p.timer <= 0) {
        p.state = 'shaking';
        p.timer = CFG.CRUMBLE_SHAKE;
      }
    }

    if (p.state === 'shaking') {
      p.shakeOff = (Math.random() - 0.5) * 4;
      p.timer--;
      if (p.timer <= 0) {
        p.broken = true; p.active = false;
        p.shakeOff = 0;
        p.respawnT = CFG.CRUMBLE_RESPAWN;
      }
    }
  }

  respawn() {
    const sp = this.safePlat;
    if (sp && !sp.broken && sp.active && sp.x + sp.w > this.camera.x - 50) {
      this.player.x = sp.x + sp.w / 2 - CFG.PW / 2;
      this.player.y = sp.y - CFG.PH;
    } else {
      const fb = this.platforms.find(p => !p.broken && p.active && p.x + p.w > this.camera.x);
      if (fb) {
        this.player.x = fb.x + fb.w / 2 - CFG.PW / 2;
        this.player.y = fb.y - CFG.PH;
      } else {
        this.player.y = CFG.H - 150;
        this.player.x = this.camera.x + 100;
      }
    }
    this.player.vx = 0; this.player.vy = 0;
  }

  drawCrumblingPlatform(p, ctx, gameTime) {
    const w = p.w, h = p.h, x = p.x, y = p.y;

    if (p.broken) {
      const prog = Math.min(1, p.respawnT / CFG.CRUMBLE_RESPAWN);
      if (prog < 0.3) return;
      ctx.strokeStyle = `rgba(80, 40, 20, ${prog * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      let rx = x + w;
      for (let n = 0; n < 5; n++) {
        const nx = rx - w / 5;
        ctx.lineTo(nx, y + h - ((n + 1) % 2) * 4);
        rx = nx;
      }
      ctx.closePath();
      ctx.stroke();
      return;
    }

    const seed = x * 0.13;
    let color, cracks, nd, bolts, rusts;
    if (p.state === 'solid') {
      color = '#6B3A1A'; cracks = 2;
      nd = [3, 5, 2, 4]; bolts = 2; rusts = 0;
    } else if (p.state === 'activated') {
      color = '#8B3A1A'; cracks = 4;
      nd = [6, 4, 8, 5, 7, 3]; bolts = 3; rusts = 2;
    } else {
      color = '#B7410E'; cracks = 6;
      nd = [10, 5, 12, 7, 9, 4, 11, 6]; bolts = 3; rusts = 4;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    let rx = x + w;
    const segW = w / nd.length;
    for (let n = 0; n < nd.length; n++) {
      const nx = rx - segW;
      const d = nd[n] + Math.sin(seed + n * 3) * 2;
      ctx.lineTo(nx, y + h - d);
      rx = nx;
    }
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,200,150,0.15)';
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x, y + h - 2, w, 2);

    ctx.strokeStyle = '#3A1A0A';
    ctx.lineWidth = 1;
    for (let c = 0; c < cracks; c++) {
      const sx = x + 6 + c * (w / Math.max(1, cracks)) + Math.sin(seed + c * 2) * 5;
      const sy = y + 2 + Math.sin(seed + c * 3) * 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      let cx2 = sx, cy2 = sy;
      for (let s = 0; s < 3; s++) {
        cx2 += 4 + Math.sin(seed + c * 5 + s * 2) * 3;
        cy2 += 2 + Math.sin(seed + c * 7 + s * 3) * 3;
        ctx.lineTo(cx2, cy2);
      }
      ctx.stroke();
    }

    const bpos = [[x + 5, y + 4], [x + w - 5, y + 4]];
    if (bolts > 2) bpos.push([x + w / 2 - 2, y + 4]);
    for (let b = 0; b < bolts && b < bpos.length; b++) {
      const bx = bpos[b][0], by_ = bpos[b][1];
      ctx.fillStyle = '#4A4A4A';
      ctx.beginPath(); ctx.arc(bx, by_, 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2A2A2A';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx - 2, by_); ctx.lineTo(bx + 2, by_); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by_ - 2); ctx.lineTo(bx, by_ + 2); ctx.stroke();
    }

    for (let r = 0; r < rusts; r++) {
      const rx2 = x + 10 + ((seed * 7 + r * 31) % (w - 20 | 1));
      const ry2 = y + 4 + r * 4 + Math.sin(seed + r * 7) * 3;
      const a = Math.max(0, 0.3 + Math.sin(gameTime * 0.04 + r * 2.1) * 0.15);
      ctx.fillStyle = `rgba(200, 80, 30, ${a})`;
      ctx.beginPath(); ctx.arc(rx2, ry2, 1.5 + Math.sin(gameTime * 0.03 + r * 3) * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CFG.W, CFG.H);

    if (this.state === 'MENU') {
      drawMenu(ctx, this);
    } else {
      this.renderGame(ctx);
    }

    this.input.clearFrame();
  }

  renderGame(ctx) {
    const cx = this.camera.x;
    const sx = this.camera.x + this.camera.shakeX;
    const sy = this.camera.shakeY;

    drawBg(ctx, cx, CFG.W, CFG.H);

    ctx.save();
    ctx.translate(-sx, -sy);

    for (const p of this.platforms) {
      const ox = p.shakeOff || 0;
      if (ox) ctx.translate(ox, 0);

      if (p.type === 'magnet' && !p.broken) {
        ctx.fillStyle = '#2A6B8A';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#4A9BC8';
        ctx.fillRect(p.x, p.y, p.w, 3);
        ctx.fillStyle = '#1A4B6A';
        ctx.fillRect(p.x, p.y + p.h - 3, p.w, 3);

        for (let b = 0; b < Math.ceil(p.w / 35); b++) {
          ctx.fillStyle = '#3A7B9A';
          ctx.beginPath();
          ctx.arc(p.x + 8 + b * 35, p.y + 8, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        const pulse = Math.sin(this.gameTime * 0.03) * 0.5 + 0.5;
        const cx2 = p.x + p.w / 2;
        const cy2 = p.y + p.h / 2;
        const rx = p.w / 2 + 40;
        const ry = 55 + pulse * 8;

        ctx.fillStyle = `rgba(100, 180, 255, ${0.04 + pulse * 0.03})`;
        ctx.beginPath();
        ctx.ellipse(cx2, cy2, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(100, 180, 255, ${0.15 + pulse * 0.12})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.ellipse(cx2, cy2, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        for (let sp = 0; sp < 2; sp++) {
          const spX = p.x + ((p.x * 3.7 + sp * 53 + this.gameTime * 0.3) % p.w);
          const spY = p.y - 3 - Math.sin(this.gameTime * 0.08 + sp * 2.3) * 10 - 3;
          const spA = Math.max(0, Math.sin(this.gameTime * 0.04 + sp * 3.1)) * 0.5;
          ctx.fillStyle = `rgba(150, 210, 255, ${spA})`;
          ctx.beginPath();
          ctx.arc(spX, spY, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (p.type === 'crumbling') {
        this.drawCrumblingPlatform(p, ctx, this.gameTime);
      } else {
        ctx.fillStyle = p.broken ? '#444' : '#B7410E';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        if (!p.broken) {
          ctx.fillStyle = '#D06A2A';
          ctx.fillRect(p.x, p.y, p.w, 3);
          ctx.fillStyle = '#7B2A0A';
          ctx.fillRect(p.x, p.y + p.h - 3, p.w, 3);

          for (let b = 0; b < Math.ceil(p.w / 35); b++) {
            ctx.fillStyle = '#6B2A0A';
            ctx.beginPath();
            ctx.arc(p.x + 8 + b * 35, p.y + 8, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      if (ox) ctx.translate(-ox, 0);
    }

    for (const c of this.conveyors) {
      ctx.fillStyle = '#4A4A4A';
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = '#6B6B6B';
      ctx.fillRect(c.x, c.y, c.w, 3);
      ctx.fillStyle = '#2A2A2A';
      ctx.fillRect(c.x, c.y + c.h - 3, c.w, 3);
      ctx.fillStyle = '#333';
      ctx.fillRect(c.x, c.y - 3, 7, c.h + 6);
      ctx.fillRect(c.x + c.w - 7, c.y - 3, 7, c.h + 6);

      ctx.fillStyle = '#E8B830';
      for (let a = -1; a <= 1; a++) {
        const ax = c.x + c.w / 2 + a * 22 * c.dir;
        const ay = c.y + c.h / 2;
        ctx.beginPath();
        ctx.moveTo(ax + (c.dir > 0 ? 0 : 9), ay - 5);
        ctx.lineTo(ax + (c.dir > 0 ? 9 : 0), ay);
        ctx.lineTo(ax + (c.dir > 0 ? 0 : 9), ay + 5);
        ctx.fill();
      }
    }

    for (const h of this.hazards) {
      ctx.fillStyle = '#4A4A4A';
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.fillStyle = '#333';
      ctx.fillRect(h.x + 3, h.y + 3, h.w - 6, h.h - 6);

      for (let i = 0; i < Math.ceil(h.w / 20); i++) {
        ctx.fillStyle = i % 2 === 0 ? '#E8B830' : '#1A1A1A';
        ctx.fillRect(h.x + i * 20, h.y + h.h - 8, 10, 8);
      }

      ctx.fillStyle = '#777';
      ctx.fillRect(h.x + h.w / 2 - 2, h.y - 10, 4, 10);
    }

    for (const s of this.scraps) {
      if (s.col) continue;
      const dy = s.drawY !== undefined ? s.drawY : s.y;

      ctx.fillStyle = 'rgba(212, 160, 23, 0.12)';
      ctx.beginPath();
      ctx.arc(s.x + s.w / 2, dy + s.h / 2, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#D4A017';
      ctx.beginPath();
      ctx.moveTo(s.x + 1, dy + s.h - 1);
      ctx.lineTo(s.x + s.w / 2, dy + 1);
      ctx.lineTo(s.x + s.w - 1, dy + s.h - 1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#F0D060';
      ctx.beginPath();
      ctx.moveTo(s.x + 3, dy + s.h - 3);
      ctx.lineTo(s.x + s.w / 2, dy + 3);
      ctx.lineTo(s.x + s.w - 3, dy + s.h - 3);
      ctx.closePath();
      ctx.fill();
    }

    for (const t of this.floatTexts) {
      ctx.fillStyle = `rgba(232, 184, 48, ${t.alpha})`;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
    }

    this.player.draw(ctx);

    if (this.player.groundPlat && this.player.groundPlat.type === 'magnet') {
      const pa = 0.2 + Math.sin(this.gameTime * 0.05) * 0.1;
      ctx.strokeStyle = `rgba(100, 180, 255, ${pa})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, 22, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    drawHUD(ctx, this);

    if (this.state === 'DEAD') drawDeath(ctx, this);
  }

  handleInput() {
    if (this.state === 'MENU' && this.input.pressed('Enter')) {
      this.start();
    } else if (this.state === 'PLAYING' && (this.input.pressed('r') || this.input.pressed('R'))) {
      this.start();
    } else if (this.state === 'DEAD') {
      if (this.input.pressed('r') || this.input.pressed('R')) this.start();
      if (this.input.pressed('Enter')) this.state = 'MENU';
    }
  }

  loop(ts) {
    if (!this.lastTime) this.lastTime = ts;
    const dt = Math.min((ts - this.lastTime) / 16.667, 3);
    this.lastTime = ts;

    this.handleInput();
    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener('DOMContentLoaded', () => { new Game(); });
